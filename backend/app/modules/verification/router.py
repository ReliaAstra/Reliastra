"""Public verification of evidence artifacts.

This router is the only part of Reliastra a customer's counterparty is expected
to call, so it is written for that reader:

* **No authentication, no consent required.** The verification id is a
  24-byte random token issued to the recipient of the document; capability is
  carried by the token, and an unguessable address that needs an account is not
  verification - it is a support ticket.
* **Nothing is invented.** An unknown id is a 404 that says "not found" and
  offers no suggestion. A degraded database is a 503, never an empty success,
  because "we could not check" and "there is nothing there" are different
  answers to a question that may be asked in a dispute.
* **The response is the proof, not a promise.** Hashes, signature, algorithm,
  key id and the renderer that produced the bytes are returned together with
  the procedure for checking them, so a recipient with the machine-readable
  payload can verify without trusting this endpoint at all.

Deliberately absent: the payload itself. The facts of an incident belong to the
parties who were issued the artifact; the endpoint proves what the payload must
hash to, which is the only thing a verifier needs from us.
"""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Path, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.evidence import canonical, design, signing
from app.modules.evidence.repository import (
    EvidenceRepository,
    EvidenceSnapshotRepository,
)
from app.platform.web.rate_limit import enforce_public_read_limit
from app.modules.verification.service import verify_snapshot

router = APIRouter(prefix="/v1/verify", tags=["Verification"])

_NO_STORE = {"Cache-Control": "no-store"}


def _unavailable(detail: str) -> Response:
    """A structured 503, not a 500 and not a silent miss.

    ``found: false`` with ``service_degraded: true`` keeps the failure visible to
    a caller that only checks ``found`` while telling a caller that inspects the
    body that the record may exist and was simply unreadable.
    """
    return Response(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        media_type="application/json",
        headers=_NO_STORE,
        content=json.dumps(
            {
                "found": False,
                "error": detail,
                "service_degraded": True,
            }
        ),
    )


@router.get("/keys", response_model=None)
async def verification_keys() -> dict:
    """The public signing keys, in JWK form, for anyone to check a signature.

    The **whole keyring** is served, not just the newest key. Publishing only the
    current key means the first rotation makes every previously issued record
    unverifiable by anyone, with no error to notice: the verification endpoint
    keeps answering ``found: true`` while the key a record needs no longer
    exists anywhere.

    Each entry carries ``key_fingerprint`` - a digest of the key material,
    independent of its id - so a verifier that pinned ``kid -> key`` can detect a
    different key being published under a familiar id.
    """
    state = signing.signing_state()
    keys = signing.public_jwks()
    return {
        "algorithm": signing.ALGORITHM,
        "signature_encoding": signing.SIGNATURE_ENCODING,
        "configured": state.available,
        "keys": keys,
        "note": (
            "Ed25519 signatures cover the canonical evidence payload bytes (the "
            "value hashed into data_hash), not the rendered PDF. Entries with "
            "status 'historical' are superseded keys retained so records issued "
            "before a rotation stay verifiable."
            if keys
            else "This deployment has no signing key configured, so evidence "
            "artifacts are issued unsigned and say so on the document."
        ),
    }


@router.get("/{verification_id}", response_model=None)
async def verify_evidence(
    request: Request,
    verification_id: str = Path(
        min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """The public verification record for one evidence artifact.

    Rate limited like every other public read. The verification id is
    unguessable, but it is delivered by email, and an unlimited public endpoint
    that returns a tenant's ``org_id``, incident id, exact outage window and
    signing key id turns one leaked link into an enumeration oracle.
    """
    await enforce_public_read_limit(request)

    try:
        snapshot = await EvidenceSnapshotRepository.get_by_verification_id(
            db, verification_id
        )
    except Exception:
        # Database unreachable - return a structured error rather than 500
        return _unavailable("Verification service temporarily unavailable")
    if not snapshot:
        return Response(
            status_code=status.HTTP_404_NOT_FOUND,
            media_type="application/json",
            headers=_NO_STORE,
            content=json.dumps({"found": False, "error": "Evidence not found"}),
        )

    # The report row carries what the snapshot does not: retention and the
    # renderer that produced the bytes. Missing is stated, not hidden - an
    # artifact from before provenance was recorded has no renderer to report.
    report = None
    if snapshot.report_file_path:
        try:
            report = await EvidenceRepository.get_by_file_path(
                db, snapshot.report_file_path
            )
        except Exception:  # pragma: no cover - defensive
            report = None

    retention: dict[str, object] = {
        "expires_at": None,
        "expired": None,
        "artifact_available": report is not None,
    }
    if report is not None and report.expires_at is not None:
        expires = report.expires_at
        if expires.tzinfo is None:  # defensive: a naive column value
            expires = expires.replace(tzinfo=timezone.utc)
        created = snapshot.created_at
        if created.tzinfo is None:  # defensive: a naive column value
            created = created.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        retention["expires_at"] = expires.isoformat()
        retention["expired"] = expires < now
        retention["retention_days"] = max(0, (expires - created).days)

    # Actually re-derive the verdict from the stored payload. This endpoint used
    # to echo the stored hash and signature columns, which proves only that the
    # row is self-consistent - a property a tampered row retains. A caller that
    # trusts this endpoint has learned nothing it could not have learned by
    # trusting the party it is checking.
    outcome = verify_snapshot(snapshot)

    return {
        "found": True,
        "verified": outcome.verified,
        "incident_id": str(snapshot.incident_id),
        "dependency_id": str(snapshot.dependency_id),
        "org_id": str(snapshot.org_id),
        "time_window": {
            "start": snapshot.time_window_start.isoformat(),
            "end": snapshot.time_window_end.isoformat(),
        },
        "data_hash": snapshot.data_hash,
        "report_checksum": snapshot.report_checksum,
        "methodology_version": snapshot.methodology_version,
        "created_at": snapshot.created_at.isoformat(),
        "authenticity": {
            "signed": snapshot.signature is not None,
            "algorithm": snapshot.signature_alg,
            "encoding": signing.SIGNATURE_ENCODING,
            "signing_key_id": snapshot.signing_key_id,
            "signature": snapshot.signature,
            "signature_covers": "canonical payload bytes (the value hashed into data_hash)",
            "public_keys": design.keys_api_url(),
            "verified": outcome.verified,
            "verification_reason": outcome.reason,
        },
        "verification_checks": outcome.as_dict()["checks"],
        "rendering": {
            "renderer": report.renderer if report else None,
            "renderer_version": report.renderer_version if report else None,
            "file_size_bytes": report.file_size_bytes if report else None,
            "note": (
                "Renderer provenance is recorded on artifacts issued from this "
                "version onward."
                if report is not None and report.renderer is None
                else None
            ),
        },
        "retention": retention,
        "verification": {
            "payload": "issued beside this document as the .json artifact",
            "procedure": canonical.verification_procedure(),
            "note": (
                "`verified` is re-derived from the stored payload on every "
                "request. It is null when the record carries no signature or "
                "the payload could not be read - a check that could not run is "
                "never reported as a pass."
            ),
        },
        "report_url": design.verification_url(verification_id),
        "record_url": design.verify_api_url(verification_id),
    }
