# PROMPT · Production remediation of the public dependency index (SEO + LLM indexability)

> Hand this to an engineer or a coding agent with write access to the `ReliaAstra/Reliastra`
> monorepo. It is self-contained: the defect set, the required behaviour, the design already
> validated against the code, and the acceptance criteria. The evidence base is
> `docs/public-dependency-index-seo-llm-audit.md` (findings are referenced by their ids: C1…C7,
> H1…H5, M1…M5, L1…L2). Read that document first; do not re-derive it.

---

## 1 · Mission

Make the live public dependency index — `/observatory`, `/observatory/{vendor}`,
`/observatory/{vendor}/incidents/{id}` — **durably indexable by search engines and durably
readable by LLM/agent crawlers**, without weakening the product's honesty rules and without
touching the authenticated console.

The failure mode being fixed is not cosmetic. Today a single transient condition on the
measurement API (a 429 from the shared rate limiter, a restart, a slow query) causes:

- live, sitemap-listed dependency records to serve `<meta name="robots" content="noindex">`
  with HTTP 200 and no data (C2) — the strongest deindexing signal there is;
- `sitemap.xml` to return 200 with **zero** `/observatory/{vendor}` URLs (C4) — which a crawler
  reads as a deliberate withdrawal;
- published incident record URLs to 404 permanently after 90 days while being described as
  permanent everywhere (C7).

Root cause underneath all three: every public read opts out of caching, which makes all three
routes fully dynamic and turns ordinary traffic into upstream fan-out against one shared
300/min budget (C1 + C3).

**Engineering first.** Fix the cause, then the symptoms, then the guards that stop the
regression. No workaround that only changes what a crawler sees.

---

## 2 · Non-negotiable guardrails

These are product invariants. A fix that violates any of them is wrong even if it makes the
metrics look better.

1. **Never fabricate or interpolate a measurement.** A value the API did not return stays
   absent and renders as an explicit "no data" / "insufficient data" state. This is the whole
   product argument; see `frontend/src/lib/track-api.ts` header and
   `docs/redesign/seo-pillar-ai-infrastructure.md`.
2. **Never serve a stale measurement as if it were current.** Short TTLs are acceptable; a
   last-known-good fallback is acceptable **only** for the sitemap's URL list (discovery), never
   for a figure on a record page. If you add a fallback anywhere, it must be typed so a caller
   cannot mistake it for fresh data, and it must be logged.
3. **Status codes must tell the truth.** 404 means "this record does not exist". 5xx means "we
   could not read it right now — retry". 200 means "here is the record". Never a 200 page whose
   body says the data could not be read.
4. **`noindex` is a statement about existence, not about availability.** It may be emitted only
   when the API answered 404 (or for surfaces that are private by design).
5. **Do not touch the authenticated console** (`(console)` route group, `/admin/*`, billing,
   auth). Public surfaces only.
6. **Methodology copy is load-bearing.** The single-observation-point disclosure, the detection
   rule ids, and the "correlation is not causation" framing must survive verbatim. Several tests
   scan for the phrases that used to be false (`src/lib/__tests__/methodology.test.tsx`,
   `src/seo/__tests__/seo.test.ts`). If a change would alter a claim, stop and raise it.
7. **No new runtime dependencies.** Node 20+, Next 16 App Router, FastAPI, existing libs only.
8. **Every fix ships with a test that would have caught the original defect.** A fix without a
   regression guard is incomplete.

---

## 3 · Context you need

- Monorepo: `frontend/` (Next.js 16 App Router, `src/app`), `backend/` (FastAPI, `app/`),
  `deploy/` (single-VPS all-in-one: Caddy → one container running FastAPI :8000 + Next :3000 +
  Redis + Celery worker + Celery beat under supervisord).
- The frontend reads the backend directly, server-side, from
  `RELIASTRA_API_URL` (default `https://api.reliastra.com`; `http://127.0.0.1:8000` in the
  all-in-one image — `Dockerfile:109`, `deploy/entrypoint.sh:45`).
- Public data path: `frontend/src/lib/track-api.ts` → `backend/app/modules/vendors/router.py`
  (+ the public half of `backend/app/modules/evidence_gate/router.py`).
- Rate limiting: `backend/app/core/rate_limit.py` — `public_vendor_limiter` is 300 req/60 s,
  keyed by client IP resolved from `X-Forwarded-For` with a fallback to the socket peer. In the
  all-in-one deployment **every** server-side read and **every** proxied browser call resolves to
  `127.0.0.1`, i.e. one shared bucket for the entire public site.
- SEO source of truth: `frontend/src/lib/seo.ts` (`PUBLIC_PAGES`, `buildMetadata`, JSON-LD
  builders), `frontend/src/lib/routes.ts` (route table), `frontend/src/app/robots.ts`,
  `frontend/src/app/sitemap.ts`, `frontend/src/app/llms.txt/route.ts`,
  `frontend/src/app/llms-full.txt/route.ts`.
- Existing guards: `frontend/src/seo/__tests__/seo.test.ts`,
  `frontend/e2e/public-redesign.spec.ts`, `frontend/scripts/audit-public-site.mjs`,
  `frontend/scripts/verify-public-routes.mjs`, and the read-only live verifier
  `frontend/scripts/audit-live-dependency-index.sh`.

---

## 4 · Work packages

Execute in this order. WP1 unblocks everything else; WP2–WP3 stop index loss; WP4–WP5 clean the
crawl signals; WP6 is the backend half; WP7 is verification and docs.

### WP1 · Make the public reads cacheable and bounded (C1, H1, H2, H3)

**File:** `frontend/src/lib/track-api.ts`

1. Replace the `cache: 'no-store'` transport with Next Data Cache reads:
   `next: { revalidate: <ttl>, tags: [<tag>] }`. Suggested TTLs — catalog 60 s, vendor detail
   60 s, metrics 120 s, timeline 60 s, published incidents 300 s, the contractually-empty
   `/incidents` endpoint 600 s. Tags must allow invalidating one vendor
   (`observatory:vendor:{name}`) and the catalog (`observatory:catalog`).
   *Why:* an explicit no-store forces dynamic rendering, which silently cancels
   `export const revalidate` on all three routes
   ([Next ISR caveats](https://nextjs.org/docs/app/guides/incremental-static-regeneration)).
2. Add a hard timeout to every read (`AbortSignal.timeout`, ~8 s). The console proxy already
   does this (`src/lib/backend-proxy.ts:89-91`); the crawler-facing path had none, so a hung API
   hung `/observatory` and `/sitemap.xml` indefinitely (H1).
3. Keep `export const revalidate` on the three routes and make it true. The hub
   (`/observatory`) and the incident route read no request-time API, so they become genuine ISR.
   The vendor record reads `searchParams` (`window`, `region`) and therefore stays dynamically
   rendered — that is fine and expected, because the *data* is now cached; state this in the
   file comment instead of implying the page is static.
4. Fix the false comments: the module header claiming responses "are cached for 60s by the fetch
   cache" (it was not), and the hub's claim that "the catalog endpoint returns identity and
   observation time only - no health verdict" — `VendorResponse`
   (`backend/app/modules/vendors/schemas.py:19-22`) carries `recent_status`, `latency_ms` and
   `status_code`, populated by `VendorService.list_public_vendors`
   (`backend/app/modules/vendors/service.py:104-110`).
5. Make the hub's state column read the catalog's own verdict and use the per-vendor detail call
   only for what the catalog genuinely lacks (the endpoint list behind "Region labels"). A failed
   detail read must degrade to "not read" for that column and must not blank the state (H2).
6. Keep the `/incidents` call (the UI must stay correct if the backend ever populates it) but
   cache it long; note in a comment that it returns `[]` by design today
   (`vendors/service.py:273-275`) (H3).
7. Optional, only with WP6: send an internal-reader credential header when
   `RELIASTRA_INTERNAL_READER_TOKEN` is set, so SSR reads land in their own rate-limit bucket.
   When unset, send nothing — behaviour must be identical to today.

**Acceptance:** `curl -sSI /observatory` shows a cached response (`s-maxage`/`x-nextjs-cache`),
not `no-store`; a cold burst of 40 record requests does not exhaust the 300/min public budget;
no `no-store` remains in `track-api.ts`; every read has a timeout.

---

### WP2 · Separate "does not exist" from "could not be read" (C2)

**Files:** `frontend/src/lib/track-api.ts`, `frontend/src/app/observatory/[vendor]/page.tsx`,
`frontend/src/app/observatory/[vendor]/incidents/[id]/page.tsx`,
`frontend/src/app/observatory/page.tsx`, `frontend/src/app/observatory/error.tsx` (new),
`frontend/src/components/observatory/record-sections.tsx`

1. Add a three-way result type and helpers to `track-api.ts`:
   ```ts
   export type RecordRead<T> =
     | { kind: 'ok'; value: T }
     | { kind: 'missing' }              // the API answered 404
     | { kind: 'unreadable'; cause: unknown };  // 429 / 5xx / timeout / DNS / bad body
   export function isRecordMissing(err: unknown): boolean;   // true only for 404
   export class RecordUnreadableError extends Error { readonly vendor: string; readonly reason: unknown; }
   ```
   (`getJsonOrNull` must keep returning `null` **only** on 404 and rethrow everything else.)
2. Vendor record page:
   - `generateMetadata`: `missing` → `robots: { index: false, follow: true }` (correct);
     `unreadable` → **stay indexable** (`index: true, follow: true`) with generic-but-true
     title/description and the same canonical.
   - Body: `missing` → `notFound()`; `unreadable` → `throw new RecordUnreadableError(...)` so
     the segment's `error.tsx` renders and the response is a 5xx. Delete the HTTP-200
     "observation unavailable" render path and the now-dead `RecordUnavailable` component
     (leave a comment explaining why no 200 failure component exists).
3. Incident record page: same discrimination. Today `load()` collapses "vendor 404", "incident
   not found" and "API unreachable" into one `null`, and it runs **twice** (once in
   `generateMetadata`, once in the body). Refactor `load()` to return the four outcomes
   (`ok` / `incidentMissing` / `vendorMissing` / `unreadable`) and let the Data Cache make the
   two calls share one upstream read. `vendorMissing` and `incidentMissing` → `notFound()`;
   `unreadable` → throw.
4. Hub page: a failed catalog read must throw (5xx via a new `app/observatory/error.tsx`) rather
   than render an empty index at 200. Because the route is now ISR, a failed *revalidation* keeps
   serving the last good render; only a cold failure surfaces. An API answer of "zero vendors" is
   a legitimate 200 and keeps its existing empty-state copy.
5. Update `frontend/e2e/public-redesign.spec.ts:314-322`, which currently accepts `[404, 200]`
   for an unknown vendor. Assert 404, and add a case asserting that a *known* record never serves
   `noindex` (this is the regression that mattered).

**Acceptance:** with `RELIASTRA_API_URL` pointed at a black hole on a staging deploy, a known
record URL returns 5xx and its `<meta name="robots">` is `index, follow`; an unknown record URL
returns 404; the hub returns 5xx (or stale ISR content), never an empty 200.

---

### WP3 · Stop the sitemap withdrawing the records (C4, M1)

**Files:** `frontend/src/app/sitemap.ts`, `frontend/src/lib/track-api.ts`

1. Add a discovery-only catalog read to `track-api.ts`:
   `readCatalogForDiscovery()` returning `{ kind: 'fresh' | 'stale' | 'unavailable', items, … }`,
   backed by a per-process last-good memo with an explicit age cap (≤ 6 h) and a `console.warn`
   when the stale path is used. This is the **only** stale-tolerant read in the module — document
   why (a discovery document may be a minute old; a measurement may not).
2. Enumerate the catalog through its cursor with a bounded walk (page size 100, the backend's
   `le=100` cap; overall ceiling ~500 vendors; stop if a cursor repeats). Today it requests one
   page of 100 and silently drops everything beyond it (M1).
3. Enumerate incident pages for up to ~100 vendors (today: `vendors.slice(0, 24)`), with bounded
   concurrency (~6 in flight) so a large catalog cannot 429 itself — especially once WP6 adds a
   limiter to that endpoint. A single vendor's failed read skips that vendor only.
4. If the catalog is `unavailable` and there is no last-good worth publishing, **throw**. A 5xx
   sitemap makes a crawler keep the previous one; a truncated 200 sitemap tells it the records are
   gone. Remove the `catch { return staticEntries }` fallback entirely.
5. Emit `lastModified` only where a real date exists: article edit dates, vendor
   `last_check_at`, incident `resolved_at ?? started_at`. Never `new Date()`.

**Acceptance:** killing the API mid-run leaves `/observatory/{vendor}` URLs in `sitemap.xml`
(from last-good, with a warning in the log) or returns 5xx — never a 200 sitemap without them.

---

### WP4 · Remove the contradictory crawl signals (C5, M2)

**Files:** `frontend/src/app/sitemap.ts`, new `frontend/src/lib/sitemap-source.ts`,
`frontend/src/seo/__tests__/`

1. `PUBLIC_PAGES` (`src/lib/seo.ts:915-933`) is already derived and **already contains every
   published research paper**. `sitemap.ts` maps `RESEARCH_ARTICLES` a second time
   (`src/app/sitemap.ts:33-42`), so all ten articles are emitted twice with conflicting
   `<lastmod>`. The existing `seen` set only filters the API-enumerated entries, never the static
   ones. Remove the duplicate mapping.
2. Extract the static half into a **pure, synchronous** module
   (`src/lib/sitemap-source.ts`) exporting `staticSitemapEntries(base)` and `dedupeByUrl(entries)`,
   so the defect is testable without fetching anything. Apply `dedupeByUrl` to the merged result as
   a backstop (the catalog has no uniqueness guarantee of its own).
3. `<lastmod>`: only where a real date is known (see WP3.5). A page whose edit date is not tracked
   gets **no** `<lastmod>`; Google documents that it ignores `lastmod` it cannot trust, and
   stamping ~75 static entries with "now" on every request is exactly that (M2).
4. Tests: assert the emitted sitemap has no duplicate `<loc>`; assert no entry carries a
   `lastModified` equal to "now" unless it is a vendor/incident timestamp; assert every
   `PUBLIC_PAGES` path still appears exactly once.

**Acceptance:** `curl -s /sitemap.xml | grep -oE '<loc>[^<]+' | sort | uniq -d` is empty.

---

### WP5 · Fix the crawler policy and the machine-readable surfaces (C6, M3, M4, M5, H4)

**Files:** `frontend/src/app/robots.ts`, `frontend/src/app/llms.txt/route.ts`,
`frontend/src/app/llms-full.txt/route.ts`, `frontend/src/components/site/home/public-observations.tsx`,
`frontend/next.config.ts`, `frontend/src/seo/__tests__/seo.test.ts`

1. **C6 — robots rule order.** Next emits `Allow:` lines before `Disallow:` lines
   ([docs](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots)), so the
   live file starts with a blanket `Allow: /` above 24 disallows. That is correct under RFC 9309
   (Google/Bing, most-specific wins) but **wrong under first-match interpreters** — Python's
   `urllib.robotparser` on ≤ 3.12 and the ports many LLM/agent crawlers use — which then treat
   `/admin`, `/api/`, `/dashboard`, `/reports/{token}` and `/checkout` as crawlable
   ([measured divergence](https://github.com/bartoszkobylinski/lovspor/issues/351)).
   **Fix:** drop the blanket `allow: '/'` (allow is the default) so the file is correct under both
   interpretations, and keep every disallow. Update `seo.test.ts:283-291`, which currently asserts
   `rule.allow === '/'`, and add two assertions: (a) no `Allow` directive may precede a `Disallow`
   or be broader than one; (b) **no path in `PUBLIC_PAGES` may match any disallow prefix** — that
   is the "sitemap lists a blocked URL" class of error, and nothing guards it today.
2. **M3 — llms.txt.** Enumerate the concrete dependency records (from the cached catalog) in
   `llms.txt` and `llms-full.txt`, falling back to the `{vendor}` pattern line if the catalog
   cannot be read — the files must never fail to render. Add a Discovery section naming
   `sitemap.xml`, `robots.txt` and the sibling file. Correct `llms-full.txt`'s "refresh cadence
   (60s)" so it describes the cache TTLs that actually ship. Keep both files `text/plain`,
   cacheable, absolute-HTTPS-only (existing tests assert this).
3. **M4 — one URL per record.** `public-observations.tsx:44` builds
   `` `/observatory/${v.vendor_name}` `` unencoded while every other caller uses
   `SHARE_ROUTES.observatoryVendor()` (which encodes). `vendor_name` is operator-supplied when a
   submission is approved (`backend/app/modules/vendor_submissions/service.py:229-235`), so a
   reserved character yields two URLs for one record. Use the route builder.
4. **M5 — headers.** Remove `X-Frame-Options: ALLOWALL` from `next.config.ts:223` (not a valid
   token, and it collides with Caddy's valid `SAMEORIGIN` at
   `deploy/production/Caddyfile:16`, producing two conflicting headers); add
   `frame-ancestors 'self'` to the CSP instead. Remove the duplicate `Content-Type` headers for
   `/llms.txt` and `/llms-full.txt` from `next.config.ts:211-219` — the route handlers already set
   `text/plain; charset=utf-8`. Leave `connect-src` as `'self'` + the Preferred-Sources origin; if
   a public page ever needs to call `api.reliastra.com` from the browser, widen it deliberately
   then.
5. **H4 — no indexability gate on environment.** Every deployment of this image serves
   `index, follow` plus a production-pointing sitemap, and `next.config.ts:19-30` explicitly
   supports preview hosts (`*.e2b.app`). Add a host/env gate: when the serving host is not the
   canonical `SITE_URL` (or an explicit `ALLOW_INDEXING=true` is absent in a non-production
   environment), emit `X-Robots-Tag: noindex, nofollow` for the whole site and a
   `Disallow: /` robots file, while keeping canonicals pointed at production. Never gate on
   `NODE_ENV` alone — the preview build is a production build.

**Acceptance:** `python3` robotparser on ≤ 3.12 reports `can_fetch('/admin') == False` and
`can_fetch('/observatory') == True`; a preview deployment serves `noindex`; `llms.txt` lists real
record URLs.

---

### WP6 · Backend: identity, throttling, permanence (C3, C7, L1, L2)

**Files:** `backend/app/core/rate_limit.py`, `backend/app/modules/vendors/router.py`,
`backend/app/modules/evidence_gate/router.py`, `backend/app/modules/evidence_gate/service.py`,
`backend/app/config.py`, `backend/app/db/migrations/versions/*` (new),
`frontend/src/lib/backend-proxy.ts`, new `frontend/src/app/api/public/observatory/route.ts`,
`frontend/src/components/site/home/public-observations.tsx`,
`frontend/src/components/observatory/live-observation.tsx`

1. **Attribute browser traffic to the visitor.** `backend-proxy.ts:35-92` rebuilds headers from
   scratch and drops `X-Forwarded-For`, so every visitor's poll is charged to `127.0.0.1`. Forward
   the incoming `X-Forwarded-For` **verbatim** (Caddy sets it to the real client —
   `deploy/production/Caddyfile:33-37`) and `X-Real-IP` when present. Do not append the container
   address: `client_ip_from_request` takes the rightmost entry with `TRUSTED_PROXY_HOPS=1`, so
   appending would re-collapse everyone into one bucket.
2. **Give SSR its own bucket.** Add `settings.INTERNAL_READER_TOKEN` (default empty) and an
   `enforce_public_read_limit(request)` helper: when the request presents
   `X-Reliastra-Reader-Token` equal to a **non-empty** configured token (compare with
   `secrets.compare_digest`), charge a separate, higher limiter (e.g. 3000/min, key
   `rl_reader:ssr`); otherwise charge `public_vendor_limiter` per client IP as today. Empty/unset
   token ⇒ the header is ignored entirely (no privilege escalation, no behaviour change). Apply it
   to every route in `vendors/router.py` that currently calls `_rate_limit`. Never log the token.
3. **Throttle and validate the one unthrottled public endpoint (L2).**
   `GET /v1/vendors/{vendor_name}/incidents/public`
   (`backend/app/modules/evidence_gate/router.py:44-56`) has no limiter and never checks that the
   vendor exists or is public. Apply `enforce_public_read_limit` and 404 unknown/non-public
   vendors. The sitemap's bounded-concurrency walk (WP3.3) is what keeps this from biting us.
4. **Make "permanent" true (C7).** `list_public_incidents` filters
   `Incident.started_at >= now - 90 days` (`evidence_gate/service.py:68`), while the incident page
   docstring, `sitemap.ts` and `docs/redesign/seo-pillar-ai-infrastructure.md:198-200` all call
   these *permanent* records — and the page's only other incident source returns `[]` by design
   (`vendors/service.py:273-275`). So every published incident URL 404s on a schedule.
   Add `settings.PUBLIC_INCIDENT_WINDOW_DAYS` (default: unbounded within retention, e.g. `None` or
   `3650`) and use it for the cutoff. Then correct the doc that asserts the opposite, and state the
   real window in `llms-full.txt`. If the product decision is instead to keep a rolling window,
   then stop calling the URLs permanent, and make an aged-out record answer **410 Gone** with an
   explanatory body rather than 404 — but that needs a route-handler-level status, so decide before
   coding.
5. **Stop advertising two observation points (L1).** Migration `0004_vendor_endpoints.py:28,67`
   sets `regions = ["us-east","eu-west"]` as both the column default and the seed value, while the
   deployed topology is single-origin; `execute_vendor_check` only overwrites it after a successful
   probe (`vendors/tasks.py:66`). Until then the hub prints "Region labels in use: eu-west ·
   us-east" — the exact multi-region implication the methodology copy forbids. Add a migration that
   (a) changes the column `server_default` to an empty list, and (b) normalises rows that still
   hold the seeded pair **and** have `last_check_at IS NULL`. Idempotent, reversible, no data loss
   for endpoints that have actually been probed.
6. **Tame the browser-side amplifiers.** The homepage ledger polls `/api/v1/vendors?limit=9`
   every 60 s and on every `visibilitychange` (`public-observations.tsx:23,30-32`), and each open
   record page calls `router.refresh()` at most every 30 s (`live-observation.tsx:53-63`). Add a
   cached public catalog route (`app/api/public/observatory/route.ts`, `revalidate: 60`, returning
   only the fields the ledger renders) and point the poll at it, so N visitors share one upstream
   read. Throttle `visibilitychange` to respect the poll interval. Raise the `router.refresh()`
   floor to the data-cache TTL (60 s) and keep the visibility guard.
7. **Backend tests:** the window setting (bounded and unbounded), the internal-reader bucket
   (token match, token mismatch, token unset ⇒ no escalation), and `/incidents/public` 404ing an
   unknown vendor. Follow the existing style in `backend/tests/unit/`.

**Acceptance:** 60 sequential anonymous API reads still 429 at the configured ceiling, but a
full server-side render of the hub plus five records does not; the homepage poll produces one
upstream call per minute site-wide.

---

### WP7 · Verification, docs, and the guards that keep this fixed (H5)

1. **Repair or retire the stale audit scripts.** `scripts/audit-public-site.mjs:32-54` and
   `scripts/verify-public-routes.mjs:17-40` still seed `/track`,
   `/external-dependency-intelligence`, `/dependency-monitoring`, `/sla-evidence`,
   `/incident-evidence` and the removed `/partner/*` tree, and neither contains the string
   `observatory`, `sitemap`, `robots.txt` or `llms`. Bring them to the current IA or delete them in
   favour of `scripts/audit-live-dependency-index.sh`; either way the surviving tooling must cover
   the dependency index, `sitemap.xml`, `robots.txt` and both `llms` files.
2. **Wire the live verifier into CI** against a preview deployment (it is `curl`-only, read-only,
   exits non-zero on any critical failure). Add `--load` to a scheduled job rather than to PR CI.
3. **Regression tests** (`frontend/src/seo/__tests__/observatory-indexability.test.ts`, plus
   additions to `seo.test.ts`) — source-scan guards are an established pattern in this repo (see the
   `loading.tsx` soft-404 guard at `seo.test.ts:120-130`):
   - `track-api.ts` contains no cache opt-out and every read sets a timeout and a `next.revalidate`;
   - the vendor and incident pages never emit `index: false` on the `unreadable` branch;
   - no observatory page renders a failure state with HTTP 200;
   - `sitemap.ts` maps `RESEARCH_ARTICLES` zero times and ends in `dedupeByUrl`;
   - `robots.ts` has no blanket allow and no `PUBLIC_PAGES` path matches a disallow;
   - `app/observatory/[vendor]/loading.tsx` still does not exist (existing guard — keep it).
4. **Docs.** Update `docs/redesign/seo-pillar-ai-infrastructure.md` (items 2, 3 and 5 of the
   "deliberately NOT changed" list are all addressed by this work), add a
   `backend/docs/API_CHANGELOG.md` entry for the new setting, the reader-token header contract, the
   `/incidents/public` limiter and the incident-window change, and document
   `RELIASTRA_INTERNAL_READER_TOKEN` in `frontend/.env.example` and the deployment env list.
5. **Append a remediation record** to `docs/public-dependency-index-seo-llm-audit.md` mapping each
   finding id → the commit that closed it, and re-run the live verifier against production after
   deploy, attaching the output.
6. **After deploy, in Search Console / Bing Webmaster:** re-submit `sitemap.xml`, request
   indexing for `/observatory` and each dependency record, and watch for "Submitted URL not found
   (404)" on incident records (C7) and for duplicate-URL warnings (C5). Records that were deindexed
   by C2 need a recrawl to recover — that is expected, not a failed fix.

---

## 5 · Definition of done

- `cd frontend && npm run typecheck && npm run lint && npm test` all green; `npm run build`
  succeeds and its output shows `/observatory` and the incident route as cached/ISR rather than
  dynamic-only. (The vendor record stays dynamic — it reads `searchParams`; that is correct.)
- `cd backend && pytest` green, including the new tests.
- `bash frontend/scripts/audit-live-dependency-index.sh --base <preview>` exits 0.
- Manual fault injection on a preview deploy (point `RELIASTRA_API_URL` at a black hole) shows:
  record → 5xx + `index, follow`; unknown record → 404; hub → 5xx or stale ISR; sitemap → 5xx or
  last-good with a warning. No `noindex` anywhere, no 200 failure page.
- `curl -s /sitemap.xml | grep -oE '<loc>[^<]+' | sort | uniq -d` → empty.
- `python3` robotparser (≤ 3.12 semantics) → private paths denied, `/observatory*` allowed.
- No measurement is fabricated, no stale figure is presented as current, and the methodology copy
  is unchanged.

## 6 · Out of scope

Console/admin surfaces, billing, the attribution engine, probe execution and Celery topology,
evidence generation, and any change to what is measured. Adding vendors to the public catalog is a
separate decision — note for the reviewer: `seed_vendors_task` is wired to nothing outside tests
and the submissions router is unmounted (`backend/app/main.py:411`), so **there is currently no
supported runtime path to grow the public catalog**. Raise it, do not silently fix it here.

## 7 · How to report back

One PR per work package is preferred (WP1 and WP2 may be combined — WP2 depends on WP1's typed
reads). Each PR description must state: the finding ids it closes, the behaviour change in one
sentence, the test that would have caught the original defect, and the verification output
(`audit-live-dependency-index.sh` summary plus the fault-injection results). If a package cannot be
completed, say which acceptance criterion failed and why — do not paper over it with a
crawler-visible workaround.
