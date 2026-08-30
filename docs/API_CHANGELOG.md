# API changelog

Notable changes to RELIASTRA's public HTTP API. Newest first. Entries describe
the contract a client codes against — request and response fields, status-code
semantics, and anything that changes how a caller must behave — not internal
refactors.

---

## Unreleased — 2026-08-30 — RELIASTRA-owned checkout (`/v1/billing`)

Paying for RELIASTRA is now a RELIASTRA-owned flow. The customer sees RELIASTRA's
plan summary, the commercial price in USD, the exact amount that will be charged
in the payment currency, and a method list we control; Paystack only ever handles
the card. The server — never the browser — decides plan, price, amount, currency
and interval, and entitlement changes only on server-side verification.

Three consequences for API clients:

1. A new **quote** endpoint is the only authoritative source of what a payment
   will cost. Clients must read the amount from it rather than from a price table.
2. Checkout rejections now use **409 / 403 / 503** with a machine-readable
   `reason` slug, instead of the previous 422/500 mixture.
3. `POST /v1/billing/verify` is **idempotent and replay-safe**, and is the only
   call that can activate a plan. A browser callback is never sufficient.

### Added

#### `GET /v1/billing/checkout/quote?plan=<plan>&interval=<monthly|annual>`

Returns the full checkout surface for a plan, in the state the checkout page
renders it. Requires an authenticated session (`401` otherwise). **Always
`200`** when the plan exists, including for plans that cannot be bought
self-serve — those come back as `available: false` with a reason, so the client
shows a considered state instead of an error page.

| Field | Notes |
| --- | --- |
| `plan`, `display_plan`, `description`, `features` | Plan identity as RELIASTRA states it. |
| `billing_interval` | Echoes the requested interval (`monthly` \| `annual`). |
| `product_currency`, `product_amount_minor`, `product_price_display` | The commercial price (`USD`, `3900`, `"$39.00 (USD)"`). Never charged directly under the current payment config. |
| `payment_currency`, `payment_amount_minor`, `payment_amount_display` | The **exact** charge handed to the provider (`NGN`, `6000000`, `"₦60,000.00 (NGN)"`). `null`/`null` when no canonical price is configured. |
| `payment_currency_name` | Expanded name for display: `"Nigerian Naira (NGN)"`. |
| `payment_provider`, `payment_provider_display` | `"Paystack"` / `"Paystack — secure hosted checkout"`. |
| `period_word` | `"month"` or `"year"` — lets copy read "billed once per year" without hard-coding. |
| `currency_notice` | Canonical transparency copy. Treat it as provider-supplied text, not a client-side constant. |
| `fx_reference` | A *labelled estimate* (`rate`, `source_timestamp`, `retrieved_at`, `provider`, `provider_url`) or `{ "available": false }`. Display-only: it never determines the charge, and clients must not use it to compute amounts. |
| `payment_methods[]`, `channels` | Offered methods and the provider channel array that will be sent (`["card"]` for global checkout). Clients render `payment_methods`; `channels` is informational. |
| `price_token` | Opaque fingerprint of (plan, interval, amount, currency). Send it back on initialize. |
| `organization_name`, `billing_email` | Who is being billed and where the receipt goes. `billing_email` is resolved from the organization owner, not from the request. |
| `current_plan`, `current_interval`, `already_subscribed` | Lets the checkout refuse to sell a period that is already paid for. |
| `checkout_enabled`, `available`, `unavailable_reason`, `unavailable_message` | Availability. `unavailable_reason` carries a reason slug (see below). |
| `trial_note` | Copy about the active evaluation period, when one applies. |

#### Migration `0029_billing_tx_attribution`

Adds three columns to `billing_transactions`, all populated for new payments:
`user_id` (FK → `users`, `ON DELETE SET NULL`, indexed — who actually paid on
behalf of the organization), `verified_at` (when our server-side verification
succeeded), and `duplicate` (a later payment for an already-covered period,
recorded rather than silently dropped). Existing rows are backfilled where the
provider had already recorded a paid timestamp.

### Changed

#### `POST /v1/billing/initialize`

- Request accepts two optional fields:
  - `payment_method` — the id from the quote's `payment_methods`. A method the
    deployment does not offer is rejected with `409` **before** any provider call.
  - `expected_price_token` — the quote's `price_token`. If pricing moved in the
    meantime the call fails with `409` / `quote_stale` instead of charging a
    different amount than the customer reviewed.
- Client-supplied `amount`, `currency`, `channels` and `email` are **ignored**
  (they were already ignored; now explicitly so, with tests). Email is always the
  organization owner's.
- Response adds `public_key`, `inline_js_enabled`, `inline_js_url`, `channels`,
  `payment_methods[]`, and the price echo (`plan`, `billing_interval`,
  `amount_minor`, `currency`, `amount_display`, `product_*`, `payment_provider`)
  so a client can launch the provider without a second round trip.
- Behavior: the provider transaction is created from server-side pricing and no
  longer passes a `plan` code. Paystack invalidates `amount` when a `plan` is
  supplied, which would silently charge whatever the provider's stored plan says
  instead of the amount RELIASTRA displayed.

#### `POST /v1/billing/verify?reference=<reference>`

- Response adds `display_plan`, `billing_interval`, `period_word`, `reason`,
  `reason_message`, `activated`, `duplicate_payment`.
- `verified: true` now means *verified and applied*. Re-verifying the same
  reference returns `verified: true, activated: false` (no double entitlement,
  no error).
- A reference we cannot find at the provider is `409` / `transaction_not_found`,
  not `503`: the provider answered, it just had no such transaction. Only genuine
  transport failures are `503` — clients should not treat "unknown reference" as
  a reason to retry indefinitely.
- Verifying a reference belonging to another organization is `403`.
- Verification validates status, amount, currency, and organization association,
  and activates only after all of them pass.

#### `GET /v1/billing/transactions`

Each row now carries the figures recorded **at the time of payment** —
`product_currency`, `product_amount_minor`, `product_price_display`,
`charged_currency`, `charged_amount_minor`, `charged_amount_display`,
`billing_interval`, `display_plan`, `paid_at`, `verified_at`, `period_start`,
`period_end`, `duplicate`, `status`. History is never recalculated with current
pricing after a reprice.

#### Error semantics for checkout

`CheckoutRejectedException` (in `app/core/checkout_reasons.py`) is the single
exit for "this payment cannot proceed", so every rejection has the same envelope
and the client can branch on a slug instead of parsing copy:

```json
{
  "error": {
    "code": "CHECKOUT_FAILED",
    "message": "The price shown on this page is no longer the price our system has, so nothing has been charged.",
    "details": [{ "field": "reason", "issue": "quote_stale" }],
    "request_id": "…"
  }
}
```

| Status | Meaning for the caller | Reasons |
| --- | --- | --- |
| `409` | Rejected on policy or state — retrying as-is cannot succeed | `price_not_configured`, `payment_method_unavailable`, `plan_not_self_serve`, `quote_stale`, `transaction_not_found`, `transaction_not_paid`, `amount_below_plan_price`, `currency_mismatch`, `payment_channel_not_supported`, `organization_mismatch` |
| `403` | The reference belongs to another organization | `organization_mismatch` |
| `503` | The provider could not be reached — retrying is reasonable | `paystack_unavailable`, `verification_unavailable` |

The remaining slugs — `payment_cancelled`, `card_declined`,
`authentication_required`, `payment_pending`, `payment_replayed`,
`duplicate_payment`, `session_expired`, `network_interrupted` — are returned in
`200` verify responses (`verified: false` plus `reason`) or are client-derived;
they are not HTTP errors, because the customer's next step is a UX decision
rather than a failed request. All slugs and their customer-facing copy are
enumerated in `frontend/src/lib/billing/checkout-errors.ts`.

#### Payment channels

`resolve_checkout_channels()` (`app/core/payment_channels.py`) decides what the
provider may offer, and is fail-closed: an unset list means **card only**, not
"everything"; unknown channel names are dropped; locally restricted rails (USSD,
bank transfer, mobile money, QR, EFT, and similar) are excluded unless explicitly
enabled *and* the transaction currency supports them; the result is never empty
and card is always first. The resolved array is sent on initialize and applied
again to the InlineJS call, since the SDK otherwise defaults to every enabled
channel on the account.

New settings (all optional):

| Variable | Default | Effect |
| --- | --- | --- |
| `PAYSTACK_DEFAULT_CHANNEL` | `card` | Channel used when nothing is configured. |
| `PAYSTACK_CHECKOUT_CHANNELS` | unset | Explicit channel list. Blank/absent ≠ unrestricted. |
| `PAYSTACK_ENABLE_LOCAL_CHANNELS` | `false` | Opt-in for country-restricted rails, subject to the currency table. |
| `PAYSTACK_INLINE_JS_ENABLED` | `true` | Enables the embedded popup; takes effect only when `PAYSTACK_PUBLIC_KEY` is set, otherwise the checkout falls back to the hosted URL. |

### Compatibility

- No field was removed or renamed; all response changes are additive, so clients
  written against the previous billing responses continue to work.
- `GET /v1/pricing`, `GET /v1/billing/currency` and
  `GET /v1/pricing/fx-reference` are unchanged in shape. The FX endpoint remains
  display-only guidance, never an input to the charge.
- The legacy return entry point `GET /settings/billing?pay_ref=<reference>` still
  resolves: a session arriving at the provider with only a reference finds its
  payment, verifies it, and tidies the URL.
- Card data never transits RELIASTRA. There is no endpoint that accepts a card
  number, expiry, CVC or PIN, and none will be added: raw-card handling requires
  PCI-DSS Level 1 attestation, and hosted/InlineJS checkout keeps that scope with
  Paystack.
