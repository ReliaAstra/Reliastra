# Public incident evidence: the artifact, its guarantees, and verification

Landed: 2026-09-26 (phase 5 of `docs/intelligence/AUDIT.md`).

Every detector-confirmed public incident can carry a machine-verifiable
evidence document: the exact claim, the detection provenance, and every raw
observation row of the incident's window, serialised to canonical JSON bytes,
SHA-256 hashed, and frozen. The tenant evidence system
(`app/modules/evidence/`) keeps its own artifacts for customer incidents;
this document describes the public plane (`app/modules/incidents/public_evidence.py`).
Both hash with the same canonical serialisation (`app/modules/evidence/canonical.py`),
so a checksum means the same thing on both.

## Where the artifacts live

- `GET /v1/public/incidents/{id}/evidence` - the newest freeze, byte-for-byte.
  The response body is the stored canonical bytes, never a re-serialisation.
  Headers: `ETag` (the content hash), `X-Reliastra-Evidence-Version`,
  `X-Reliastra-Artifact-Schema-Version`, `X-Reliastra-Methodology-Version`.
- `GET /v1/public/incidents/{id}/evidence/versions/{n}` - one pinned freeze.
  Frozen artifacts never change, so this caches far longer than `latest`.
- `GET /v1/public/incidents/{id}` - the record detail now carries an
  `evidence` descriptor (version, hash, sizes, freeze status) so consumers
  can link the artifact without fetching it.
- The public site mirrors each record page at
  `/observatory/{vendor}/incidents/{id}/index.json`, generated from the same
  canonical reads as the HTML (`frontend/src/lib/observatory/incident-record.ts`)
  and linking the evidence URL and hash. One source of truth, two renderers.

## The three guarantees, and what enforces them

**Deterministic.** `build_evidence_document` is a pure function of stored
facts. No wall-clock value enters the document; the only timestamps in it are
the incident's stored stamps and the observations' own timestamps.

**Reproducible.** The observation window is bounded by facts of the record:
`started_at` minus a fixed context margin (900s, a methodology constant) on
the early side; the stamped `resolution_observation_id`'s timestamp (or
`resolved_at` when that probe has aged out of the partitioned store) on the
late side. A freeze regenerated at any later time selects the same rows and
produces the same hash. Rebuild-verification is part of the test suite.

**Immutable.** Each freeze is one row in `public_incident_evidence`;
`before_update` and `before_delete` raise at the model level. When an
incident resolves, a new version is appended that supersedes the open
freeze; nothing is edited in place. `(incident_id, version)` is unique;
the row stores the exact bytes as text (not JSONB - no type reparses what
was hashed).

Provenance classes and methodology versions behave exactly as the audit's
invariants require: `attribution` is copied from the incident (`observed`
only today, but a future `correlated` state cannot silently collapse into
an observed claim), and `methodology_version` travels with every artifact.

## How a third party verifies

The recipe ships inside every artifact, in its `verification` block:

1. Take the served JSON document and remove the `verification` key.
2. Re-serialise: sorted keys, compact separators (`,` and `:`),
   `ensure_ascii=False`, UTF-8 bytes.
3. SHA-256 those bytes. The digest must equal the document's
   `verification.payload_sha256`, which is also the response `ETag` and the
   `data_hash` on the record detail.

One shell line, given the document in `doc.json`:

```sh
jq -d 'del(.verification)' doc.json \
  | python3 -c 'import sys,hashlib;print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())'
```

...compared against `jq -r .verification.payload_sha256 doc.json`. (The
backend hashes `canonical_json_bytes` of the parsed document; jq's
`-d`/`--raw-output` round-trip must preserve the canonical form, so when in
doubt verify with the Python recipe above rather than a reserialising tool.)

To pin a citation: fetch `/evidence/versions/{n}` and record its ETag. That
URL's bytes cannot change.

## Generation pipeline (and why it cannot lose or fake a freeze)

1. The probe transaction that opens or resolves an incident also writes a
   `public_incident_evidence_requested` outbox row (same transaction - the
   event can never be lost after a transition commits).
2. The outbox processor (Celery beat, every 10s) drains events by type and
   calls the freeze. Freeze is idempotent: an artifact whose
   `incident_status` matches the incident's live state is a no-op, races
   resolve on the unique constraint, and redelivery changes nothing.
3. A daily reconciliation task
   (`app.modules.incidents.tasks.reconcile_public_incident_evidence`)
   re-freezes anything an outage skipped. The outbox is the fast path; the
   sweep is the guaranteed one. Both are DB-only work - generation never
   runs in the probe task or the API process, and never touches the network.

Absence semantics are explicit everywhere: no artifact yet reads as "not
generated yet" (404 on the artifact URL, `evidence: null` on the detail, a
stated absence on the record page), never as "unverifiable by design".

## Testing map

- `tests/unit/test_public_incident_evidence.py` - document determinism,
  window bounds (facts, never clocks), verification recipe, freeze state
  rules (first freeze, supersede, no-op, race, missing), outbox handler
  consumption rules, reconciliation queue, immutability guards.
- `tests/integration/test_public_incident_evidence_api.py` - the whole path
  on real Postgres through the real app: interleaved record/detect, outbox
  drain, served-bytes verification, header contract, detail descriptor,
  rebuild determinism, versioned reads, update-blocked-by-flush, and the
  reconciliation recovery path.
- `frontend/src/lib/observatory/__tests__/incident-record.test.ts` - the
  sidecar's content table (observed with/without evidence, published,
  404s, throw-on-unreadable).
