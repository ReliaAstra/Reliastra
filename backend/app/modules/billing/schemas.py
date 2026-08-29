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


class InitializePaymentRequest(BaseModel):
    plan: str = Field(min_length=1, max_length=50)
    email: EmailStr | None = None
    # Explicit billing interval. Required for paid plans. Defaults to monthly
    # for backward compatibility but ALL checkout callers should send it.
    billing_interval: BillingInterval = BillingInterval.MONTHLY


class InitializePaymentResponse(BaseModel):
    authorization_url: str
    reference: str
    access_code: str
    # Echo of what is about to be charged, so the confirmation screen and any
    # post-redirect page can state the real currency/amount instead of
    # re-deriving (and possibly mis-deriving) it.
    amount_minor: int | None = None
    currency: str | None = None
    amount_display: str | None = None


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
