"""Payment pricing — PRODUCT PRICE (USD) versus PAYMENT PRICE (Paystack).

Two distinct concepts, deliberately kept separate:

``PRODUCT PRICING``
    RELIASTRA's canonical commercial price list. USD-denominated, defined once
    in :mod:`app.core.permissions` (``PLAN_PRICES_USD`` /
    ``PLAN_ANNUAL_PRICES_USD``). Nothing in this module changes it.

``PAYMENT PRICING``
    The amount actually sent to Paystack, in the *processing currency*
    (``settings.PAYSTACK_CURRENCY`` — NGN for the current merchant account).
    This is a business-defined price the operator publishes
    (``settings.PAYSTACK_NGN_PLAN_PRICES``); it is **not** derived from the USD
    list price.

Rules this module enforces
--------------------------
* **No FX conversion, ever.** There is no rate constant here, nothing is
  fetched at runtime, and ``$39`` is never silently transformed into a Naira
  figure. Paystack reads the integer it is given as the currency it is told,
  so an implicit conversion would be a mis-charge, not a rounding detail.
* **No invented fallback.** If the payment price for a plan/interval has not
  been published for the configured currency, self-serve checkout is *not*
  offered: :func:`resolve_payment_price` reports ``is_configured=False`` and
  :meth:`BillingService.initialize_payment` refuses to initialize rather than
  charging the USD minor-unit amount in a different currency.
* **One number everywhere.** Pricing pages, the upgrade flow, the pre-payment
  confirmation, receipts and emails all read the amount through this module,
  so what the customer sees is literally what is sent to Paystack.

When the processing currency *is* USD, the payment price defaults to the
product price in minor units (``PLAN_AMOUNTS``) — i.e. a USD deployment keeps
its historical behaviour with no extra configuration.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.config import settings
from app.core.permissions import (
    PLAN_AMOUNTS,
    PLAN_BILLING_AVAILABILITY,
    PLAN_ANNUAL_AMOUNTS,
    PLAN_PRICES_USD,
    get_plan_annual_price_usd,
    normalize_plan,
)

logger = logging.getLogger(__name__)

#: RELIASTRA's canonical commercial currency for product pricing.
PRODUCT_CURRENCY = "USD"

#: Currency label used in customer-facing copy. Kept here so the checkout,
#: the pricing API and transactional email can never disagree.
CURRENCY_NAMES: dict[str, str] = {
    "NGN": "Nigerian Naira (NGN)",
    "USD": "US Dollars (USD)",
    "GHS": "Ghanaian Cedi (GHS)",
    "ZAR": "South African Rand (ZAR)",
    "KES": "Kenyan Shilling (KES)",
    "XOF": "West African Cfa Franc (XOF)",
    "EUR": "Euros (EUR)",
    "GBP": "Pounds Sterling (GBP)",
}

CURRENCY_SYMBOLS: dict[str, str] = {
    "NGN": "\u20a6",
    "USD": "$",
    "GHS": "\u20b5",
    "ZAR": "R",
    "KES": "KSh",
    "EUR": "\u20ac",
    "GBP": "\u00a3",
}

MONTHLY = "monthly"
ANNUAL = "annual"

#: Canonical, customer-facing disclosure shown next to every RELIASTRA payment
#: decision while the processing currency is Naira. One version for the whole
#: product — never restate it in a page or a component.
NGN_CURRENCY_NOTICE = (
    "Please note that all transactions are currently processed in Nigerian Naira "
    "(NGN). We are actively working towards enabling payments in US Dollars (USD) "
    "to better serve our global user base. However, due to ongoing legal and "
    "regulatory compliance requirements, this transition has been temporarily "
    "delayed. We appreciate your patience and understanding as we work diligently "
    "to resolve this matter."
)


@dataclass(frozen=True)
class PaymentPrice:
    """A single plan/interval priced in both currencies, plus its state."""

    plan: str
    interval: str
    product_currency: str
    product_amount: int | None
    """USD list price in minor units (cents). ``None`` for custom pricing."""
    payment_currency: str
    payment_amount: int | None
    """Amount actually sent to Paystack, in minor units of
    ``payment_currency``. ``None`` when unpublished for that currency."""

    @property
    def payment_currency_name(self) -> str:
        return CURRENCY_NAMES.get(self.payment_currency, self.payment_currency)

    @property
    def is_configured(self) -> bool:
        """Can self-serve checkout legally be offered for this price?"""
        return self.payment_amount is not None and self.payment_amount > 0

    @property
    def requires_different_amount(self) -> bool:
        """True when the processing currency differs from the product currency,
        so a business-published payment price is mandatory."""
        return self.payment_currency != self.product_currency


def payment_currency() -> str:
    """Normalized ISO-4217 code Paystack will actually charge in."""
    return (settings.PAYSTACK_CURRENCY or PRODUCT_CURRENCY).strip().upper()


def currency_name(code: str) -> str:
    return CURRENCY_NAMES.get(code, code)


def format_money(minor_units: int | None, currency: str) -> str:
    """Render a minor-unit amount as ``\u20a660,000.00 (NGN)``.

    The ISO code is always part of the output — a bare symbol is not acceptable
    here: screen readers, plain-text email clients and forwarded receipts must
    receive the currency as text, and ``\u20a6`` must never be mistaken for ``$``.
    """
    if minor_units is None:
        return ""
    amount = f"{minor_units / 100:,.2f}"
    symbol = CURRENCY_SYMBOLS.get(currency)
    return f"{symbol}{amount} ({currency})" if symbol else f"{amount} {currency}"


def format_product_price(plan: str, interval: str = MONTHLY) -> str | None:
    """Human product-price string for a plan (``$39``). None for custom."""
    normalized = normalize_plan(plan)
    usd = (
        get_plan_annual_price_usd(normalized)
        if (interval or MONTHLY).strip().lower() == ANNUAL
        else PLAN_PRICES_USD.get(normalized, 0)
    )
    if not usd:
        return None
    return format_money(int(usd) * 100, PRODUCT_CURRENCY)


def _published_amounts(currency: str) -> dict[str, dict[str, int]] | None:
    """Operator-published payment prices, keyed ``plan -> interval -> minor``.

    Read from settings, so the business controls the number; never computed.
    Accepts either a full map (``{"pro": {"monthly": 6000000}}``) or a flat
    monthly-only map (``{"pro": 6000000}``) for convenience. Only NGN has a
    published catalog today: adding another currency means adding its own
    explicit setting, not deriving one.
    """
    if currency != "NGN":
        return None
    raw = settings.PAYSTACK_NGN_PLAN_PRICES
    if not raw:
        return None
    normalized: dict[str, dict[str, int]] = {}
    for plan, value in raw.items():
        stated = str(plan).strip().lower()
        key = normalize_plan(stated)
        intervals: dict[str, int] = {}
        if isinstance(value, dict):
            for interval, amount in value.items():
                try:
                    intervals[str(interval).strip().lower()] = int(amount)
                except (TypeError, ValueError):
                    continue
        else:
            try:
                intervals[MONTHLY] = int(value)
            except (TypeError, ValueError):
                intervals = {}
        intervals = {
            interval: amount
            for interval, amount in intervals.items()
            if interval in (MONTHLY, ANNUAL) and amount > 0
        }
        if not intervals:
            logger.error(
                "PAYSTACK_NGN_PLAN_PRICES[%r] carries no usable amount; ignoring "
                "the entry.",
                stated,
            )
            continue
        if key != stated:
            logger.warning(
                "PAYSTACK_NGN_PLAN_PRICES[%r] uses a legacy plan name; price it "
                "under its canonical id %r instead.",
                stated,
                key,
            )
        if key not in self_serve_plans():
            # Free is never charged and Enterprise is Contact Sales: a price
            # attached to either is a misconfiguration, never a checkout.
            logger.error(
                "PAYSTACK_NGN_PLAN_PRICES[%r] resolves to %r, which RELIASTRA "
                "does not charge through self-serve checkout; ignoring.",
                stated,
                key,
            )
            continue
        if key in normalized:
            if stated == key:
                normalized[key] = intervals  # canonical id wins over an alias
            else:
                # ``starter`` is a legacy alias of ``pro``. An alias may fill a
                # gap but must never overwrite a price published under the
                # canonical slug: silently repricing a live plan is a
                # mis-charge.
                logger.error(
                    "Ignoring PAYSTACK_NGN_PLAN_PRICES[%r]: %r already has a "
                    "published price under its canonical id.",
                    stated,
                    key,
                )
            continue
        normalized[key] = intervals
    return normalized or None


def resolve_payment_price(plan: str, interval: str = MONTHLY) -> PaymentPrice:
    """The canonical resolution of "what will this plan cost and be charged as"."""
    normalized = normalize_plan(plan)
    interval = (interval or MONTHLY).strip().lower()
    interval = ANNUAL if interval == ANNUAL else MONTHLY

    usd_annual = get_plan_annual_price_usd(normalized)
    if interval == ANNUAL:
        product_minor = usd_annual * 100 if usd_annual is not None else None
    else:
        product_minor = PLAN_PRICES_USD.get(normalized, 0) * 100

    currency = payment_currency()
    published = _published_amounts(currency)
    amount: int | None = None
    if published:
        amount = published.get(normalized, {}).get(interval)
    if amount is None and currency == PRODUCT_CURRENCY:
        # A USD deployment charges its published USD amounts directly.
        amount = (
            PLAN_ANNUAL_AMOUNTS.get(normalized)
            if interval == ANNUAL
            else PLAN_AMOUNTS.get(normalized)
        )
    return PaymentPrice(
        plan=normalized,
        interval=interval,
        product_currency=PRODUCT_CURRENCY,
        product_amount=product_minor or None,
        payment_currency=currency,
        payment_amount=amount,
    )


def checkout_amount(plan: str, interval: str = MONTHLY) -> int:
    """Amount in minor units to send to Paystack.

    Raises instead of guessing: a missing payment price for a non-USD
    processing currency must never fall back to the USD figure.
    """
    price = resolve_payment_price(plan, interval)
    if not price.is_configured:
        raise PaymentPriceNotConfigured(price)
    return int(price.payment_amount or 0)


def minimum_product_amount(plan: str, interval: str = MONTHLY) -> int | None:
    """The smallest payment that covers the plan, in payment-currency minor units.

    Used by webhook/verify integrity checks. It is the *published payment
    price* — not the USD list price — because that is what a correctly
    configured checkout collects.
    """
    amount = resolve_payment_price(plan, interval).payment_amount
    return int(amount) if amount else None


class PaymentPriceNotConfigured(RuntimeError):
    """Raised when checkout is requested for a currency with no published price."""

    def __init__(self, price: PaymentPrice) -> None:
        self.price = price
        super().__init__(
            f"No {price.payment_currency} payment price is published for plan "
            f"'{price.plan}' ({price.interval}). Set PAYSTACK_NGN_PLAN_PRICES for "
            f"{price.payment_currency} before offering self-serve checkout."
        )


#: Canonical disclosures per processing currency. A currency only gets a notice
#: once the business has written and approved its wording: ``None`` means "no
#: disclosure is defined for this currency", never "reuse the NGN paragraph".
#: USD is absent deliberately — when Paystack charges in the same currency the
#: price list uses, there is nothing to explain, and showing a currency warning
#: would itself be misleading.
CURRENCY_NOTICES: dict[str, str] = {
    "NGN": NGN_CURRENCY_NOTICE,
}


def customer_currency_notice() -> str | None:
    """Canonical pre-payment disclosure for the current processing currency."""
    return CURRENCY_NOTICES.get(payment_currency())


def currency_mismatch() -> bool:
    """True when the charged currency differs from the list-price currency."""
    return payment_currency() != PRODUCT_CURRENCY


def self_serve_plans() -> list[str]:
    """Plans RELIASTRA charges for on self-serve — the only ones that can have
    a payment price. Free is never charged, Enterprise is Contact Sales."""
    return sorted(
        plan
        for plan, availability in PLAN_BILLING_AVAILABILITY.items()
        if availability == "self_serve" and PLAN_AMOUNTS.get(plan)
    )


def checkout_ready() -> bool:
    """Are payment prices published for every self-serve plan/interval?

    A pricing page must not offer "Upgrade to Pro" for a currency it cannot
    price: with no published amount, checkout would either fail mid-flow or —
    worse — charge the USD minor-unit figure as Naira.
    """
    if not currency_mismatch():
        return True
    for plan in self_serve_plans():
        for interval in (MONTHLY, ANNUAL):
            if resolve_payment_price(plan, interval).payment_amount is None:
                return False
    return True


def published_payment_amounts() -> dict[str, dict[str, str]]:
    """``plan -> interval -> display`` for every published payment price.

    Only amounts the business actually published appear. A pricing card must
    never compose a Naira figure itself — if it is not in this map, the card
    states the currency without inventing a number.
    """
    out: dict[str, dict[str, str]] = {}
    for plan in self_serve_plans():
        row: dict[str, str] = {}
        for interval in (MONTHLY, ANNUAL):
            price = resolve_payment_price(plan, interval)
            if price.is_configured:
                row[interval] = format_money(
                    price.payment_amount, price.payment_currency
                )
        if row:
            out[plan] = row
    return out


def currency_info() -> dict:
    """The payload every customer-facing payment surface renders from.

    Returned as a plain dict so both the public pricing endpoint and the
    authenticated billing endpoint can embed the identical object.
    """
    currency = payment_currency()
    return {
        "product_currency": PRODUCT_CURRENCY,
        "payment_currency": currency,
        "payment_currency_name": currency_name(currency),
        "payment_symbol": CURRENCY_SYMBOLS.get(currency, currency),
        "differs_from_product_currency": currency_mismatch(),
        "notice": customer_currency_notice(),
        "checkout_ready": checkout_ready(),
        "plan_payment_amounts": published_payment_amounts(),
    }
