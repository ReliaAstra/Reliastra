# RELIASTRA — Production Crawl / Indexability Remediation

**Scope:** Make reliastra.com a single canonical, crawlable, machine-readable
source of truth for Google, AI/search crawlers (OAI-SearchBot), LLM retrieval,
and humans — under the current developer-first positioning
("Independent evidence for the APIs your software depends on").

**Positioning guardrails honored:** no restoration of the old
enterprise/MSP/agency positioning; no generic SEO content; no invented
capabilities, telemetry, regions, customers, incidents, uptime figures or
integrations.

---

## 1. Files changed

| File | Change |
|---|---|
| `frontend/src/app/agencies/page.tsx` | **Deleted** (old agency/MSP positioning page) |
| `frontend/src/app/agencies/route.ts` | **New** — route handler returning **HTTP 410 Gone** + `X-Robots-Tag: noindex` |
| `frontend/src/components/site/home/agencies-scene.tsx` | **Deleted** (dead, unrendered agency scene) |
| `frontend/src/lib/routes.ts` | Removed `agencies` from `PUBLIC_ROUTES`; added documented `GONE_ROUTES` table |
| `frontend/src/lib/seo.ts` | Removed `/agencies` from `CORE_PUBLIC_PAGES` (sitemap source) |
| `frontend/src/app/sitemap.ts` | Comment updated (no longer lists `/agencies`) |
| `frontend/src/app/llms.txt/route.ts` | Removed the `Agencies:` page link |
| `frontend/src/app/robots.ts` | Added explicit `OAI-SearchBot` group (`Allow: /` + private-route disallows) |
| `frontend/src/app/page.tsx` | Homepage `<title>` (absolute), description, OG/Twitter, OG-image `alt`, WebPage JSON-LD `name` |
| `frontend/src/app/layout.tsx` | Default title/description/keywords, OG/Twitter, OG-image `alt` |
| `frontend/src/components/site/home/observation-ledger.tsx` | Strengthened machine-readable illustrative marker |
| `frontend/src/seo/__tests__/seo.test.ts` | Assert `/agencies` NOT in sitemap; new OAI-SearchBot robots test |
| `frontend/src/components/site/__tests__/navigation-links.test.tsx` | `/agencies` added to removed-B2B link guard |
| `frontend/src/lib/__tests__/analytics-scope.test.ts` | Dropped stale `/agencies` public-page example |
| `frontend/src/lib/__tests__/gone-routes.test.ts` | **New** — pins `GONE_ROUTES` to a real 410 handler |

## 2. Routes changed

- **`/agencies`: HTTP 200 → HTTP 410 Gone.** The page described an agency/MSP
  product line (client estates, white-label delivery, a per-client console,
  "Start monitoring client environments") that RELIASTRA does not build.

## 3. Redirects created

- **None new.** All pre-existing permanent redirects are preserved unchanged
  (`/track*`→`/observatory*`, `/external-dependency-intelligence` &
  `/dependency-monitoring`→`/product`, `/incident-evidence` &
  `/sla-evidence`→`/product/evidence`, `/partners*`→`/creators`, console
  section aliases, `www`→apex at the edge).

## 4. URLs removed from sitemap

- `/agencies`

## 5. URLs added to sitemap

- **None.** Every legitimate current public URL was already present
  (`/`, `/product`, `/product/evidence`, `/observatory`, `/pricing`,
  `/docs/*`, `/research/*` + hubs + categories + papers, `/glossary/*`,
  `/about`, `/security`, `/contact`, `/status`, legal, `/creators`, and the
  dynamically enumerated `/observatory/{vendor}` + incident records). No URL
  was added because a route *could* render it.

## 6. robots.txt contents (served, HTTP 200)

```
User-Agent: *
Disallow: /admin/
Disallow: /admin
Disallow: /dashboard
Disallow: /dependencies
Disallow: /incidents
Disallow: /evidence
Disallow: /clients
Disallow: /settings
Disallow: /onboarding
Disallow: /support
Disallow: /portal/
Disallow: /portal
Disallow: /reports/
Disallow: /reports
Disallow: /checkout
Disallow: /api/
Disallow: /api
Disallow: /login
Disallow: /signup
Disallow: /verify-email
Disallow: /reset-password
Disallow: /r/
Disallow: /r
Disallow: /referral-unavailable
Disallow: /docs-md/

User-Agent: OAI-SearchBot
Allow: /
Disallow: /admin/
Disallow: /admin
Disallow: /dashboard
Disallow: /dependencies
Disallow: /incidents
Disallow: /evidence
Disallow: /clients
Disallow: /settings
Disallow: /onboarding
Disallow: /support
Disallow: /portal/
Disallow: /portal
Disallow: /reports/
Disallow: /reports
Disallow: /checkout
Disallow: /api/
Disallow: /api
Disallow: /login
Disallow: /signup
Disallow: /verify-email
Disallow: /reset-password
Disallow: /r/
Disallow: /r
Disallow: /referral-unavailable
Disallow: /docs-md/

Sitemap: https://reliastra.com/sitemap.xml
```

**Design note (deviation from the literal baseline, deliberate):** the `*`
group intentionally omits a blanket `Allow: /`. Everything not disallowed is
allowed by default, and omitting the blanket allow keeps the disallow list
meaningful to first-match robots.txt interpreters (Python `urllib.robotparser`
≤3.12 and its ports, common among agent crawlers) — a leading `Allow: /` would
void every private-route disallow under that reading. `OAI-SearchBot` gets an
explicit `Allow: /` because it is one known, longest-match crawler where the
private-route disallows still win. **GPTBot is intentionally NOT added** (not
approved). **Googlebot is not blocked** (covered by the permissive `*` group).

## 7. llms.txt contents (served, HTTP 200, `text/plain`)

Served from `frontend/src/app/llms.txt/route.ts`. The `Agencies:` line was
removed. Structure (verbatim sections, dynamic record list omitted):

```
# RELIASTRA

> RELIASTRA observes the external services software depends on. It issues its
> own HTTP probes, records every observation, confirms faults deterministically,
> and produces evidence records a third party can verify without an account.

## What RELIASTRA is
An external dependency observation product for individual engineers: SREs,
platform engineers, backend and infrastructure engineers, and engineers running
production AI applications on hosted model APIs.
RELIASTRA is not uptime monitoring...

## Observation model (state this exactly; do not infer more)
- Probes are issued from 1 observation point today (us-east). A `region` field
  appears on every observation as a scheduler label... It is not a second opinion.
- Default probe interval: 300 seconds.
- An incident opens after 2 consecutive failed checks (rule
  `single.consecutive_failures`) and resolves after 2 consecutive successes...
- No multi-region or quorum confirmation is claimed...

## Attribution
Deterministic, versioned arithmetic... A score is an alignment between two
timelines, not proof of causation. Every result carries a methodology version.

## Evidence ... SHA-256 ... Ed25519 ... retained 365 days ...

## Interfaces (REST API / CLI / Webhooks)

## Pricing — One plan. $9 USD per month... No plan ladder, no seats...

## Public observatory ...

## Dependency records (enumerated, do not guess slugs) ...

## Pages
- Home / Product / Evidence records / Public observatory / Pricing /
  Documentation (+ all guides) / Glossary / Research / About / Technical
  creators / Contact / Status
```

The file states one observation point, 300s cadence, 2-check confirm/resolve,
deterministic non-causal attribution — and does **not** claim llms.txt
guarantees indexing.

## 8. Canonical strategy

- Every indexable page self-canonicalizes to `https://reliastra.com<path>` via
  `buildMetadata()`/`canonicalUrl()` (HTTPS, apex host, no query strings).
- Homepage uses an **absolute** title so the root `%s | RELIASTRA` template does
  not double the brand.
- `www.reliastra.com` → `reliastra.com` is a permanent (301) redirect at the
  edge; canonicals and the sitemap use the apex host only.
- Public documentation/research/observatory pages self-canonicalize unless an
  intentional destination exists (retired capability pages 308 → `/product*`).
- No canonical points at an obsolete Reliastra page.

## 9. noindex findings

- Public marketing/research/docs/observatory pages emit `index, follow`
  (verified on `/`, `/product`, `/pricing`, `/research`, `/docs`, `/about`,
  `/glossary`, `/security`, `/contact`, `/creators`).
- `/agencies` now emits `noindex, nofollow` (meta + `X-Robots-Tag`) with 410.
- Private/token surfaces stay protected: `/admin`, console, `/reports/*`,
  `/checkout`, `/r/*`, `/api/*` carry `X-Robots-Tag: noindex, nofollow, noarchive`
  and are robots-disallowed; auth pages are disallowed.
- Non-production deployments remain fully noindex (unchanged gate).
- **No accidental noindex on any public page; no global noindex added.**

## 10. Old-positioning URLs discovered (complete audit)

Searched the codebase for `agency/agencies, MSP, white-label, enterprise,
client environments, seats, Pro/Enterprise plan`. Findings:

- **`/agencies`** — agency/MSP software, client portfolio management, "Start
  monitoring client environments", client estates. **Obsolete.**
- `components/site/home/agencies-scene.tsx` — dead (unrendered) agency scene.
  **Removed.**
- `/creators` — "Technical Creator Program" for infrastructure publishers.
  **Current & legitimate — kept.**
- `/pricing` — single $9/mo plan, no Pro/Enterprise tiers, no seats.
  **Current — kept.**
- Glossary references to "99.99% uptime" — legitimate: they *criticize*
  unsubstantiated uptime claims (on-message). **Kept.**
- Backend/console `agency`/`AgencyClient` types & `/agency` console internals —
  not public marketing; out of scope for this public-site remediation.

## 11. Old-positioning URLs removed / redirected

- **`/agencies` → HTTP 410 Gone** (Option C). It is permanently obsolete and has
  **no legitimate replacement** — the product is developer-first, so no current
  page absorbs an agency pitch without inventing an agency capability. A 410
  (not a redirect) tells crawlers the removal is intentional and permanent, so
  the URL is dropped from the index rather than retried or pointed at an
  unrelated page. It is removed from the sitemap and llms.txt, and no page links
  to it.

## 12. Crawler / WAF changes

- **robots.txt:** added the explicit `OAI-SearchBot` allowlist (see §6).
- **Caddy/WAF (`deploy/production/Caddyfile`): reviewed — no changes needed.**
  There is no user-agent blocking, no bot challenge, and no crawler-facing rate
  limit in front of public content; all requests are logged (JSON); `www`→apex
  is a 301; HSTS + minimal security headers only. Googlebot and OAI-SearchBot
  reach public content unobstructed. Protected routes remain authenticated
  server-side regardless of robots.txt.

## 13. Structured-data changes

- **No fabricated data.** No fake reviews, ratings, customer counts, aggregate
  ratings, pricing tiers or organization facts were introduced.
- Homepage `WebPage` JSON-LD `name` updated to match the new title.
- Verified homepage emits valid, visible-content-matching JSON-LD:
  `Organization`, `WebSite`, `SoftwareApplication` (Offer price 0 = free trial
  entry), `WebPage`, `FAQPage` (built from the rendered definitions),
  `BreadcrumbList` and `TechArticle` (research) elsewhere.

## 14. Metadata changes

- **Homepage:** `<title>` → `RELIASTRA — Independent Evidence for External
  Dependencies` (absolute); description → "independently observes the APIs and
  external services your software depends on, confirms persistent failures,
  correlates incidents, and produces verifiable evidence records."
- **Root layout:** default title/description aligned to the same positioning;
  keywords moved to current terminology (external dependency, dependency
  observation, incident correlation, evidence record); removed the fault-implying
  "attributes incidents to the responsible vendor" phrasing (attribution is
  correlation, not proof of causation/liability).
- **OG/Twitter image `alt`:** was `"AI Infrastructure Security - cloud,
  Kubernetes, AI systems"` (factually wrong) → now describes RELIASTRA's actual
  proposition. All other page titles/descriptions remain unique and factual.

## 15. Validation results

Automated (all green):
- `vitest run` → **389 tests / 28 files passed** (includes new `gone-routes`,
  new OAI-SearchBot robots test, sitemap-source, methodology-restraint,
  navigation link-integrity, indexability gate).
- `tsc --noEmit` → **clean**.
- `eslint` (changed files) → **clean**.

Runtime smoke (dev server, `NEXT_PUBLIC_SITE_INDEXABLE=true`):
- `/agencies` → **410** + `X-Robots-Tag: noindex, nofollow` ✅
- `/robots.txt` → **200**, contains `OAI-SearchBot` `Allow: /`, no GPTBot ✅
- `/` → **200**; `<title>`, canonical, `og:image:alt`, JSON-LD, `index, follow` all correct ✅
- `/llms.txt` → **200**, `text/plain`, no `/agencies`, methodology-consistent ✅
- `/`, `/product`, `/product/evidence`, `/pricing`, `/research`, `/docs`,
  `/docs/methodology`, `/about`, `/glossary`, `/security`, `/contact`,
  `/creators` → **200** ✅
- Sitemap **source** validated: `/agencies` absent, no redirect/404/query URLs,
  every URL maps to a declared route (seo.test.ts + sitemap-source.test.ts).

## 16. Remaining risks / notes

- **`/sitemap.xml` and `/observatory` returned 500 in this sandbox** solely
  because the measurement API (`api.reliastra.com`) is unreachable here
  (ECONNRESET). That is the **designed fail-loud behavior** — a 5xx keeps a
  record URL indexed for retry instead of publishing an empty index as fact.
  With the backend reachable (production), both return 200. No code change.
- **Root canonical** renders as `https://reliastra.com` (no trailing slash)
  while the sitemap lists `https://reliastra.com/`. These are the same URL
  (site root), pre-existing and Google-normalized; left unchanged to avoid
  unrelated behavior changes.
- **GPTBot** is not listed in robots.txt (per instruction: do not add without
  explicit approval). If approved, add a dedicated group mirroring
  `OAI-SearchBot`.
- **Observatory freshness** is backend-driven; the frontend correctly separates
  live measurement from example data (distinction section) and never fabricates
  freshness, but cannot display live telemetry when the API is down (by design).
- **`/agencies` 410** assumes no inbound link equity worth preserving; if
  analytics later shows material external links to `/agencies`, revisit — but a
  redirect to an unrelated page would misrepresent the product.
