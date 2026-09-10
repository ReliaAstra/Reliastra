# Incident detection and SLA evidence: how it actually works

This is the operator-facing description of the path from a failing dependency to
a verifiable evidence artifact. It documents behaviour, not intent: every
statement here is covered by a test named at the bottom.

## Observation topology

RELIASTRA probes from **one observation point**. Every check for every
dependency is issued by the same worker; the `region` value on a check result is
a scheduling label, not an independent vantage point.

`OBSERVATION_TOPOLOGY` selects the rule set:

| Value | Confirmation rule | Use when |
| --- | --- | --- |
| `single` (default) | `SINGLE_TOPOLOGY_FAILURE_CHECKS` consecutive failed checks | one host, one worker - today |
| `multi` | `QUORUM_MIN_REGIONS` distinct observation points agree inside `QUORUM_WINDOW_SECONDS` | a real fleet of independent points |

Setting `multi` on a single-host deployment is a misconfiguration, not a tuning
choice: it would present one machine's opinion as a quorum. Nothing in the
product infers the topology from the labels you configure.

## Detection

`app/modules/checks/detection.py` is a pure function of the recorded checks.
There is no randomness, no timing heuristic and no estimate.

- **Open**: `SINGLE_TOPOLOGY_FAILURE_CHECKS` (default 2) consecutive failures,
  the current check being the last one.
- **Recover**: `CONSECUTIVE_RECOVERY_CHECKS` consecutive successes while an
  incident is open.
- **Idempotent**: a confirmed failure while an incident is already open returns
  "do not open"; a recovery signal with no open incident returns "do not
  resolve". The database additionally carries a partial unique index on open
  incidents per dependency, because two workers can both be told "open".
- **Self-describing**: the rule that fired, its threshold and its reason are
  written to `incidents.detection_rule` / `detection_metadata`, and reproduced
  verbatim in the evidence artifact. An incident opened before that provenance
  existed renders as "not recorded" rather than being guessed at.

Detection runs under `SELECT ... FOR UPDATE` on the dependency row, so
concurrent checks for the same dependency serialize instead of interleaving
"read recent results" with "write confirmation".

## Evidence lifecycle

`incidents.evidence_status` is the single field the console reads:

| State | Meaning | Console action |
| --- | --- | --- |
| `pending` | not started; requested on resolution | none |
| `generating` | requested and dispatched | none, auto-refresh |
| `available` | artifact stored and linked | open the report |
| `failed` | generation failed; `evidence_error` says why | retry |
| `not_entitled` | the plan does not include evidence | upgrade prompt |

Sequence for a resolved incident:

1. `resolve_incident` stamps `resolved_at`, runs deterministic attribution, then
   calls `request_evidence_generation`.
2. That method checks entitlement **before** queueing anything. A plan without
   evidence gets `not_entitled` and no task at all - no job that retries three
   times and dies in the logs.
3. Otherwise it sets `generating` and registers an `after_commit` hook. The
   task is published **after the transaction commits**, so the worker can
   always see the resolved incident, its final check results and its outbox
   rows. There is no `countdown` sleep anywhere in this path: a delay is not a
   guarantee, and it made the race invisible instead of fixing it.
4. If the broker cannot be reached, the incident is marked `failed` with the
   dispatch error rather than being left claiming a task was queued.
5. The worker drains the observation outbox, then generates the report.

### Idempotency

`data_hash` is the SHA-256 of the canonical evidence payload (sorted keys,
compact separators, UTF-8) - the only serialisation that is ever hashed. Same
facts produce the same hash, so a task retry, a duplicated resolve or two
workers racing all return the existing artifact instead of minting another.

Two deliberate exclusions from the hash:

- **The rolling 24-hour context metric.** It is evaluated at generation time,
  so it changes between runs over the same incident. Including it would make
  every retry produce a new artifact.
- **AI explanation text.** Narrative is not a fact and must not move the hash.

An incident that is **still open** has a window that ends "now", so every
attempt would hash differently. In that case the service returns the latest
artifact rather than snapshotting a moving window again; explicit regeneration
is the only way to take another.

### Storage verification

Order matters: PDF upload → JSON sidecar upload → `stat_object` on the PDF →
size comparison → **then** the `evidence_reports` row is written. A report row
is a claim that the artifact exists, so it cannot come into existence for an
object that is not in the bucket. A mismatch is a failure, recorded on the
incident, not a success with a broken download link.

`GET /v1/evidence/{id}` stats the object before issuing a presigned URL and
raises if it is gone: "the artifact is missing, regenerate it" is a better
answer than a link that 404s.

### Two hashes, two meanings

| Field | Covers |
| --- | --- |
| `data_hash` | the canonical evidence payload - the facts |
| `report_checksum` | the rendered PDF bytes - the document |

The PDF cannot contain its own checksum, so the document points at the JSON
sidecar and the public verification endpoint for it. Both values are stored on
the snapshot row and returned by `/v1/verify/{verification_id}`.

### Recovery from a lost publish

`retry_failed_evidence_generation` runs every 300s and picks up incidents in
`failed` or `pending`, plus any `generating` attempt older than 30 minutes.
That last arm is not paranoia: if the broker was unavailable at the moment of
resolution, the `after_commit` publish never happened and nothing was written
to say so. Without the sweep those incidents would sit at `generating` forever.

## What the artifact claims

Every figure in `templates/evidence/default.html` is computed from the
incident's own window - `check_results` inside `[started_at, resolved_at]`:

- availability = `up / measured`, where blocked probes (SSRF policy refusals)
  are excluded from the denominator and reported separately, because a request
  RELIASTRA refused to send is not vendor downtime;
- latency statistics over measured checks only - a failed probe records `0.0`,
  which is an absence of measurement, not a fast response;
- percentiles by nearest rank, deterministic;
- **no data is never 100%**: an empty or fully blocked window reports
  `availability = null`, `insufficient_data = true` and a human-readable note.

The chart is rendered from those same observations (time-proportional x axis,
max-per-bucket downsampling that cannot hide a spike, failures marked on the
baseline). A window with nothing to draw renders an explicit message instead of
an empty axis.

The rolling 24-hour figure is still computed and still shown, labelled as
context, in its own section, with a note that it covers a different window.

## Tests

| Concern | Test |
| --- | --- |
| detection rules, both topologies | `backend/tests/unit/test_check_detection.py` |
| window arithmetic, blocked checks, empty windows | `backend/tests/unit/test_evidence_metrics.py` |
| chart determinism and downsampling | `backend/tests/unit/test_evidence_chart.py` |
| service decisions: linkage, idempotency, plan, storage | `backend/tests/unit/test_evidence_service.py` |
| task retry semantics | `backend/tests/unit/test_evidence_tasks.py` |
| full lifecycle against Postgres | `backend/tests/integration/test_evidence_lifecycle.py` |
| no fabricated claims in the artifact | `frontend/src/lib/__tests__/product-contract.test.ts` |
| console evidence states | `frontend/src/lib/__tests__/evidence-state.test.ts` |
