"""The public intelligence dataset tree: pure construction from canonical rows.

The dataset is a derived snapshot of records this codebase already treats as
canonical: the public incident detail responses (the exact objects the API
serves), the frozen evidence bytes (the exact documents the evidence endpoint
serves), and the vendor catalog identity rows (the registry's canonical
identity). Nothing here re-derives a measurement, invents a field, or carries
a wall-clock value - the same determinism discipline the evidence artifacts
follow, because the dataset's commit history is meant to be citable: commit
N is a reproducible function of the records that existed when it was made.

File layout (extensible by addition, not by mutation - a new directory is a
new artifact class; existing paths never change meaning):

    README.md               provenance, methodology, verification pointers
    catalog.json            vendor identity (registry canonical fields)
    incidents/index.jsonl   one summary object per line, oldest first
    incidents/{id}.json     the canonical incident detail object
    evidence/{id}.json      the frozen artifact bytes, verbatim

``dataset_content_hash`` is a SHA-256 over the per-file SHA-256s in path
order: changing any byte of any file changes the hash, which is what makes
the publisher's no-op check a content check and not a timestamp check.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

#: Dataset format version. Bumped when the tree's meaning changes (a new
#: directory, a renamed field), so a dataset consumer can pin a contract.
DATASET_SCHEMA_VERSION = "1.0"

DATASET_GENERATOR = "reliastra-public-dataset"

#: The README, generated. Deliberately free of timestamps and counts: both
#: change on every publication and would break byte-reproducibility for a
#: logically unchanged dataset. Facts that change belong in the data files,
#: not the prose about them.
_README_TEMPLATE = """# RELIASTRA public intelligence dataset

Independent, endpoint-scoped availability observations of third-party public
services, published by RELIASTRA (https://reliastra.com/observatory).

## What is in here

- `catalog.json` - the vendors RELIASTRA probes and publishes records for.
- `incidents/index.jsonl` - one line per detector-confirmed incident
  (summary fields, oldest first). JSON Lines: append-friendly, stream-parseable.
- `incidents/{{id}}.json` - the full record for one incident: the exact claim,
  the detection rule, the run provenance.
- `evidence/{{id}}.json` - the frozen, hashed evidence document for an
  incident (raw observations of its window). These are the exact bytes the
  API serves at `/v1/public/incidents/{{id}}/evidence`; their SHA-256 is in
  each document's `verification` block, with the recipe to recompute it.

## How to read the claims

Every incident is one observed endpoint from one observation region. The
attribution is `observed` (RELIASTRA's own probes) and the methodology
version that produced it is stated on every record. A record is a statement
about the probed endpoint, never about a vendor's services as a whole.
"We do not know" is a publishable state here: an incident still open says so,
and an incident without an evidence file simply has no frozen artifact yet.

An incident appears in this dataset only when a deterministic detection rule
confirmed the failure run (single failed probes publish nothing). The record
lifecycle vocabulary is suspected, detecting, confirmed, ongoing, resolved;
this dataset carries records from `confirmed` onward.

## Licences and provenance

Dataset schema version: {schema_version}
Methodology version: {methodology_version}
Generator: {generator} {generator_version}

The data is generated from the same canonical records the public API serves;
this repository is a mirror, and the API is authoritative. Record pages:
https://reliastra.com/observatory/{{vendor}}/incidents/{{id}}.
"""


def dataset_readme(
    *,
    methodology_version: str,
    generator_version: str,
) -> str:
    """The repository README. Pure: same inputs, same bytes."""
    return _README_TEMPLATE.format(
        schema_version=DATASET_SCHEMA_VERSION,
        methodology_version=methodology_version,
        generator=DATASET_GENERATOR,
        generator_version=generator_version,
    )


def _canonical_json_text(payload: Any) -> str:
    """Human-readable canonical JSON: the same ordering discipline as the
    evidence hash, with newlines so diffs in the git history stay readable.
    (The *hash* of a generated file is computed over these exact bytes, so
    this serialisation is part of the dataset's identity - do not tune it
    casually; bump DATASET_SCHEMA_VERSION when it changes.)"""
    return json.dumps(payload, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def build_dataset_tree(
    *,
    vendors: list[dict[str, Any]],
    incidents: list[dict[str, Any]],
    evidence: dict[str, str],
    methodology_version: str,
    generator_version: str,
) -> dict[str, bytes]:
    """Assemble the dataset tree from canonical rows.

    ``vendors`` are the catalog identity dicts (registry fields the API
    publishes). ``incidents`` are canonical incident detail objects (the
    API's detail response shape, as plain dicts, ``incident_id`` key
    required). ``evidence`` maps incident id to the frozen artifact's exact
    payload bytes-as-str (served verbatim, never re-serialised).

    Returns ``{path: bytes}``. Deterministic: same inputs, same tree.
    """
    tree: dict[str, bytes] = {}
    tree["README.md"] = dataset_readme(
        methodology_version=methodology_version,
        generator_version=generator_version,
    ).encode("utf-8")
    tree["catalog.json"] = _canonical_json_text(
        {
            "schema_version": DATASET_SCHEMA_VERSION,
            "vendors": sorted(vendors, key=lambda v: v.get("vendor_name", "")),
        }
    ).encode("utf-8")

    ordered = sorted(
        incidents,
        key=lambda i: (
            i.get("started_at") or "",
            str(i.get("incident_id", "")),
        ),
    )
    tree["incidents/index.jsonl"] = "".join(
        json.dumps(summary, sort_keys=True, ensure_ascii=False) + "\n"
        for summary in (incident_summary(i) for i in ordered)
    ).encode("utf-8")
    for incident in ordered:
        incident_id = str(incident["incident_id"])
        tree[f"incidents/{incident_id}.json"] = _canonical_json_text(incident).encode(
            "utf-8"
        )

    for incident_id in sorted(evidence):
        tree[f"evidence/{incident_id}.json"] = evidence[incident_id].encode("utf-8")

    return tree


def incident_summary(incident: dict[str, Any]) -> dict[str, Any]:
    """The index line for one incident: identity, window, claim metadata.

    The summary fields, in the API's own names. Provenance fields that only
    make sense with the full record (observation ids, detection metadata)
    stay in `incidents/{id}.json`.
    """
    keys = (
        "incident_id",
        "vendor_name",
        "vendor_display_name",
        "category",
        "target_name",
        "endpoint_url",
        "region",
        "status",
        "severity",
        "failure_kind",
        "started_at",
        "detected_at",
        "resolved_at",
        "duration_seconds",
        "observation_count",
        "failure_count",
        "methodology_version",
        "attribution_status",
    )
    return {key: incident.get(key) for key in keys}


def file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def dataset_content_hash(tree: dict[str, bytes]) -> str:
    """SHA-256 over the per-file hashes in path order.

    A Merkle-style digest of the exact tree: any byte change anywhere moves
    it; a logically unchanged dataset reproduces it byte for byte. This is
    the publisher's idempotency key.
    """
    digest = hashlib.sha256()
    for path in sorted(tree):
        digest.update(path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(file_hash(tree[path]).encode("ascii"))
        digest.update(b"\0")
    return digest.hexdigest()
