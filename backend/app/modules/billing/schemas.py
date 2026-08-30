import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class BillingInterval(str, Enum):
    MONTHLY = "monthly"
    ANNUAL = "annual"


class PaymentCurrencyResponse(BaseModel):
    """How Paystack will actually charge, and the canonical disclosure.

    One payload, consumed by every RELIASTRA-owned payment surface (pricing,
    upgrade modal, billing page, pre-payment confirmation). The notice text is
    served from the backend so web and email can never show different wording.
    """

    product_currency: str
    """Currency RELIASTRA's price list is denominated in (USD)."""
    payment_currency: str
    """ISO code Paystack charges in (NGN today)."""
    payment_currency_name: str
    """Plain-language name, e.g. ``Nigerian Naira (NGN)``."""
    payment_symbol: str
    differs_from_product_currency: bool
    """True when the charged currency is not the list-price currency."""
    notice: str | None = None
    """Canonical pre-payment disclosure. ``None`` when there is nothing to
    disclose (processing currency == product currency)."""
    checkout_ready: bool = True
    """False when the business has not published payment prices for the
    processing currency, so self-serve checkout must not be offered."""
    plan_payment_amounts: dict[str, dict[str, str]] = {}
    """``plan -> interval -> formatted amount`` for published payment prices.
    Absent means unpublished — the UI then states the currency without showing
    a figure, because no figure may be derived client-side."""
    payment_provider: str = "Paystack"
    """Who actually takes the money. Part of the mandatory transparency
    triple (product price / actual charge / payment provider)."""
    payment_provider_display: str = "Paystack — secure hosted checkout"
    fx_reference: dict | None = None
    """Market reference estimate (rate, source, timestamps, disclaimer) shown
    *beside* prices for context. Display-only: it is never consulted to
    determine a charge. ``None`` when disabled or unavailable — surfaces then
    omit the estimate rather than inventing one."""


class BillingTransactionResponse(BaseModel):
    """One collected payment, as recorded at the time it happened.

    Both sides are carried — the USD product price that was quoted and the
    amount/currency the provider actually charged — so a receipt can restate
    the full transparency triple from history without re-deriving anything.
    """

    id: uuid.UUID
    reference: str
    provider: str
    plan: str
    display_plan: str
    billing_interval: str
    status: str
    product_currency: str
    product_amount_minor: int | None = None
    product_price_display: str | None = None
    charged_currency: str
    charged_amount_minor: int
    charged_amount_display: str
    paid_at: datetime | None = None
    # When RELIASTRA verified the charge with the provider (distinct from the
    # provider's own ``paid_at``), so a receipt can state both facts.
    verified_at: datetime | None = None
    period_start: datetime | None = None
    period_end: datetime | None = None
    created_at: datetime
    # A second payment for an already-covered period. Surfaced, not hidden.
    duplicate: bool = False


class BillingTransactionsResponse(BaseModel):
    items: list[BillingTransactionResponse]
    # The same disclosure object every payment surface renders, so the history
    # view can state the provider + currency without a second source.
    payment: PaymentCurrencyResponse



class PlanDetailsResponse(BaseModel):
    org_id: uuid.UUID
    plan: str
    # Effective plan = the plan whose limits currently apply (PRO while a Free
    # organization is inside its 14-day trial).
    effective_plan: str
    is_trial_active: bool = False
    trial_days_remaining: int = 0
    trial_length_days: int
    # Evaluation is the canonical name (trial is the legacy alias). Both are
    # returned so older frontends keep working while new ones can use the
    # evaluation terminology the spec requires.
    is_evaluation_active: bool = False
    evaluation_status: str = "none"
    evaluation_started_at: datetime | None = None
    evaluation_expires_at: datetime | None = None
    evaluation_days_remaining: int = 0
    evaluation_used: bool = False
    # Convenience: effective limits derived from the effective plan
    max_dependencies: int | None = None
    max_team_members: int | None = None
    min_check_interval_seconds: int | None = None
    data_retention_days: int | None = None
    # Feature snapshot for the effective plan (mirrors PLAN_FEATURES)
    effective_features: dict | None = None
    # Fallback UX: actual consequences of expiry (real account data)
    fallback_info: dict | None = None
    subscription_status: str | None = None
    current_period_end: datetime | None = None
    price_usd: int = 0
    # Billing interval of the active subscription, if any.
    billing_interval: str | None = None
    # True when the effective plan uses custom/contact-sales pricing and the
    # UI must never display a numeric price.
    effective_is_custom: bool = False
    # ── Payment currency (what the card is actually charged in) ──────────
    # The billing page renders its disclosure from this, never from a literal
    # copied into the component, so it can never drift from checkout.
    payment: PaymentCurrencyResponse | None = None
    # Next renewal charge, resolved from the payment price catalog: minor
    # units + display string in the payment currency.
    next_charge_amount_minor: int | None = None
    next_charge_amount_display: str | None = None


class PaystackWebhookPayload(BaseModel):
    event: str
    data: dict[str, Any]


class PaystackWebhookResponse(BaseModel):
    received: bool
    event_type: str


class CheckoutQuoteResponse(BaseModel):
    """Everything the RELIASTRA checkout page renders, resolved server-side.

    This exists so a payment screen can be built without a single number being
    composed in the browser. The page reads a plan id and an interval from its
    URL, asks for this quote, and displays exactly what it is told: the product
    price, the amount that will be charged, the currency that charge settles in,
    the payment methods genuinely available to a global customer, and the
    disclosure that explains the USD/NGN relationship. There is no amount,
    currency or channel field for a client to set, and none to tamper with: the
    request that actually creates money (:class:`InitializePaymentRequest`)
    carries a plan and an interval and nothing else.

    ``available`` is the honest gate. When checkout cannot be offered (no
    published payment price, a contact-sales plan) the page says so with the
    reason instead of presenting a button that will fail.
    """

    plan: str
    display_plan: str
    description: str = ""
    features: dict | None = None
    billing_interval: str
    # ── The transparency triple: what it costs, what is charged, by whom ────
    product_currency: str
    product_amount_minor: int | None = None
    product_price_display: str | None = None
    payment_currency: str
    payment_amount_minor: int | None = None
    payment_amount_display: str | None = None
    payment_currency_name: str
    payment_provider: str = "Paystack"
    payment_provider_display: str = "Paystack \u2014 secure hosted checkout"
    period_word: str = "month"
    # Canonical currency disclosure + the display-only FX reference.
    currency_notice: str | None = None
    fx_reference: dict | None = None
    # ── Payment methods, as the backend's channel policy permits them ───────
    # The UI renders this list verbatim and never appends a method of its own,
    # so a market-restricted rail cannot appear because a component was
    # optimistic. ``channels`` is the same list sent to Paystack on initialize.
    payment_methods: list[dict] = []
    channels: list[str] = []
    #: Digest of the figures this quote was priced from (see ``_price_token`` in
    #: the billing service). The checkout echoes it when it initializes the
    #: payment: if the price list moved while the page was open, the payment is
    #: refused instead of charging something the customer did not approve. An
    #: opaque token, never an amount.
    price_token: str = ""
    # ── Who is paying, and what they already have ──────────────────────────
    organization_name: str | None = None
    billing_email: str | None = None
    current_plan: str | None = None
    current_interval: str | None = None
    already_subscribed: bool = False
    # ── Gate ───────────────────────────────────────────────────────────────
    available: bool = True
    unavailable_reason: str | None = None
    unavailable_message: str | None = None
    # True when card checkout can be opened right now (Paystack configured).
    checkout_enabled: bool = True
    trial_note: str | None = None


class InitializePaymentRequest(BaseModel):
    plan: str = Field(min_length=1, max_length=50)
    email: EmailStr | None = None
    # Explicit billing interval. Required for paid plans. Defaults to monthly
    # for backward compatibility but ALL checkout callers should send it.
    billing_interval: BillingInterval = BillingInterval.MONTHLY
    # Which *offered* method the customer picked. Validated against the
    # backend's channel policy on the server; it cannot widen the set, and a
    # value outside it is refused rather than passed through to Paystack.
    payment_method: str | None = Field(default=None, max_length=40)
    #: Optional echo of ``CheckoutQuoteResponse.price_token``. Absent is allowed
    #: (an older client just skips the staleness check); present-and-different
    #: stops initialization with a classified 409 rather than a mismatched charge.
    expected_price_token: str | None = Field(default=None, max_length=64)


class InitializePaymentResponse(BaseModel):
    authorization_url: str
    reference: str
    access_code: str
    # Paystack's *publishable* key, for completing payment inside RELIASTRA's
    # page via InlineJS. Safe by definition to expose (it is the key browser
    # integrations are given); the secret key is never serialized anywhere.
    public_key: str | None = None
    inline_js_enabled: bool = False
    inline_js_url: str | None = None
    # The rails this transaction was opened with, echoed so the checkout can
    # confirm the experience it launched matches what the customer approved.
    channels: list[str] = []
    payment_methods: list[dict] = []
    plan: str | None = None
    billing_interval: str | None = None
    # Echo of what is about to be charged, so the confirmation screen and any
    # post-redirect page can state the real currency/amount instead of
    # re-deriving (and possibly mis-deriving) it.
    amount_minor: int | None = None
    currency: str | None = None
    amount_display: str | None = None
    # The USD product price this checkout corresponds to, resolved
    # server-side, so the transparency triple on the hand-off screen is
    # backend-sourced end to end (product price / actual charge / provider).
    product_currency: str | None = None
    product_amount_minor: int | None = None
    product_price_display: str | None = None
    payment_provider: str = "Paystack"


class VerifyTransactionResponse(BaseModel):
    verified: bool
    plan: str
    reference: str
    # What was actually collected, taken from Paystack's own figures rather
    # than recomputed from config: a confirmation surface can restate the
    # charge in the currency it was charged in, and cannot drift from the
    # amount the gateway settled. Null when nothing was verified.
    currency: str | None = None
    amount_minor: int | None = None
    amount_display: str | None = None
    # The USD list price quoted by this checkout (transparency on
    # confirmation screens, read back from the persisted transaction).
    product_currency: str | None = None
    product_amount_minor: int | None = None
    product_price_display: str | None = None
    payment_provider: str = "Paystack"
    # Confirmation-screen identity, resolved server-side so the screen cannot
    # contradict the plan the payment actually bought.
    display_plan: str | None = None
    billing_interval: str | None = None
    period_word: str | None = None
    # ``reason`` is a machine-readable CheckoutReason slug;
    # ``reason_message`` is RELIASTRA's own sentence for it. The UI switches on
    # the slug and prints the message — it never forwards a provider string.
    reason: str | None = None
    reason_message: str | None = None
    # True when verification flipped this organization onto the paid plan;
    # False for an idempotent re-verification of a payment already applied.
    activated: bool = False
    # A second valid payment for a period already covered. Applied, and shown
    # honestly — never silently swallowed.
    duplicate_payment: bool = False
