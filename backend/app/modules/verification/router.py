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

from fastapi import APIRouter, Depends, Path, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.evidence import design, signing
from app.modules.evidence.repository import (
    EvidenceRepository,
    EvidenceSnapshotRepository,
)

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

    Published here and nowhere else on purpose: a public key must be
    retrievable independently of the document it signs, or the signature only
    proves that one file is self-consistent. The private half is never served
    by any route in this application.
    """
    state = signing.signing_state()
    jwk = signing.public_jwk(state)
    return {
        "algorithm": signing.ALGORITHM,
        "signature_encoding": signing.SIGNATURE_ENCODING,
        "configured": state.available,
        "keys": [jwk] if jwk else [],
        "note": (
            "Ed25519 signatures cover the canonical evidence payload bytes (the "
            "value hashed into data_hash), not the rendered PDF."
            if jwk
            else "This deployment has no signing key configured, so evidence "
            "artifacts are issued unsigned and say so on the document."
        ),
    }


@router.get("/{verification_id}", response_model=None)
async def verify_evidence(
    verification_id: str = Path(
        min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """The public verification record for one evidence artifact."""
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
        now = datetime.now(timezone.utc)
        retention["expires_at"] = expires.isoformat()
        retention["expired"] = expires < now
        retention["retention_days"] = max(
            0, (expires - snapshot.created_at.replace(tzinfo=timezone.utc)).days
        )

    return {
        "found": True,
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
        },
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
            "procedure": [
                "canonicalise the payload with sorted keys and compact separators",
                "sha256 those bytes and compare the hex digest with data_hash",
                "sha256 the PDF and compare with report_checksum",
                (
                    "verify the Ed25519 signature over the payload bytes against the "
                    "public key at /v1/verify/keys"
                ),
            ],
        },
        "report_url": design.verification_url(verification_id),
        "record_url": design.verify_api_url(verification_id),
    }
