# Frontend forensic QA pass

Live walkthrough of the redesigned RELIASTRA frontend, before and after edits.
Rendered in headless Chromium (Playwright) against a fixture backend that
mirrors the FastAPI contract (`scripts/qa-backend.mjs`). Nothing in this file
was judged from source alone.

## Method

- Viewports: 375, 390, 412, 768, 1024, 1280, 1440, 1920.
- Routes: every public page, the research index and all three articles,
  `/track` and `/track/[vendor]`, all partner pages, auth (customer and
  partner sign in, sign up, reset, verify), the console (overview,
  dependencies and record, incidents and record, evidence and record, clients
  and record, onboarding, client onboarding, reports, settings, billing,
  support), root 404 and console error boundary.
- Per page: HTTP status, rendered height, word count, em-dash count, h1 set,
  failed subrequests, console errors, horizontal overflow
  (`scrollWidth > clientWidth`), and a full-page capture.
- Interactions: mobile site nav, mobile console nav, agency scope switcher,
  the four-stage onboarding sequence through monitor creation, login and
  signup validation, forgot and reset password, the verify-email code step.
- Gates: `npm run typecheck`, `npm run lint`, `npm test` (76 passing),
  `next build --experimental-build-mode compile`.

## Before and after

| Page | Before (1440) | After (1440) | Before words | After words | Em dashes |
| --- | --- | --- | --- | --- | --- |
| `/` | 13,739 px | 10,139 px | 2,167 | 1,161 | 12 to 0 |
| `/` at 390 | 21,040 px | 14,488 px | | | |
| `/pricing` | 5,099 px | 4,813 px | 871 | 577 | 15 to 0 |
| `/research` | 3,892 px | 3,571 px | 454 | 369 | 5 to 0 |
| `/track` | 4,102 px | 3,408 px | 741 | 497 | 4 to 0 |
| `/track/stripe` | 8,867 px | 7,252 px | 1,934 | 1,345 | 2 to 0 |
| `/partner` | 13,712 px | 2,637 px | 1,480 | 278 | 0 |
| `/login` | | 900 px | 158 | 101 | 2 to 0 |
| `/signup` | | 936 px | 191 | 118 | 2 to 0 |
| `/security` | | 3,452 px | 512 | 435 | 0 |

Repository-wide: 154 em dashes in 48 files, plus SVG social titles, e2e specs
and scripts, reduced to 0. Sentences were rewritten, not re-punctuated;
empty-cell placeholders (`—`) became a literal word (`none`, `no data`,
`unknown`, `0`).

## Content audit: claims

| Claim | Where | Source of truth | Supported | Action |
| --- | --- | --- | --- | --- |
| "Claim SLA credits", "calculated credit amount" | `app/page.tsx`, `app/layout.tsx`, `lib/seo.ts` | No credit concept in backend | No | Rewritten to attribution and evidence |
| SLA credit guarantee in homepage FAQ | `app/page.tsx` HOME_FAQS | none | No | Removed; five FAQs kept, each backed by `permissions.py` or evidence service |
| "AES-256 at rest, TLS 1.3" | `app/security/page.tsx`, `partner/public/page-privacy.tsx` | `core/security.py` (Fernet), Caddy default TLS | No | "Stored secrets encrypted at rest; traffic over HTTPS; card details handled by Paystack" |
| "SOC 2 Type II certified providers", penetration testing, MFA | `partner/public/page-privacy.tsx` | none | No | Removed |
| "Hundreds more" integrations | homepage | vendors service: any HTTP endpoint | No | "Any HTTP endpoint" |
| "Three regions" / "multiple cloud regions" / world map with coordinates | `console/pages/overview.tsx`, `track/page.tsx`, `observatory/region-plot.tsx`, `record-sections.tsx` | Regions are scheduling labels (`us-east`, `eu-west`, `ap-south`, `sa-east`); one worker; no geographic routing | No | Map, city names and coordinates removed; region codes shown; quorum rule stated (two regions inside 60 s) |
| Region names "US East" etc. in console | `lib/dashboard/format.ts` | API region codes | Misleading | `regionLabel` returns the code the API and evidence use |
| Partner tiers Bronze/Silver/Gold/Platinum, 32 to 40 percent, account manager, weekly payouts, 120 to 180-day attribution | `types/partner.ts`, `page-tiers.tsx`, `page-premium.tsx`, `tier-badge.tsx`, `tier-progress-card.tsx`, dashboard badge | `PARTNER_COMMISSION_RATE=30`; no tier fields in partner models or schemas | No | All removed. `/partner/tiers` and `/partner/premium` redirect (308) to `/partner/commission` |
| "Applications reviewed by hand" | drafted for partner home | `PartnerStatus` is `active` on creation | No | Not published; copy says the link is issued on signup |
| 30 percent recurring, 30-day hold, $50 minimum, 24 h destination cooldown | partner home | `config.py` PARTNER_* | Yes | Kept |
| 90-day referral cookie | partner terms, FAQ | `referral-banner.tsx` sets a 90-day cookie; backend replays `ref_code` at signup | Yes (frontend mechanism) | Kept |
| Plan limits (3/50 deps, 60 s/15 s interval, 1/90 day retention, 1/10 seats), 14-day Pro trial, no card | pricing, plan matrix | `core/permissions.py`, `TRIAL_DAYS` | Yes | Kept; onboarding now offers 15 s and 30 s intervals to Pro (was clamped at 60 s) |
| sha256 checksum, attribution classification and confidence | homepage evidence block, docs | `evidence/service.py`, attribution schemas | Yes | Kept; example artifact labelled as an example |
| Audit log, refresh-token rotation, rate limiting, SSRF policy | security page | `core/audit_log.py`, `core/security.py`, `core/rate_limit.py` | Yes | Kept, shortened |
| Testimonials, customer logos, uptime percentages, certifications | site | none | n/a | None present after pass |

## Copy audit (summary)

- KEEP: console record pages (dependency, incident, evidence), console
  tables, plan matrix, docs, glossary, research articles.
- SHORTEN: every public hero and section lede, pricing terms, track index
  notes, vendor record section notes and methodology, auth intros, onboarding
  stage copy, console empty and failure states, partner privacy.
- REWRITE: homepage (12 blocks, one idea each), partner overview (five
  blocks), research index header, security encryption paragraph, metadata
  descriptions, login error mapping.
- REMOVE: homepage capabilities and trust grids, duplicate trial facts on
  pricing, `DistinctionSection` on vendor records (folded into methodology),
  vendor record on-screen summary duplicate (kept as `sr-only` for crawlers),
  partner tiers and premium pages, partner icon-card grids, tier badge in the
  partner dashboard, region plot.

## Defects found live and fixed

1. `/dependencies` hydration error: mobile record stack wrapped every cell in
   the row `<a>`, and the Active incident cell renders its own `<Link>`.
   Only the title cell is a link now (`console/data-table.tsx`).
2. Console tables overflowed at 1024 (`/dependencies` 1304 px,
   `/incidents` 1208 px, `/evidence` 1171 px): every column had a fixed width
   under `table-fixed`. The first column is fluid; `td` clips with an
   ellipsis. Regions column shows a count with the full list as a title.
3. Onboarding offered a 60 s minimum interval on a Pro organization
   (`INTERVALS` started at 60). Now 15 s upward, filtered by the plan minimum.
4. `/verify-email` rendered two h1 headings (shell and OTP step). The step
   has a `headless` prop.
5. `/clients` availability cell printed "insufficient data" twice, colliding
   with the next column. Token is now `no monitors`.
6. Login echoed raw backend text ("No fixture for POST ...") into the alert.
   Only known sentences render; 5xx bodies never reach the screen
   (`lib/api-error.ts`, `app/login/page.tsx`).
7. Floating "N" badge on every page was the Next dev indicator, not app code.
   Disabled via `devIndicators: false` so captures reflect production.
8. Removed dead references after deleting the tier model
   (`dashboard-layout.tsx`, `command-palette.tsx`, nav and footer links,
   route slug lists, sitemap indexable slugs).

## Second pass results

- 0 em dashes in `src`, `public`, `e2e`, `scripts`.
- 0 horizontal overflow at 375, 390, 412, 768, 1024, 1280, 1440, 1920 across
  public, auth and console routes.
- 0 page errors. Remaining 404 subrequests are fixture-only endpoints
  (`/api/v1/analytics/events`, `/api/v1/billing/currency`,
  `/api/v1/public/analytics/visit`); the app treats them as silent.
- 56 of 56 internal links from public pages resolve 200; `/partner/tiers`
  and `/partner/premium` 308 to `/partner/commission`.
- Onboarding sequence: environment, dependency (suggestion prefill),
  observation (15 s interval available, four regions), review, creation,
  live observation table.
- `typecheck`, `lint` (0 errors, 5 pre-existing warnings), `test` (76
  passing), `build` compile: all green.

## Not changed, on purpose

- `docs/*`, `glossary/*`, research article bodies and legal pages: dense by
  nature; already free of unsupported claims after the metadata and SEO
  edits.
- The console record pages: they already meet the density and evidence bar.
- Partner dashboard internals beyond the tier badge and payout hint.
