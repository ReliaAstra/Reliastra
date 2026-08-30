# Reliastra API changelog (frontend & SDK)

This is a **breaking** release. Update clients before deploying.

## Auth

`POST /v1/auth/register` now returns a single payload:

```json
{
  "user": { "id": "...", "email": "...", "full_name": "...", "is_active": true },
  "organization": { "id": "...", "name": "...", "slug": "...", "plan": "free" },
  "tokens": { "access_token": "...", "refresh_token": "...", "token_type": "bearer", "expires_in": 900 }
}
```

A default organization is created automatically. Do **not** call `POST /v1/orgs` as a required signup step.

Login / refresh still return the token object only.

## Tenant context

`{org_id}` is no longer a path parameter.

Send one of:

- `X-Organization-ID: <uuid>`
- `Reliastra-Organization: <uuid>`

Examples:

| Old | New |
| --- | --- |
| `GET /v1/orgs/{org_id}/dependencies` | `GET /v1/dependencies` |
| `POST /v1/orgs/{org_id}/incidents` | `POST /v1/incidents` |
| `GET /v1/orgs/{org_id}` | `GET /v1/orgs/current` |
| `GET /v1/orgs/{org_id}/members` | `GET /v1/orgs/members` |

`GET /v1/orgs` still lists the caller's organizations (no header required).

## Pagination

All list endpoints use cursor pagination:

```
GET /v1/dependencies?limit=50&cursor=<next_cursor>
```

```json
{
  "data": [ ... ],
  "pagination": { "next_cursor": "abc", "has_more": true, "limit": 50 }
}
```

Legacy `items` / `next_cursor` / `has_more` / `total` fields are still present for one release.

## Public API

The `/v1/public/` prefix is gone. Same resources live at the canonical path.

| Old | New |
| --- | --- |
| `/v1/public/vendors` | `/v1/vendors` |
| `/v1/public/vendors/{name}/incidents` | `/v1/vendors/{name}/incidents?public=true` |
| `/v1/public/referral/{code}` | `/v1/referral/{code}` |
| `/v1/public/partners` | `/v1/partners` (directory) |
| `/v1/public/evidence/{token}/download` | `/v1/evidence/{token}/download` |
| `/v1/public/pricing` | `/v1/pricing` |
| `/v1/public/feed` | `/v1/feed` |
| `/v1/public/status` | `/v1/status` |

Optional `?public=true` documents unauthenticated access; public routes do not require auth.

## Errors

Every 4xx/5xx body is:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid field: email",
    "details": [{ "field": "email", "issue": "must be a valid email address" }],
    "request_id": "req_abc123"
  }
}
```

`X-Request-ID` is echoed on every response.

Checkout rejections use the same envelope with `code: "CHECKOUT_FAILED"` and the reason
in `details[0]`: `{ "field": "reason", "issue": "quote_stale" }`. The status is
meaningful — `409` rejected on policy or state (retrying as sent cannot succeed), `403`
the reference belongs to another organization, `503` the provider could not be reached,
which is the only case worth retrying. `422` is never used for a checkout rejection.

## Evidence report tokens

`report_token` TTL is **7 days**. Gate responses include `report_token` and `expires_at`.

## Founding customer program removed

The private founding customer program is retired. The following endpoints are
**gone** (404):

| Removed |
| --- |
| `GET /v1/billing/founding-spots` |
| `POST /v1/billing/founding-spot/claim` |
| `GET /v1/admin/business/founding-customers` |

`GET /v1/billing/plan` no longer returns `is_founding_customer`,
`founding_discount_pct` or `discounted_price_usd` — every organization is
charged the published plan price (`price_usd`).

## Admin control plane (2026-08)

The platform admin API is reorganized into an operational control plane.
Legacy module-oriented routes remain available and are marked **deprecated**
in OpenAPI. Prefer the canonical surface below.

Full mapping: [`docs/ADMIN_CONTROL_PLANE.md`](./ADMIN_CONTROL_PLANE.md).

### Bootstrap

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/v1/admin/overview` | Primary admin home payload |
| `GET` | `/v1/admin/attention` | Prioritized action-required alerts |
| `GET` | `/v1/admin/search?q=` | Global admin search |

### Customers (replaces `/v1/admin/users`)

| Method | Path |
| --- | --- |
| `GET` | `/v1/admin/customers` |
| `GET` | `/v1/admin/customers/recent` |
| `GET` | `/v1/admin/customers/churn-risk` |
| `GET` | `/v1/admin/customers/{customer_id}` |
| `PATCH` | `/v1/admin/customers/{customer_id}` |
| `POST` | `/v1/admin/customers/{customer_id}/impersonate` |
| `POST` | `/v1/admin/customers/{customer_id}/plan` |
| `POST` | `/v1/admin/customers/{customer_id}/email` |
| `POST` | `/v1/admin/customers/{customer_id}/deactivate` |
| `GET` | `/v1/admin/customers/{customer_id}/activity` |

Impersonation now requires `{ "reason": "..." }` and returns a short-lived
access token only (no refresh).

### Revenue / Growth / Product

```
GET /v1/admin/revenue/summary|timeseries|attention
GET /v1/admin/growth/overview|funnel|retention|referrals
GET /v1/admin/product/overview|features|vendors|engagement|activation
```

### Support / Communications / Operations

```
GET  /v1/admin/support/overview
GET  /v1/admin/support/tickets/{id}   # full workspace (customer + billing context)
GET  /v1/admin/communications/overview
GET  /v1/admin/operations/overview
GET  /v1/admin/operations/errors      # was /error-logs
```

Partners (`/v1/admin/partners/*`) and vendor-submission tenant-admin routes
are unchanged.

## Billing currency (added)

`GET /v1/billing/currency` — public, no auth — is the single source every payment
surface reads:

```json
{
  "product_currency": "USD",
  "payment_currency": "NGN",
  "payment_currency_name": "Nigerian Naira (NGN)",
  "payment_symbol": "\u20a6",
  "differs_from_product_currency": true,
  "notice": "RELIASTRA's plans are priced in USD. Our current Paystack payment flow processes payments in NGN. We are working toward enabling USD payment options for our global customers.",
  "checkout_ready": true,
  "plan_payment_amounts": { "pro": { "monthly": "\u20a660,000.00 (NGN)", "annual": "\u20a6600,000.00 (NGN)" } },
  "payment_provider": "Paystack",
  "payment_provider_display": "Paystack \u2014 secure hosted checkout",
  "fx_reference": {
    "available": true,
    "source_currency": "USD",
    "payment_currency": "NGN",
    "rate": 1650.12,
    "source_timestamp": "Wed, 13 Aug 2025 00:40:32 +0000",
    "retrieved_at": "2025-08-13T09:12:00Z",
    "provider": "ExchangeRate-API",
    "provider_url": "https://www.exchangerate-api.com",
    "source_url": "https://open.er-api.com/v6/latest/USD",
    "label": "Exchange rate reference (estimate \u2014 not the price you pay)",
    "disclaimer": "Exchange rate shown is a market reference estimate only. \u2026"
  }
}
```

`checkout_ready: false` means no payment price is published for a self-serve plan:
clients must not offer a live "continue to payment" action, and must show
`notice` regardless. `plan_payment_amounts` carries **pre-formatted, ready-made
strings** — clients render them verbatim and never compute a currency figure
locally. Do not fall back to a hardcoded amount when this request fails: show the
disclosure without a number.

`fx_reference` is **display-only context**: a market estimate, labelled as an
estimate, attributed to a verifiable source and timestamped. It is *never* used
to determine what is charged (the charge is the published payment price), and it
is `null` when disabled or unavailable — clients hide the reference rather than
inventing one. `GET /v1/pricing/fx-reference` returns the same object.

## Pricing

`GET /v1/pricing` plans now carry the payment price alongside the USD list price:
`payment_amount_display`, `payment_annual_amount_display` (both `null` when that
price is unpublished), `product_price_display`,
`product_annual_price_display`, a `transparency` triple per interval
(`{monthly, annual}` each with `product_price`, `actual_charge`,
`payment_provider`, `payment_provider_display`, `currency_label`) and
`checkout_ready`. `price_usd` / `price_annual_usd` are
unchanged: they remain RELIASTRA's canonical **product** list prices in USD.
Every RELIASTRA-owned payment screen must render the transparency triple —
Product price / Actual charge / Payment provider — verbatim from these fields.

`/v1/pricing` is the marketing view. For a payment, read
`GET /v1/billing/checkout/quote` instead: it is the only response that also carries the
provider channels offered, the receipt identity and the `price_token` that
`/v1/billing/initialize` expects back.

## Checkout (2026-08)

Checkout is **RELIASTRA-owned**: the plan summary, both currency figures, the payment
method list and the billing state are ours, and Paystack only processes the card. A client
reads one endpoint and sends what it read back, unchanged.

`GET /v1/billing/checkout/quote?plan=<plan>&interval=<monthly|annual>` — authenticated —
is the only authoritative source for what a payment will cost:

```json
{ "plan": "pro", "display_plan": "Pro", "billing_interval": "monthly",
  "product_currency": "USD", "product_amount_minor": 3900,
  "product_price_display": "$39.00 (USD)",
  "payment_currency": "NGN", "payment_amount_minor": 6000000,
  "payment_amount_display": "\u20a660,000.00 (NGN)",
  "payment_currency_name": "Nigerian Naira (NGN)",
  "payment_provider": "Paystack",
  "payment_provider_display": "Paystack \u2014 secure hosted checkout",
  "period_word": "month",
  "currency_notice": "RELIASTRA's plans are priced in USD. Our current Paystack payment flow processes payments in NGN. We are working toward enabling USD payment options for our global customers.",
  "fx_reference": { "available": true, "rate": 1650.0, "\u2026": "\u2026" },
  "channels": ["card"],
  "payment_methods": [{ "id": "international_card", "channel": "card",
    "label": "International card", "networks": ["Visa", "Mastercard"],
    "supports_international": true, "handles_card_data": "provider" }],
  "price_token": "117944b151bc77c1",
  "billing_email": "owner@example.com", "organization_name": "Acme Ltd",
  "current_plan": "free", "current_interval": null, "already_subscribed": false,
  "available": true, "unavailable_reason": null, "unavailable_message": null,
  "checkout_enabled": true, "trial_note": null }
```

- Always `200` when the plan exists. A plan that cannot be bought self-serve answers
  `available: false` with `unavailable_reason` (a reason slug) and
  `unavailable_message`, so a client renders a considered state instead of an error page.
  Enterprise is arranged with Sales and is never priced through self-serve checkout.
- `payment_amount_minor` / `payment_amount_display` are the **exact** figures handed to the
  provider — render them verbatim, never compute them. `price_token` fingerprints
  (plan, interval, amount, currency).
- `currency_notice` is canonical disclosure copy; treat it as server-supplied text.
- `fx_reference` is display-only context: a labelled, attributed, timestamped estimate, or
  `{ "available": false }`. It is structurally incapable of touching the charge.
- `payment_methods` is what a client renders; `channels` is the provider array that will be
  sent and is informational.

`POST /v1/billing/initialize` takes `{plan, billing_interval, payment_method?,
expected_price_token?}` and still echoes what it will charge, so the confirmation screen
and the stored transaction cannot disagree:

```json
{ "authorization_url": "https://checkout.paystack.com/…", "reference": "…",
  "access_code": "…", "public_key": "pk_test_…", "inline_js_enabled": true,
  "inline_js_url": "https://js.paystack.co/v1/inline.js",
  "channels": ["card"], "payment_methods": [ … ],
  "amount_minor": 6000000, "currency": "NGN", "amount_display": "\u20a660,000.00 (NGN)",
  "product_currency": "USD", "product_amount_minor": 3900,
  "product_price_display": "$39.00 (USD)", "payment_provider": "Paystack" }
```

- Clients never send an amount, a currency, a channel list or an email; such fields are
  ignored, and the email billed is always the organization owner's.
- `payment_method` must be an id offered by the quote. Anything this deployment does not
  offer is refused with `409` **before** a provider call is made.
- `expected_price_token` is the quote's `price_token`. If pricing moved in between, the
  call fails `409` / `quote_stale` rather than charging an amount the customer never saw.
- A plan with no published payment price returns `409` with reason
  `price_not_configured` (previously `422`) instead of starting a checkout.
- The provider transaction is created from server-side pricing and does **not** pass a
  Paystack `plan` code: supplying one invalidates `amount`, so the customer would be
  charged whatever the provider has stored rather than what RELIASTRA displayed.

`POST /v1/billing/verify?reference=<ref>` is the only call that can activate a plan — a
browser callback is never sufficient:

```json
{ "verified": true, "activated": true, "duplicate_payment": false,
  "plan": "pro", "display_plan": "Pro", "billing_interval": "monthly",
  "period_word": "month", "reference": "…",
  "currency": "NGN", "amount_minor": 6000000, "amount_display": "\u20a660,000.00 (NGN)",
  "product_currency": "USD", "product_amount_minor": 3900,
  "product_price_display": "$39.00 (USD)", "payment_provider": "Paystack",
  "reason": null, "reason_message": null }
```

`verified: true` means verified **and applied**: status, amount, currency and organization
association all matched and the payment was recorded as it actually happened.
Re-verifying the same reference is idempotent — `verified: true, activated: false`, no
double entitlement and no error. A second payment for a period already covered is kept,
not discarded, and reported as `duplicate_payment: true`. Anything else comes back as
`verified: false` with a `reason` slug and `reason_message`
(`card_declined`, `payment_pending`, `authentication_required`, …) so the client shows its
own copy instead of relaying a provider error.

### Reason slugs

Stable, machine-readable and safe to branch on; the customer-facing wording lives in
`frontend/src/lib/billing/checkout-errors.ts`. Slugs that surface as HTTP errors:

| Slug | Status |
| --- | --- |
| `price_not_configured`, `payment_method_unavailable`, `plan_not_self_serve`, `quote_stale`, `transaction_not_found`, `transaction_not_paid`, `amount_below_plan_price`, `currency_mismatch`, `payment_channel_not_supported`, `organization_mismatch` | `409` |
| `organization_mismatch` — verifying another organization's reference | `403` |
| `paystack_unavailable`, `verification_unavailable` | `503` |

A reference the provider does not know is `409 transaction_not_found`, **not** `503`: the
provider answered, it just had nothing to say, so retrying indefinitely is wrong. The
remaining slugs arrive inside `200` verify responses or are derived client-side —
`payment_cancelled`, `card_declined`, `authentication_required`, `payment_pending`,
`payment_replayed`, `duplicate_payment`, `session_expired`, `network_interrupted`.

### Payment channels

`channels` on both the quote and the initialize response is the array handed to the
provider — `["card"]` for global checkout — and the same array is re-applied to the
InlineJS call, because the SDK otherwise defaults to every channel enabled on the account.
Resolution is fail-closed: unset means **card only**, not "everything"; unknown channel
names are dropped; country-restricted rails are excluded unless explicitly enabled *and*
supported for the transaction currency; the result is never empty and card is always first.

| Setting | Default | Effect |
| --- | --- | --- |
| `PAYSTACK_DEFAULT_CHANNEL` | `card` | Channel used when nothing is configured. |
| `PAYSTACK_CHECKOUT_CHANNELS` | unset | Explicit channel list. Blank/absent ≠ unrestricted. |
| `PAYSTACK_ENABLE_LOCAL_CHANNELS` | `false` | Opt-in for country-restricted rails, still subject to the currency table. |
| `PAYSTACK_INLINE_JS_ENABLED` | `true` | Embedded popup; takes effect only with `PAYSTACK_PUBLIC_KEY`, else the checkout uses the hosted URL. |

No endpoint accepts a card number, expiry, CVC or PIN, and none will be added: raw-card
handling requires PCI-DSS attestation, and hosted/InlineJS checkout keeps that scope with
Paystack.

### Legacy return path

`GET /settings/billing?pay_ref=<reference>` still resolves: a session that reaches the
product with nothing but a reference finds its payment, verifies it server-side and tidies
the URL. A customer returning mid-confirmation is never asked to pay again.

## Payment history (added)

`GET /v1/billing/transactions` — authenticated, organization-scoped — returns
one row per collected payment, persisted verbatim from the provider's
verification report when the money moved:

```json
{
  "items": [{
    "reference": "6K…", "provider": "Paystack", "plan": "pro",
    "billing_interval": "monthly", "status": "success",
    "product_currency": "USD", "product_amount_minor": 3900,
    "product_price_display": "$39.00 (USD)",
    "charged_currency": "NGN", "charged_amount_minor": 6000000,
    "charged_amount_display": "\u20a660,000.00 (NGN)",
    "display_plan": "Pro",
    "paid_at": "…", "verified_at": "…", "created_at": "…",
    "period_start": "…", "period_end": null, "duplicate": false
  }],
  "payment": { …same currency object as /v1/billing/currency… }
}
```

History rows record what was **actually charged** (currency + minor units) and
the USD product price quoted at the time; they never re-derive amounts from
today's catalog. Refunds and disputes update `status` via the webhook.

Migration `0029_billing_tx_attribution` adds `user_id` (who paid on behalf of the
organization; `SET NULL` if that user goes), `verified_at` (when our server-side
verification succeeded) and `duplicate` (a later payment for a period already covered).
`period_end` is the provider's own next-payment date when it supplies one and `null`
otherwise — it is never inferred; the covered period shown to customers comes from the
subscription record.

## Transactional email

Every automated email now ends in one canonical support footer rendered by
`app/infrastructure/email_layout.py` (see `docs/TRANSACTIONAL_EMAIL.md`). Clients
and templates must not add their own footer, support address or unsubscribe line.
