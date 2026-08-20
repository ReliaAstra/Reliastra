# RELIASTRA admin control-plane API map

This map was prepared before the Admin Dashboard frontend implementation. It follows the currently registered FastAPI routers in `backend/app/modules/admin/router.py` and `backend/app/modules/partners/admin_router.py`.

> **Contract note:** `backend/openapi.json` is currently behind the registered control-plane router: it lists the legacy growth and partner routes, while the source registers the canonical endpoints below in `app.main`. The frontend uses only the registered canonical routes and proxies them through its same-origin `/api/admin/*` route. Regenerate the backend OpenAPI artifact before treating it as the release contract.

All `/v1/admin/*` endpoints require a JWT Bearer token for a user with `is_system_admin=true` (`require_system_admin`). The backend remains the authorization authority. Errors use the normalized shape:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "System admin access required",
    "details": [],
    "request_id": "…"
  }
}
```

## Home / command center

| Capability | Method + endpoint | Payload / result used | Frontend cache / refresh | Mutation |
| --- | --- | --- | --- | --- |
| Home bootstrap | `GET /v1/admin/overview` | `AdminOverviewResponse`: business, growth, product, support, communications, system, `actions_required`, `generated_at` | 45s stale, 60s refresh | No |
| Attention watchlist | `GET /v1/admin/attention` | `AttentionResponse`: prioritized `items`, counts, timestamp | 30s stale, 45s refresh | No |
| Global search | `GET /v1/admin/search?q=&limit=` | `AdminSearchResponse`: grouped customers, organizations, tickets, partners, campaigns | only after 2 characters; short cache | No |
| Revenue graph | `GET /v1/admin/revenue/timeseries?period=7d\|30d\|90d\|365d&granularity=day\|week\|month` | `RevenueTimeseriesResponse.data_points` | 90s | No |
| Recent customers | `GET /v1/admin/customers/recent?limit=` | `CustomerListResponse`-shaped recent items | 60s | No |

The overview endpoint is the sole aggregate request used for the initial metric, support, product, and compact system sections. The home page does **not** fan out to every domain summary endpoint.

## Customers

| Capability | Method + endpoint | Parameters / contract | Cache / mutation handling |
| --- | --- | --- | --- |
| List | `GET /v1/admin/customers` | `search`, `status`, `plan`, `segment`, `health`, `created_from`, `created_to`, `page`, `page_size` (1–100), `sort`; `CustomerListResponse` | URL-backed filters, 30s stale |
| Recent | `GET /v1/admin/customers/recent?limit=` | limit 1–100 | Home-only, 60s |
| Churn risk | `GET /v1/admin/customers/churn-risk?limit=` | limit 1–100 | On demand |
| Workspace | `GET /v1/admin/customers/{customer_id}` | `CustomerDetailResponse`: profile → organizations → billing/MRR → product → support/activity | On demand, short cache |
| Activity | `GET /v1/admin/customers/{customer_id}/activity?page=&page_size=` | paginated activity | On demand |
| Safe profile update | `PATCH /v1/admin/customers/{customer_id}` | `{ full_name?, admin_note?, source? }` | Server confirmation, invalidate customer detail/list/audit |
| Plan override | `POST /v1/admin/customers/{customer_id}/plan` | `{ plan, reason?, org_id? }` | Confirmation required; server confirmation then invalidate financial/customer/audit queries |
| Send email | `POST /v1/admin/customers/{customer_id}/email` | `{ subject, body, html_body? }` | Server confirmation; audited |
| Impersonate | `POST /v1/admin/customers/{customer_id}/impersonate` | `{ reason }`; returns short-lived token | Confirmation + reason required; audited; never stored by the dashboard |
| Deactivate | `POST /v1/admin/customers/{customer_id}/deactivate` | `{ reason }` | Confirmation + reason required; server confirmation; audited |

## Revenue, growth, and product

| Capability | Method + endpoint | Data | Cache |
| --- | --- | --- | --- |
| Revenue summary | `GET /v1/admin/revenue/summary` | MRR, ARR, movements, paying customers, ARPU | 60s |
| Revenue attention | `GET /v1/admin/revenue/attention` | failed payments / churn-risk attention lists | 60s |
| Growth overview | `GET /v1/admin/growth/overview?period=` | signup, activation, conversion, engagement, retention summary | 2m |
| Growth funnel | `GET /v1/admin/growth/funnel?period=` | canonical signup → verified → org → dependency → monitoring → paid stages | 2m |
| Retention | `GET /v1/admin/growth/retention?weeks=1..52` | cohort payload | On demand |
| Product referral analytics | `GET /v1/admin/growth/referrals` | referral summary and top referrers | On demand |
| Product overview | `GET /v1/admin/product/overview` | active users/orgs/monitors, checks, incidents, coverage, adoption | 90s |
| Features | `GET /v1/admin/product/features` | feature adoption rates | 2m |
| Vendor coverage | `GET /v1/admin/product/vendors?limit=1..100` | coverage and engagement | 2m |
| Engagement | `GET /v1/admin/product/engagement` | DAU, WAU, MAU, stickiness | 90s |
| Activation | `GET /v1/admin/product/activation` | time to first check, activation rate/buckets | 2m |

The canonical growth endpoints above intentionally replace legacy `/v1/admin/analytics/*` and legacy `/v1/admin/growth/{top-vendors,referral-stats,plg-funnel}` routes.

## Support

| Capability | Method + endpoint | Parameters / payload | Cache / mutation handling |
| --- | --- | --- | --- |
| Triage overview | `GET /v1/admin/support/overview` | counts, queue, SLA / response metrics | 20s stale, 30s refresh |
| Queue | `GET /v1/admin/support/tickets` | `status`, `category`, `priority`, `assigned_to`, `search`, `page`, `page_size` | URL-backed, 20s |
| Ticket workspace | `GET /v1/admin/support/tickets/{ticket_id}` | ticket, messages, customer, organization, subscription, activity | On demand, 15s |
| Create | `POST /v1/admin/support/tickets` | email, full_name?, category, subject, body, priority, source? | Invalidate queue/overview/audit after server confirmation |
| Update | `PATCH /v1/admin/support/tickets/{ticket_id}` | status?, priority?, assigned_to?, resolution? | No blind optimistic count updates; invalidate server-authoritative queue/workspace |
| Reply / note | `POST /v1/admin/support/tickets/{ticket_id}/reply` | `{ body, is_internal_note }` | Invalidate workspace/query after confirmation |
| Bulk update | `POST /v1/admin/support/tickets/bulk-update` | ticket IDs + status?/priority?/assigned_to? | Server confirmation; invalidate queue/overview/audit |

## Communications

| Capability | Method + endpoint | Contract | Mutation handling |
| --- | --- | --- | --- |
| Overview | `GET /v1/admin/communications/overview` | campaigns, drafts, scheduled, announcements, delivery stats | On navigation |
| Campaign list/create | `GET` / `POST /v1/admin/communications/campaigns` | list filter: status/page/page_size; create: campaign name, subject, HTML/text, segment, UTM, schedule | Server confirmation, invalidate campaign list/overview |
| Campaign detail/update | `GET` / `PATCH /v1/admin/communications/campaigns/{campaign_id}` | editable draft fields | Server confirmation |
| Campaign send | `POST /v1/admin/communications/campaigns/{campaign_id}/send` | no body; returns recipient count | Explicit impact confirmation; audited; no optimistic delivery figures |
| In-app notifications | `GET` / `POST /v1/admin/communications/notifications` | paginated list / notification payload | Server confirmation |
| Announcements | `GET` / `POST /v1/admin/communications/announcements`; `GET` / `PATCH /v1/admin/communications/announcements/{announcement_id}` | lifecycle and targeting payloads | Server confirmation; audited create/update |

## Partners

| Capability | Method + endpoint | Parameters / contract | Cache / mutation handling |
| --- | --- | --- | --- |
| Program metrics | `GET /v1/admin/partners/stats` | `PartnerStatsResponse` | On navigation, 60s |
| List | `GET /v1/admin/partners?status=&search=&page=&page_size=` | `PartnerAdminListResponse` | URL-backed, 60s |
| Detail | `GET /v1/admin/partners/{partner_id}` | profile, referred customers, commission/payout history and summary | On demand |
| Commissions | `GET /v1/admin/partners/commissions?partner_id=&status=&period=&page=&page_size=` | `AdminCommissionListResponse` | On demand |
| Reverse commission | `POST /v1/admin/partners/commissions/{commission_id}/reverse` | `{ reason }` | Confirmation + reason required; audited; invalidate lists/detail/stats/audit |
| Payouts | `GET /v1/admin/partners/payouts?status=&partner_id=&period=&page=&page_size=` | `AdminPayoutListResponse` | On demand |
| Create payout | `POST /v1/admin/partners/payouts` | `{ partner_id, amount_minor? }` | Confirmation; invalidate payout/detail/stats/audit |
| Process payout | `POST /v1/admin/partners/payouts/{payout_id}/process` | `{ action: mark_paid\|mark_failed, transaction_reference? }` | Confirmation; invalidate payout/detail/stats/audit |
| Update status | `PATCH /v1/admin/partners/{partner_id}` | `{ status: active\|suspended\|banned, reason? }` | Confirmation for suspension; audited |

## Operations and audit

| Capability | Method + endpoint | Parameters / data | Cache |
| --- | --- | --- | --- |
| Operations overview | `GET /v1/admin/operations/overview` | API, DB, Redis, workers, scheduler, billing, email, storage, engines | 10s stale, 15s refresh |
| Errors | `GET /v1/admin/operations/errors?level=&is_resolved=&page=&page_size=` | paginated error log items | On demand |
| System metrics | `GET /v1/admin/operations/metrics` | aggregated platform metrics | 30s |
| Audit trail | `GET /v1/admin/audit-log?action=&entity_type=&actor=&search=&page=&page_size=` | paginated audit entries | On demand |

## Relationships represented in the UI

```text
Customer → Organization → Subscription / Plan → MRR → Product usage → Support → Activity
Partner → Referral → Customer → Subscription → Commission → Payout
Operations → API / database / Redis / workers / scheduler / billing / email / storage
```

## Frontend safety rules

- Browser calls use relative `/api/admin/*` URLs only; the Next.js route handler forwards Bearer auth to the configured `RELIASTRA_API_URL` server-side.
- A successful admin bootstrap request is the frontend route guard; `401` clears client tokens and `403` never renders sensitive content.
- Mutations wait for backend confirmation and then invalidate related React Query keys. Financial figures are never changed optimistically.
- The existing backend audit decorators/services remain authoritative for audited operations; the UI explains impact before dangerous actions.
