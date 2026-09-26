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
