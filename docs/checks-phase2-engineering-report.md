# Check execution — phase 2 engineering report

**Date:** 2026-09-05
**Scope:** make RELIASTRA's check execution production-ready
**Verdict:** the real runtime path was booted and exercised end to end — Beat →
broker → worker → probe → `CheckResult` — including the failure path. See §7 and §8.

---

## 1. Root cause

Three independent faults, only the first of which was a scheduling bug.

### 1.1 The documented scheduler escape hatch did not exist

`RUN_IN_PROCESS_SCHEDULER` was read from config and logged about in `main.py`,
but **nothing implemented it**. Setting it to `true` executed zero checks while
silencing the warning that said so. Anyone following the documented single-process
dev path got a system that looked healthy and never probed anything.

The flag has been deleted rather than defaulted, so the choice cannot be made
again by accident:

```
$ grep -Rni "RUN_IN_PROCESS_SCHEDULER" . --exclude-dir=.git --exclude-dir=node_modules
# zero references in code, config, compose, scripts or tests
```

Remaining hits are prose in historical audit documents, each annotated as
superseded (§6).

### 1.2 Nothing could tell an outage apart from an unexecuted probe

`CheckResult` rows were the only signal. No row meant either *"the vendor is
down"* or *"RELIASTRA never ran the probe"* — indistinguishable, and both render
as an empty chart. This is the symptom that makes an operator distrust the
whole product.

### 1.3 Session teardown could not explain itself

`sessionExpired()` logged nothing distinguishing a 401 from a 429, a 502 from a
network failure, or a malformed body from a real expiry — so a transient proxy
error was silently indistinguishable from a dead session, and a refresh token
could be destroyed for a reason nobody could read out of a log.

---

## 2. What changed

### 2.1 Celery + Redis are first-class and the only path

`backend/app/infrastructure/celery_app.py` — audited and hardened:

- explicit broker **and** result backend, both from `settings.REDIS_URL`
- stable, fully-qualified task names; `test_no_task_name_is_registered_twice`
  guards against double registration
- `task_acks_late` + `task_reject_on_worker_lost`, so a worker killed mid-probe
  returns the task to the queue instead of losing it
- `task_default_queue="celery"` + `task_create_missing_queues=True`
- 11 beat entries; every high-frequency one carries an `expires` (§4.2)
- the app fails visibly when mandatory infra is missing

`grep` confirms **exactly one** scheduling mechanism:

```
$ grep -rn "schedule_due_checks" backend/app        # called only from tasks.py:81
$ grep -rn "execute_check.*\.delay" backend/app     # service.py:289 (scheduler)
                                                    # service.py:858 (manual trigger)
$ grep -Rni "apscheduler|BackgroundScheduler|schedule\.every" backend/app frontend/src
# none
```

`schedule_due_checks` is invoked only by the `schedule_checks` Celery task.
`execute_check` is published from exactly two places — the scheduler and the
manual trigger — and both call the **same** task. The API never probes inline.

### 2.2 Scheduler + worker heartbeats

`backend/app/modules/checks/scheduler_health.py` (new):

| Key | Written by | TTL |
|---|---|---|
| `reliastra:checks:scheduler:last_heartbeat` | Beat tick | `max(CHECK_SCHEDULE_SECONDS × 4, 60)` |
| `reliastra:checks:worker:last_heartbeat` | `worker_heartbeat` task | same |
| `reliastra:checks:dispatch_failure:{dep_id}` | dispatch failure | 3600 s |
| `reliastra:checks:dispatched:{dep_id}` | dispatch | in-flight window |
| `reliastra:checks:executing:{dep_id}` | probe start | `CELERY_TASK_TIME_LIMIT` |

Every TTL is **derived from config**, not hard-coded.
`test_heartbeat_ttl_is_derived_from_the_schedule_interval` is parametrized over
`CHECK_SCHEDULE_SECONDS ∈ {5, 10, 30, 120, 900}` and asserts both the derivation
formula and two invariants (TTL ≥ 2 × interval, TTL ≥ 60 s) — comparing the
property to the same settings values it reads would also pass for a constant,
which is precisely the mistake being guarded against.

### 2.3 `GET /health/checks`

Reports `scheduler`, `worker` and `broker` independently as
`healthy | stale | not_observed | redis_unavailable`, with an overall
`healthy | degraded | unavailable`, and returns **HTTP 503** unless healthy.
`broker.queue_depth` is included because a rising depth with a healthy broker is
the clearest possible "nothing is consuming" signal. No broker address or
credential appears in the response — `sanitize_broker_url()` is log-only, and
`test_health_payload_exposes_no_broker_address` asserts the payload contains
neither the host nor the password.

### 2.4 Check-state diagnostics

`CheckState` (new enum in `constants.py`) gives nine nameable states:
`never_checked`, `awaiting_scheduled_execution`, `queued`, `executing`,
`successful`, `target_failed`, `blocked_by_security_policy`, `dispatch_failed`,
`scheduler_unavailable` — surfaced through `GET /v1/checks/state/{id}` with
`is_target_problem`, `is_infrastructure_problem` and a `pipeline` block.

The `error_message` prefixes are now named constants used by **both** the
producer and the classifier, so they cannot drift:

```
$ grep -rn "blocked by security policy" backend/app --include=*.py
constants.py:14   BLOCKED_BY_SECURITY_POLICY_PREFIX = "URL blocked by security policy"
constants.py:17   REDIRECT_BLOCKED_BY_SECURITY_POLICY_PREFIX = "Redirect blocked by ..."
service.py:368    error_message=f"{BLOCKED_BY_SECURITY_POLICY_PREFIX}: {reason}"
service.py:478    redirect_error = f"{REDIRECT_BLOCKED_...}: {exc}"
service.py:679    (classifier reads the same constants)
```

`constants.py` is purely additive — 61 insertions, 0 deletions; the three
pre-existing quorum constants are untouched.

**SSRF was not modified.** `resolve_pinned_target_async` and the policy are
byte-identical; a policy rejection stays distinct from a timeout, from worker
unavailability and from scheduler unavailability.

### 2.5 Dispatch failures are counted, logged and never faked

`checks_dispatch_failures_total{region,reason}` increments on every failed
`execute_check.delay()`. The log line carries dependency id, region, exception
type and a truncated message — never a token, auth header or probe payload.

`next_check_at` is **not** advanced and **no `CheckResult` is written**. A probe
that never happened must never appear in history.

### 2.6 Manual trigger

`POST /v1/checks/run` — authenticated, authorized, rate-limited per
organization. Publishes the same `execute_check` task, returns **202** with the
queued task ids, and returns **503 with a `reason`** when the broker refuses.
No duplicated probe logic, no SSRF bypass, no inline execution.

### 2.7 Metrics actually reach Prometheus

Check counters are incremented **in the worker**, never in the API. Before this
change the API's `/metrics` published *zero* `reliastra_*` series — verified
live: `curl -s /metrics | grep -c "^reliastra_"` → `0`. A counter nobody can
scrape is not observability.

`render_metrics()` now uses `prometheus_client`'s multiprocess collector when
`PROMETHEUS_MULTIPROC_DIR` is set, so the existing API endpoint serves the whole
fleet with no extra port. If the directory is empty it falls back to the local
registry rather than publishing a blank page. Unset ⇒ previous behaviour exactly.

### 2.8 Frontend session diagnostics

`frontend/src/lib/session-expiry.ts` (new) is the single classifier and logger.
`classifyAuthFailure()` returns
`unauthorized | rate_limited | proxy_unavailable | server_error | client_error | network | malformed | no_session`.
`logSessionEnd()` and `logAuthWarning()` assemble their messages **internally**,
so no call site can interpolate a token into a log line, and `redact()` strips
bearer tokens, `authorization:`/`cookie:` values and JWTs.

`isSessionInvalid()` is true **only** for `unauthorized` and `no_session`. A 403
whose `code` is not an auth code is resource authorization, not a dead session —
that guard is what stops a 429 or a 5xx from destroying a valid refresh token.

### 2.9 Dev stack

`backend/scripts/dev-stack.sh` rewritten: `start | run | api | worker | beat |
stop | restart | status`; configurable `REDIS_URL`; real readiness waits;
process-group cleanup on exit; meaningful startup errors; an operational summary
block.

---

## 3. Architecture

```
                            ┌──────────────────────────┐
                            │      Celery Beat         │  the ONLY scheduler
                            │  every CHECK_SCHEDULE_S  │
                            └───────────┬──────────────┘
                                        │ schedule_checks (expires=2×interval)
                                        │ worker_heartbeat (expires=2×interval)
                                        ▼
                                 ┌─────────────┐
        POST /v1/checks/run ───▶ │    Redis    │ ◀── heartbeats (TTL from config)
        (same execute_check)     │   broker    │ ◀── dispatched/executing markers
                                 └──────┬──────┘
                                        │ execute_check(dep_id, region)
                                        ▼
                            ┌──────────────────────────┐
                            │      Celery worker       │
                            │  schedule_due_checks     │
                            │  → execute_check         │
                            │     SSRF pin + probe     │
                            └───────────┬──────────────┘
                                        ▼
                                 ┌─────────────┐        ┌──────────────┐
                                 │  Postgres   │        │  /metrics    │
                                 │ CheckResult │        │ multiproc    │
                                 └─────────────┘        └──────────────┘
        GET /health/checks ◀── reads heartbeats + queue_depth
        GET /v1/checks/state/{id} ◀── classifies the nine states
```

---

## 4. Bugs found by actually running it

Four real defects, all found by booting the stack rather than by reading code.
Two were mine.

### 4.1 `task_queues` killed the worker at startup (mine)

Setting `celery_app.conf.task_queues = ("celery",)` raises
`AttributeError: 'str' object has no attribute 'name'` at worker boot — Celery
needs kombu `Queue` objects there. Fixed with `task_default_queue` +
`task_create_missing_queues`, plus a comment saying never pass names.

### 4.2 Readiness probe declared a healthy worker failed (mine)

`celery inspect ping | grep -q pong` under `set -euo pipefail`: `grep -q` exits
on match, celery gets SIGPIPE, the pipeline reports failure. A worker that
answered *"celery@e2b.local ready"* was declared dead, costing ~245 s per boot.
Fixed by capturing output then matching.

### 4.3 Redis eviction policy could silently drop queued work

Production Redis ran `--maxmemory 128mb --maxmemory-policy allkeys-lru`. Redis
**is the broker** here: under pressure LRU evicts least-recently-used keys,
which includes queued check tasks and the heartbeat keys — losing work while the
service still looks healthy. Changed to `noeviction` (fail loudly on write,
which is what the dispatch-failure metric and `/health/checks` report) and
raised the limit to 256mb.

### 4.4 Worker and Beat had no healthchecks

Neither `backend/docker-compose.yml` nor `deploy/production/compose.yml` had one,
so an orchestrator would restart a wedged API but never notice a dead worker —
precisely the failure mode this whole phase is about. Both files now define
healthchecks, and production also gained resource limits and log rotation for
the worker, scheduler and Redis.

Both healthcheck commands were executed against the live stack:

```
worker: celery -A ... inspect ping -d celery@$HOSTNAME -t 10 | grep -q pong   → exit 0
beat:   python -c "...get('reliastra:checks:scheduler:last_heartbeat')..."    → exit 0
        (same command with the key deleted)                                   → exit 1  ✓
```

---

## 5. A misdiagnosis I made and corrected

Worth recording because it changed the fix.

Watching the worker-down test, queue depth climbed 0 → 31 in 90 s. I concluded
Beat was republishing the same `execute_check` every cycle and added an
in-flight guard, writing in the code comment *"observed live: depth 0 → 31 in
90 s with the worker killed."*

**That attribution was wrong.** Inspecting the queue contents:

```
queue depth: 33
   11  app.modules.checks.tasks.schedule_checks
   11  app.modules.checks.tasks.worker_heartbeat
   11  app.modules.observations.tasks.process_outbox
distinct execute_check targets: 0
```

Zero `execute_check` messages. `schedule_checks` is *itself* a worker task, so a
dead worker schedules nothing at all — the growth was Beat's periodic ticks
backing up. Those already carried `expires` and are discarded on delivery, so
there was no unbounded-growth defect on that path.

What I did with that:

- **Corrected the false comment** in `service.py` to describe the case the guard
  actually covers — a worker that is alive but slower than
  `CHECK_SCHEDULE_SECONDS`, where a probe would otherwise overlap itself every
  cycle and multiply load on a target already struggling. The guard is
  legitimate for that and is tested; it is simply not what I observed.
- **Closed the one real gap** the inspection exposed: `process_outbox` had no
  `expires`, so a backlog of identical outbox drains would all execute. Added.
- **Locked it in with a test** — `test_periodic_tasks_expire_so_a_broker_backlog_drains_as_no_ops`
  fails if any sub-60 s schedule lacks `expires`.
- The guard then fired **3 times in the live path** during a worker restart, so
  it is exercised, not theoretical.

---

## 6. Documentation

New: **`docs/checks-operating-model.md`** — required runtime components, the
verification commands, the health endpoint, the nine states, the manual trigger,
failure semantics, metrics, dev stack, production safety notes.

`README.md` now opens the stack section with the four-component requirement and
links to it.

Two historical documents claimed `RUN_IN_PROCESS_SCHEDULER` was a working
escape hatch. Both were false and both are now annotated as superseded rather
than silently deleted:

- `backend/audit/reliastra_production_audit.md:101` — *"Fix shipped (partial)"*
- `backend/FIXES_IMPLEMENTED.md:418` — *"`RUN_IN_PROCESS_SCHEDULER=false` on the API"*

---

## 7. Tests

### Commands and results (all executed)

```
$ cd backend && python -m pytest tests/unit/test_check_pipeline_observability.py -q -p no:randomly
32 passed in 2.16s

$ python -m pytest tests/integration/test_checks_runtime.py -q -p no:randomly
13 passed

$ python -m pytest -q -p no:randomly
3 failed, 615 passed, 7 skipped, 4 warnings in 85.80s

$ cd frontend && npx vitest run
 Test Files  1 passed (1)
      Tests  18 passed (18)

$ npm run lint
✖ 5 problems (0 errors, 5 warnings)

$ npm run build
✓ Compiled successfully   (ignoreBuildErrors: false → full typecheck)
```

### The 3 failures are pre-existing

```
tests/integration/test_billing_api.py::test_initialize_annual_uses_the_annual_payment_price
tests/integration/test_checkout_flow.py::test_transaction_is_opened_with_a_card_only_channel_array
tests/integration/test_checkout_flow.py::test_a_client_volunteering_an_amount_is_ignored_not_rejected
```

All three are `KeyError: 'body'` from a Paystack capture mock, order-dependent,
and unrelated to checks. Proven by running the identical command in a worktree at
the base commit `0857083`:

| | failed | passed | skipped |
|---|---|---|---|
| base `0857083` | 3 | 570 | 7 |
| this branch | 3 | **615** | 7 |

**+45 passing tests, zero regressions.**

### Requirement 12 coverage

| | Requirement | Test |
|---|---|---|
| A | Beat → `schedule_checks` on interval | `test_worker_heartbeat_is_scheduled_on_the_check_interval`, `test_beat_schedule_references_only_registered_tasks` |
| B | due dep → `.delay()` queued | `test_successful_dispatch_is_counted_and_marks_the_dependency_queued` |
| C | real task produces `CheckResult` | `test_checks_runtime.py` (eager Celery, real row read back) |
| D | Redis down → metric + log + `next_check_at` unchanged + no fake observation | `test_dispatch_failure_increments_metric_and_keeps_dependency_due`, `test_unreachable_broker_skips_the_cycle_without_touching_the_database` |
| E | manual trigger uses same task path | `test_checks_runtime.py` + live proof §8 |
| F | SSRF still blocks | `test_classify_blocked_by_security_policy_is_not_a_target_failure` + existing suite |
| G | heartbeat healthy → stale | `test_heartbeat_goes_stale_when_scheduling_stops` |
| H | session-expiry diagnostic has status, no secrets | 18 vitest cases |

Plus: duplicate-dispatch guard, in-flight marker clearing, periodic-task expiry,
and cross-process metric aggregation (a real subprocess writes the sample, the
parent renders it — the production path, not a stand-in).

### Lint

`ruff` is non-blocking in CI and reports 571 issues at baseline. Judged per file
against the base blob:

```
git show 0857083:backend/<path> | ruff check --stdin-filename <path> -
```

Every file I touched is clean except one `I001` in `celery_app.py` that is
present at base too.

---

## 8. End-to-end proof (live stack)

`bash scripts/dev-stack.sh start` → **healthy in 33.1 s**: Postgres, Redis,
migrations, Paystack mock, mail sink, API, worker (`inspect ping → pong`), Beat
(heartbeat present in Redis).

Registered a real user (OTP read from the mail sink), created a dependency on
`https://pypi.org/simple/` — a public, non-private IPv6 host, so SSRF passes
without being weakened:

```
state before any probe:  awaiting_scheduled_execution | is_due=True | last_result=None
   t+5s   check_results=0   queue_depth=0
   t+10s  check_results=2   queue_depth=0

   region=eu-west is_up=True status_code=200 latency_ms=279.6
   region=us-east is_up=True status_code=200 latency_ms=273.5

state after:  successful | is_target_problem=True | is_infrastructure_problem=False

scheduler heartbeat  2026-09-05T23:23:42.772825+00:00  (ttl 58s)
worker    heartbeat  2026-09-05T23:23:42.760682+00:00  (ttl 58s)
```

Metrics on the API endpoint, written by the worker:

```
reliastra_checks_scheduled_total{region="us-east"} 2.0
reliastra_checks_scheduled_total{region="eu-west"} 2.0
reliastra_check_scheduler_cycles_total{result="ok"} 4.0
reliastra_checks_total{region="eu-west",status="up"} 2.0
reliastra_celery_tasks_total{status="SUCCESS",task="app.modules.checks.tasks.execute_check"} 4.0
```

### Manual trigger (live)

A dependency with `check_interval_seconds: 300`, so it was **not** naturally due:

```
POST /v1/checks/run            → HTTP 202
  queued: [('us-east', '49977fc7-0b8c-42f3-bb8d-f64ddd27a9c4')]
  t+6s  PROBE RAN: region=us-east is_up=True status=200 latency=286.7ms
no token                       → HTTP 401
unknown dependency             → HTTP 404 RESOURCE_NOT_FOUND
```

---

## 9. Failure proof (live)

Worker killed while Beat and Redis stayed up:

```
baseline   /health/checks=200  scheduler=healthy  worker=healthy  broker=healthy  queue=0
  t+15s    /health/checks=200  worker age 28s   queue_depth=7
  t+30s    /health/checks=200  worker age 43s   queue_depth=13
  t+45s    /health/checks=200  worker age 58s   queue_depth=16
  t+60s    /health/checks=503  status=degraded  worker=not_observed  queue_depth=22
  t+75s    /health/checks=503  status=degraded  worker=not_observed  queue_depth=25
  t+90s    /health/checks=503  status=degraded  worker=not_observed  queue_depth=31
```

The endpoint degrades to **503** once the derived TTL lapses. The dependency's
own state stayed `successful` — its last probe genuinely succeeded — but the
response carried `pipeline.status = degraded`, so the UI can say both true
things at once instead of showing an empty chart:

```
state          = successful
detail         = Last probe succeeded (83 ms).
pipeline       = {'status':'degraded','scheduler':'not_observed',
                  'worker':'not_observed','broker':'healthy'}
check_results  = 2   ← no new probes; the history did not silently empty
```

Worker restored:

```
  t+12s  results=20  queue_depth=0  /health/checks=200
  t+36s  results=22  queue_depth=0  /health/checks=200
  final  healthy | scheduler healthy | worker healthy | broker healthy
  state  = successful | pipeline = healthy
```

The 51-message backlog drained to zero and probing resumed on its own.

---

## 10. Remaining risks

Stated plainly, none of them verified end to end here:

1. **Docker was never run.** `docker compose config` was not executed — Docker
   is unavailable in this sandbox. Both compose files parse as valid YAML and
   the healthcheck *commands* were run against the live stack, but the container
   wiring itself (image, `PATH`, `$$HOSTNAME` expansion, `depends_on` ordering)
   is unverified. **This is the largest remaining gap.**
2. **Prometheus was never scraped.** Multiprocess aggregation is proven by a
   real subprocess test and by the live `/metrics` output, but no scraper has
   read it, and `PROMETHEUS_MULTIPROC_DIR` is not yet set in
   `deploy/production/compose.yml` or the production env file — only in
   `dev-stack.sh`. It must be added, and cleared on worker restart, before
   worker metrics appear in production.
3. **The 3 pre-existing test failures** in billing/checkout remain. Unrelated to
   this work, but the suite is not green.
4. **`http_requests_total` is defined but never incremented** anywhere — a
   pre-existing dead metric I did not touch.
5. **Single-region Redis** in production. It is the broker, the result backend
   and the heartbeat store; if it dies, checks stop. The system now *reports*
   that loudly (`redis_unavailable`, dispatch-failure metric) rather than
   silently, but there is no failover.
6. **The in-flight marker TTL floor is 300 s.** A task genuinely lost without
   being requeued would hold that dependency back for up to 5 minutes. Bounded
   and logged, but a bound.
7. **No load test.** Dispatch was exercised with a handful of dependencies, not
   the 500-per-cycle ceiling.
