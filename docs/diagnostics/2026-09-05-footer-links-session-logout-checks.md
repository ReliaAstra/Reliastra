# Diagnostic report — footer links, session logout, checks not executing

Date: 2026-09-05
Branch: `arena/01a073a0-reliastra` (base `0857083`)
Method: static trace + live execution. Everything below marked **[executed]** was
observed by running code in this sandbox; everything else is a file/line citation you can
open.

Environment used for the live checks:

- Frontend: `npx next dev -p 3000 -H 0.0.0.0` (Next.js 16.3.3, Turbopack) — still running.
- Backend: repo requirements installed into a venv; `pytest` run against the project's own
  harness (`pgserver` embedded Postgres + `fakeredis`).
- No Redis and no Celery are present in this sandbox: `command -v redis-server` → nothing,
  `ss -ltn` → nothing listening on 6379 (only 3000/22/111).

## Summary

| Symptom | Root cause | Severity | Verified |
| --- | --- | --- | --- |
| Footer links "not clicking" | 6 of the 14 footer links are dead: 4 point at `/research*` routes that do not exist (**404**), 2 call `scrollToId()` on section ids that are not in the rendered page (silent scroll-to-top) | High (marketing page) | **[executed]** — live 404s |
| Automatically logged out of dashboard | Access token TTL is **15 min**; the console re-authenticates from scratch on every page load; and *any* non-2xx from `/v1/auth/refresh` (429, 502, blip) is treated as "session dead" and **deletes the refresh token** | High | **[executed]** — 14.991 min token lifetime |
| Checks not executing | Checks are triggered **only** by Celery Beat → `schedule_checks` → `execute_check.delay()`. No beat/worker and no Redis ⇒ nothing ever dispatches. `RUN_IN_PROCESS_SCHEDULER=true`, the documented single-process escape hatch, is a **dead setting** | High (core product) | **[executed]** — enqueue fails without a broker |

---

## 1. Footer links are not accessible

File: `frontend/src/components/landing/sections/Footer.tsx` (rendered by
`frontend/src/components/landing/page-landing.tsx`).

Nothing is blocking pointer events — I checked for overlays, `pointer-events: none`, and
z-index traps across `frontend/src/components/landing/**` and `globals.css`; the only
`pointer-events: none` rules are decorative (`not-found.tsx` grid, search icons,
`disabled:` button states). The handlers do fire. They just do nothing useful.

(`FOOTER_LINKS` holds 14 entries across the four columns; the bottom bar adds a 15th,
`System status` → `/track`, which works.)

### 1.1 Four links 404 — the `/research` route does not exist **[executed]**

`Footer.tsx:24-27` links to four research pages. There is no `frontend/src/app/research/`
directory at all (`ls frontend/src/app` → `(console) admin api checkout login portal privacy
reports reset-password signup terms track verify-email …`).

Live against the running dev server:

```
200  /track
404  /research
404  /research/the-dependency-gap
404  /research/how-reliastra-measures-vendor-reliability
404  /research/reliastra-research-agenda
200  /privacy
200  /terms
```

The same dead target is also in the navbar: `Navbar.tsx:67` and `Navbar.tsx:131`
(`href="/research"`).

### 1.2 Two links scroll nowhere — the anchor ids are not on the page **[executed]**

- `Footer.tsx:15` — `Features` → `scrollToId('solution')`
- `Footer.tsx:18` — `Partners` → `scrollToId('partners')`

`scrollToId` (`frontend/src/components/landing/theme.ts:27-35`) falls back to
`window.scrollTo({ top: 0 })` when the id is missing — so the click silently jumps to the
top of the page and nothing else happens. That is the "it's not clicking" feeling.

The ids exist only in two components that **nothing imports**:

```
src/components/landing/sections/PartnersSection.tsx:62:  <section id="partners" ...>
src/components/landing/sections/SolutionSection.tsx:32:  <section id="solution" ...>

grep -rn "SolutionSection|PartnersSection" src/   →  no matches outside those two files
```

Section ids actually present in the rendered landing tree:

```
Navbar: <none>            HeroSection: id="top"      EvidenceSection: id="evidence"
LiveVendorGrid: id="live" ResearchSection: id="research"
ComparisonTable: id="comparison"   PricingSection: id="pricing"
FAQSection: <none>        FinalCTA: <none>           Footer: <none>
```

So `Pricing` (line 16) works, `Features` and `Partners` do not.

### 1.3 Three links swap the whole page instead of navigating

`Support` (33), `Contact` (34) and `Guarantee` (43) all call `goTo('support')`, which does
`usePartnerStore.getState().navigate('support')` (`theme.ts:9-24`). That mutates zustand
state; `frontend/src/app/page.tsx` then re-renders and replaces the entire marketing page
with the partner SPA's `PublicLayout` — **without changing the URL**. Consequences:
no address-bar change, nothing to bookmark or share, middle-click / ⌘-click / "open in new
tab" does nothing at all (they are `<button>`s, not `<a>`s, so there is no href and no
pointer affordance), and a reload drops the visitor back on the landing page.

`Join as partner` (35) is fine — `goTo('signup')` does `window.location.assign('/signup')`.

### 1.4 Full audit of all 14 footer links (+ the `System status` link)

| # | Label | Target | State |
| --- | --- | --- | --- |
| 1 | Features | `scrollToId('solution')` | dead — id not rendered |
| 2 | Pricing | `scrollToId('pricing')` | OK |
| 3 | Track | `/track` | OK (200) |
| 4 | Partners | `scrollToId('partners')` | dead — id not rendered |
| 5 | Research Home | `/research` | **404** |
| 6 | The Dependency Gap | `/research/the-dependency-gap` | **404** |
| 7 | Measurement Methodology | `/research/how-reliastra-measures-vendor-reliability` | **404** |
| 8 | Research Agenda | `/research/reliastra-research-agenda` | **404** |
| 9 | Support | `goTo('support')` | works, but URL-less page swap |
| 10 | Contact | `goTo('support')` | same |
| 11 | Join as partner | `/signup` | OK (200) |
| 12 | Privacy Policy | `/privacy` | OK (200) |
| 13 | Terms of Service | `/terms` | OK (200) |
| 14 | Guarantee | `goTo('support')` | same as #9 |
| 15 | System status | `/track` (`Footer.tsx:123`) | OK (200) |

(The partner-network footer, `components/partner/public/partner-footer.tsx`, is clean — all
13 of its store-routed pages exist in `public-layout.tsx:60-86`.)

### 1.5 Fix

1. Either add the `app/research/**` routes (4 pages + index) or drop those four links and
   the two navbar links. There is a `ResearchSection` already on the landing page
   (`id="research"`) that these were presumably meant to expand.
2. Point `Features` at an id that exists (`evidence` or `comparison`) and either restore
   `PartnersSection` to `page-landing.tsx` or repoint `Partners`.
3. Make the three support links real anchors (`href="/support"` — the console route already
   exists at `app/(console)/support/page.tsx`) so they are keyboard- and click-target
   accessible.

---

## 2. You are being logged out of the dashboard

Four separate things combine. The first two make it frequent; the third makes it permanent;
the fourth is a foot-gun that produces it constantly in a mis-wired environment.

### 2.1 The access token only lives 15 minutes **[executed]**

```
$ python -c "from app.core.security import create_access_token; ..."
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS   = 7
access token lifetime (min) = 14.991
refresh token lifetime (days) = 7.0
```

(`backend/app/config.py:88-95`, `backend/app/core/security.py:41-60`.)

But the browser cookie that carries the token across the preview edge is written for an
hour, with a comment that is simply wrong:

```ts
// frontend/src/lib/auth-cookie.ts:24
const MAX_AGE_SECONDS = 60 * 60; // matches ACCESS_TOKEN_EXPIRE_MINUTES=60
```

`backend/.env.example:58` also ships `ACCESS_TOKEN_EXPIRE_MINUTES=15`. So every 15 minutes
the session in your hand is already dead and the app must rotate. Anyone reading that
comment will believe they have an hour.

### 2.2 Every page load burns a refresh rotation

`frontend/src/lib/dashboard/api.ts:601-608` (`bootstrapSession`) starts with
`const refreshed = await refreshSession(); if (!refreshed) return null;` — it never reuses
a still-valid access token. `DashboardProviders`
(`components/dashboard/shell/providers.tsx:59-77`) runs that on every mount and calls
`redirectToSignIn()` if it returns null. Net effect: **every hard reload, deep link or
refresh of the console performs a full token rotation**, so the refresh token is spent
continually and every one of those moments is a chance to be signed out.

### 2.3 Any transient refresh failure is treated as "session expired" — and wipes the token

```ts
// frontend/src/lib/auth-refresh.ts:41
if (!res.ok) return null;          // 429? 502? network blip? → "no session"
```

```ts
// frontend/src/lib/dashboard/api.ts:177-181
if (res.status === 401) {
  useAppStore.getState().sessionExpired();
  throw new ApiError('Your session has expired. Please sign in again.', 401);
}
```

`sessionExpired()` (`stores/app-store.ts:156-171`) calls `clearCustomerTokens()`, which
**deletes `reliastra_refresh_token` from localStorage**, and `providers.tsx:86-89` then
routes to `/login?expired=1`. So one failed HTTP call — a 429, a 502 from the Next proxy
(`lib/backend-proxy.ts:95-115` returns a structured 502 whenever the upstream fetch
throws), a backend restart, a moment of offline — is a hard logout that cannot be recovered
without signing in again. There is no retry and no distinction between "token rejected"
(401) and "server unavailable" (5xx / network).

### 2.4 `/v1/auth/refresh` sits behind the shared 100 req/min IP limiter

```py
# backend/app/core/rate_limit.py:121
ip_limiter = SlidingWindowRateLimiter(limit=100, window_seconds=60, key_prefix="rl_ip")
# backend/app/modules/auth/router.py:76-84
async def refresh_token(...):
    await enforce_rate_limit(request, ip_limiter)
```

The same bucket is used by register/login/verify-otp/resend (`auth/router.py:60,71,82,113,
155,171,200`) and by `analytics/router.py:21`. Behind a preview proxy, an office NAT or a
load balancer that loses `X-Forwarded-For`, every user shares one bucket, and the console
polls on top of it (`shell/top-bar.tsx:68` 60 s, `lib/dashboard/queries.ts:286,317,327`).
Hitting 429 on refresh ⇒ §2.3 ⇒ logged out. It fails *open* when Redis is down, so this
only bites when Redis is healthy.

### 2.5 Wrong-backend wiring (the most likely cause if it happens immediately)

```ts
// frontend/src/lib/backend-proxy.ts:1-3
const BACKEND_URL =
  process.env.RELIASTRA_API_URL?.replace(/\/$/, '') || 'https://api.reliastra.com';
```

and `frontend/.env.example:11` ships `RELIASTRA_API_URL="https://api.reliastra.com"`. Only
the Docker image pins it to the co-located API (`Dockerfile:106-107`
`RELIASTRA_API_URL=http://127.0.0.1:8000`). If your local/preview frontend does not have
`RELIASTRA_API_URL` pointed at the API you actually signed into, every request is validated
against a different `SECRET_KEY` (`backend/app/config.py:83-87` — the shipped placeholder)
and returns 401 forever: login appears to work, then everything is signed out. Symptom:
logout within seconds rather than after 15 minutes.

### 2.6 What I could *not* reproduce here

Multi-worker refresh-token replay. `AuthService.refresh` serialises with a per-process
`asyncio.Lock` and a per-process grace cache
(`backend/app/modules/auth/service.py:246-365`), so with `API_WORKERS > 1` a same-token
replay landing on a different worker relies on the `recent_rotation` DB check rather than
the in-memory cache. The same-process cases pass (`tests/unit/test_auth_token_family.py` —
5 passed, incl. `test_refresh_reuse_within_grace_window_is_benign` and
`test_refresh_service_rejects_replayed_token`), but I did not run a multi-worker
concurrency test, so I am flagging it as a residual risk, not a confirmed cause.

### 2.7 How to confirm which one is hitting you (60 seconds)

DevTools → Network, filter `refresh`, then reload the console:

- `429` → §2.4. `502 BACKEND_UNAVAILABLE` → §2.3/§2.5 (check `RELIASTRA_API_URL` on the
  server). `401` immediately → §2.5. Works, then dies ~15 min later → §2.1.
- Then Application → Local Storage: if `reliastra_refresh_token` disappears at the moment
  of logout, that is §2.3 destroying a session that was still valid.

### 2.8 Fix

1. `auth-refresh.ts` — only treat `401` as terminal. On 429/5xx/network, retry with
   backoff and leave the refresh token alone.
2. `api.ts` `bootstrapSession` — reuse a non-expired access token (decode `exp`) instead of
   rotating on every load.
3. `auth-cookie.ts:24` — derive the cookie `Max-Age` from the real TTL (or fix the comment
   and the env to 60).
4. Give `/v1/auth/refresh` its own limiter keyed on the token family, not the shared
   100/min IP bucket.
5. Log the failing status in `sessionExpired()` so this is diagnosable from the client.

---

## 3. Checks are not executing

### 3.1 There is exactly one trigger, and it is Celery Beat **[executed]**

```
$ grep -rn "schedule_due_checks" backend/app      # only the Celery task calls it
backend/app/modules/checks/tasks.py:70:  return await check_service.schedule_due_checks(session)
backend/app/modules/checks/service.py:138: async def schedule_due_checks(...)

$ grep -rn "execute_check" backend/app            # only schedule_due_checks calls it
backend/app/modules/checks/service.py:195: execute_check_task.delay(str(dep.id), region)
```

The chain is `beat_schedule["schedule-checks-periodic"]`
(`backend/app/infrastructure/celery_app.py:106-112`, interval `CHECK_SCHEDULE_SECONDS`,
default 30 s) → `app.modules.checks.tasks.schedule_checks` (`checks/tasks.py:49-70`) →
`CheckService.schedule_due_checks` (`checks/service.py:138-227`) → `execute_check.delay()`
per dependency/region → `CheckService.execute_check` writes the `CheckResult`.
`main.py:237-239` states it plainly: *"Scheduling is handled entirely by Celery Beat … No
custom scheduler loop, no APScheduler."*

No beat process, no worker, or no broker ⇒ **zero checks, forever, silently.**

### 3.2 `RUN_IN_PROCESS_SCHEDULER` is a dead setting **[executed]**

```
$ grep -rn "RUN_IN_PROCESS_SCHEDULER" .   (excluding .git)
backend/app/config.py:359            ← the field definition
backend/app/main.py:243,245,248      ← only a log message
backend/docker-compose.yml:52, deploy/production/compose.yml:48, dev-stack.sh:146,
backend/tests/conftest.py:36         ← all set it to false
```

Nothing polls due checks in-process. But the startup log tells operators otherwise
(`main.py:243-251`): *"For single-process dev set `RUN_IN_PROCESS_SCHEDULER=true`"*. Setting
it true only suppresses that warning line — the API still never dispatches a check. Anyone
following that instruction gets exactly your symptom.

### 3.3 The repo's own dev stack cannot run checks

`backend/scripts/dev-stack.sh` boots Postgres, the API, a mock Paystack and a mail sink —
and nothing else:

```
$ grep -n "celery\|redis" backend/scripts/dev-stack.sh     → no matches
backend/scripts/dev-stack.sh:132:  export REDIS_URL=""
backend/scripts/dev-stack.sh:146:  export RUN_IN_PROCESS_SCHEDULER=false
```

So with the documented local workflow there is no broker and no scheduler: checks are
structurally impossible. In the Docker image they do run —
`deploy/entrypoint.sh:41` `ENABLE_CELERY="${ENABLE_CELERY:-true}"` gates
`[program:celery-worker]` and `[program:celery-beat]` in `deploy/supervisord-all.conf`.

### 3.4 What happens to a due check when the broker is missing **[executed]**

Enqueueing the real task with no reachable Redis (I set
`broker_connection_max_retries = 1` in the probe so it would not hang; the failure below
actually comes from the result-store retry, so it is not an artefact of that override):

```
CRITICAL [celery.backends.asynchronous] Retry limit exceeded while trying to reconnect to
the Celery result store backend. The Celery application must be restarted.
DELAY FAILED: RuntimeError
```

`schedule_due_checks` wraps each `.delay()` in `try/except`
(`checks/service.py:191-217`): on failure it logs
*"Failed to enqueue check for dep … leaving next_check_at due for retry"*, sets
`dispatch_ok = False`, and deliberately does **not** advance `next_check_at`. So the
dependency stays due forever, the beat tick logs a warning nobody sees, no `CheckResult`
row is written, and the dashboard shows an empty history with no error. That is the exact
shape of "checks are not executing".

### 3.5 The dispatch logic itself is fine **[executed]**

```
$ pytest tests/unit/test_check_service.py tests/unit/test_auth_token_family.py \
         tests/unit/test_celery_task_hardening.py -q
19 passed in 3.19s
```

including `test_schedule_due_checks_never_runs_http`,
`test_execute_check_writes_observation_outbox`, `test_beat_schedule_uses_configured_interval`
and `test_execute_check_blocked_url_records_failure_without_http`. So this is a wiring /
runtime failure, not a logic bug.

### 3.6 One more way checks can look dead even with the worker running

`execute_check` puts every target through the SSRF guard
(`checks/service.py:281-296` → `core/ssrf_protection.resolve_pinned_target_async`). Private,
loopback and link-local targets are rejected and recorded as
`URL blocked by security policy: …` with `is_up=False` instead of being probed
(`_record_blocked_result`, `checks/service.py:228-251`). If your test dependency points at
`http://localhost:8000/health` or a `127.0.0.1`/`192.168.x.x` target, you will see failures
and no latency data even though the pipeline is healthy.

### 3.7 Fix

1. Decide which is true: **implement** `RUN_IN_PROCESS_SCHEDULER` (a small asyncio task in
   `lifespan` calling `schedule_due_checks` on `CHECK_SCHEDULE_SECONDS`, guarded by
   `task_always_eager`/direct execution) **or remove the setting and the misleading log
   line**. Right now it is a lie in the operator's face.
2. Add Redis + `celery worker` + `celery beat` to `dev-stack.sh` (it already starts
   Postgres via `pgserver`; a `redis-server` and two celery processes is the same shape),
   and set `REDIS_URL` accordingly instead of `""`.
3. Surface the failure: a health check that reports "beat has not ticked in N ×
   CHECK_SCHEDULE_SECONDS" (the beat could write a Redis/DB heartbeat), and a
   `checks_dispatcher_failures_total` counter on the enqueue `except` at
   `checks/service.py:197-206`. Today the only evidence is a `logger.warning`.
4. Add a `/v1/checks/run` (or a `?now=1` on dependency create) for manual triggering so a
   developer can prove the probe path without waiting for beat.

---

## Verification log (what actually ran)

| Command | Result |
| --- | --- |
| `npx next dev -p 3000 -H 0.0.0.0` | Ready in 288 ms, listening 0.0.0.0:3000 |
| `curl -w '%{http_code}'` on 9 footer/navbar targets | `/research*` → **404 ×4**; `/track`, `/privacy`, `/terms`, `/signup`, `/support` → 200 |
| `grep -o 'id="[a-z-]*"'` over the 10 rendered landing sections | `top, evidence, live, research, comparison, pricing` present; `solution`, `partners` absent |
| `grep -rn "SolutionSection\|PartnersSection" src/` | no importers |
| `python -c "create_access_token(...)"` | `exp − now = 14.991 min`; refresh = 7.0 days |
| `pytest tests/unit/test_check_service.py test_auth_token_family.py test_celery_task_hardening.py -q` | **19 passed** in 3.19 s |
| `execute_check.delay(...)` with no Redis | `RuntimeError: Retry limit exceeded … result store backend` |
| `command -v redis-server`, `ss -ltn` | no binary, nothing on :6379 |
| `grep -rn "RUN_IN_PROCESS_SCHEDULER"` | config field + one log line + four `=false` assignments; no implementation |
| `grep -n "celery\|redis" backend/scripts/dev-stack.sh` | no matches |
