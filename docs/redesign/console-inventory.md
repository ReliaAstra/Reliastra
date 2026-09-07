# RELIASTRA — Authenticated console audit & redesign report

Phase 2. Companion to `route-inventory.md` (Phase 1, public site + auth).

The authenticated product is treated as an **operational evidence console**, not
an analytics dashboard. Every screen is answerable against seven questions:
what is happening now · which dependency · how severe · when did it begin ·
internal or external · what evidence supports that · what to do next.

Design language: the public site is *cinematic infrastructure*; the console is
*operational infrastructure*. Same typography, palette, spacing and brand
language — different density, different posture.

---

## 1. Route inventory — authenticated surface

| Route | Component (after) | State |
| --- | --- | --- |
| `/dashboard` | `console/pages/overview.tsx` | Recomposed |
| `/dependencies` | `console/pages/dependencies.tsx` | Recomposed |
| `/dependencies/[id]` | `console/pages/dependency-record.tsx` | Recomposed |
| `/incidents` | `console/pages/incidents.tsx` | Recomposed |
| `/incidents/[id]` | `console/pages/incident-record.tsx` | Recomposed |
| `/evidence` | `console/pages/evidence.tsx` | Recomposed |
| `/evidence/[id]` | `console/pages/evidence-record.tsx` | **New route** (backed by the existing `GET /v1/evidence/{id}`) |
| `/settings` | `console/pages/settings.tsx` | Recomposed |
| `/settings/billing` | `console/pages/billing.tsx` | Recomposed, money contract preserved verbatim |
| `/support` | `console/pages/support.tsx` | Recomposed |
| `/onboarding` | `components/onboarding/*` | Unchanged (guided flow, out of scope) |
| `/clients`, `/clients/[id]`, `/clients/onboarding` | `dashboard/pages/*` | Unchanged (agency mode; nav entry only appears when `org.has_agency_mode`) |
| `(console)/loading.tsx`, `error.tsx`, `not-found.tsx` | rewritten | Recomposed |

No route was invented other than `/evidence/[id]`, which exposes an endpoint
the backend already serves and which the spec requires ("a serious evidence
library … opening detailed records").

### Shell

| Before | After |
| --- | --- |
| `dashboard/shell/app-shell.tsx` (max-w-6xl, sidebar, top bar, floating help bubble, theme toggle, two notification bells) | `console/console-shell.tsx` + `console-nav.tsx` + `console-topbar.tsx` |

Deleted as dead code once every route was migrated: `shell/app-shell.tsx`,
`shell/top-bar.tsx`, `shell/sidebar.tsx`, `shell/help-button.tsx`,
`shell/theme-toggle.tsx`, and the superseded page components
`pages/{overview,incidents-list,incident-detail,dependencies-list,dependency-detail,evidence-library,settings,support,billing}.tsx`.

Still used from the old shell: `command-palette`, `upgrade-modal`,
`add-dependency`, `error-boundary`, `providers`, `client-selector`,
`notification-bell`, `onboarding`.

---

## 2. Information architecture

Navigation (rail on `lg+`, sticky bar + primary row + sheet below):

```
RELIASTRA
SYSTEM STATUS · n MONITORED
  n operational · n degraded · n down · n unknown · n open incidents
OVERVIEW
MONITORING   Dependencies · Incidents
EVIDENCE     Evidence records
CLIENTS      Agency portfolio        (only when has_agency_mode)
ACCOUNT      Settings · Billing · Support
PRO PLAN — Manage
```

Every entry is a route that exists. The spec's `EVIDENCE → Reports` and
`RESEARCH` entries were deliberately **not** added: there is no authenticated
reports route (evidence *is* the record, and share links resolve to the public
`/reports/[token]` verification page), and in-app research would duplicate the
public research ecosystem without a backend behind it. Both are recorded here
rather than faked in the nav.

Global status is exposed as typography plus indicators in the rail and repeats
in a compact strip on mobile — never as a KPI card.

### Overview composition

`PageHead` (organisation, fact strip: monitored `n/limit` · availability 24h ·
open incidents · observation regions) → **Active incidents** → **Dependency
health** (sorted by state, critical rows tinted, incident codes cross-linked) →
**Recent incidents** → **Evidence**. No metric tiles, no icons, no greeting.

---

## 3. Design system — the `.obc` layer

`globals.css` §1981+ adds a console layer on top of the Phase 1 Obsidian
tokens: `--obc-*` (row 40px, gutters 20/28px, rail 232px, bar 52px), type
(`obc-title/h2/label/body/mono/figure/unit/link`), surfaces (`obc-page/section/
section-head/panel/inset`, 2px radius, no shadow), tables (`obc-table/num/sort`),
state (`obc-dot`, `obc-state[data-state]`, `obc-live`), controls
(`obc-btn[-primary|-sm]`, `obc-input`, `obc-field-label`), `obc-skel`, chart
primitives (`obc-axis/grid/thresh`), `obc-scroll`, reduced-motion.

Components: `console/primitives.tsx` (`State`, `PageHead`, `Fact`, `Section`,
`Readout`, `Row`, `Empty`, `Failure`, skeletons), `console/data-table.tsx`
(sortable `<th>` buttons with `aria-sort`, row links, critical row tint,
record-stack transform below `lg`, `TableFilters`), `console/telemetry.tsx`
(hand-rolled SVG `Plot` with threshold rule and a `<details>` data table,
`CheckStrip`).

No charting library was added. `recharts` remains for the surfaces that still
use it; the console's own plots are ~120 lines of SVG.

---

## 4. Data-integrity defects found and fixed

These were found by rendering the app, not by reading it.

1. **Fabricated incident metrics.** `incident-detail.tsx:213-227` hard-coded
   `Error rate 3.1x` and `Latency p95 1,240ms` as string literals, shown on
   every incident with any chart data. On an SLA-evidence product that is the
   most damaging possible defect. The new incident record computes
   observations, failed checks, regions, peak and median latency **from the
   check results returned for the incident window**, and states which window
   they were computed over.
2. **Fabricated confidence.** The incidents list defaulted a missing
   `confidence` to `HIGH`; the evidence library defaulted it to `MEDIUM`.
   Confidence is now printed only from `correlation_confidence`, and its
   absence is printed as "not recorded".
3. **Fabricated uptime.** The dependencies table rendered
   `uptime ?? 100` → a never-measured dependency reported `100.00%`. It now
   prints `no data`.
4. **Zero-latency as a measurement.** A `down` dependency reports
   `avg_latency_ms_24h: 0`; the tables printed `0 ms`. Non-positive latency is
   now `no data`.
5. **Colliding record codes.** `reportCode`/`incidentCode` took the first four
   characters of an id with hyphens stripped, so `ev_a1`, `ev_a2`, `ev_a3` all
   rendered `RPT-EV_A`. `format.ts` now shares a `shortCode()` that strips
   non-alphanumerics and takes the **last** four characters.
6. **Hard-coded region count.** The overview header printed "3 regions". It now
   counts the union of `Dependency.regions`, and omits the fact at zero.
7. **Dead latency chart.** `dependency-detail.tsx` mapped
   `{timestamp, latency_ms}` over an API that returns `{points:[{t,v}]}`, so
   the chart was permanently empty and silent about it. Fixed, with an explicit
   "not enough observations to plot" state.
8. **Status vocabulary.** `State` now prefers the backend's own word, so a
   dependency the API calls `down` reads "Down" rather than borrowing the
   incident-severity word "Critical". `ui/status-badge.tsx` gained the missing
   incident lifecycle mapping (`open`, `investigating`, `resolved`,
   `false_positive`), which previously all rendered as "Unknown".
9. **`undefined` beside a price.** A partial `plan.payment` payload rendered
   "Billed in undefined" / "39.00 undefined". Billing now only uses a payment
   object that actually carries a payment currency, and the QA fixture was
   corrected to the real `PaymentCurrencyInfo` shape.
10. **Off-brand boot splash.** The session-restore splash was a white page with
    a cyan checkmark. It is now the product's own void/signal palette with no
    animation.

---

## 5. Time, evidence and attribution

* Every timestamp is explicit UTC. Axis labels carry a date once a series spans
  more than twelve hours (a 24-hour plot previously printed the same `18:10 UTC`
  at both ends).
* Availability always carries its window ("Availability 24h").
* Missing values print `no data`, `no observation`, `not recorded` — never a
  zero, never a dash that could be read as a measurement.
* Incident record: header (code, dependency, state, detected, last update,
  duration) → **Attribution** (your service ↔ external dependency, correlation
  method, confidence, window, correlated dependencies, region of first
  detection, other dependencies during the same window) → **Timeline** of real
  events → **Observations** (computed figures, latency plot with the configured
  alert threshold, check-outcome strip, quorum count) → **Evidence**.
* Evidence record reads as a record, not a chart: subject, observations,
  attribution, integrity (checksum, byte size, generation time, record id),
  share and export (verification link to the public `/reports/[token]`).

---

## 6. Accessibility

* Semantic landmarks; skip link; one `<h1>` per page; sections labelled.
* Tables are real tables with captions, `scope="col"`, `aria-sort` on the
  header cell and a real `<button>` for the sort control.
* Below `lg`, tables become record stacks (`<ul>` of label/value pairs) rather
  than horizontal scrollers.
* Status is always dot **plus** word; colour never carries meaning alone.
* Plots are `aria-hidden` drawings paired with a `<details>` data table of the
  same observations; `CheckStrip` carries an `aria-label` summary.
* Reduced motion honoured (`.obc` layer); the only animation left is a 2s dot
  pulse on genuinely active incidents.

---

## 7. Verification performed

Executed in this workspace:

* `npx tsc --noEmit` — clean.
* `npx next build` — full production build succeeds.
* `npx eslint src` — 0 errors (5 pre-existing warnings, none in new code).
* `npx vitest run` — 42/42.
* `npx playwright test --list` — 111 tests / 5 files (Playwright browsers
  cannot be downloaded in this sandbox; specs list but do not run here).

Rendered QA (real Chromium, `scripts/qa-shot.mjs`, fixture backend
`scripts/qa-backend.mjs` on `:8787`), screenshots in `frontend/.qa/`
(git-ignored):

| Route | Widths judged |
| --- | --- |
| `/dashboard` | 1440, 390, 375 |
| `/dependencies` | 1440, 390 |
| `/dependencies/dep_auth0` | 1440 |
| `/incidents` | 1440 |
| `/incidents/inc_7f31a9` | 1440, 390 |
| `/evidence`, `/evidence/ev_a1` | 1440 |
| `/settings`, `/settings/billing`, `/support` | 1440 |

Findings acted on during QA: table overflow at 1440 (fixed with a fixed table
layout), duplicate `RPT-EV_A` codes, `0 ms` latency for down hosts, identical
plot axis labels, `undefined` currency strings, breadcrumb printing raw record
ids, and a missing primary mobile navigation row.

`scripts/qa-backend.mjs` is a development-only fixture server. It is never
imported by `src/` and is not wired into any build or CI serving path.

---

## 8. Backend

Untouched. No schema, worker, Celery, Redis, auth, billing, entitlement or
evidence-generation change. The only additions to the data layer are two
client-side query hooks over endpoints that already existed:
`useEvidenceRecord()` → `GET /v1/evidence/{id}` and `useRegenerateEvidence()` →
`POST /v1/evidence/{id}/regenerate`.

Billing contracts preserved exactly: `data-testid="payment-confirmation"`,
`billing-transparency`, `billing-next-charge`, `billing-currency-notice`,
`transaction-row-{reference}`, the `?pay_ref=` single-flight verification and
URL tidy, the "Upgrade" button that opens the plan chooser, and the canonical
`PaymentCurrencyNotice` / `FxReferencePanel` disclosure components (rendered
inside a `dark` scope, since they carry their own light/dark palettes and the
app root sets no theme class).

---

## 9. Known gaps / deliberate omissions

* **Agency portfolio** (`/clients*`) still uses the previous visual language.
  It is gated behind `has_agency_mode` and was out of the stated scope for this
  phase.
* **Onboarding flow** (`/onboarding`) unchanged.
* **In-app research** and an authenticated **reports** destination were not
  added — see §2.
* **API keys**: `GET /v1/api-keys` exists in the API client but has no UI on any
  surface, before or after. Adding one is a product decision, not a redesign.
