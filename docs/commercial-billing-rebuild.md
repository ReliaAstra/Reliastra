# Commercial billing rebuild

Rebuild of ReliaAstra’s billing, checkout, invoices, cancellation and refund
surfaces as a B2B SaaS control path. Canonical list price is **$19 USD / month**
(annual **$190**). Paystack collects the USD price converted to NGN at the live
exchange rate (e.g. $19.00 at ₦1,322/USD → ₦25,118.00 / month). The 14-day
trial is unchanged.

> **Update:** the NGN payment amount is no longer an operator-published catalog
> (₦60,000 / ₦600,000). It is the USD list price converted at the live rate
> from `app/core/fx_reference.py`; a plan is chargeable only while a rate is
> available. See `app/core/payment_pricing.py` for the resolution.

## Root causes

1. **No refund policy surface.** Terms defined cancellation (end of paid period)
   but did not define a money-back window. The product advertised neither a
   policy page nor a summary at checkout/billing.
2. **Upgrade was a popup.** Settings → Billing and `openUpgrade()` opened a
   plan chooser dialog instead of a dedicated checkout URL.
3. **Billing was not a control center.** History existed as Paystack-backed
   rows, but there were no working invoices/receipts, no cancel/resume, and no
   masked payment method.
4. **List price drift.** Product pricing had been $39 / $390 in catalog tests,
   partner examples and e2e contracts while the intended commercial price is
   $19 / $190. NGN charges were already a separate published catalog and must
   not be derived from USD cents.
5. **No terms gate.** Initialize accepted a plan/interval with no
   acknowledgement of terms, cancellation or refunds.

**Business policy (not invented):** there is **no advertised refund period**.
Cancellation ≠ refund. Refunds of collected payments are case-by-case via
`billing@reliastra.com`, processed through Paystack when issued.

## Architecture

- **SSOT copy:** `backend/app/core/commercial_terms.py` (`public_policy()`).
  Frontend fallback: `frontend/src/lib/billing/commercial-terms.ts`.
- **SSOT price:** `PLAN_PRICES_USD["pro"] = 19`, `PLAN_ANNUAL_PRICES_USD = 190`,
  `PLAN_AMOUNTS = 1900`, `PLAN_ANNUAL_AMOUNTS = 19000`.
- **Payment:** Paystack initialize/verify/webhooks unchanged. Amounts come from
  `payment_pricing` (NGN catalog). USD cents are never sent as Naira.
- **Documents:** HTML invoice/receipt from `billing_transactions` at payment
  time. Routes: `GET /v1/billing/transactions/{id}/invoice|receipt`.
- **Cancellation:** local `cancel_at_period_end`. Access until
  `current_period_end`. Lazy expire **only when** `cancel_at_period_end is True`
  (MagicMock truthiness is why the gate is `is True`, not truthy).
- **Payment method:** Paystack `authorization.brand/last4/exp_*` persisted
  masked. Never a PAN.

## Files

| Area | Path |
| --- | --- |
| Terms SSOT | `backend/app/core/commercial_terms.py` |
| Price SSOT | `backend/app/core/permissions.py` |
| Billing service | `backend/app/modules/billing/service.py` |
| Routes | `backend/app/modules/billing/router.py` |
| Documents | `backend/app/modules/billing/documents.py` |
| Models | `backend/app/modules/billing/models.py` |
| Migration | `backend/app/db/migrations/versions/0034_billing_control_center.py` |
| Checkout | `frontend/src/components/checkout/*` |
| Billing page | `frontend/src/components/console/pages/billing.tsx` |
| Upgrade redirect | `frontend/src/components/dashboard/shell/upgrade-modal.tsx` |
| Refund page | `frontend/src/app/refund-policy/page.tsx` |
| Playwright | `frontend/e2e/billing-commercial.spec.ts`, checkout specs |

## Database

Migration **0034** on `subscriptions`:

- `cancel_at_period_end` (bool, default false)
- `canceled_at`
- `payment_method_brand`, `payment_method_last4`, `payment_method_exp_month`,
  `payment_method_exp_year`, `payment_method_channel`

`billing_transactions` is unchanged: invoices/receipts are generated from
existing provider-backed rows.

## Payment provider

Paystack remains the collector. Initialize metadata now includes
`product_amount_minor=1900` for monthly Pro. Verify persists masked
authorization. Refund/dispute webhooks still mark history and reverse partner
commissions.

## Routes

| Method | Path | Role |
| --- | --- | --- |
| GET | `/v1/billing/terms` | public |
| GET | `/v1/pricing` | public (now includes trial/cancel/refund summaries) |
| GET | `/v1/billing/plan` | org |
| GET | `/v1/billing/transactions` | org (document URLs on each row) |
| GET | `/v1/billing/transactions/{id}/invoice` | org (`?download=1`) |
| GET | `/v1/billing/transactions/{id}/receipt` | org (`?download=1`) |
| POST | `/v1/billing/initialize` | member; requires `terms_accepted: true` |
| POST | `/v1/billing/cancel` | admin; cancel at period end |
| POST | `/v1/billing/resume` | admin |
| GET | `/refund-policy` | public marketing page |
| GET | `/checkout?plan=pro\|standard&interval=monthly\|annual` | authenticated checkout |

`standard` / `starter` / `professional` query aliases map to Pro.

## Invoice / receipt

- Numbers: `INV-YYYYMM-XXXXXXXX`, `RCT-YYYYMM-XXXXXXXX`.
- Built from persisted `charged_*` and `product_*`, not today’s catalog.
- Frontend `api.openBillingDocument` fetches with session headers, opens a blob
  for view, or triggers download.

## Refund

- **Period:** none advertised (`refund_period_days: null`).
- **How:** email billing@reliastra.com with the payment reference.
- **Destination:** original Paystack method if a refund is issued.
- **Versus cancel:** cancel stops renewal; it does not refund the current period.

## Playwright

Coverage added/updated:

- Pricing $19 / $190, no leftover $39.
- No upgrade modal; billing CTA navigates to `/checkout`.
- Checkout terms checkbox; Continue disabled until checked.
- Commercial summaries on checkout; public `/refund-policy`.
- Subscribe, history, invoice/receipt HTTP documents, cancel, resume.
- Failed payment stays Free.
- Existing checkout-page flow (success, decline, cancel, pending, mobile 320px)
  now accepts terms before Continue.

## Remaining issues

- Playwright/pytest were not executed in this sandbox (no pytest module, no
  Paystack mock / Mailhog stack). Run `frontend/e2e` against the local stack.
- Historical `backend/docs/API_CHANGELOG.md` examples still show
  `product_amount_minor: 3900` as past payload illustrations.
- Analytics unit fixtures still use `amount_minor=3900` as a sample integer,
  not a list price.
- Observatory `duration(3900)` is unrelated and was left alone.
- NGN charge was previously a separate published catalog (₦60,000 / ₦600,000);
  it is now the $19/$190 list price converted at the live FX rate
  (see the update note above and `app/core/payment_pricing.py`).
- Evidence reports still use a small feature-gate dialog; Subscribe then
  redirects to checkout (not a pricing popup).
- “Update payment method” reuses checkout rather than a card-update-only
  Paystack flow.
- Documents are HTML, not PDF.
- Partner projections assume 0% churn and 30% of $19.

## Trial (unchanged)

14 days of Pro limits from `organizations.created_at`. No card required.
Subscribing starts billing immediately and marks evaluation converted.
After trial without a paid plan, the org continues on Free.
