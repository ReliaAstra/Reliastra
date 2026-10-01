"""The one canonical JSON serialisation every artifact hash is computed over.

Extracted from ``evidence.generation`` so the public incident evidence
artifacts (``app.modules.incidents.public_evidence``) hash their documents
with exactly the same function the tenant evidence PDFs and JSON snapshots
do. Two artifact planes, one definition of "the bytes": a checksum is only
comparable across artifacts when both sides serialise identically, and a
second hand-rolled ``json.dumps`` call is how identical facts drift into
different bytes.
"""

from __future__ import annotations

import json
from typing import Any

#: Keys added to the served document *around* the hashed facts.
#:
#: The signed and hashed object is the measurement payload. The served JSON adds
#: issuance metadata - the hash itself, the verification id, the renderer, the
#: signature envelope - which describes *how* the document was issued rather
#: than what was measured, and therefore cannot be inside its own hash.
#:
#: This lives here, next to the serialiser, so generation and verification
#: cannot disagree about where the payload ends. When the two planes disagreed
#: (the tenant plane published a recipe that omitted these keys, the public
#: plane published one that did not), a third party following the documented
#: steps exactly computed a different digest and concluded a genuine record had
#: been forged.
EVIDENCE_ENVELOPE_KEYS: frozenset[str] = frozenset(
    {
        "context_metrics",
        "data_hash",
        "verification_id",
        "report_checksum",
        "generated_at",
        "authenticity",
    }
)


def canonical_json_bytes(payload: dict[str, Any]) -> bytes:
    """Serialise an evidence payload deterministically.

    Sorted keys, compact separators and ``ensure_ascii=False`` so the same
    facts always produce the same bytes - and therefore the same
    ``data_hash`` - regardless of insertion order or platform locale. This is
    the only serialisation that may be hashed.
    """
    return json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def payload_from_document(document: dict[str, Any]) -> dict[str, Any]:
    """The hashed facts inside a served evidence document.

    Inverse of the envelope ``generation`` adds. Tolerates a document that was
    stored before the envelope gained a key: unknown top-level keys are left in
    place rather than silently dropped, because dropping a key that was part of
    the original hash would produce a false mismatch.
    """
    return {k: v for k, v in document.items() if k not in EVIDENCE_ENVELOPE_KEYS}


def verification_procedure() -> list[str]:
    """The exact steps a third party runs, derived from the code above.

    Generated rather than hand-written so the published recipe cannot drift away
    from the serialiser it describes. Every load-bearing option is named: a
    verifier using ``json.dumps`` defaults gets ``ensure_ascii=True`` and a
    different digest for any payload containing a non-ASCII endpoint, vendor or
    error string.
    """
    return [
        "take the served .json document",
        (
            "delete the top-level envelope keys "
            + ", ".join(sorted(EVIDENCE_ENVELOPE_KEYS))
        ),
        (
            "serialise what remains with json.dumps(payload, sort_keys=True, "
            "separators=(',', ':'), ensure_ascii=False).encode('utf-8')"
        ),
        "sha256 those bytes; the hex digest must equal data_hash",
        "sha256 the PDF bytes; the hex digest must equal report_checksum",
        (
            "if authenticity.signed is true, verify the Ed25519 signature in "
            "authenticity.signature over the same payload bytes using the key "
            "whose kid equals authenticity.signing_key_id from /v1/verify/keys. "
            "A key id that is absent from /v1/verify/keys means the record "
            "cannot be verified - that is a failure, not a pass."
        ),
    ]
