# Observatory observation correctness — 2026-09-26

## Diagnosis and scope

- `backend/app/modules/checks/http_probe.py::observe_http` already accepted an
  expected-code list and preserved the HTTP code. Public execution in
  `vendors/tasks.py::execute_vendor_check` never supplied an endpoint contract;
  every unexpected result became the generic `probe_failed`.
- `observations/repository.py` counted `error_type != NULL` or missing status as
  unsuccessful. This measures contract compliance, **not** reachability.
  `incidents/public_service.py::_observation_is_up` used the same predicate.
  The incorrect step was conflating this decision with transport facts in the
  public API/UI: `format.ts::deriveState`, `record-sections.tsx`,
  `telemetry-chart.tsx`, and `answer.ts` rendered unsuccessful as no response.
- `frontend/src/app/observatory/page.tsx::ObservatoryIndexPage` explicitly used
  `REGION_RESOLVE_LIMIT = 24`. Region metadata was absent from `VendorResponse`,
  forcing detail calls for a bounded prefix. There was no SQL 24-row limit.

## Implementation

`observations/semantics.py` is the shared read/write normalization layer.
Response receipt always follows the recorded raw status, never the success bit.
It separates reachable, response_received, transport_status, http_status,
response_class and evaluation. Unknown historical transport causes stay unknown.
New observations persist these facts in the existing JSON metadata column.
`error_type` remains the SQL-compatible projection of a failed contract; it is
not advertised as synonymous with a transport error. HTTP failures use
`unexpected_http_response`. SQL availability uses the named `expected_sql`
predicate; incidents consume the normalized evaluation. Customer observation
outbox writes pass through this same observation repository.

The probe retains an HTTP status already received if a subsequent redirect hop
fails/deadlines. Its expected-code argument is validated. A response does not
imply the complete redirect chain met its contract.

`VendorEndpoint.expected_status_codes` and `TargetDefinition.expected_status_codes`
make the public contract explicit and registry-configurable. Defaults remain
`[200]`. Registry validation rejects empty/invalid code sets; registry sync
applies the declared policy. Mistral (`https://status.mistral.ai`) and xAI
(`https://status.x.ai`) are status-page targets, with no repository evidence that
403 is an accepted contract. Their policy remains `[200]`, not `[200,403]`.
Changing this requires an intentional reviewed registry change, not a UI fix.

API schemas now expose facts on catalog/detail/current observations and ordinary
observation responses. Timeline buckets retain response-received and expected
counts separately: a mixed bucket is not assigned a fabricated transport cause.
OpenAPI's affected vendor/timeline definitions are updated. Existing `is_up`
continues to mean contract success. Availability is expected observations / all
observations, not transport reachability; HTTP 403 under `[200]` correctly lowers
that percentage while proving an HTTP response existed.

`VendorService._with_recent_status` batch-loads active endpoint region metadata
for the whole catalog page. Every row supplies sorted/deduplicated `regions` and
`region_state` (`configured`/`unconfigured`). The index makes no region detail
requests. Existing record pagination remains; empty or absent region metadata is
never interpreted as a health failure.

The UI uses explicit response facts, preserves stale-state precedence, prints
HTTP status for unexpected responses and only says no response with explicit
support. Chart buckets show HTTP codes independently of `is_up`. Generic failure
text is “Expectation not met” when transport facts are unavailable. Availability
methodology text distinguishes contract failures from transport failures.

## Incident rules / history

The deterministic detector (`checks/detection.py`) is unchanged: single-point
consecutive unexpected observations reach the configured failure threshold;
expected observations reach the recovery threshold. Multi-point deployments use
the existing quorum rules. Public incidents open as `major`; there is no separate
severity escalation algorithm in the public application service. Existing runs
update their evidence/counts; recovery closes them. Failure kind retains HTTP
4xx/5xx versus timeout/transport and raw status codes.

Migration `0044_endpoint_expectations` adds only the endpoint policy column,
backfilled with the prior `[200]` behavior. It does **not** rewrite observations,
incidents, evidence artifacts, availability history, or endpoint health.
Historical raw statuses safely establish response receipt. Historical evaluation
remains the recorded success/failure, not a re-evaluation under a new policy.
Missing precise error causes are not fabricated. Persisted historical evidence
remains immutable. No access to production history was available in this run.

A repeated 403 under `[200]` can still produce a genuine **unexpected-response
incident**, with 0% contract availability if every sample is 403. The fix does not
promise to erase those incidents or change them to healthy.

## Automated verification

Commands (from backend / frontend respectively):

```
../.venv/bin/pytest tests/unit tests/integration -q
npm test
npm run typecheck
```

- Backend: **1,070 passed, 51 skipped** (existing conditional skips).
- Frontend: **489 passed**, 37 files.
- TypeScript: only missing generated PrismaClient exports in `seed.ts` and
  `src/lib/db.ts`; Prisma generation is blocked by TLS failure downloading its
  engine from binaries.prisma.sh. No changed-file type errors remain.
- `tests/integration/test_observation_semantics.py`: production probe function
  with controlled HTTP/transport responses, actual migrated PostgreSQL writes,
  independent fact assertions, shared detector opening/recovery, SQL availability,
  explicit `[200,403]` acceptance, API catalog/detail/timeline 403 regression,
  and constant-query region coverage at 50/100/500/1001 records.
- Matrix: 200, 201, 204, 301, 302, 403, 404, 429, 500, 502, timeout, DNS, TCP,
  TLS. Under the default policy only 200 is expected; redirects without Location
  are terminal observations. Existing routing/deadline tests also pass.
- Frontend regression proves 403/404/429/500/502 render `Responded — HTTP N`,
  never “No response” or “Not responding”; timeout renders explicitly.

## Measured query counts

SQLAlchemy `before_cursor_execute` instrumentation against migrated local
PostgreSQL, excluding seed/setup and unchanged taxonomy queries:

| Path | Before | After |
|---|---:|---:|
| First catalog page | 2 | 3 |
| Index catalog + 24 region detail reads (cold, 50 rows) | 74 | 3 |
| Required region-bearing catalog at 50/100/500/1001 records | first 24 only | 3 at every size |

The baseline executed `_with_recent_status` extracted from base commit
`bfcb87c` plus the original 24-detail read pattern; each detail takes 3 queries.
The permanent regression counts the current list + observation batch + endpoint
batch. Cursor lookup adds one query on subsequent pages in both versions.
At normal 100-record pagination these costs are bounded per page, not per vendor.
The 1001-row test intentionally stresses the data-access function beyond the
public page-size bound. No new cache or N+1 loading was introduced.

## Live verification and remaining deployment gate

Read-only production-equivalent `observe_http(..., timeout=15)` executions:

| Target | Raw status | Transport | Evaluation |
|---|---|---|---|
| Mistral status page | none | tls_error (TLS EOF) | unexpected |
| xAI status page | none | tls_error (TLS EOF) | unexpected |
| Real short-deadline Mistral probe | none | timeout | unexpected |

These are actual sandbox observations, **not** confirmation of the live 403
reported by the user. No third-party writes were made. The same production
DNS-pinned/security-validated probe function was used; TLS validation was not
bypassed to obtain a desired result.

After the automated tests, read-only requests to
`https://api.reliastra.com/v1/vendors/mistral/timeline`,
`https://api.reliastra.com/v1/vendors/xai`, and
`https://reliastra.com/observatory` all failed during TLS negotiation. Therefore
production index/detail rendering, real region values and post-deployment
incident creation **remain unverified**. This branch has not been deployed and
no production data was modified.

Rollout: apply Alembic migration before starting new API/workers; deploy backend
and frontend together; allow the existing 60-second read cache to expire. From a
production-capable observation host, rerun the two probes, inspect stored facts,
verify catalog + timeline + record displays and region metadata beyond row 24,
then observe a complete detector failure/recovery window. A 403 must appear as
`http_response`, `4xx`, `unexpected` under `[200]`, never no response. Compare
unrelated dependency states and aggregates before closing the deployment gate.
