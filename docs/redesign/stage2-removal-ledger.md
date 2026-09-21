# Stage 2 removal ledger — dormant B2B modules/tables/routes awaiting deletion

Source: `backend/app/bootstrap/routers.py` `ROUTER_REGISTRY` unmounted entries (stage 1), plus `docs/redesign/developer-first-refurbishment.md` §3/§7.

Stage 1 hid and unmounted but did not delete. Stage 2 deletes code, tables (Alembic downgrade), and skipped suites once product settled.

## Backend — unmounted routers (mounted=False)

| Registry name | Router import | Module path | Notes |
|---|---|---|---|
| `agencies` | `agencies_router` | `backend/app/modules/agencies` | clients, applications, portfolio, client portals `/portal/*` |
| `partners` | `partners_router` | `backend/app/modules/partners` | partner portal API (commissions, payouts, referrals dashboard) |
| `admin_partners` | `admin_partners_router` | `backend/app/modules/partners.admin_router` | commissions/payouts admin |
| `badges` | `badges_router` | `backend/app/modules/badges` | vendor trust badges |
| `vendor_submissions` | `submission_router` | `backend/app/modules/vendor_submissions` | lead capture |
| `vendor_submission_admin` | `submission_admin_router` | `backend/app/modules/vendor_submissions` | submission review admin |
| `growth` | `growth_router` | `backend/app/modules/growth` | PLG surfaces (admin-scoped) |
| `status` / `status_page` | `status_router`, `status_page_router` | `backend/app/modules/status_pages` | org status pages |
| `public_analytics` | `public_analytics_router` | `backend/app/modules/analytics` | public marketing metrics |
| `email_admin` | `email_admin_router` | `backend/app/modules/email_events.admin_router` | email campaign admin |
| `email_center` | `email_center_router` | `backend/app/modules/email_center` | campaigns |
| `outreach_admin` | `outreach_admin_router` | `backend/app/modules/outreach` | outreach sequences |
| referrals `/leaderboard`, `/claim-reward` | part of `referrals_router` but disabled | `backend/app/modules/referrals` | PLG gamification; `/my-referral` and public `/r/{code}` stay |

**Kept:**

- `public_partners_router` (`GET /v1/public/referral/{code}`) — single creator-attribution endpoint behind `/r/{code}`.
- `referrals_router` `/my-referral` — user's own code and stats.
- Admin control plane minus partner administration.

## Backend — modules to delete in stage 2

```
backend/app/modules/agencies
backend/app/modules/partners          (keep public_router only, or extract to creators)
backend/app/modules/badges
backend/app/modules/vendor_submissions
backend/app/modules/growth
backend/app/modules/status_pages
backend/app/modules/analytics         (public_analytics_router only; check if other analytics used)
backend/app/modules/email_center
backend/app/modules/email_events      (admin_router only; webhook router stays for Resend/SMTP inbound)
backend/app/modules/outreach
```

## Backend — tables (models.py)

| Module | Model file | Tables |
|---|---|---|
| agencies | `modules/agencies/models.py` | `agencies`, `clients`, `applications`, `portfolios` (verify) |
| partners | `modules/partners/models.py` | `partners`, `commissions`, `payouts`, `partner_referrals` |
| badges | `modules/badges/models.py` | `badges`, `badge_issuances` |
| vendor_submissions | `modules/vendor_submissions/models.py` | `vendor_submissions` |
| growth | `modules/growth/models.py` | `growth_events`, `funnels` (verify) |
| status_pages | `modules/status_pages/models.py` | `status_pages`, `status_page_incidents` |
| analytics | `modules/analytics/models.py` | `public_analytics`, `marketing_metrics` |
| email_center | `modules/email_center/models.py` | `email_campaigns`, `email_templates` |
| email_events | `modules/email_events/models.py` | `email_events` (admin view; webhook events table may stay) |
| outreach | `modules/outreach/models.py` | `outreach_sequences`, `outreach_steps` |

Run `alembic downgrade` removing these tables; generate new revision after deletion.

## Backend — skipped test suites (pytest.mark.skip stage-1)

- `tests/.../test_agency_*.py` — agency portfolio, entitlements now assert gone
- `tests/.../test_partner_*.py` — referral/notifications, commissions, payouts
- `tests/.../test_email_center*.py`
- `tests/.../test_outreach*.py`
- `tests/.../test_badges*.py`
- `tests/.../test_vendor_submission*.py`
- `tests/.../test_growth*.py`
- `tests/.../test_status_page*.py`

These travel with modules to stage 2. Stage 2 re-runs full suite with no skips.

## Frontend — routes already removed / redirected

| Removed route | Destination | Status | File still present? |
|---|---|---|---|
| `/agencies` | `/product` per refurbishment §4, but currently restored as first-class page — should 308 to `/product` in stage 2 | 308 | `frontend/src/app/agencies/page.tsx` exists — currently honest but still agency wedge; stage 2 deletes |
| `/partner`, `/partner/*`, `/partners` | `/creators` | 308 | `next.config.ts` redirect |
| `/agency`, `/organization`, `/clients`, `/clients/*` | `/dashboard` | 302 temporary | `next.config.ts` redirect |
| console `/reports` page | removed (evidence records remain) | — | check `frontend/src/app/(console)/` — evidence remains |
| `/portal/*` client portals | removed | — | no dir |
| `/referral-unavailable` | PLG gamification removed | — | `frontend/src/app/referral-unavailable/` exists — stage 2 deletes |
| `/external-dependency-intelligence`, `/dependency-monitoring`, `/incident-evidence`, `/sla-evidence` | `/product` / `/product/evidence` | 308 | `next.config.ts` |
| `/track`, `/track/*`, `/vendor-tracking` | `/observatory` | 308 | `next.config.ts` |

## Frontend — code remnants

- `frontend/src/lib/agency/navigation.ts` — still exists, should be deleted stage 2
- `frontend/src/components/site/home/agencies-scene.tsx` — honest version (one plan, up to 25 endpoints) but still agency narrative; stage 2 replaces with developer-focused topology or removes
- `frontend/src/lib/dashboard/plans.ts` — still contains `free` and `enterprise` internal values (enterprise marked legacy, ALL_PLANS=['pro']); stage 2 deletes `enterprise` normalization, `has_agency_mode`, etc.
- `frontend/src/components/partner/*`, `src/components/agency/*` — if any remain, delete
- `frontend/bun.lock` — deleted (C2), npm only — noted in docs/README.md
- `sharp` `0.35.4` — upgraded (C1), build verified

## Commercial model (single source of truth)

`backend/app/platform/commercial/entitlements.py` (or `app/core/permissions.py` per older docs):

- `PLAN_PRICES_USD["pro"] = 9`, display name Developer
- `PLAN_ANNUAL_PRICES_USD` all None, `PLAN_ANNUAL_AMOUNTS = {}` — annual does not exist
- `PLAN_TEAM_LIMITS` — one seat
- Limits: 25 dependencies, 30s checks, 90d retention on Developer; 3 deps / 60s / 24h post-trial grace
- `PUBLIC_PLAN_CATALOG = ("pro",)` — public pricing advertises exactly one plan

Frontend mirrors in `frontend/src/lib/dashboard/plans.ts` and `frontend/src/lib/billing/commercial-terms.ts` (PRO_PRICE_USD 9, PRO_ANNUAL 0, monthly only).

## Stage 2 checklist

1. Delete modules listed above (minus what review keeps — e.g., `public_partners_router` extracted to `creators` module).
2. Delete tables via Alembic downgrade, create new revision.
3. Delete `has_agency_mode`, plan `enterprise` normalization leftovers, un-commented import block in `app/bootstrap/routers.py`.
4. Frontend: delete `app/agencies`, `app/referral-unavailable`, `lib/agency/*`, `agencies-scene.tsx` or rewrite to developer topology, remove `free`/`enterprise` from `plans.ts` except grace state.
5. Re-run full suite with no skips: `pytest`, `npm run lint`, `npm run typecheck`, `npm test`, `next build` (sharp 0.35.4).
6. Update `docs/README.md`, `docs/redesign/developer-first-refurbishment.md` §7, and this ledger to mark completed.

## Verification

- `grep -R "agencies_router\|partners_router\|badges_router" backend/app/bootstrap/routers.py` should show only mounted=False entries before stage 2, and none after.
- `grep -R "enterprise\|annual\|seat" frontend/src/app/pricing frontend/src/components/site --include="*.tsx"` should show no B2B ladder after stage 2.
- `ls docs/archive` should contain all point-in-time reports; `ls docs/*.md` should contain only living docs + README.
