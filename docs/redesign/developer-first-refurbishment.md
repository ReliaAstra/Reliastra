# Developer-first refurbishment - B2B removal, stage 1

Companion to the earlier redesign phases:

- Phase 1 = `route-inventory.md` (public site)
- Phase 2 = `console-inventory.md` (authenticated console)
- Phase 3 = `observatory-inventory.md` (public tracking)
- Phase 4 = `agency-onboarding-inventory.md` (agency portfolio, onboarding, IA)
- **Phase 5 = this document** (developer-first product definition, B2B unmount)

---

## 1 · What changed and why

The product definition moved from "accountability infrastructure for agencies
and MSPs" to a **developer-first dependency evidence tool**: one engineer, one
plan ($9/month, monthly only), no sales process, no client hierarchies.

The inherited B2B machinery contradicted that definition at every layer:
plan ladders (Free/Pro/Enterprise), annual billing, seats, white-label
branding, an agency wedge (client groups, client-facing reports, client
portals), a partner network with commissions and payouts, growth funnels,
email campaigns, vendor lead capture, and org status pages.

The methodology core was already correct and is unchanged: deterministic
detection (`backend/app/modules/checks/detection.py`), signed immutable
evidence snapshots, honest probe states, and a public observatory that
renders real observations or says it cannot.

## 2 · Two-stage removal (stage 1 executed here)

Stage 1 (this change) **hides and unmounts but does not delete**:

- Backend routers are no longer mounted in `app/main.py` (imports preserved,
  annotated with the stage-1 marker). The API surfaces return 404, not 403,
  so no client can mistake them for an available capability.
- Frontend routes, components, nav entries, sitemap entries and e2e suites
  for the removed surfaces are deleted; URLs redirect to the closest
  surviving destination (see §4).
- Module code and database tables are preserved untouched, so a stage-2
  deletion is a separate, reviewable change - and so restoring a surface is
  a one-line un-comment in `app/main.py` plus a frontend revert.

Stage 2 (later, deliberate): delete the dormant modules, tables, and their
skipped test suites once the product has settled.

## 3 · Unmounted backend surfaces

| Router | Module | Notes |
|---|---|---|
| `agencies_router` | `modules/agencies` | clients, applications, portfolio |
| `partners_router` | `modules/partners` | partner portal API |
| `admin_partners_router` | `modules/partners.admin_router` | commissions/payouts admin |
| `badges_router` | `modules/badges` | vendor trust badges |
| `submission_router` / `submission_admin_router` | `modules/vendor_submissions` | lead capture |
| `growth_router` | `modules/growth` | PLG surfaces (admin-scoped) |
| `status_router` / `status_page_router` | `modules/status_pages` | org status pages |
| `public_analytics_router` | `modules/analytics` | public marketing metrics |
| `email_admin_router` / `email_center_router` | `modules/email_events`, `modules/email_center` | campaigns |
| `outreach_admin_router` | `modules/outreach` | outreach sequences |
| referrals `/leaderboard`, `/claim-reward` | `modules/referrals` | PLG gamification; `/my-referral` stays |

**Deliberately kept:**

- `public_partners_router` (`GET /v1/public/referral/{code}`) - the single
  creator-attribution endpoint behind `/r/{code}` links.
- `referrals_router` `/my-referral` - a user's own code and stats.
- The admin control plane minus partner administration.

## 4 · Frontend route disposition

| Removed route | Destination | Status |
|---|---|---|
| `/agencies` | `/product` | 308 |
| `/partner`, `/partner/*`, `/partners` | `/creators` | 308 |
| `/agency`, `/organization`, `/clients`, `/clients/*` | `/dashboard` | temporary (console bookmarks) |
| console `/reports` page | removed (evidence records remain) | - |
| `/portal/*` client portals | removed | - |

`/r/{code}` creator links, `/reports/[token]` evidence share pages, `/track/*`
and all research routes are unchanged.

## 5 · Commercial model (single source of truth)

`backend/app/core/permissions.py`:

- `PLAN_PRICES_USD["pro"] = 9` - plan id `pro`, display name **Developer**.
- `PLAN_ANNUAL_PRICES_USD` all `None`, `PLAN_ANNUAL_AMOUNTS = {}` - annual
  billing does not exist; checkout rejects the interval.
- `PLAN_TEAM_LIMITS` - one seat on every plan.
- Limits: 25 dependencies, 30-second checks, 90-day retention on Developer;
  3 dependencies / 1 minute / 24 hours in the post-trial grace state.
- Agency feature keys (`client_groups_isolation`, `client_facing_reports`,
  `agency_branding`, `custom_branded_evidence`) are deleted; any surviving
  gate reads `plan_allows_feature()` → `False`, the safe direction.
- `PUBLIC_PLAN_CATALOG = ("pro",)` - the public pricing endpoint advertises
  exactly one plan; enterprise is never rendered anywhere.

The 14-day trial is unchanged mechanics (derived from org age, no separate
plan) with rewritten copy: full Developer capabilities during trial, reduced
limits afterwards, configuration and history preserved.

## 6 · Tests

- Pricing-contract suites updated to the $9 monthly-only reality.
- New guards: `test_agency_entitlements.py` now asserts the B2B feature keys
  are gone, the unmounted routers are absent from the OpenAPI schema, and the
  creator endpoints are the only partner-surface paths exposed.
- Dormant-surface suites (partner referral/notifications, email center,
  agency portfolio) are `pytest.mark.skip`-ed with a stage-1 reason; they
  travel with their modules to stage 2.
- Frontend: link-integrity and sitemap tests now fail on any link into a
  removed surface; landing-section test asserts the maintainer section
  closes the page.

## 7 · What stage 2 must include

1. Delete `modules/{agencies,partners,badges,vendor_submissions,growth,status_pages,analytics,email_center,email_events admin,outreach}` (minus what stage 2 review keeps), their tables via Alembic downgrade, and the skipped suites.
2. Delete `has_agency_mode`, plan `enterprise` normalization leftovers, and the un-commented import block in `app/main.py`.
3. Re-run the full suite with no skips.
