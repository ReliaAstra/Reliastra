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

### The scheduler enforces this, not just the schema

A dependency row can still carry several region labels — one created before the
topology was corrected, or set through the API by a non-console client. The
dispatcher does not trust them. `CheckDispatcher._regions_for`
(`app/modules/checks/dispatch.py`) probes with exactly **one** label while the
topology is `single`, and logs a warning naming the dependency. Migration
`0045_dependencies_single_region` collapses the two-label legacy default on rows
that still hold it; `dependencies.regions` now defaults to `["us-east"]`.

This matters because the quorum rule counts distinct `observation_point` values.
Without the guard, a single worker emitting two labels satisfies
`QUORUM_MIN_REGIONS = 2` on its own.

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

### The envelope boundary

The served `.json` artifact is the hashed payload **plus an issuance envelope**:
`context_metrics`, `data_hash`, `verification_id`, `report_checksum`,
`generated_at`, `authenticity`. Those describe how the document was issued
rather than what was measured, so they cannot be inside their own hash.

`EVIDENCE_ENVELOPE_KEYS` in `app/modules/evidence/canonical.py` is the single
definition of that boundary, and both generation and verification use it. The
procedure published at `/v1/verify` is **generated from that constant** by
`verification_procedure()`, so the documented recipe cannot drift away from the
serialiser it describes. It previously was a hand-written list that omitted
both the envelope keys and `ensure_ascii=False`, so a third party following it
exactly computed a different digest and concluded a genuine record had been
forged.

## Verification is performed, not reported

`GET /v1/verify/{id}` re-derives its answer on every request
(`app/modules/verification/service.py`):

1. fetch the stored payload from object storage;
2. strip the envelope;
3. re-serialise with `canonical_json_bytes` and re-hash against `data_hash`;
4. cross-check the document's embedded `data_hash` against the row's, which
   catches a payload swapped for a different but internally consistent one;
5. verify the Ed25519 signature over those same bytes against the key published
   for the recorded `signing_key_id`.

The result is three-valued and the distinction is load-bearing:

| `verified` | Meaning |
| --- | --- |
| `true` | re-derived and matched |
| `false` | re-derived and did not match — altered, or signed by a key we do not publish |
| `null` | could not determine: unsigned record, or the payload was unreadable |

The endpoint used to return the stored `data_hash` / `signature` columns and let
the caller infer integrity from their presence. That is circular: a tampered row
stays self-consistent. The CLI (`reliastra verify`) and the public report page
now require `verified === true` and fail closed otherwise, because a gate that
cannot fail is not a gate.

### Key rotation

`/v1/verify/keys` publishes the whole keyring, not just the current key. Each
entry carries `key_fingerprint` — a digest of the key material, independent of
its id — so a verifier that pinned `kid -> key` can detect a different key being
published under a familiar id.

Register superseded keys in `EVIDENCE_SIGNING_KEYRING` **before** rotating, and
use a new `EVIDENCE_KEY_ID`. Without the keyring, the first rotation silently
makes every historical record unverifiable: the endpoint keeps answering
`found: true, signed: true` while the key a record needs no longer exists
anywhere. `verify_signature_over` accepts a record if **any** published key for
its `kid` validates it, so a mistaken id reuse degrades to a detectable
condition rather than destroyed evidence.

## Load shedding must not blind the observer

`CircuitBreaker` collapses repeated expensive probes so a dead dependency stops
eating a worker. Only **transport** failures count — a failure where no HTTP
response came back, which is what actually burns `timeout_seconds`
(`is_expensive_failure` in `app/platform/resilience/circuit_breaker.py`).

It previously counted every `is_up=False`. The detector opens an incident at 2
consecutive failures and the breaker tripped at 3, so a *confirmed, ongoing
outage* opened its own circuit one check later and was then probed at most once
per `HALF_OPEN_INTERVAL_SECONDS` (60 s). Two consequences, both of which corrupt
the published record:

- "2 consecutive failures" stopped meaning consecutive *in time*, so two probes
  60 s apart could confirm an incident with nothing measured in between;
- suppressed checks write no rows, so the availability denominator became a
  biased sample of the worst part of the outage.

An endpoint that answers with an unexpected status is cheap to observe and must
never throttle how often it is looked at.

## Sampling gaps are recorded, not forgiven

The in-flight dispatch marker (`record_check_dispatched`) exists to stop
duplicate publishes, and is cleared by the worker on the success path. A worker
killed mid-probe never clears it, so its TTL is an upper bound on how long one
dead worker can silence a dependency. It is now `min(max(2 × interval, 30), 120)`
seconds — it was `max(interval × 4, 360)`, which is 360 s at a 30 s interval, or
twelve consecutive skipped cycles. Under memory pressure that TTL stopped being
a backstop and became the dispatch mechanism: measured production cadence was one
observation roughly every five minutes while the pricing page advertised 30 s.


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

### Two hashes, one signature, and what each of them proves

| Field | Covers | What it proves |
| --- | --- | --- |
| `data_hash` | the canonical evidence payload - the facts | the payload is internally consistent |
| `report_checksum` | the rendered PDF bytes - the document | this file is the one that was issued |
| `signature` | `data_hash`'s bytes, Ed25519 | a RELIASTRA key produced that payload |

A hash proves nothing about authorship: anyone can hash their own fabricated
facts and the footer will agree with them. So the payload bytes are signed
(`app/modules/evidence/signing.py`) and the public half is published at
`GET /v1/verify/keys` - independently of the document it signs, which is the
only arrangement under which a third party can check anything.

`EVIDENCE_SIGNING_PRIVATE_KEY` is optional, and an unsigned deployment is a
supported state rather than a broken one: `sign_payload` returns `None`, the
document prints **Unsigned** in section 11, and the verification record returns
`"signed": false`. The artifact may never claim a signature it does not carry,
which is why the absence is printed instead of the row being omitted.

```bash
# base64url of a 32-byte seed; or put a PEM key at EVIDENCE_SIGNING_PRIVATE_KEY_FILE
python -c "from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey as K; \
import base64; print(base64.urlsafe_b64encode(K.generate().private_bytes_raw()).decode())"
```

Set `EVIDENCE_KEY_ID` *before* a rotation, not after: it is the identifier quoted
in documents already in circulation, and deriving it from the key means a
rotation silently mints a new one.

The PDF cannot contain its own checksum, nor a statement about which renderer
produced it that is knowable only afterwards. So both live beside the document -
in the JSON sidecar, on the report row (`renderer`, `renderer_version`) and at
`/v1/verify/{verification_id}` - and section 11 says where to find them. When the
fallback renderer is what actually ran, the document is rendered a second time so
that fact is printed on the page: a degraded artifact should be visible in the
artifact. The image build also fails if Chromium cannot launch, so the fallback
is now a deliberate choice rather than a silent accident.

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

### How it is worded

Presentation is a separate concern from measurement, and it is now a separate
module: `app/modules/evidence/design.py` owns every label, every precision and
every derived sentence in the document.

- **No raw storage tokens.** `vendor_failure` prints as "Vendor failure",
  `dep_01J8…` prints as the dependency's name (resolved in one batched query),
  and an unmapped token is title-cased rather than printed verbatim or invented.
  The one exception is the `Rule Identifier` row, where the raw rule key is a
  citation the reader can grep in our source.
- **No float artefacts.** `0.73 * 100` is `73.00000000000001`. Every numeric
  goes through one formatter with an explicit precision; availability keeps four
  decimals because that is what was measured, and an unavailable figure renders
  as an em dash, never as `0` and never as blank.
- **A finding before the data.** Section 0 is a derived block - four figures and
  up to five sentences - and every statement in it restates a number printed
  below it. It contains no recommendation, no liability language, and no fact the
  record does not carry.
- **Addressable.** A report reference a human can say aloud
  (`RA-20260911-OPENAIAPI-188B0`, deterministic from the incident), an addressee,
  a retention end date, and the verification URL as both text and QR. Before
  this, the artifact printed a verification id and no address: the one claim
  anyone could check was not checkable without reading our API docs.
- **`StrictUndefined`.** A typo in the template fails the generation attempt
  instead of printing an empty cell in a document meant to be quoted in a
  dispute.

The appendix (section 10) reproduces up to 60 checks - first 40 and last 20 when
the window is longer, because the first failure and the recovery are the rows a
reader looks for - and states what was withheld. The truncation notice and the
appendix are generated together, so the document cannot promise rows it does not
show.

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
| labels, precision, references, derived findings | `backend/tests/unit/test_evidence_design.py` |
| sign / verify / unsigned degradation / key id | `backend/tests/unit/test_evidence_signing.py` |
| the rendered document, including its limits | `backend/tests/unit/test_evidence_document.py` |
| the public verification record | `backend/tests/unit/test_verification_public_record.py` |
