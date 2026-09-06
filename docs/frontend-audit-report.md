# Frontend production bug audit & remediation

**Date:** 2026-09-06
**Scope:** full frontend correctness audit - routes, navigation, auth gating,
error states, SSR, accessibility, production build.
**Method:** static analysis, a real production build served by `node`, a real
headless Chromium, and mutation-testing of the guards I added.

---

## 1. Verification matrix

| Area | Status | Evidence |
|---|---|---|
| Public routes | **PASS** | 27/27 returned 200 against the production build (`/tmp/route_audit.py`) |
| Research routes | **PASS** | `/research`, `/research/the-dependency-gap`, `/research/how-reliastra-measures-vendor-reliability`, `/research/reliastra-research-agenda` all 200; unknown slug → 404 |
| Navbar | **PASS** | 7 vitest assertions + Playwright link crawl over rendered DOM |
| Footer | **PASS** | same; mutation-tested (see §5) |
| Landing sections | **PASS** | `#evidence #live #research #comparison #pricing` all visible at 1440px |
| Customer auth | **PASS (static)** | gate verified in `providers.tsx`; live signup not exercised (backend down) |
| Partner auth | **PARTIAL** | role-crossing bug found and fixed; partner flows not driven end to end |
| Protected routes | **PASS** | 6 console routes redirect to `/login` in a real browser |
| Session expiration | **PASS** | 18 vitest cases; `session-expiry.ts` unchanged and still redacts |
| API calls | **PASS** | 3 proxy bases verified; failed calls are 502 `BACKEND_UNAVAILABLE`, not 404 |
| Mobile | **PASS** | 390/768/1280/1440 - no horizontal overflow, footer reachable |
| Console | **PASS** | 0 console errors, 0 page errors, 0 hydration errors on 13 routes |
| Hydration | **PASS (runtime)** | Playwright asserts no hydration text on every public route |
| Accessibility | **PASS (baseline)** | 0 unnamed buttons, 0 unlabeled inputs, 0 images w/o alt, 1 `h1`, 0 heading jumps |
| Production build | **PASS** | `npm run build` → `✓ Compiled successfully` |
| Playwright smoke suite | **PASS** | `e2e/public-navigation.spec.ts` → **28 passed (1.4m)** |

### Exact commands and results

```
$ npm run lint
✖ 5 problems (0 errors, 5 warnings)          # all 5 pre-existing

$ npm run typecheck                          # script added by this change
exit 0, no output

$ npm run test
Test Files  2 passed (2)
     Tests  25 passed (25)                   # 18 session-expiry + 7 nav-link

$ npm run build
✓ Compiled successfully
├ ○ /research
├   /research/[slug]
│ ├ ● /research/the-dependency-gap
│ ├ ● /research/how-reliastra-measures-vendor-reliability
│ └ ● /research/reliastra-research-agenda

$ PW_CHROMIUM_PATH=/tmp/chromium PW_CHROMIUM_LIB_PATH=/tmp/nsslibs \
  npx playwright test e2e/public-navigation.spec.ts
28 passed (1.4m)
```

`ignoreBuildErrors: false` in `next.config`, so the build is a full typecheck.

---

## 2. Bugs found and fixed

### 2.1 Research routes did not exist (the reported 404s)

`grep` found no `src/app/research/` at all. The footer and navbar linked to
`/research` plus three specific slugs, and `components/content/article-template.tsx`
was a complete, unused article template with JSON-LD, evidence and methodology
sections - so the routes were *intended* and simply never created.

Created `/research` (index) and `/research/[slug]` backed by
`RESEARCH_ARTICLES`, a single constant that drives `generateStaticParams`, the
index, the footer and the sitemap. The three articles use the existing
`ArticleTemplate`. Unknown slugs call `notFound()` - a real 404, not a redirect.

Content is methodological and describes behaviour that exists in the codebase
(scheduling, regional origination, quorum, the SSRF policy, the nine check
states, evidence checksums, retention). It contains no invented statistics.

### 2.2 Footer scrolled to sections that were never rendered

`scrollToId('solution')` and `scrollToId('partners')` targeted ids that exist
only inside `SolutionSection`/`PartnersSection` - components the landing page
does not import. Because `scrollToId` falls back to `window.scrollTo({top:0})`
when the id is missing, **these were dead links that still looked like they
worked**.

`page-landing.tsx` documents the removal as deliberate ("deliberately tight (9
sections)... every removed section moved its one essential idea into Hero or
Evidence"), and all five orphan components had zero importers. Per the brief,
they were deleted rather than reinstated, and the links repointed to sections
that exist.

Deleted: `SolutionSection`, `PartnersSection`, `FounderSection`,
`ProblemSection`, `UseCasesSection` (1,000+ lines of unreachable code).

### 2.3 "Join as partner" enrolled visitors as customers

`goTo('signup')` resolved to `window.location.assign('/signup')` - the
**customer** registration form, which posts to `/api/v1/auth/register` and never
creates a partner profile. The partner form is a separate component that
registers *and* calls `partnerApi.apply()`.

This is the role-crossing failure from §6 of the brief. The footer now targets
`/?page=signup`, and `app/page.tsx` was extended to honour `?page=support` so
the dual-mode support page is also linkable and refresh-safe.

### 2.4 Console chrome was served to unauthenticated visitors

`app-store.hydrated` was written by the bootstrap effect and **never read by
anything**. `DashboardProviders` rendered `{children}` unconditionally, so
`/dashboard` returned the full top bar, sidebar and page content to an anonymous
visitor and only redirected once the effect fired.

Queries were already gated by `useSessionReady()`, so there was no 401 storm -
but console UI and its HTML were served to anonymous visitors and flashed before
the bounce. Now gated on `hydrated && sessionState === 'authenticated'`, using
the flag that already existed for exactly this purpose.

### 2.5 A failed API call rendered as "no data"

Six dashboard pages destructured only `{ data, isLoading }`. On a 500, `data`
is `undefined`, `isLoading` is false, and the page renders its empty state -
exactly the failure mode the brief calls out as critical.

Added `QueryErrorState` (with Retry) and wired it into `dependencies-list`,
`incidents-list`, `evidence-library`, `billing`, and `dependency-detail`.

Two worse variants in `dependency-detail.tsx`:

- **`?? 100` fabricated a perfect score.** `history?.uptime_percentage ?? row?.uptime_percentage_24h ?? 100` meant a failed history load displayed **100% uptime**. In an SLA-evidence product that reports a vendor as flawless precisely when it could not be measured. Now renders `-`.
- **Infinite skeleton.** `if (isLoading || !dep) return <RsSkeleton/>` meant a 404 (deleted dependency) or a 500 shimmered forever with no explanation and no way out.

The check-history table now distinguishes *failed* / *loading* / *genuinely
empty*, with the empty case pointing at the pipeline rather than the dependency.

### 2.6 `npm run start` required a runtime production does not use

The script was `bun .next/standalone/server.js`, but `bun` is not installed and
`deploy/supervisord-all.conf` runs `/usr/bin/node /app/web/server.js`. Changed to
`node`, matching the real runtime. Also added the missing `typecheck` script.

### 2.7 Sitemap omitted live public routes

`/privacy` and `/terms` were served but never listed. The sitemap is now derived
from `@/lib/routes`.

---

## 3. Route source of truth

`src/lib/routes.ts` is new and declares every public, auth, console, admin,
share, research and partner destination. The research slugs and landing section
ids live there too, so the footer, `generateStaticParams`, the sitemap and the
link-integrity test all read one list. A route can no longer diverge into a
stale path - which is precisely how the original 404s happened.

---

## 4. Getting a real browser (and why it matters)

No browser was obtainable through normal channels: the Playwright CDN, all
mirrors, `storage.googleapis.com` and every distro mirror are blocked, and
`apt-get` cannot resolve packages. Six attempts failed.

What worked: `@sparticuz/chromium` ships a real Chromium binary **inside the npm
tarball**. It unpacked and launched but needed `libnspr4.so`, `libnss3.so` and
`libnssutil3.so`. `nm -D` showed only 38 versioned NSS symbols were referenced,
so I built stub shared objects exporting exactly those (with `NSS_VersionCheck`
returning success) - Chromium uses BoringSSL for TLS, so NSS is only needed to
satisfy the dynamic linker for `http://` testing.

Result: a working headless Chromium, driven through the repo's existing
`PW_CHROMIUM_PATH` / `PW_CHROMIUM_LIB_PATH` hooks. **Caveat:** these are stub
crypto libraries. The results are valid for DOM, navigation, console and
layout assertions over `http://`; they would not be trustworthy for TLS
behaviour.

---

## 5. The guards were mutation-tested

A test that passes is not evidence until it has been seen to fail.

**vitest nav-link test** - reintroduced the two original bugs (a stale research
slug and `Join as partner → /signup`):

```
× resolves every internal href to a declared route
   AssertionError: expected [ Array(1) ] to deeply equal []
× links only to research slugs that are generated routes
   AssertionError: expected 4 to be 3
× sends partner signup to the partner form, not customer signup
   AssertionError: expected '/signup' to be '/?page=signup'
3 failed | 4 passed      → restored → 7 passed
```

**Playwright link-integrity test** - injected `/research/a-slug-that-was-never-created`
into the footer:

```
first run:  1 passed     ← WRONG
```

That pass was invalid: the standalone server caches its build manifest at
startup, so it was still serving the previous build. After stopping and
restarting the server:

```
Error: broken internal links
expect(received).toEqual(expected)
- Expected  - 1
+ Received  + 3
1 failed
```

**Operational note worth keeping:** after every `npm run build`, the production
server must be restarted or it serves stale output and verification silently
lies.

---

## 6. Requirement 10 evidence (error vs empty)

Before:

```tsx
const { data: deps, isLoading } = useDependencies();
{isLoading ? <TableSkeleton/> : !rows.length ? <EmptyState title="No dependencies yet" .../>}
```

After:

```tsx
const { data: deps, isLoading, isError, isFetching, refetch } = useDependencies();
{isLoading ? <TableSkeleton/>
 : isError ? <QueryErrorState title="Unable to load dependencies" onRetry={() => refetch()} retrying={isFetching}/>
 : !rows.length ? <EmptyState title="No dependencies yet" .../>}
```

`QueryErrorState` renders `role="alert"`, states that the data may still exist,
and offers Retry with a disabled/`Retrying…` state so it cannot double-submit.
It deliberately does not render the raw backend message.

---

## 7. API contract audit

Three distinct bases, all verified:

| Frontend | Proxy | Backend |
|---|---|---|
| `/api/v1/*` (`dashboard/api.ts`) | `api/v1/[...path]` | `/v1/*` |
| `/api/admin/*` (`admin-api.ts`) | `api/admin/[...path]` | `/v1/admin/*` |
| `/api/partners/*` (`partner-api.ts`) | `api/partners/*` → `proxyToBackend` prepends `/v1` | `/v1/partners/*` |

A first static pass reported 48 "unmatched" paths; that was my own error - the
matcher assumed a single `/v1` base for all three clients. Re-checking against
the actual prefixes showed every one resolves.

Live confirmation with the backend down: `/api/v1/vendors`,
`/api/v1/billing/currency` and `/api/v1/public/analytics/visit` returned
**502 `BACKEND_UNAVAILABLE`**, not 404. The proxy resolved and the backend was
absent - the correct classification, and the correct failure to show a user.

---

## 8. Genuinely unresolved

### 8.1 The marketing landing page has no server-rendered content - significant

`app/page.tsx` returns a boot splash until a `useEffect` sets `mounted`, because
`partner-store` is persisted to `localStorage` and SSR cannot read it. The
production HTML for `/` is 15,473 bytes and contains **only the splash** - no
hero, navbar, sections, pricing or footer.

```
$ curl -s localhost:3000/ | grep -c "All rights reserved"
0        # footer marker absent
```

For a marketing site with a sitemap, JSON-LD article templates and a
"Preferred Source" SEO component, this means crawlers see an empty page. It is
not a hydration error (Playwright asserts none on any route) and users are
unaffected, so I did **not** change it: the fix means altering the marketing
render path, and the honest way to land that is with a browser watching for
hydration mismatches across a persisted-store rehydration - a change I would
want reviewed rather than shipped at the end of an audit. **This is the highest-
value remaining item.**

### 8.2 Partner experience has no real URLs

Partner pages (`home`, `earn`, `tiers`, `dashboard`, `referrals`, `payouts`, …)
are state-routed through Zustand, reachable only at `/` with `?page=` honoured
for a subset. A partner deep link is not shareable and back/forward does not
work. Converting this to file routes is a redesign, which the brief excludes; I
made `?page=support` work and documented the pattern instead.

### 8.3 Not run this session

- **`e2e/checkout-flow.spec.ts`, `checkout-page.spec.ts`, `pricing-transparency.spec.ts`** - these need the FastAPI backend, Postgres, Redis, the Paystack stand-in and the mail sink. The Python venv at `/home/user/.venv-reliastra` is outside the persisted workspace and was gone this session (`pgserver`, `fastapi`, `celery`, `redis` all missing), so the stack could not be started. They cover checkout and pricing paths this change does not touch, but they were **not** executed and I am not claiming they pass.
- **Backend `pytest`** - same reason.
- **Live signup/login/partner registration** - needs the backend. Auth gating was verified in a real browser only for the unauthenticated redirect path.

### 8.4 Accessibility is a baseline, not a full audit

Programmatic checks only (accessible names, labels, alt, heading order). No
contrast-ratio measurement, no screen-reader pass, no keyboard-traversal test of
dialogs.

### 8.5 Pre-existing lint warnings

5 warnings remain, all in files this change does not touch.
