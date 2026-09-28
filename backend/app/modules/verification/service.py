"""Third-party verification of an evidence record, performed rather than asserted.

The verification endpoint used to return the stored ``data_hash`` and
``signature`` columns and let the caller infer that a record was intact. That is
circular: it proves the row still says what it said, which is exactly what an
attacker with write access to the row would leave intact. A verifier that trusts
this endpoint learns nothing it could not have learned by trusting the party it
is meant to be checking.

This module actually re-derives the answer from the artifact:

1. Fetch the signed JSON payload from object storage.
2. Strip the issuance envelope to recover the hashed facts.
3. Re-serialise with the same canonical serialiser generation used.
4. Re-hash and compare against the recorded ``data_hash``.
5. Verify the Ed25519 signature over those same bytes against the published key
   for the recorded ``signing_key_id``.

The result distinguishes three states, because collapsing them would recreate
the original defect in a new form:

``True``
    Re-derived and matched.
``False``
    Re-derived and did not match. The record has been altered, or was signed by
    a key this deployment does not publish.
``None``
    Could not determine - the payload is gone, or storage is unreachable. A
    verification that could not run is never reported as a pass.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from app.modules.evidence import signing
from app.modules.evidence.canonical import (
    canonical_json_bytes,
    payload_from_document,
)

logger = logging.getLogger(__name__)


@dataclass
class Check:
    """One verification step, reported whether it passed, failed, or could not run."""

    name: str
    status: str  # "pass" | "fail" | "unavailable"
    detail: str | None = None

    @property
    def ok(self) -> bool:
        return self.status == "pass"

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"name": self.name, "status": self.status}
        if self.detail:
            out["detail"] = self.detail
        return out


@dataclass
class VerificationOutcome:
    verified: bool | None
    reason: str | None = None
    checks: list[Check] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "verified": self.verified,
            "reason": self.reason,
            "checks": [c.as_dict() for c in self.checks],
        }


def _storage():
    from app.infrastructure.storage import storage_client

    return storage_client


def verify_snapshot(snapshot: Any) -> VerificationOutcome:
    """Re-derive the verdict for *snapshot* from its stored payload.

    Synchronous because it is called from the request path behind a threadpool
    only if the caller chooses; object storage access here is a single GET.
    """
    checks: list[Check] = []

    if not snapshot.signature:
        checks.append(
            Check(
                "signature_present",
                "unavailable",
                "this record carries no signature; it is a checksum, not an "
                "authenticity claim",
            )
        )
    else:
        checks.append(Check("signature_present", "pass"))

    path = getattr(snapshot, "json_evidence_path", None)
    if not path:
        checks.append(
            Check("payload_available", "fail", "no payload artifact is recorded for this record")
        )
        return VerificationOutcome(
            verified=False,
            reason="payload_not_retained",
            checks=checks,
        )

    try:
        raw = _storage().download_bytes(path)
    except Exception as exc:
        # Missing object and unreachable bucket are different operational
        # problems but the same answer for a verifier: the claim could not be
        # checked. Neither is a pass.
        logger.warning("verification: payload for %s unreadable: %s", path, exc)
        checks.append(Check("payload_available", "unavailable", f"{type(exc).__name__}: {exc}"))
        return VerificationOutcome(
            verified=None,
            reason="payload_unavailable",
            checks=checks,
        )
    checks.append(Check("payload_available", "pass"))

    try:
        document = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        checks.append(Check("payload_parses", "fail", f"unparseable payload: {exc}"))
        return VerificationOutcome(verified=False, reason="payload_unparseable", checks=checks)
    if not isinstance(document, dict):
        checks.append(Check("payload_parses", "fail", "payload is not a JSON object"))
        return VerificationOutcome(verified=False, reason="payload_unparseable", checks=checks)
    checks.append(Check("payload_parses", "pass"))

    payload = payload_from_document(document)
    try:
        payload_bytes = canonical_json_bytes(payload)
    except (TypeError, ValueError) as exc:
        checks.append(Check("payload_canonicalises", "fail", str(exc)))
        return VerificationOutcome(verified=False, reason="payload_uncanonicalisable", checks=checks)
    checks.append(Check("payload_canonicalises", "pass"))

    recomputed = hashlib.sha256(payload_bytes).hexdigest()
    if recomputed == snapshot.data_hash:
        checks.append(Check("data_hash_matches", "pass"))
    else:
        checks.append(
            Check(
                "data_hash_matches",
                "fail",
                f"recomputed {recomputed[:16]}... does not equal recorded "
                f"{str(snapshot.data_hash)[:16]}...",
            )
        )

    # The document embeds its own hash. If the stored row and the served
    # artifact disagree, the artifact was swapped - a swap that leaves each
    # half internally consistent, which is what a single-digest check misses.
    embedded = document.get("data_hash")
    if embedded is not None and embedded != snapshot.data_hash:
        checks.append(
            Check(
                "document_hash_agrees_with_record",
                "fail",
                "the served artifact and the verification record name different payloads",
            )
        )
    else:
        checks.append(Check("document_hash_agrees_with_record", "pass"))

    if not snapshot.signature:
        # Integrity only. Stated as such, never as verification.
        return VerificationOutcome(
            verified=None,
            reason="unsigned",
            checks=checks,
        )

    candidates = signing.resolve_public_keys(snapshot.signing_key_id)
    if not candidates:
        checks.append(
            Check(
                "signing_key_published",
                "fail",
                f"no public key is published for key id {snapshot.signing_key_id!r}; "
                "this record was signed by a key this deployment does not "
                "publish, which is a verification failure",
            )
        )
        return VerificationOutcome(verified=False, reason="unknown_signing_key", checks=checks)
    checks.append(
        Check("signing_key_published", "pass", f"{len(candidates)} key(s) published for this id")
    )

    if signing.verify_signature_over(payload_bytes, snapshot.signature, snapshot.signing_key_id):
        checks.append(Check("signature_valid", "pass"))
    else:
        checks.append(
            Check(
                "signature_valid",
                "fail",
                "Ed25519 signature does not verify over the payload bytes "
                "against any key published for this key id",
            )
        )

    failed = [c for c in checks if c.status == "fail"]
    if failed:
        return VerificationOutcome(
            verified=False,
            reason=failed[0].name,
            checks=checks,
        )
    return VerificationOutcome(verified=True, checks=checks)
