# Phase 3 — Public Infrastructure Observatory

Complete rebuild of the public tracking surface: `/track` and `/track/[vendor]`.

Phase 1 (`docs/redesign/route-inventory.md`) rebuilt the marketing site as
*cinematic infrastructure*. Phase 2 (`docs/redesign/console-inventory.md`) rebuilt
the authenticated product as an *operational evidence console*. This phase adds the
third and last design language: the **public infrastructure observatory** — a public,
independently observed record of an external dependency's behaviour.

It is not a status page. A status page is a vendor talking about itself. This is
RELIASTRA's own measurement record, published, and it is simultaneously the product
demo, the SEO surface, the trust mechanism and the research artifact.

---

## 1 · What was there before

`/track/[vendor]` (632 lines) and `/track` (295 lines) rendered inside the marketing
shell with marketing components. The audit found:

| Finding | Consequence |
| --- | --- |
| Three fetches total (`developer`, `timeline`, `incidents/public`) | The `metrics`, `vendors/{name}` and `incidents` endpoints were unused, so windows, endpoint configuration and non-published incidents never appeared |
| `fetchVendorPublicIncidents` read `.incidents` off the response | The endpoint returns a **bare array** — the incident and evidence sections rendered empty on every vendor, silently |
| Evidence links pointed at `/portal/{download_token}` | `/portal/[token]` is the **agency SLA portfolio**, not an evidence download, and the production API always returns `download_token: null` |
| No chart | The central fact of the page — behaviour over time — was not shown at all |
| No regional intelligence | Region was printed as a string; the observation topology was invisible |
| Availability printed straight from the API | `get_endpoint_stats` returns `uptime_percentage = 100.0` for a window with **zero observations**; the page would have advertised "100%" for a dependency nobody had measured |
| Huge empty bands, marketing rhythm | Read as a landing page about monitoring, not as a measurement record |

Baseline screenshots: `frontend/.qa/track-before/` (git-ignored).

---

## 2 · The public API this surface is built on

All of it is unauthenticated and real (`backend/app/modules/vendors/router.py`).

| Endpoint | Used for | Limit |
| --- | --- | --- |
| `GET /v1/vendors?limit=` | the index catalog | `public_vendor_limiter` 300/min |
| `GET /v1/vendors/{name}` | identity, `recent_status`, endpoints + regions | 300/min |
| `GET /v1/vendors/{name}/metrics` | availability / mean / p95 for 1h…90d | 300/min |
| `GET /v1/vendors/{name}/timeline?window&region` | the chart, the per-region current observation, the last-hour pulse | 300/min |
| `GET /v1/vendors/{name}/incidents?limit` | every incident opened against the vendor | 300/min |
| `GET /v1/vendors/{name}/incidents/public` | incidents with published evidence (**bare array**) | 300/min |
| `POST /v1/evidence/gate` | releasing an evidence report to a named requester | 5/min per IP |

**`/vendors/{name}/developer` is deliberately not used.** It is the one endpoint with a
30/min limit, and every server-rendered page shares one IP bucket. The record composes
the cheaper endpoints instead and gets strictly more data for it. Per render, one record
costs ~7 requests + one 1h timeline per region (capped at 6), all fetch-cached for 60s.

### Facts the API does not provide, and are therefore not claimed

- **No vendor status-page data.** RELIASTRA does not ingest, mirror or reconcile any
  vendor status page, so no comparison is drawn. Section 08 says this explicitly.
- **No configured check interval.** `VendorEndpoint.check_interval_seconds` exists on the
  model but is not in `VendorEndpointResponse`. The record therefore publishes the
  cadence it can *measure* (bucket length ÷ mean observations per bucket) and says so.
- **No regions-affected list per incident**, no `max_latency_ms`, no
  `downtime_percentage` in production (`list_public_incidents` returns them as `None`).
  They render as "not recorded" when absent, never as a number.
- **`dependency_name` is never rendered.** It is the name a *customer* gave the
  dependency inside their own account. It comes back from a public endpoint; publishing
  it would leak customer naming. A unit test asserts it cannot reach the page.

---

## 3 · Structure of the record

`/track/[vendor]` is a numbered document, not a dashboard. The index spine (01…10) is
what makes 3,000+ words of measurement navigable.

| | Section | What it answers |
| --- | --- | --- |
| — | **Masthead** | What is observed (name at up to 11.5rem), what state it is in, when it was last observed (to the second, UTC), the last hour of observations, and the identity strip: category, endpoint host, regions, "measured by RELIASTRA probes" |
| — | **Summary** | Two crawlable paragraphs composed entirely from the record: what it is, from where, how often, 24h and 30d availability, incident count |
| 01 | Current observation | One row per region: latency, status code, result, observed-at. Individual measurements, not averages |
| 02 | Observed state and availability | The state word, how it was derived, and every window the API aggregates with its observation count |
| 03 | Historical telemetry | The chart: latency trace, availability strip, incident bands, p95 threshold, hover + keyboard inspection, range and region switchers |
| 04 | Observation network | Coordinate plot of the observation origins + the region table with coordinates and measured cadence |
| 05 | Observed incidents | Date, UTC window, record, duration, severity, status, evidence availability |
| 06 | Evidence records | Published evidence with detected/duration/severity, and the gate that releases the signed report |
| 07 | How RELIASTRA knows this | Nine specification rows describing the actual implementation, including its limits |
| 08 | Observation vs official vendor status | The distinction, stated where it matters |
| 09 | Dependency information | Observed endpoint, protocol, host, path, regions, state, record identifier, record opened |
| 10 | Related records | Other dependencies under observation, research, docs, glossary |
| — | Conversion | "Create an independent record" — contextual, no hype |

`/track` is the same language at index scale: an aggregate strip (dependencies,
categories, regions in use, most recent observation), the catalog with a **resolved
state per dependency** (from `/vendors/{name}`, capped at 24 entries — beyond that a row
is listed without a state rather than with a guessed one), a "how to read this index"
specification, and the conversion band.

---

## 4 · The live element

The requirement was that the page feel live with no incident in progress, without a
blinking neon dot.

- The observation timestamp is **server-rendered**. Nothing important waits for JS.
- After mount, a 1s tick advances a `T+MM:SS` counter and a 1px cadence hairline that
  fills against the interval at which observations have actually been arriving.
- When the counter passes that interval, the component calls `router.refresh()` — only
  while the tab is visible, at most once every 30s — so a new observation appears
  without a reload. That is the entire motion budget of the page.
- The last-hour pulse strip in the masthead is 60 real buckets, static SVG.

---

## 5 · The chart

`components/observatory/telemetry-chart.tsx`, ~260 lines of SVG, no chart library.

- One 1.25px trace in text white. Colour is reserved for failure and incident bands.
- **The line breaks at a failed bucket.** Interpolating across an outage would draw a
  latency that was never observed.
- Axes carry units (`ms`) and real UTC times; the p95 from `/metrics` is drawn as a
  labelled dashed threshold; incident windows are shaded with their published title.
- The inspected value prints in a **fixed readout row above the plot** — no floating
  tooltip, no layout shift, and the row is populated (latest bucket) before you hover.
- Two viewBoxes rather than one stretched one: uniform scaling would put 3px type on a
  375px phone.
- Keyboard: the plot is focusable, arrow keys move the cursor (shift = 10%), Home/End
  jump, Escape clears; the accessible name is the full prose summary of the series.
- Range (24H/7D/30D/90D) and region are **URL state**, server-rendered inside a Suspense
  boundary keyed by `window:region`. Every range is a shareable, crawlable address, it
  works without JavaScript, and switching does not tear down the page.

---

## 6 · Refusing to fabricate

The rules are enforced in `lib/observatory/format.ts` and covered by 23 unit tests
(`lib/observatory/__tests__/observatory.test.ts`):

| Input | Rendered |
| --- | --- |
| `uptime_percentage: 100.0` with `total_observations: 0` | `insufficient data` |
| `avg_latency_ms: 0` | `no data` |
| `status_code: null` | `no data` |
| no timestamp | `no observation` |
| field absent from the API | `not recorded` |
| endpoint unreachable | `unreachable` (distinct from empty) |

State derivation never defaults to healthy: the most recent failed observation wins,
then the rolled-up `recent_status`, then `unknown` — an absence of observations is not
health. A fixture dependency (`newrelic`) that has never been observed exists purely to
keep this path honest; the e2e suite asserts that page contains "insufficient data" and
contains no availability figure at all.

Three failure states are visually distinct: **no data** (nothing observed yet),
**telemetry unavailable** (that endpoint failed, rest of the record intact),
**observation unavailable** (the record itself could not be read — no figures, no chart
frame, a retry). A vendor that does not exist gets its own 404 page that says RELIASTRA
publishes no record for it.

---

## 7 · Evidence

The public gate does not serve a file from a link: it records the requester and returns
a signed, expiring token. So the UI is a **request**, not a download button, and says so.
On success it renders the real expiry, links through the same-origin proxy
(`/api/v1/evidence/{token}/download`) rather than the API host, and mentions the created
account only when the API reports one. Rate-limit (429) and failure responses have their
own copy. No account is required to reach any of it.

---

## 8 · Accessibility, SEO, performance

- One `h1`, one `main`, semantic section headings, breadcrumbs, skip link.
- Status is **dot + word** everywhere; no meaning is carried by colour alone.
- Every figure (`svg[role="img"]`) carries a prose accessible name; the chart also has a
  `figcaption` summarising the window, bucket count, failures, peak and mean.
- Focus is visible on the chart, the switchers and the form; the chart is fully keyboard
  operable.
- Unique title and description per vendor, canonical, OG + Twitter, `Dataset` +
  `WebPage` + `BreadcrumbList` structured data on the record, `CollectionPage` on the
  index. Unknown vendors are `noindex`.
- Server-rendered end to end; the only client components are the elapsed-time readout,
  the chart cursor and the evidence form — all hydrating around content already in the
  HTML. No content sits behind a spinner.

**Known platform limitation:** this Next version streams every dynamic route, so
`notFound()` cannot rewrite the status line after the shell has flushed — `/track/{unknown}`
answers 200 with the 404 page and `noindex`. `/portal/[token]` and `/reports/[token]`
already behave the same way. The e2e suite asserts the page content and the noindex,
and accepts either status.

---

## 9 · Verification

| Check | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| `eslint src e2e scripts` | 0 errors (5 pre-existing warnings, none in this phase) |
| `vitest` | 65 passed (23 new) |
| `next build` | succeeds; `/track` static, `/track/[vendor]` dynamic |
| `playwright e2e/observatory.spec.ts` | **30 passed** |
| `playwright e2e/public-redesign.spec.ts` | 39 passed |
| `playwright e2e/public-navigation.spec.ts` | 56 passed |

`e2e/observatory.spec.ts` covers 375/390/768/1024/1280/1440/1920 for both routes: no
horizontal overflow, no post-hydration layout shift, every section present and in
document order, the state/telemetry/observation/timestamp/region content, range and
region switching, the evidence gate performing a real request, link integrity across
both pages including the entire global footer, no placeholder hrefs, no console errors,
no failed same-origin requests, keyboard operation of the chart, and the SEO head.

Two pre-existing defects were fixed on the way, because the suite could not otherwise
be green: `/pricing` scrolled horizontally at 375/390 (a wide table's `min-width` leaks
into the root scroll area in Chromium — fixed with `.ob-scroll-x { contain: paint }`),
and the partner navigation overflowed at 1024 (its desktop lockup needs 1157px, so it
now switches at `xl`). Three auth specs were colliding with Next's own
`#__next-route-announcer__`, which is also `role="alert"`; they now target the
application's alerts.

---

## 10 · Files

**New**

```
src/lib/observatory/format.ts        formatters, sentinels, state derivation
src/lib/observatory/regions.ts       region code → published location + coordinate
src/lib/observatory/incidents.ts     merge of the two incident endpoints
src/lib/observatory/__tests__/observatory.test.ts
src/components/observatory/primitives.tsx        shell, sections, readouts, RecordTable
src/components/observatory/record-sections.tsx   masthead + sections 01–10
src/components/observatory/telemetry-chart.tsx   the chart (client)
src/components/observatory/telemetry-panel.tsx   suspended series + controls
src/components/observatory/region-plot.tsx       coordinate plot
src/components/observatory/live-observation.tsx  cadence counter (client)
src/components/observatory/evidence-request.tsx  evidence gate (client)
src/app/track/[vendor]/{loading,error,not-found}.tsx
e2e/observatory.spec.ts
frontend/scripts/qa-crop.mjs         element-level screenshot harness
```

**Rewritten**: `src/lib/track-api.ts`, `src/app/track/page.tsx`,
`src/app/track/[vendor]/page.tsx`.

**Extended**: `src/app/globals.css` (`.obs` layer + `.ob-scroll-x`),
`scripts/qa-backend.mjs` (never-observed vendor, evidence gate fixtures).

**Touched outside scope**: `src/app/pricing/page.tsx`,
`src/components/partner/public/partner-nav.tsx`, `e2e/public-redesign.spec.ts` — see §9.

---

## 11 · Not done

- The observatory keeps the global footer (every link route-derived and tested) but
  replaces the marketing header with a minimal bar: wordmark, the index, "what this
  measures", one action. Product menus have no business over an outage record.
- The `PreferredSourceSection` (Google's button, third-party script) stays on the index
  and is deliberately **not** on the record, which loads no third-party script at all.
- Vendor-status comparison, per-incident affected regions, and the configured check
  interval remain unbuilt because the backend does not expose them. Each is stated on
  the page as a limit rather than quietly omitted.
