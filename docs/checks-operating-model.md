# Check execution — operating model

RELIASTRA's uptime probes do **not** run inside the API process. They run in a
Celery worker, dispatched by Celery Beat, through a Redis broker. If any of
those three is missing, **no checks execute** and the dependency history simply
stops growing. This document is the operator's contract for that pipeline.

---

## 1. Required runtime components

A deployment that can execute checks has all four of these, always:

| Component | Role | Missing it means |
|---|---|---|
| **Postgres** | dependency config + `check_result` history | nothing to probe, nowhere to record |
| **Redis** | Celery broker + result backend + scheduler/worker heartbeats | no task can be published or consumed |
| **Celery worker** | executes the probes, writes `CheckResult` rows | tasks queue forever; history stops |
| **Celery Beat** | the **only** scheduler; ticks every `CHECK_SCHEDULE_SECONDS` | nothing is ever dispatched |

> **There is no in-process scheduler and no escape hatch.** A
> `RUN_IN_PROCESS_SCHEDULER` flag used to exist in config and documentation. It
> was never implemented — `main.py` only logged about it — so setting it to
> `true` executed zero checks while silencing the very warning that said so.
> The flag has been deleted. Celery Beat is the single authoritative scheduler;
> do not add a second one.

The pipeline:

```
Celery Beat  ──tick──▶  schedule_checks (worker task)
                              │
                              ▼
                     schedule_due_checks()
                     reads due dependencies (≤500)
                              │
                              │  execute_check.delay(dep_id, region)
                              ▼
                        Redis broker  ──▶  Celery worker
                                                 │
                                                 ▼
                                     resolve_pinned_target_async (SSRF)
                                                 │
                                                 ▼
                                        HTTP probe  ──▶  CheckResult
```

---

## 2. Verifying a deployment

### Redis is reachable

```bash
redis-cli -u "$REDIS_URL" ping
# PONG
```

### A worker is consuming

```bash
celery -A app.infrastructure.celery_app.celery_app inspect ping
# ->  celery@<host>: pong
```

No answer means no worker, and therefore no probes — regardless of what the
API's own health endpoint says.

### Beat is ticking

Beat has no `inspect`. Its proof is a heartbeat key in Redis whose **TTL is
derived from `CHECK_SCHEDULE_SECONDS`**, so mere existence means "beat
published inside the staleness window":

```bash
redis-cli -u "$REDIS_URL" get reliastra:checks:scheduler:last_heartbeat
# 2026-09-05T23:26:12.497681+00:00

redis-cli -u "$REDIS_URL" ttl reliastra:checks:scheduler:last_heartbeat
# 55
```

### The health endpoint

```bash
curl -s http://<api>/health/checks | jq
```

```json
{
  "status": "healthy",
  "scheduler": { "status": "healthy", "age_seconds": 9.5 },
  "worker":    { "status": "healthy", "age_seconds": 9.5 },
  "broker":    { "status": "healthy", "queue_depth": 0 }
}
```

| `status` per component | Meaning |
|---|---|
| `healthy` | heartbeat seen inside the derived staleness window |
| `stale` | heartbeat seen, but too old — that component stopped ticking |
| `not_observed` | no heartbeat yet — never started, or TTL expired |
| `redis_unavailable` | Redis itself is unreachable |

Overall `status` is `healthy`, `degraded` (one component down) or `unavailable`,
and the endpoint returns **HTTP 503** unless healthy — so a load balancer or
orchestrator healthcheck treats a checks-dead deployment as unhealthy. No broker
address or credential is ever included in the response.

**`queue_depth` is the most useful number in an outage.** A rising depth with a
healthy broker means tasks are being published but nothing is consuming them.

### Container healthchecks

`deploy/production/compose.yml` and `backend/docker-compose.yml` both define
healthchecks for the worker and the scheduler. The worker uses
`celery inspect ping`; the scheduler reads the heartbeat key, which is exactly
the liveness proof above.

---

## 3. Per-dependency diagnostics

`GET /v1/checks/state/{dependency_id}` distinguishes states that an empty
history cannot:

| `state` | Meaning | Whose problem? |
|---|---|---|
| `never_checked` | no `CheckResult` has ever been written | pending |
| `awaiting_scheduled_execution` | due, waiting for the next Beat tick | pending |
| `queued` | published to the broker, not yet consumed | infra if it lingers |
| `executing` | a worker is running the probe right now | pending |
| `successful` | last probe succeeded | — |
| `target_failed` | probe reached the target and it failed | **the vendor** |
| `blocked_by_security_policy` | SSRF policy refused the target | **your config** |
| `dispatch_failed` | RELIASTRA could not publish the probe | **RELIASTRA** |
| `scheduler_unavailable` | pipeline not proven alive, so no probe could run | **RELIASTRA** |

The response also carries `is_target_problem`, `is_infrastructure_problem` and a
`pipeline` block, so the UI can say *"the vendor is down"* and *"RELIASTRA never
ran the probe"* as different sentences. That distinction is the whole point:
before it existed, both looked like an empty chart.

A `blocked_by_security_policy` state is never a vendor outage. It means the
configured URL resolves to a private, loopback, link-local or metadata address,
so RELIASTRA refused to send anything. The SSRF policy is deliberately not
relaxed for development convenience — if a dev check needs a local target, that
is a configuration problem to solve explicitly, not a policy to weaken.

---

## 4. Manual trigger

```bash
curl -X POST http://<api>/v1/checks/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Organization-ID: $ORG" \
  -H "Content-Type: application/json" \
  -d '{"dependency_id": "<uuid>", "region": "us-east"}'
```

Authenticated, authorized and rate-limited (`check_trigger_limiter`, per
organization). It enqueues the **same** `execute_check` task the scheduler
uses — there is no second probe implementation, and it does not bypass SSRF
resolution.

It returns **202** with the queued task ids — the probe has been *accepted*,
not completed — and it reports broker errors as **503 with a `reason`** rather
than pretending to have run. A failed trigger never advances `next_check_at`
and never writes a `CheckResult`. Because it publishes through the same broker
to the same worker, a success here is end-to-end proof that
API → broker → worker → probe works.

---

## 5. Failure semantics

These are deliberate and are covered by tests:

- **Dispatch failed** → `checks_dispatch_failures_total{region,reason}` is
  incremented, an error is logged with the dependency id, region, exception type
  and a truncated message, and **`next_check_at` is left unchanged** so the next
  Beat tick retries. No fake `CheckResult` is written — an observation that
  never happened must never appear in history.
- **Broker unreachable** → the whole cycle is skipped before any database work,
  counted as `reason="broker_unavailable"`, and logged loudly.
- **Duplicate dispatch** → if a dependency's previous task is still in flight,
  the scheduler skips it and counts `checks_dispatch_skipped_total{reason="previous_task_in_flight"}`.
  A target slower than `CHECK_SCHEDULE_SECONDS` would otherwise overlap itself
  on every cycle, multiplying load on something already struggling.
- **Dead worker** → `schedule_checks` is itself a worker task, so a dead worker
  schedules nothing at all. Beat keeps publishing periodic ticks, which carry an
  `expires` value and are discarded on delivery rather than stampeding when the
  worker returns.

Logs and metrics never contain tokens, auth headers or probe payloads.
`sanitize_broker_url()` strips credentials from any broker URL before it is
logged.

---

## 6. Metrics

```
reliastra_checks_scheduled_total{region}
reliastra_checks_dispatch_failures_total{region,reason}
reliastra_checks_dispatch_skipped_total{region,reason}
reliastra_checks_total{region,status}
reliastra_check_latency_seconds_bucket{region,le}
reliastra_check_scheduler_cycles_total{result}
reliastra_celery_tasks_total{task,status}
```

**These are incremented in the worker, not in the API.** Without shared
collection the API's `/metrics` endpoint would publish no check metrics at all,
because its own process never records any. All three processes therefore set
`PROMETHEUS_MULTIPROC_DIR` to the same directory, which lets the existing
`/metrics` endpoint on the API serve the whole fleet with no extra port:

```
PROMETHEUS_MULTIPROC_DIR=/var/lib/reliastra/prometheus
```

The directory must be **cleared on worker restart** — stale files from a killed
process would otherwise be reported as live series forever. `scripts/dev-stack.sh`
does this automatically. If the variable is unset, `/metrics` falls back to the
process-local registry, exactly as before.

---

## 7. Development stack

```bash
cd backend
REDIS_URL=redis://127.0.0.1:6379/0 ./scripts/dev-stack.sh start
```

Starts Postgres, Redis, migrations, a Paystack mock, a mail sink, the API, a
worker and Beat — with real readiness waits, not assumptions — and prints an
operational summary. `stop`, `restart`, `status`, and individual `api` /
`worker` / `beat` commands are supported; `run` keeps everything in the
foreground and cleans up its children on exit. Logs land in `.dev-stack/*.log`.

`CHECK_SCHEDULE_SECONDS=10` shortens the tick for local testing.

### Windows local workers must use `--pool=solo`

Celery prefork (billiard) does not run on Windows: the worker crash-loops
with `PermissionError: [WinError 5] Access is denied`, Beat keeps publishing
every `CHECK_SCHEDULE_SECONDS`, and the Redis `celery` list grows (e.g. 2000+
queued) while `reliastra:checks:scheduler:last_heartbeat` and
`reliastra:checks:worker:last_heartbeat` stay missing. Probing is then idle
while the API still answers `/health` 200.

`backend/scripts/dev-stack.sh` auto-selects `--pool=solo` on Git Bash /
MSYS / Cygwin. Native PowerShell:

```powershell
cd backend
.\.venv\Scripts\celery.exe -A app.infrastructure.celery_app.celery_app worker --pool=solo --concurrency=1 --loglevel=info
.\.venv\Scripts\celery.exe -A app.infrastructure.celery_app.celery_app beat --loglevel=info
```

Verify with `celery inspect ping`, both heartbeat keys present, and
`GET /health/checks` (alias `GET /v1/checks/health`) returning 200. Restart
the API after pulling — a stale API process serves an OpenAPI without those
routes (404 on both).

---

## 8. Production safety notes

- **Redis is the broker, so `maxmemory-policy` must be `noeviction`.** An
  `allkeys-lru` policy evicts least-recently-used keys, which under pressure
  includes queued check tasks and the heartbeat keys — silently dropping work
  while the service still looks up. `noeviction` fails loudly on write instead,
  which is what the dispatch-failure metric and `/health/checks` are for.
- `appendonly yes` keeps the queue across a Redis restart.
- Worker and scheduler containers carry healthchecks, resource limits and log
  rotation in `deploy/production/compose.yml`.
- `task_acks_late` + `task_reject_on_worker_lost` mean a worker killed mid-probe
  returns the task to the queue rather than losing it.
- `CHECK_SCHEDULE_SECONDS`, `CELERY_*` concurrency and time limits, and
  `CHECK_DISPATCH_FAIL_FAST` are all environment-configurable. Nothing is
  hard-coded to localhost, and no secret is hard-coded.
