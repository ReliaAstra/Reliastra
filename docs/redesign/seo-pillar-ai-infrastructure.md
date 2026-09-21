# SEO pillar · AI infrastructure observatory

**Scope of this change set.** The first public SEO + AI-search acquisition
pillar for RELIASTRA: the AI infrastructure research hub, permanent public
incident records, hub-qualified research articles, glossary expansion, and a
round of data-integrity corrections to the existing observatory copy. It
extends the public surfaces built in
`docs/redesign/observatory-inventory.md`; nothing here replaces that
architecture.

The governing rule for every page below is the rule the observatory already
lives by: **a page exists when the data exists**. A route, a sitemap entry, a
title, or a sentence that the measurement API cannot support is not shipped.

> **Status (2026-09).** This document is the record of that change set, and parts
> of it have since moved. The surface it calls `/track` is now `/observatory` -
> the developer-first refurbishment renamed and consolidated it, and `/track` is
> a 308. Known production risks 1, 2 and 5 at the end were fixed afterwards;
> `docs/public-dependency-index-seo-llm-audit.md` is the audit that found what
> remained and `docs/engineering/prompt-fix-public-dependency-index.md` is the
> remediation spec. The governing rule above is unchanged, and is now enforced
> rather than stated: an unreadable catalog read throws, the page fails loudly
> instead of publishing an empty index, and `sitemap.xml` refuses to serve a
> partial list.

---

## 1 · Integrity audit findings (and what was fixed)

Inspected against the deployed production surface (`reliastra.com`,
`api.reliastra.com`) and the code in `backend/app/modules/vendors`,
`backend/app/modules/checks`, `backend/app/modules/evidence_gate`.

| # | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| 1 | The public catalog's observed endpoints are **vendor status sites** (`status.openai.com`, `status.stripe.com`, `status.twilio.com`, `status.auth0.com`, `www.cloudflarestatus.com`), not vendor APIs - while copy said "Independent observation of public third-party APIs. Nothing is read from a vendor status page." | `vendors/constants.py::SEED_VENDORS`; probe = plain HTTP GET via `observe_http` | `/track` index header, masthead descriptor and methodology rows now state: RELIASTRA measures the HTTP behaviour of the *listed endpoint*; where that endpoint is the vendor's status site, the record says so explicitly and distinguishes endpoint-up from service-up (new "Endpoint vs service" row, section 08). |
| 2 | "Availability is the share of observations that returned a status code with no transport error" was **wrong in the permissive direction**: `observe_http` counts only the expected status (200 for public probes) as success; a 500 is a failed observation (recorded as `probe_failed`). | `http_probe.py` (`expected_codes or [200]`), `vendors/tasks.py` (`error_type='probe_failed' when not is_up`), `ObservationRepository.get_endpoint_stats` | Section 02 note and methodology rows ("Success"/"Failure"/"Availability") now describe the shipped rule: HTTP 200 within a 15-second deadline, ≤5 policy-validated redirect hops; timeouts, transport errors and other codes are failures. |
| 3 | Incident copy claimed incidents "open when at least two regions fail inside the same 60-second window" - but `VendorService.get_vendor_incidents` **always returns `[]` for public records**, production runs `OBSERVATION_TOPOLOGY=single` with one origin (`CHECK_WORKER_REGION='us-east'`), and `list_public_incidents` only surfaces incidents whose *evidence a customer organisation published*. An empty list is therefore a statement about a channel, not about outages. | `vendors/service.py`, `config.py` defaults, `evidence_gate/service.py` | Section 05 rewrite: names the published-evidence channel, states single-origin reality ("observed from a single origin"), and prints "no public incident records … never a claim that no outage occurred". Methodology rows now distinguish the deployed single-point persistence rule (2 consecutive) from the multi-origin quorum rule and state that public probing opens no incidents. |
| 4 | `recent_status='stale'` (observation older than 900s, set by the API) was **not handled** by `deriveState`: a stale record with an old successful observation could render "Responding", and the index rendered it as "No observations" - both wrong. | `format.ts::deriveState` (pre-change), `vendors/service.py` stale branch | `deriveState` now treats `stale` as a precondition: state `unknown`, word "Not observed recently", qualifier that old observations are historical facts. Unit-tested. |
| 5 | `GET /track/nosuchvendor` served the not-found UI with **HTTP 200** (soft 404): `track/[vendor]/loading.tsx` committed the streaming shell before the page body could call `notFound()`. | Local reproduction against `qa-backend.mjs` (fixed + pre-existing) | `loading.tsx` removed from the segment (comment in the page records why; `seo.test.ts` guards it). Unknown vendors and unknown incident ids now return 404 with the custom boundary. |
| 6 | The sitemap contained `/partner/tiers` and `/partner/premium`, which are permanent **redirects** to `/partner/commission` - non-canonical URLs in the sitemap. | `next.config.ts` redirects vs `lib/seo.ts::PUBLIC_PAGES` | Both removed from `PUBLIC_PAGES`; the sitemap is canonical-only again. |
| 7 | The crawlable record summary contained grammar and scope imprecision ("is a ai dependency", "its public endpoints" for single-endpoint vendors) and could imply API coverage. | `/track/openai` rendered output | Summary recomposed: category grammar via `articleFor()`, names the observed URL, and states endpoint-not-service scope plus the "absence of published records ≠ absence of outages" distinction. |
| 8 | `recent_status` "valid response" phrasing left "valid" undefined to a machine reader. | `format.ts` qualifiers | Every state qualifier now references the probe rule ("received the expected response … within its deadline"). |

### Deliberately NOT changed (data insufficient)

- **Model-level or API-level pages** (`/models/openai/gpt-5` etc.): the public
  catalog observes one status-site endpoint per vendor. A model page without
  model-specific observations would be thin and misleading. The hub states
  this and the record schema can carry such endpoints when they exist.
- **Per-service vendor pages** (`/track/{vendor}/{service}`): `vendor_endpoints`
  supports several endpoints per vendor, but production stores exactly one per
  vendor; nothing to distinguish yet.
- **`GET /v1/vendors/{name}/incidents` behaviour** (always `[]`): correct by
  design (public probes persist observations, not incidents); left as the
  source of truth for what the UI may claim.
- **`is_up`/`health_status` semantics on endpoints** (`health_status` is
  written `operational`/`down` per probe): rendered as-is ("Endpoint state")
  since it is the API's own field; not re-derived.
- **Vendor coverage** (OpenRouter, Anthropic, Gemini, Mistral): no observation
  targets exist, so no pages. The hub lists them under "Not yet under
  observation", derived from the live catalog, and the list shrinks
  automatically as real records arrive.
- **`/status`** (RELIASTRA platform status) and `/portal`, `/reports` token
  shares: untouched, correctly noindexed.

---

## 2 · Routes added

| Route | Rendering | Source of truth | Indexability |
| --- | --- | --- | --- |
| `/research/ai-infrastructure` | server-rendered; dynamic while the API is reachable | Track API (`/vendors`, `/vendors/{name}`, `/vendors/{name}/metrics`, `/vendors/{name}/incidents/public`) + `RESEARCH_HUBS`/`RESEARCH_ARTICLES` | index, canonical, in sitemap |
| `/research/ai-infrastructure/is-openai-down` | SSG | `content/research-articles.tsx` | index, canonical, in sitemap |
| `/research/ai-infrastructure/ai-api-outage-evidence` | SSG | same | index, canonical, in sitemap |
| `/track/[vendor]/incidents/[id]` | server-rendered, `revalidate=300` | merged `TrackIncident[]` + `TrackPublicIncident[]`; **renders iff the API returns the record** | index when real, 404 otherwise, in sitemap when enumerated |
| `/research/{hub-article-slug}` (top-level) | 308 redirect to the canonical hub URL | `RESEARCH_ARTICLES.hub` | never indexed |
| `/glossary/{independent-measurement,quorum-detection,transport-error,vendor-reported-status,partial-outage,availability,latency}` | SSG (`generateStaticParams`) | `GLOSSARY_TERMS` | index, canonical, in sitemap |

Route helpers (single source of truth): `lib/routes.ts` gains
`RESEARCH_HUBS`, `researchHubRoute()`, `researchRoute()` (hub-aware),
`researchHubArticles()`, `researchStandaloneArticles()`,
`SHARE_ROUTES.trackIncident()`. The sitemap, footer, research index, hub,
teasers and both dynamic article routes all derive from those functions, so a
slug cannot exist in one place and not another - the mechanism that prevents
the historic footer-404 class of defect.

## 3 · SEO / AI-search surface changes

1. **Answer-first vendor block.** New `#is-down-answer` section in every
   vendor masthead: the question as a real `<h2>` ("Is OpenAI down?"), a
   direct state-scoped answer, measured facts (timestamp, HTTP code, latency,
   region set, window availability), and the two scoping caveats. Composed by
   `lib/observatory/answer.ts` - a pure function unit-tested against healthy /
   degraded / critical / stale / unknown inputs, so answer text and visible
   data cannot drift.
2. **Machines-first paragraphs preserved and corrected.** The `sr-only`
   record summary and the new hub sections give retrieval systems complete
   sentences: entity, state, timestamp (UTC), endpoint, regions, window,
   observation count, methodology pointer, and the explicit "absence of
   published records ≠ absence of outages" distinction.
3. **Structured data.** Vendor records: existing `Dataset` description is now
   endpoint-scoped; hub: `CollectionPage` + `BreadcrumbList` with `hasPart`
   enumerating only live records and published articles; incident page:
   `WebPage` (with `datePublished`/`dateModified` from the stored window) +
   breadcrumbs; glossary terms join the existing `DefinedTermSet`.
   No `FAQPage` was added on data pages - answers there are volatile and the
   claims are scoped; nothing is schema'd that the page does not show.
4. **Titles / descriptions.** Vendor descriptions now name the observed host
   ("… measurement of OpenAI (`status.openai.com`) …"), which makes the title
   match the honest scope instead of outrunning it. Hub and article titles are
   unique; `| RELIASTRA` template preserved; OG/Twitter per page; language
   declared at the root layout (`en`).
5. **Sitemap.** Canonical-only: research hub, hub-qualified article URLs, new
   glossary terms, vendor pages (as before), plus real incident pages
   discovered through the published-evidence endpoint - capped at the first 24
   vendors, with graceful fallback when the API is unreachable at generation
   time. lastmod follows article `updatedAt` where present.
6. **robots.txt.** `/observatory/**` (including `/incidents/**`) stays crawlable
   by the absence of any rule against it, and there is deliberately no blanket
   `Allow: /`: Next.js writes Allow lines before Disallow lines, and a
   first-match reader - Python's `urllib.robotparser` through 3.12 and the ports
   of it many agent crawlers use - stops at the Allow and voids every disallow
   below it. Console/admin/auth/token routes stay disallowed; `/sitemap.xml` is
   advertised. A deployment that is not the canonical host disallows everything
   and advertises no sitemap.
7. **llms.txt / llms-full.txt** refreshed with the hub, the incident-URL
   pattern, and an explicit "what the public observatory actually probes"
   section (status-site semantics, single origin, empty-incident caveat). Kept
   as convenience, never as the discoverability mechanism - every fact is in
   the page HTML too.
8. **Internal link graph.** Footer "Intelligence" gains the hub; research index
   gains a "Hubs" band; `/track` index links the hub beside the methodology;
   vendor pages link the hub (AI-category only); hub ↔ articles ↔ methodology ↔
   glossary ↔ vendor records ↔ incident pages are mutually linked with
   descriptive anchors. No orphans: every new page is reachable from the
   footer plus at least one contextual body link.

## 4 · New original research

Two hub articles under the standing editorial rules (no rewritten vendor docs,
no invented statistics):

- **“Is OpenAI down?” - how to answer the question honestly** - decomposes the
  query into its five distinct claims; defines the atomic observation; states
  precisely what the OpenAI record measures and what it refuses; gives a
  reproducible curl recipe against the same endpoint plus the public API
  timeline call an engineer can diff against.
- **When an AI API misbehaves: an evidence playbook** - the ten-minute record
  to keep (UTC windows, error shapes, verbatim failed request, client retry
  state), the three-record triangulation (own telemetry / vendor statement /
  independent observation), correlation-vs-causation discipline mirroring the
  product's attribution rules, and the evidence-report structure.

The methodology paper was **corrected, not rebranded**: sections 2-3 now
document the two detection topologies and the deployed single-origin reality
(the paper previously described quorum across regions as though it were what
production runs); the known-limitations section now states expected-200
semantics, the 15-minute staleness rule, and endpoint-not-company scope.
`updatedAt: 2026-09-10` flows into the visible metadata block and JSON-LD.

## 5 · Performance & accessibility notes

- No new client components; the hub and incident pages are server-rendered
  from the same fetch budget discipline as the vendor record (detail +
  metrics + incidents per AI provider; cap 12; `/developer` endpoint still
  unused for rate-limit reasons).
- Removing `[vendor]/loading.tsx` costs a skeleton on cold TTFB and buys
  correct status codes; the per-window telemetry Suspense boundary stays.
- Hub/vendor tables keep real `<caption>`s, `role="img"` SVG aria-labels,
  single `h1`, monotonic heading levels (asserted by the crawl script below),
  and visible state words - never colour alone.

## 6 · Reproducing the QA

From `frontend/`:

```bash
npm run test          # unit tests incl. answer-builder, deriveState,
                      # hub-routing, sitemap-source, nav-integrity, soft-404 guard,
                      # indexability and the record-status contract
npm run typecheck
npm run lint
npm run build
node scripts/qa-backend.mjs 8787 &
RELIASTRA_API_URL=http://127.0.0.1:8787 npm run start
# then:
curl -s localhost:3000/sitemap.xml | grep -c "/observatory/.*/incidents/"  # real incidents only
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/observatory/nosuchvendor  # 404
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/research/is-openai-down   # 308 -> hub child
curl -s localhost:3000/robots.txt | grep -c "^Allow:"                             # 0
bash scripts/audit-live-dependency-index.sh   # the whole contract, against a live site
```

The Playwright suites (`e2e/observatory.spec.ts`,
`e2e/infrastructure-live.spec.ts`) continue to cover the rendered record
against the fixture backend; browser download is unavailable in the agent
sandbox, so this change set validated rendering via the production standalone
server plus scripted HTML/JSON-LD QA (all head checks, link-integrity,
heading-order and alt-text checks pass).

## 7 · Known production risks (for the report)

1. Single origin (`us-east`) until probe workers are deployed elsewhere - the
   copy now matches this, but multi-region incidents still cannot exist.
   **Remediated (2026-09):** `vendor_endpoints.regions` no longer carries a
   seeded `eu-west` label no probe ever used (migration
   `0038_public_endpoint_regions`), and the record page, the sitemap and the
   llms.txt files all state one observation region from the same constant. The
   underlying constraint stands: one point means no quorum, and the topology
   label stays `single`.
2. `fetchVendorDetail` on `/track` fans out one detail call per row (cap 24)
   against the shared 300/min bucket; unchanged from before, still the main
   crawl-load amplifier if the catalog grows.
   **Remediated (2026-09):** the fan-out is bounded at `REGION_RESOLVE_LIMIT`
   (24) and marked as a prefix rather than a complete read, the rows it skips
   say so instead of implying "zero regions", and the site's own server-side
   reads now authenticate as a reader (`X-Reliastra-Reader` /
   `INTERNAL_READER_TOKEN`) with their own 3000/min budget instead of sharing
   the 300/min IP bucket with the browser traffic the app proxies. It remains
   the largest read multiplier on the public surface.
3. `newrelic`-style registered-but-unobserved vendors are in the sitemap and
   indexable with "insufficient data" content - thin but honest; consider
   noindex-ing records with zero observations once the catalog grows.
   **Still open.** The record page does distinguish "no observations yet" from
   "could not be read", which was the part that mattered for correctness; the
   thin-content question is an editorial one.
4. The hub counts incidents via per-vendor public-incident calls on every
   revalidation; if the catalog grows past a handful of AI vendors, move the
   hub to the same batch endpoint the record pages should eventually get.
   **Resolved differently (2026-09):** the hub no longer calls the incident
   endpoint at all - observed state comes from the catalog row's own
   `recent_status`, so the hub is one paginated catalog walk plus the bounded
   detail prefix above.
5. Sitemap/incident discovery only enumerates incidents within the evidence
   channel's rolling 90-day window (API constraint), so a permanent incident
   page stays live at its URL but ages out of the sitemap.
   **Remediated (2026-09), and the original claim was wrong in a way that
   cost published URLs.** The window was never an evidence-channel constraint:
   it was a literal `timedelta(days=90)` in the gate service, now
   `PUBLIC_INCIDENT_WINDOW_DAYS` (365, held at the retention the documents
   promise). And the incident page was never permanent - once an incident aged
   out, its published, sitemap-listed URL started returning 404. The page now
   states the window it is published for, the sitemap and the page are
   enumerated from the same read, and neither silently drops entries: an
   unreadable catalog throws instead of publishing a shorter list.
