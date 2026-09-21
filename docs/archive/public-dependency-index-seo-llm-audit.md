# Audit · Public dependency index — SEO indexability & LLM indexability

**Date:** 2026-09-20
**Scope:** the live public dependency index (`/observatory`, `/observatory/{vendor}`,
`/observatory/{vendor}/incidents/{id}`) and the machine surfaces that expose it to
crawlers and models: `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt`,
metadata/JSON-LD, and the backend endpoints those pages render from.
**Mode:** audit only. **No product code, config or copy was changed by this audit.**
The only files added are this report and
`frontend/scripts/audit-live-dependency-index.sh` (a read-only live verifier).

---

## 0 · Verification status — read this first

This sandbox has **no outbound network** (`curl https://reliastra.com` → DNS failure;
TLS blocked), and the page-fetch proxy available to the agent failed for this domain
while succeeding for `example.com`. Therefore **no live HTTP response from
`reliastra.com` or `api.reliastra.com` was observed**. Everything below is proven from
the deployed source of truth — the exact code paths that produce the live surfaces —
plus the backend contract they call. Each finding carries a `Confirm live` command so
an operator with network access can turn inference into measurement in minutes.

One external signal, reported with its caveat: `site:reliastra.com` returns **zero
results** through the search backend available here, and no `reliastra.com` URL appears
for any observatory/product query (only GitHub PRs and issues about the repo do). That
is *consistent with* the site not being indexed, but it is **not proof** — the index
behind that tool may simply not cover the domain. Treat it as a prompt to check
Search Console / Bing Webmaster coverage, not as a finding.

Findings: **7 critical, 5 high, 5 medium, 2 low.**

| # | Severity | Finding |
|---|---|---|
| C1 | Critical | `cache: 'no-store'` on every data read makes all three observatory routes fully dynamic; `export const revalidate` is inert |
| C2 | Critical | A transient API failure emits `noindex` on canonical, sitemap-listed dependency records |
| C3 | Critical | Self-inflicted rate-limit exhaustion: one shared 300/min bucket, ~13–25 upstream calls per crawler hit, plus per-tab auto-refresh |
| C4 | Critical | `sitemap.xml` silently drops **every** dependency-record URL when one catalog read fails |
| C5 | Critical | Duplicate `<url>` entries in `sitemap.xml` — all 10 research articles, with conflicting `lastmod` |
| C6 | Critical | `robots.txt` emits `Allow: /` before every `Disallow`; first-match interpreters (Python `robotparser` ≤3.12 and its ports — most LLM/agent crawlers) read the private surfaces as allowed |
| C7 | Critical | "Permanent" public incident record URLs 404 after the evidence channel's rolling 90-day window |
| H1 | High | No upstream timeout anywhere on the crawler-facing path (`/observatory`, `/sitemap.xml`, records) |
| H2 | High | The index re-fetches per-vendor state the catalog response already carries — 24 avoidable calls per render |
| H3 | High | `fetchVendorIncidents` is a guaranteed-empty call on every record page (backend returns `[]` by design) |
| H4 | High | No environment/host gate on indexability — any deployment of this image serves `index, follow` + a production sitemap |
| H5 | High | Zero live verification coverage: both existing audit scripts are stale and neither mentions `/observatory`, `sitemap.xml`, `robots.txt` or `llms.txt` |
| M1 | Medium | Silent truncation: sitemap caps at 100 vendors and 24 vendors' incidents; index prints `items.length` from a 60-item read |
| M2 | Medium | `lastModified: now` for ~75 static entries on every request → untrustworthy `lastmod` |
| M3 | Medium | `llms.txt` never enumerates dependency records; neither discovery file is linked from HTML; `llms-full.txt` states a 60s refresh cadence the deployment does not implement |
| M4 | Medium | Homepage record links are not URL-encoded, unlike every other link to the same route |
| M5 | Medium | Header hygiene on the crawler path: invalid `X-Frame-Options: ALLOWALL` colliding with Caddy's `SAMEORIGIN`; duplicate `Content-Type` for `/llms.txt` |
| L1 | Low | Migration-seeded endpoints advertise two region labels (`us-east`, `eu-west`) until the first probe overwrites them |
| L2 | Low | `/v1/vendors/{name}/incidents/public` is unauthenticated, unthrottled and does not verify the vendor is public |

---

## 1 · Critical findings

### C1 · The observatory is not revalidated — it is re-rendered on every request

**Evidence**

- `frontend/src/lib/track-api.ts:171` — the single transport used by every public
  observatory read: `fetch(..., { cache: 'no-store' })`.
- `frontend/src/app/observatory/page.tsx:74` — `export const revalidate = 60;`
- `frontend/src/app/observatory/[vendor]/page.tsx:72` — `export const revalidate = 60;`
- `frontend/src/app/observatory/[vendor]/incidents/[id]/page.tsx:61` — `export const revalidate = 300;`
- `frontend/src/lib/track-api.ts:19` — module docstring: *"Responses are cached for 60s
  by the fetch cache, so repeat views of the same URL cost nothing."*
- `frontend/src/app/observatory/page.tsx:256` — UI copy: *"Revalidated every 60 seconds"*.

Next.js is explicit that an explicit `no-store` on any fetch in a route makes the route
**dynamically rendered**: "If any of the fetch requests used on a route have a
revalidate time of 0, or an explicit `no-store`, the route will be dynamically
rendered" ([Next.js ISR guide, Caveats](https://nextjs.org/docs/app/guides/incremental-static-regeneration)).
There is no `generateStaticParams` on either dynamic segment, so nothing is prerendered
at build time either.

**Consequences**

1. `revalidate = 60` / `300` are dead config. No Full Route Cache, no ISR, no
   `stale-while-revalidate`. Every crawler hit, every visitor, every
   `router.refresh()` runs the whole page again.
2. Dynamically rendered routes are served with
   `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, so the
   CDN/Caddy in front cannot absorb crawler traffic. TTFB for Googlebot is the full
   upstream fan-out latency (13–25 sequential-ish HTTP calls, see C3).
3. Two user-facing and one machine-facing claim are false as deployed: the page says
   "Revalidated every 60 seconds", the data module says repeat views cost nothing, and
   `llms-full.txt` tells models each vendor page has a "refresh cadence (60s)".
4. The docstring's stated design rationale for composing cheap endpoints instead of the
   `/developer` aggregate ("Responses are cached for 60s…") no longer holds, so the
   tighter 30/min `developer_limiter` avoidance buys less than the comment claims.

**Confirm live**

```bash
curl -sSI https://reliastra.com/observatory | grep -iE 'cache-control|x-nextjs-cache|age'
# 'no-store' / absent x-nextjs-cache  → dynamic (C1 confirmed)
# 's-maxage=60' or HIT/STALE          → ISR is actually working
```

**Direction (not applied):** give the public reads a real cache
(`next: { revalidate: 60 }` / `tags`) or an in-process TTL cache in `track-api.ts`, and
delete whichever of `revalidate` / the docstring / the UI copy ends up untrue.

---

### C2 · A transient API blip deindexes a live dependency record

**Evidence**

- `frontend/src/app/observatory/[vendor]/page.tsx:96-103` — `generateMetadata`:
  ```ts
  try { detail = await fetchVendorDetail(vendor); } catch { detail = null; }
  ...
  if (!detail) return { ..., robots: { index: false, follow: true } };
  ```
  `fetchVendorDetail` returns `null` **only** for HTTP 404 (`track-api.ts:177-185`
  `getJsonOrNull`); every other failure — 429, 5xx, timeout, DNS — **throws** and is
  caught into the same `null`. So "the record does not exist" and "the record could not
  be read right now" produce the identical directive: `noindex`.
- `frontend/src/app/observatory/[vendor]/page.tsx:166-176` — the body renders
  `<RecordUnavailable>` with **HTTP 200** on the same throw path
  (`record-sections.tsx` → *"The measurement API is unreachable. No cached or
  approximate figure is shown"*).
- Same pattern on the incident record: `incidents/[id]/page.tsx:92-101`
  (`robots: { index: false }`) — but its body (`:141-163`) does **not** 404 on
  unavailability, and `load()` is executed **twice** (once in `generateMetadata`, once
  in the page) with no shared cache, so metadata and body can disagree on the same
  response.
- `frontend/e2e/public-redesign.spec.ts:314-322` — the regression test accepts either
  status for an unknown vendor: `expect([404, 200]).toContain(res.status())`. Nothing
  asserts that a *known* record never serves `noindex`.

**Why this is critical for the index**

`noindex` on a 200 is the strongest removal signal a page can send. The URLs affected
are exactly the ones `sitemap.xml` advertises at `priority 0.8`
(`frontend/src/app/sitemap.ts:57-62`). The failure needs no bug in Google's crawler —
only one 429 or one slow response during a recrawl (see C3 for why 429s are
structurally likely). Recovery is not automatic on the next healthy response; it needs
a recrawl *and* re-processing, and the record is out of the index in the meantime. A
200 with no measurement content is simultaneously a soft-404/thin-content signal.

**Confirm live** (safe: one request)

```bash
V=$(curl -s https://reliastra.com/sitemap.xml | grep -oE '/observatory/[a-z0-9-]+' | head -1)
curl -s "https://reliastra.com$V" | grep -oE '<meta name="robots" content="[^"]*"'
```
Repeat during an API degradation, or force it by pointing `RELIASTRA_API_URL` at a
black hole on a staging deploy. `noindex` while the vendor exists in `/v1/vendors` =
C2 confirmed.

**Direction:** distinguish 404 from transport/5xx. On 404 → `notFound()` (real 404).
On any other failure → serve the last good render (which requires C1's cache) or a
503 with `Retry-After`, and never `noindex`.

---

### C3 · The public index can rate-limit itself out of the index

**Evidence — the budget**

- `backend/app/core/rate_limit.py:126-130` — `public_vendor_limiter = 300 req / 60 s`,
  with the backend's own comment: *"all local traffic shares one IP key"*.
- `backend/app/core/rate_limit.py:23-49` — `client_ip_from_request` reads
  `X-Forwarded-For`; when absent it falls back to the socket peer.
- `frontend/src/lib/track-api.ts:168-172` — server-side reads send only
  `accept: application/json`. **No `X-Forwarded-For`.**
- `frontend/src/lib/backend-proxy.ts:35-92` — the `/api/v1/*` proxy rebuilds headers
  from scratch (`Authorization`, `X-Request-ID`, `Idempotency-Key`,
  `X-Organization-ID`, `Content-Type`). **No `X-Forwarded-For` here either.**
- `Dockerfile:109` and `deploy/entrypoint.sh:45` — the production image is all-in-one:
  `RELIASTRA_API_URL=http://127.0.0.1:8000`.

Net effect: **every** server-rendered observatory page, the sitemap, the homepage
ledger *and* every visitor's browser poll are attributed to `127.0.0.1` and draw down
one shared 300/min window. On Redis failure the limiter fails open
(`rate_limit.py:107-116`), which hides the problem rather than fixing it.

**Evidence — the fan-out per render** (all `no-store`, so nothing is deduped; React's
fetch memoisation does not apply):

| Surface | Upstream calls per render | Source |
|---|---|---|
| `/observatory` | 1 + up to 24 (`RESOLVE_LIMIT`) = **25** | `observatory/page.tsx:77,90,99-105` |
| `/observatory/{vendor}` | 1 (metadata) + 10 (`fetchVendorRecord`: detail, metrics, incidents, public-incidents, ≤6 timelines) + 1 catalog + 1 telemetry Suspense = **~13** (up to ~18) | `[vendor]/page.tsx:98,166,223`; `track-api.ts:296-330`; `telemetry-panel.tsx:41-46` |
| `/observatory/{vendor}/incidents/{id}` | 2 × (1 detail + 2 incident reads) = **~6** (the `load()` runs in metadata *and* body) | `incidents/[id]/page.tsx:63-88,141` |
| `sitemap.xml` | 1 + up to 24 = **25** | `sitemap.ts:53,60-70` |
| `/` (homepage ledger) | 1 server-side + 1 per open tab per 60 s | `index-scene.tsx:22`; `public-observations.tsx:23,31` |

**Evidence — the amplifiers**

- `frontend/src/components/observatory/live-observation.tsx:53-63` — on a mounted,
  visible record page, `router.refresh()` fires at most every 30 s. With C1 that is a
  full ~13-call re-render **per open tab, forever**.
- `frontend/src/components/site/home/public-observations.tsx:23,30-32` — polls
  `/api/v1/vendors?limit=9` immediately, every 60 s, and on every `visibilitychange`.

**Arithmetic:** ~13 calls per refresh ÷ 300/min ≈ **23 refreshes/minute total**. One
vendor tab costs 2 refreshes/min (~26 calls). So **roughly eleven concurrently open
record pages saturate the entire public budget** — before a single crawler request.
Googlebot rendering the index plus five records is ~90 calls in a burst; Bingbot,
GPTBot, ClaudeBot, PerplexityBot and OAI-SearchBot crawling in parallel multiply that.
Once the window is exhausted, every further read 429s → C2 fires → records go `noindex`
and the sitemap loses them (C4).

**Confirm live**

```bash
# 1. Does the public API 429 under a modest burst? (opt-in: this consumes real budget)
for i in $(seq 1 60); do
  curl -s -o /dev/null -w '%{http_code} ' https://api.reliastra.com/v1/vendors/openai
done; echo
# 2. Do the public pages advertise no-store?
curl -sSI https://reliastra.com/observatory/openai | grep -i cache-control
```
`frontend/scripts/audit-live-dependency-index.sh --load` runs a bounded version of
this and reports the first degradation.

**Direction:** cache the reads (C1), forward a real client identity to the backend,
give the SSR path its own service credential/bucket separate from browser traffic, drop
the redundant calls (H2, H3), and replace the 30 s `router.refresh()` poll with a
narrow client fetch of one endpoint.

---

### C4 · One failed catalog read strips every dependency record out of the sitemap

**Evidence** — `frontend/src/app/sitemap.ts:50-92`:

```ts
try {
  const page = await fetchTrackedVendors(100);
  ... vendorEntries ... incidentEntries ...
  return [...staticEntries, ...vendorEntries..., ...incidentEntries...];
} catch {
  return staticEntries;      // ← no vendors, no incidents, HTTP 200
}
```

Any throw — 429 (C3), 5xx, DNS, or an unbounded hang that the platform aborts (H1) —
produces a **valid, 200 sitemap containing zero `/observatory/{vendor}` URLs**. The
per-vendor incident reads have their own `catch { return [] }` (`:66-68`), so incident
pages can vanish independently while vendor pages stay.

There is no logging, no metric, no retry, and no last-known-good fallback. The comment
at `:44-48` frames this as deliberate ("Never fabricate vendor URLs") — the intent is
right, but the implementation converts a transient upstream condition into a durable
discovery signal: Google reads a sitemap that says these URLs no longer exist, drops
them from the discovery set, and re-finding them depends on internal links and the next
successful sitemap fetch. The hub `/observatory` survives (it is in `PUBLIC_PAGES`,
`lib/seo.ts:865`), so the failure is invisible in a casual check.

**Confirm live**

```bash
curl -s https://reliastra.com/sitemap.xml | grep -c '<loc>.*\/observatory\/'
```
Run it in a loop for a few minutes. A count that swings between 0 and N is C4 firing.

**Direction:** cache the catalog with a long `stale-while-revalidate` and emit the last
good vendor list on failure; log/metric the fallback; return 5xx rather than a silently
truncated 200 sitemap when the catalog cannot be read at all.

---

### C5 · Every research article is listed twice in `sitemap.xml`

**Evidence**

- `frontend/src/lib/seo.ts:915-933` — `PUBLIC_PAGES` is *derived* and already appends
  `...RESEARCH_ARTICLES.map(a => ({ path: researchRoute(a.slug), changeFrequency:
  'monthly', priority: 0.7 }))`.
- `frontend/src/app/sitemap.ts:33-42` — `staticEntries` spreads `PUBLIC_PAGES` **and
  then** maps `RESEARCH_ARTICLES` a second time with the same `monthly` / `0.7` values
  but a different `lastmod` (`articleModified(a)` vs `now`).
- `frontend/src/app/sitemap.ts:80-86` — the `seen` dedupe set is built from
  `staticEntries` and applied **only** to `vendorEntries` and `incidentEntries`.
  Duplicates *inside* `staticEntries` are never removed.
- `frontend/src/seo/__tests__/seo.test.ts:66-77` — the uniqueness assertion covers
  `PUBLIC_PAGES`, not the emitted sitemap, so the test suite cannot see this.

With 10 published articles (`RESEARCH_ARTICLES` in `lib/routes.ts:234`), the live
sitemap contains **10 duplicated `<loc>` values**, each pair carrying contradictory
`<lastmod>` (one "now", one the article's real edit date). Google documents duplicate
URLs in a sitemap as a quality problem and picks one `lastmod` unpredictably; the
"now" copy also feeds M2. Duplicate vendor URLs are likewise possible
(`vendorEntries` is never deduped against itself) if the catalog ever returns the same
`vendor_name` twice.

**Confirm live**

```bash
curl -s https://reliastra.com/sitemap.xml | grep -oE '<loc>[^<]+' | sort | uniq -d
```

**Direction:** drop the second `RESEARCH_ARTICLES` spread from `sitemap.ts` (the derived
`PUBLIC_PAGES` entry already carries the article), or move `articleModified` into the
`PUBLIC_PAGES` mapping and dedupe the final array by `url`. Add a sitemap-level
uniqueness assertion next to the existing `PUBLIC_PAGES` one.

---

### C6 · `robots.txt` rule order defeats the disallow list for first-match interpreters

**Evidence**

- `frontend/src/app/robots.ts:26-58` — one rule: `userAgent: '*'`, `allow: '/'`, and 24
  `disallow` entries covering `/admin`, `/dashboard`, `/dependencies`, `/incidents`,
  `/evidence`, `/settings`, `/onboarding`, `/support`, `/portal`, `/reports`,
  `/checkout`, `/api`, `/login`, `/signup`, `/verify-email`, `/reset-password`, `/r`,
  `/referral-unavailable`.
- Next.js emits `User-Agent`, then all `Allow:` lines, then all `Disallow:` lines
  ([Next.js robots.txt reference — output example](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots)).
  The live file is therefore:
  ```
  User-Agent: *
  Allow: /
  Disallow: /admin/
  ...
  Sitemap: https://reliastra.com/sitemap.xml
  ```

RFC 9309 (what Google and Bing implement) resolves conflicts by **most specific
match**, so for classical SEO this file is correct. The problem is the other half of the
brief — **LLM indexability**. A large share of AI/agent crawlers are Python and consult
`urllib.robotparser`, which on Python ≤ 3.12 resolves by **first match in file order**.
With `Allow: /` first, every `Disallow` below it is inert: such an agent computes
`can_fetch('/admin')`, `can_fetch('/api/v1/...')`, `can_fetch('/reports/<token>')`,
`can_fetch('/dashboard')` as **True**. This divergence is documented with measurements
across interpreters in [lovspor#351](https://github.com/bartoszkobylinski/lovspor/issues/351)
(same body, `Allow: /` above `Disallow: /sitemap.xml`: allowed on 3.9/3.12, denied on
3.14; reversing the lines denies everywhere).

Impact: token-scoped evidence shares (`/reports/{token}`), the admin control plane and
the API proxy become crawlable-by-policy for exactly the class of consumer the
`llms.txt` family is written for, and those pages are `noindex`-by-metadata only — which
an agent that does not parse `<meta>` will not honour. It also wastes crawl budget on
non-content surfaces.

**Confirm live**

```bash
curl -s https://reliastra.com/robots.txt | head -5     # is 'Allow: /' line 2?
python3 - <<'PY'
import urllib.robotparser, urllib.request, sys
p = urllib.robotparser.RobotFileParser()
p.parse(urllib.request.urlopen('https://reliastra.com/robots.txt').read().decode().splitlines())
for path in ['/observatory', '/admin', '/api/v1/vendors', '/reports/abc', '/dashboard']:
    print(f'{path:22} can_fetch={p.can_fetch("*", path)}')
PY
python3 --version   # ≤3.12 with all-True for private paths = C6 confirmed
```

**Direction:** emit the disallow list first and `Allow: /` last (or drop the blanket
`Allow: /` entirely — it is the default), which is correct under both interpretations.
Keep the per-page `noindex` metadata as defence in depth, and consider an explicit
`X-Robots-Tag` on `/reports/*` (already present, `next.config.ts:170-176`) plus the same
for `/admin/*`.

---

### C7 · "Permanent" public incident records 404 after 90 days

**Evidence**

- `frontend/src/app/observatory/[vendor]/incidents/[id]/page.tsx:42` — *"A permanent
  public incident record."*; `:44-52` — *"The route is live so that when the first
  measured incident is published it lands on a stable URL."*
- The page's only incident sources are `fetchVendorIncidents` and
  `fetchVendorPublicIncidents` (`:73-77`), merged and matched by id (`:79-84`); no match
  → `notFound()` (`:166`).
- `backend/app/modules/vendors/service.py:266-275` — `get_vendor_incidents` returns
  `incidents=[]` **unconditionally** for public records ("Public probes currently
  persist observations, not customer incidents").
- `backend/app/modules/evidence_gate/service.py:67-88` — `list_public_incidents` filters
  `Incident.started_at >= now - 90 days`.
- `frontend/src/app/sitemap.ts:16-19` — the sitemap advertises these as *"permanent
  public incident pages"*; `:60-70` emits them at `priority 0.7`, `changeFrequency:
  'monthly'`.
- `docs/redesign/seo-pillar-ai-infrastructure.md:198-200` — the recorded assumption:
  *"a permanent incident page stays live at its URL but ages out of the sitemap."*

That assumption is **false as implemented**: once an incident passes the 90-day cutoff
the only remaining source returns nothing, `merged.find(...)` is `null`, and the URL
returns **404** — not "stays live". So URLs that were published, sitemap-listed, linked
from vendor records and (per the pillar doc's own strategy) targeted at AI-search
acquisition become 404s on a schedule. Search Console reports these as "Submitted URL
not found (404)"; the sitemap churns; any model that cited the record finds it gone.
The 404 is also indistinguishable from "never existed", which is the wrong signal for a
record that did exist and was measured.

**Confirm live** (needs a published incident older than 90 days)

```bash
curl -s https://reliastra.com/sitemap.xml | grep -oE '/observatory/[^<]+/incidents/[^<]+'
# then, for an incident id known to be >90d old:
curl -s -o /dev/null -w '%{http_code}\n' "https://reliastra.com/observatory/<vendor>/incidents/<id>"
```
Also confirm the always-empty channel directly:
`curl -s https://api.reliastra.com/v1/vendors/openai/incidents` → `{"incidents":[]}`.

**Direction:** either make the public incident read unbounded (or bounded by retention,
not by a 90-day marketing window), or stop calling these URLs permanent and return
**410 Gone** with an explanatory body once a record ages out — and correct
`docs/redesign/seo-pillar-ai-infrastructure.md:198-200`, `sitemap.ts:16-19` and the page
docstring together.

---

## 2 · High

### H1 · No timeout on any crawler-facing read

`frontend/src/lib/track-api.ts:168-172` issues `fetch` with no `signal`; there is no
`AbortSignal.timeout` in `track-api.ts` or `sitemap.ts` (grep: zero hits). Contrast the
console proxy, which has one deliberately: `frontend/src/lib/backend-proxy.ts:89-91`
(*"30s hard timeout so a hung upstream never leaves the UI in a skeleton forever"*).
A hung or slow API therefore makes `/observatory`, `/observatory/{vendor}` and
`/sitemap.xml` hang for as long as the platform allows — Caddy sets no response timeout
(`deploy/production/Caddyfile:31-38`), so the client's patience is the limit. Crawler
timeouts on the sitemap and on records are a direct indexability loss, and the hang also
holds the shared rate-limit window open (C3).

### H2 · The index pays 24 calls for data the catalog response already contains

`frontend/src/app/observatory/page.tsx:37-44` states: *"The catalog endpoint returns
identity and observation time only - no health verdict - so the index resolves each
entry's state from the per-vendor detail endpoint."* The backend contradicts this:
`VendorResponse` carries `recent_status`, `latency_ms` and `status_code`
(`backend/app/modules/vendors/schemas.py:19-22`) and `list_public_vendors` populates
them from the latest observation, including the `stale` branch
(`backend/app/modules/vendors/service.py:104-110`). The frontend type even declares
those fields (`track-api.ts:32-35`) and the homepage panel already renders from them
(`public-observations.tsx:41-42`). So the 24-call fan-out behind `RESOLVE_LIMIT` is
avoidable — it is the single largest contributor to C3 on the hub page.
`docs/redesign/seo-pillar-ai-infrastructure.md:186-188` already flagged this fan-out as
"the main crawl-load amplifier" and it is still there.

### H3 · `fetchVendorIncidents` always returns empty — and is called on every record

`backend/app/modules/vendors/service.py:273-275` returns `VendorIncidentsResponse(
incidents=[])` by design. The frontend still calls it in `fetchVendorRecord`
(`track-api.ts:301-305`) and twice per incident page (`incidents/[id]/page.tsx:74`),
and feeds it to `mergeIncidents` as though it were a real source. Each call burns shared
rate-limit budget (C3) and each `null` result is indistinguishable in the UI from
"no incidents", which the copy then has to explain.

### H4 · Indexability is not gated by environment or host

`frontend/src/app/layout.tsx:36-46` sets `robots: { index: true, follow: true,
googleBot: {...} }` unconditionally; `frontend/src/app/robots.ts` and
`frontend/src/app/sitemap.ts` always resolve `NEXT_PUBLIC_SITE_URL ??
'https://reliastra.com'`, and nothing in `Dockerfile`, `deploy/entrypoint.sh` or
`deploy/production/compose.yml` sets `NEXT_PUBLIC_SITE_URL` (grep: no hits outside
`frontend/.env.example:11`). Meanwhile `next.config.ts:19-30` explicitly supports being
served from preview hosts (`*.e2b.app`, `*.e2b.dev`, `*.e2b-preview.com`). Any staging,
preview or sandbox deployment of this image therefore serves `index, follow`, a
production-pointing sitemap and canonical tags — the classic duplicate-origin setup.
Production canonicals mitigate the ranking damage, but the preview host is still
crawlable and its `robots.txt` points crawlers at the production sitemap.

### H5 · The live public index has no verification coverage

- `frontend/scripts/audit-public-site.mjs:32-54` seeds `/track`,
  `/external-dependency-intelligence`, `/dependency-monitoring`, `/sla-evidence`,
  `/incident-evidence` and `/partner` — all retired (308) or removed — and its
  `SKIP_PREFIXES` / `HEAD_ONLY` lists predate the current IA.
- `frontend/scripts/verify-public-routes.mjs:17-40` lists the same retired paths as
  `INDEXABLE` and the removed `/partner/*` tree.
- Neither file contains the string `observatory`, `sitemap`, `robots.txt` or `llms`
  (grep count: **0** in both).

So the two tools that exist to prove the public site is crawlable cannot see the public
dependency index at all, and would fail (or mislead) if run today. The Playwright spec
covers `/observatory` as one archetype (`e2e/public-redesign.spec.ts:34`) but tolerates
the C2 failure mode (`:314-322`) and needs a browser plus a running stack.
`frontend/scripts/audit-live-dependency-index.sh` (added by this audit) fills the gap:
`curl`-only, no dependencies, read-only, checks robots/sitemap/llms/records end to end.

---

## 3 · Medium

**M1 · Silent truncation of the advertised index.** `sitemap.ts:53` requests
`limit=100` (the backend cap, `vendors/router.py:44` `le=100`) and never follows
`next_cursor`, so vendors 101+ are invisible to crawlers. `sitemap.ts:64` reads
incidents for `vendors.slice(0, 24)` only. `observatory/page.tsx:90` reads the catalog
with the client default `limit=60` (`track-api.ts:196`) and prints `items.length` as
"Dependencies under observation" (`:322-324`), so the number on the page is the number
on *that page*, not the catalog. None of the three surfaces states its own ceiling.

**M2 · `lastmod` is meaningless for ~75 entries.** `sitemap.ts:31-37` stamps
`lastModified: now` on every `PUBLIC_PAGES` entry, and the route is dynamic (C1), so
each fetch re-stamps all of them. Google documents that it ignores `lastmod` it cannot
trust. Only research articles (`articleModified`) and vendor pages (`last_check_at`)
carry a real date — and the article dates are duplicated away by C5.

**M3 · LLM discovery is thinner than the SEO surface.** `llms.txt`
(`src/app/llms.txt/route.ts:120-155`) lists `/observatory` once and never enumerates
dependency records, the sitemap, or `llms-full.txt`. `llms-full.txt:231-240` gives URL
*patterns* (`/observatory/{vendor}`) — honest, and it does point agents at
`sitemap.xml` and `robots.txt` (`:242-249`), but a model cannot resolve `{vendor}`
without a second fetch. `llms-full.txt:236` also asserts a "refresh cadence (60s)" that
C1 shows is not what the deployment does. Neither file is linked from any HTML (grep:
references exist only in tests), so discovery depends entirely on crawlers probing the
conventional path.

**M4 · Inconsistent record URL construction.** `public-observations.tsx:44` builds
`/observatory/${v.vendor_name}` unencoded, while every other link uses
`SHARE_ROUTES.observatoryVendor()` (`lib/routes.ts:138`) which encodes. The five seeded
slugs are ASCII-safe, but `vendor_name` is operator-supplied when a submission is
approved (`backend/app/modules/vendor_submissions/service.py:229-235`), so a name with a
reserved character yields two different URLs for one record — one of them not in the
sitemap and not canonical.

**M5 · Header hygiene on the crawler path.** `next.config.ts:223` sets
`X-Frame-Options: ALLOWALL`, which is not a valid token, while Caddy sets
`X-Frame-Options: SAMEORIGIN` (`deploy/production/Caddyfile:16`) — the response carries
two conflicting values and browsers reject framing on ambiguity. `/llms.txt` gets
`Content-Type` twice (route handler `llms.txt/route.ts:157-162` and
`next.config.ts:211-219`). The blanket CSP on `/:path*` (`next.config.ts:225-228`)
restricts `connect-src` to `'self' https://news.google.com`: correct today (the only
browser-side observatory fetch is same-origin `/api/v1/*`), but it will silently break
any future direct call from a public page to `api.reliastra.com`.

---

## 4 · Low

**L1 · Seeded endpoints claim two regions until the first probe.**
`backend/app/db/migrations/versions/0004_vendor_endpoints.py:28,67` sets
`regions = ["us-east", "eu-west"]` (column default *and* seed rows) while the deployed
topology is single-origin; `execute_vendor_check` overwrites it to `[region]` only after
a successful probe (`vendors/tasks.py:66`). Until then the index prints
"Region labels in use: eu-west · us-east" (`observatory/page.tsx:325-327`) — precisely
the multi-region implication the methodology copy forbids. Endpoints created later are
correct (`vendors/repository.py:95` uses `settings.CHECK_WORKER_REGION`).

**L2 · The one endpoint the sitemap hammers is unthrottled.**
`backend/app/modules/evidence_gate/router.py:44-56` —
`GET /v1/vendors/{vendor_name}/incidents/public` has no rate limiter (unlike every
route in `vendors/router.py`), no Redis cache, and does not verify that the vendor
exists or is public before querying incidents. Convenient for `sitemap.ts`, but it is
an unbounded unauthenticated DB read on the public edge.

---

## 5 · What is correct (verified, so it is not "fixed" by mistake)

- `/observatory` is indexable and canonical: `robots: { index: true, follow: true }`,
  `alternates.canonical` (`observatory/page.tsx:45-75`), and it is in the sitemap source
  at `priority 0.9` (`lib/seo.ts:865`).
- `robots.txt` does **not** disallow any public content path; CSS/JS/image resources are
  deliberately unblocked, and the test asserts that (`seo.test.ts:283-291`). No
  `public/robots.txt` exists to shadow the generated file.
- Real, crawlable HTML links: `RecordTable` renders `next/link` `<a href>` rows
  (`components/observatory/primitives.tsx:369-395`), the hub is in the primary nav
  (`nav-config.ts:73-74,108`), and the homepage links records directly
  (`public-observations.tsx:44`).
- The soft-404 class of bug was genuinely fixed and is guarded: no `loading.tsx` above
  the vendor segment, asserted by `seo.test.ts:120-130`; the 404 boundary is real
  (`observatory/[vendor]/not-found.tsx`).
- Structured data is present and honest: `CollectionPage` + `BreadcrumbList` + `hasPart`
  on the hub (`observatory/page.tsx:181-208`), `Dataset` + `WebPage` + `BreadcrumbList`
  on records (`[vendor]/page.tsx:242-292`), `WebPage` with
  `datePublished`/`dateModified` on incidents.
- Canonical collapses `?window=`/`?region=` variants onto the base record URL
  (`[vendor]/page.tsx:104-106`), so query permutations do not create index bloat.
- Content is server-rendered end to end; the only client islands are the elapsed-time
  counter, the chart cursor and the evidence form — a no-JS crawler sees the record.
- `llms.txt` / `llms-full.txt` are served as `text/plain`, cacheable, with absolute
  HTTPS URLs only, and they state the methodology's limits (single observation point,
  no multi-region confirmation) — asserted by `seo.test.ts:299-360`.
- Retired URLs 308-redirect and are excluded from the sitemap source
  (`next.config.ts:57-104`, `seo.test.ts:154-176`).
- The five seeded public vendors do exist by migration, not by hand:
  `0001_initial_schema.py:212-...` seeds them with `is_public=True` and
  `0004_vendor_endpoints.py` creates their endpoints; `schedule_vendor_checks` is on the
  beat schedule (`backend/app/infrastructure/celery_app.py:158-162`). Note that
  `seed_vendors_task` itself is wired to nothing outside tests — migrations are the only
  production seeding path, and the submissions router that could add vendors is
  unmounted (`backend/app/main.py:411`), so **there is currently no supported runtime
  path to grow the public catalog**. Worth an explicit decision.

---

## 6 · Live verification runbook

From any machine with egress (this sandbox has none):

```bash
cd frontend
bash scripts/audit-live-dependency-index.sh                     # polite, read-only
bash scripts/audit-live-dependency-index.sh --base https://reliastra.com --load   # adds a bounded burst test for C3
```

The script checks, in order: `/robots.txt` rule order and directives (C6), `/sitemap.xml`
status, duplicate `<loc>` (C5), presence and count of `/observatory/*` entries (C4),
`lastmod` sanity (M2); `/llms.txt` and `/llms-full.txt` status, content type and content
(M3); the hub and each record's HTTP status, `Cache-Control` (C1), `<meta name="robots">`
(C2), canonical, single `<h1>`, JSON-LD types, and the empty-state strings; a bogus
vendor URL (must be 404, not 200); and header hygiene (M5). Exit code is non-zero if any
critical check fails. Every request is a plain `GET`, 400 ms apart, no writes.

Two checks need credentials or a controlled environment and are **not** automated:

1. **Search Console / Bing Webmaster** — coverage for `/observatory/*`, the sitemap's
   last read status and discovered-URL count, and any "Submitted URL not found (404)"
   for incident records (C7). This is the only authoritative answer to "is the index
   actually indexed".
2. **A staging deploy with `RELIASTRA_API_URL` pointed at a black hole** — proves C2 and
   C4 deterministically: the record page's `robots` meta and the sitemap's
   `/observatory/*` count under a failing upstream.

---

## 7 · Suggested remediation order

Audit only — nothing here was changed. If these are actioned, the order that removes the
most risk per change:

1. **C1** (real caching on the public reads) — it is the root cause that makes C2, C3 and
   C4 fire on ordinary traffic instead of only on bad days, and it fixes TTFB for
   crawlers at the same time.
2. **C6** (robots rule order) — a one-line-order change; it is the only finding that
   currently exposes private surfaces to the LLM/agent crawler class by policy.
3. **C2 + C4** (separate 404 from transport failure; never emit `noindex` or an
   amputated sitemap on a transient error) — stops index loss.
4. **C5 + M2** (sitemap dedupe and honest `lastmod`) — cheap, removes contradictory
   crawl signals.
5. **C3** (identity/bucket separation + drop H2/H3 redundant calls + tame the 30 s poll)
   — largely subsumed by step 1, finish the remainder.
6. **C7** (make the 90-day window and the "permanent" claim agree) — needs a product
   decision, not just code.
7. **H5** (retire or repair the two stale audit scripts; keep
   `audit-live-dependency-index.sh` in CI against a preview deploy) — so the next
   regression is caught by a machine rather than by a reader.
