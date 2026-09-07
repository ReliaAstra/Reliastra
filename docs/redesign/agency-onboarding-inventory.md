# Phase 4 — Agency portfolio, onboarding, authenticated information architecture

The final visual refoundation. Two surfaces were deliberately left on the old
visual language by Phase 2 — the agency portfolio (`/clients*`) and onboarding —
and this phase recomposes both, then fixes the information architecture around
them.

Phase 1 = `docs/redesign/route-inventory.md` (public site).
Phase 2 = `docs/redesign/console-inventory.md` (authenticated console).
Phase 3 = `docs/redesign/observatory-inventory.md` (public tracking).

---

## 1 · The finding that shaped this phase

**The agency API was switched off in the backend.**

```python
# app/main.py, before this phase
# AGENCY TEMPORARILY DISABLED - backend code preserved in
# app/modules/agencies/ but the API is not exposed to customers
# until the dashboard-first onboarding and client hierarchy UX
# are ready.  Re-enable by uncommenting the line below.
# app.include_router(agencies_router)
```

So `/v1/clients` and `/v1/agency/portfolio` answered 404, and the existing
`/clients` page was a UI for endpoints that did not respond. The condition the
comment set out is what this phase builds, so the router is mounted again
(confirmed with the repository owner before changing it).

**Authorization is unchanged.** Every route is org-scoped through
`get_current_org`; both writes carry `require_admin`; the public portal share
link remains HMAC-verified and rate-limited. `tests/integration/test_refurbishment_api.py`
previously asserted 404 for those two endpoints and documented that they become
201s when the line is uncommented — it now asserts the 201s, the list read, the
tenancy 404 for a foreign client, and the portfolio rollup.

---

## 2 · Authenticated information architecture audit

| Route | Purpose | Backend capability | Before | Now |
| --- | --- | --- | --- | --- |
| `/dashboard` | Operational overview | `dashboard/*` | Phase 2 | unchanged |
| `/dependencies`, `/dependencies/[id]` | Monitors | `dependencies/*` | Phase 2 | unchanged |
| `/incidents`, `/incidents/[id]` | Confirmed failures | `incidents/*` | Phase 2 | unchanged |
| `/evidence`, `/evidence/[id]` | Incident-side evidence | `evidence/*` | Phase 2 | unchanged |
| **`/reports`** | **Artifact-side evidence** | `GET /v1/evidence`, `GET /v1/evidence/{id}` (signed URL), `POST /v1/evidence/{id}/regenerate` | **missing — capability had no route** | **new, real** |
| `/clients` | Agency portfolio | `GET /v1/agency/portfolio`, `GET /v1/clients` | old visual language, dead API | rebuilt |
| `/clients/[id]` | Client environment | clients + applications + dependencies + incidents + evidence | old visual language, dead API | rebuilt |
| `/clients/onboarding` | Agency setup | `POST /v1/clients`, `POST /v1/clients/{id}/applications`, `PATCH /v1/dependencies/{id}` | old visual language | rebuilt as a sequence |
| `/onboarding` | First-run setup | `POST /v1/dependencies`, `GET /v1/dependencies/{id}/results`, `POST /v1/notifications/configs` | old visual language, 8 steps | rebuilt as a 4-stage sequence |
| `/settings`, `/settings/billing`, `/support` | Account | — | Phase 2 | unchanged |

### Orphans found and removed

| File | State |
| --- | --- |
| `components/dashboard/shell/client-selector.tsx` | Imported by nothing. A client switcher existed but was never mounted — replaced by the topbar scope control. |
| `components/dashboard/shell/onboarding.tsx` | Imported by nothing. A checklist modal from the pre-Phase-2 dashboard. |
| `components/onboarding/NextBestAction.tsx` | Imported by nothing (it imported the orphan above). |
| `components/onboarding/*` (8 step components + shell) | Superseded by the configuration sequence. |
| `components/dashboard/pages/{clients,client-workspace,agency-onboarding}.tsx` | Superseded by `components/agency/*`. |

### Navigation entries the previous pass refused to fabricate

- **EVIDENCE → Reports** now exists because a real capability backs it: the
  evidence module lists reports, issues signed download URLs and regenerates
  artifacts. `/reports` is the artifact view (files, checksums, downloads),
  distinct from `/evidence` (incidents and what the record says).
- **RESEARCH** has no authenticated backend and none was invented. The console
  links the public `/research` index in a `Reference` group, marked as opening
  the public site in a new tab, with a screen-reader note saying so. A hollow
  in-app research page would have been worse than the honest link.

### One real bug fixed in passing

`DataTable` documented that "the first cell contains a real link" but rendered
none — rows navigated via `onClick` only, so no table row in the console was
keyboard-reachable. The first cell is now a real anchor. That surfaced a second
defect: a link inside a cell of a linked row is invalid nested-anchor HTML,
which React refused to hydrate on `/reports`; that cell is now plain text.

---

## 3 · Agency portfolio — multi-client infrastructure operations

`/clients` is composed as an operations console, not a CRM:

- **Posture line, not KPI tiles.** One large count of environments under
  management, then the state split as dot+word chips, then open incidents and
  the observed-monitor availability. No four coloured boxes.
- **Client environments table** sorted by attention (critical → degraded →
  operational → unobserved), with applications, dependencies, availability,
  mean latency, open incidents and last incident. Rows tint only when critical.
- **Active incidents across clients**, attributed by walking
  `incident → dependency → application → client`. Anything that does not
  resolve is shown as an unassigned monitor rather than attributed to a guess.
- **Recent evidence by client** — which client has a record you can act on.
- **Unassigned monitors** — the monitors that roll up to nobody, with a route
  to fix that.
- **Client portal** — the real signed `/portal/{share_token}` link, offered at
  agency level only, because the token covers the whole portfolio.

`/clients/[id]` is a scoped environment: header with state and last observation,
four readouts, applications with monitor counts, this client's dependency health,
an attach control (a real `PATCH application_id`), incidents, evidence and the
environment record. Every table on the page contains only that client's data.

**Client scope is never ambiguous.** The top bar carries a scope control that
reads `AGENCY · <org>` or `CLIENT · <name>`, derived from the route rather than
from hidden state, and switching is a real navigation.

### The measurement trap, again

`AgencyService.get_portfolio` averages over an empty list, so a client with no
monitors comes back as `uptime_24h = 100.0`, `avg_latency_ms = 0.0`, status
`operational`. The console renders that as **Not observed / insufficient data**,
and `agencyPosture` counts those environments in their own `unmeasured` bucket
instead of adding them to "operational". Eleven unit tests hold this in place
(`src/lib/agency/__tests__/portfolio.test.ts`).

### Gating

Agency mode is a **capability, not a paywall** (confirmed with the owner). With
`has_agency_mode` false there is no navigation entry at all, and a direct
navigation renders a factual page: what the capability is, that it is a flag on
the organization rather than a plan feature, and a contact route. No price, no
plan name, no upsell — nothing in the billing system sells agency mode, so the
UI does not pretend otherwise.

---

## 4 · Onboarding — infrastructure configuration sequence

Four stages and an activation surface, replacing eight steps of cards:

```
01 ENVIRONMENT → 02 DEPENDENCY → 03 OBSERVATION → 04 CONFIRM → observation active
```

- It renders **outside the console shell**. During setup there is one task, and
  a rail pointing at surfaces with no data in them is a distraction.
- **01 ENVIRONMENT** states the real environment: organization, plan, monitor
  allowance used, and the minimum interval the plan permits. The three context
  choices are kept (they order the next stage's suggestions) and labelled as
  local setup state.
- **02 DEPENDENCY** suggests services from the **real public dependency catalog**
  (`GET /v1/vendors`), and selecting one prefills the endpoint RELIASTRA itself
  observes. No invented integration list, no logo wall. Manual entry is the
  primary path and validates the URL before it can be submitted.
- **03 OBSERVATION** offers exactly what the API accepts: the four
  `ALLOWED_REGIONS`, GET/HEAD/POST, expected status codes, interval floored by
  the plan, timeout, optional latency threshold, and progressively disclosed
  headers with the real restrictions stated. Choosing one region warns that a
  failure can never reach quorum.
- **04 CONFIRM** prints the exact configuration and the incident rule before
  anything is created.
- **Activation** is infrastructure coming online: `OBSERVATION INITIALISING`
  while the scheduler has not reached the monitor, then the first real
  observations with region, latency, status code and UTC timestamp. No
  confetti, no "you're all set".

Nothing was deleted: the alerts step became a real notification block on the
activation surface (replacing a `window.prompt()` for the Slack webhook), and
"expand"/"evidence intro" became the three real destinations this monitor now
feeds.

**Security note:** the draft (endpoint, cadence, regions) is persisted so a
reload resumes; **request headers are never persisted**, because they can carry
an API token. They live in component state and are sent once, to be encrypted
at rest by the backend.

---

## 5 · Verification

| Check | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| `eslint src e2e scripts` | 0 errors |
| `vitest` | **76 passed** (11 new) |
| `next build` | succeeds, 88 static pages |
| `playwright e2e/agency-onboarding.spec.ts` | **30 passed** |
| `playwright e2e/observatory.spec.ts` | 30 passed (no regression) |
| `playwright e2e/public-redesign.spec.ts` | 39 passed |
| `playwright e2e/public-navigation.spec.ts` | 56 passed |

`e2e/agency-onboarding.spec.ts` drives the real journeys: the full four-stage
sequence including the POST that creates the monitor and both activation states;
a rejected monitor (actionable error, no false success); resume after reload;
exit without creating anything; the portfolio's posture and attention ordering;
the unmonitored client that must not read as healthy; incident and evidence
attribution; opening and scoping a client; the scope switcher; client creation
from the dialog; the three-stage client setup sequence; the not-enabled state
(and that it is absent from the navigation); navigation integrity including
`/reports`; no placeholder hrefs; research marked as leaving the console;
375/390/412/768/1024/1280/1440/1920 with no horizontal scroll; one `h1` per
page; every form control labelled; no console errors; state never colour-alone;
and Escape closing the dialog.

**Not runnable in this environment:** `e2e/console-redesign.spec.ts` (12 tests)
and the checkout specs create accounts against the real FastAPI backend, which
cannot run here (no Python dependencies installed) — they fail at
`signup -> 404` before reaching an assertion. The backend test suite could not
be executed for the same reason; the agency integration test was updated to the
post-enable expectations it documents.

---

## 6 · Files

**Backend**
```
app/main.py                                   agencies_router mounted (+ rationale)
tests/integration/test_refurbishment_api.py   404 assertions → 201 + tenancy + portfolio
```

**New frontend**
```
src/lib/agency/portfolio.ts                   rollup guards, hierarchy joins, attribution
src/lib/agency/__tests__/portfolio.test.ts
src/components/agency/portfolio.tsx           agency operations
src/components/agency/client-environment.tsx  one client environment
src/components/agency/parts.tsx               capability notice, client dialog, portal share
src/components/sequence/shell.tsx             configuration sequence shell
src/components/sequence/observation-setup.tsx customer sequence + activation
src/components/sequence/client-setup.tsx      agency client sequence
src/components/console/pages/reports.tsx      evidence artifacts
src/app/(console)/reports/page.tsx
e2e/agency-onboarding.spec.ts
```

**Rewritten**: `src/stores/onboarding-store.ts`, the three `/clients*` route
files, `src/app/(console)/onboarding/page.tsx`.

**Extended**: `console-nav.tsx` (Reports, Agency group, Reference),
`console-topbar.tsx` (client scope), `console-shell.tsx` (sequence routes render
their own shell), `data-table.tsx` (real row link + `stackBelow`),
`lib/dashboard/queries.ts` (`useAllApplications`), `lib/dashboard/format.ts`
(zoned region codes), `scripts/qa-backend.mjs` (agency hierarchy, dependency
mutation, alert configs, signed report URL, first-observation transition).

**Deleted**: 14 orphaned or superseded files, listed in §2.

---

## 7 · Not done, and why

- **Client-level SLA portals.** The share token covers the whole portfolio;
  there is no per-client token in the backend, so the portal link is offered at
  agency level only rather than implying an isolation it does not have.
- **Client editing and deletion.** The API exposes create and list for clients
  and applications, and no update or delete. The UI therefore offers neither.
- **Authenticated research.** No backend capability; the public index is linked
  instead of duplicated.
- **Per-client billing.** No entitlement or invoice is scoped to a client in the
  billing module, so no client-level billing is shown.
