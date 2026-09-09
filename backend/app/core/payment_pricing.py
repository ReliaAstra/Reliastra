"""Payment pricing - PRODUCT PRICE (USD) converted to PAYMENT PRICE (Paystack).

Two distinct concepts, deliberately kept separate:

``PRODUCT PRICING``
    RELIASTRA's canonical commercial price list. USD-denominated, defined once
    in :mod:`app.core.permissions` (``PLAN_PRICES_USD`` /
    ``PLAN_ANNUAL_PRICES_USD``). Nothing in this module changes it.

``PAYMENT PRICING``
    The amount actually sent to Paystack, in the *processing currency*
    (``settings.PAYSTACK_CURRENCY`` - NGN for the current merchant account).
    For a currency other than USD, the payment amount is the USD product price
    converted at the **live exchange rate**: ``round(USD minor units x rate)``,
    where ``rate`` is payment-currency units per 1 USD (e.g. $19.00 at
    ₦1,322/USD -> ₦25,118.00).

Rules this module enforces
--------------------------
* **The rate is always an explicit input.** Nothing here fetches or caches a
  rate, and this module never imports the FX layer (``fx_reference`` /
  ``payment_disclosure``). Callers on the request path obtain the live rate
  through :func:`app.core.payment_disclosure.resolve_payment_price_async` (or
  :func:`app.core.fx_reference.current_rate`) and pass it in, so the figure
  quoted, displayed and sent to Paystack is one resolution of one rate.
* **No invented fallback.** If the rate is unavailable for a non-USD
  processing currency, :func:`resolve_payment_price` reports
  ``is_configured=False`` and :meth:`BillingService.initialize_payment`
  refuses to initialize rather than charging the USD minor-unit amount in a
  different currency. The FX estimate and the charge share one cache entry, so
  what the customer sees as "the rate" is the same number that priced the
  charge.
* **One number everywhere.** Pricing pages, the upgrade flow, the pre-payment
  confirmation, receipts and emails all read the amount through this module,
  so what the customer sees is literally what is sent to Paystack.

When the processing currency *is* USD, the payment price defaults to the
product price in minor units (``PLAN_AMOUNTS``) - i.e. a USD deployment keeps
its historical behaviour with no extra configuration.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.config import settings
from app.core.permissions import (
    PLAN_AMOUNTS,
    PLAN_ANNUAL_AMOUNTS,
    PLAN_BILLING_AVAILABILITY,
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

#: The payment processor RELIASTRA's current checkout runs through. Named
#: explicitly on every payment surface so a customer always knows who is
#: taking the money and in what currency.
PAYMENT_PROVIDER = "Paystack"
PAYMENT_PROVIDER_DISPLAY = "Paystack - secure hosted checkout"

#: Canonical, customer-facing disclosure shown next to every RELIASTRA payment
#: decision while the processing currency is Naira. One version for the whole
#: product - never restate it in a page or a component. This is the mandated
#: transparency wording: what the price list says and what Paystack charges.
#: It must not be softened, shortened or paraphrased in a surface; the
#: copy-guard tests diff this string against the frontend and the
#: transactional emails.
NGN_CURRENCY_NOTICE = (
    "RELIASTRA's plans are priced in USD. Our current Paystack payment flow "
    "processes payments in NGN. We are awaiting confirmation of additional "
    "payment options for international customers."
)

#: Mandatory wording beside the exchange rate wherever one is displayed. The
#: rate is no longer decorative: it is the basis of the conversion from the
#: USD list price to the NGN charge, so the disclosure must say so - a rate
#: without these words is how a customer comes to believe the figure was
#: invented.
FX_REFERENCE_DISCLAIMER = (
    "Your charge is the USD price converted to NGN at the market rate shown "
    "here. The rate is provided by the named source and is refreshed "
    "periodically."
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
    ``payment_currency``. ``None`` when no rate is available to convert the
    USD price for that currency."""

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
        so an exchange rate is mandatory to price the charge."""
        return self.payment_currency != self.product_currency


def payment_currency() -> str:
    """Normalized ISO-4217 code Paystack will actually charge in."""
    return (settings.PAYSTACK_CURRENCY or PRODUCT_CURRENCY).strip().upper()


def currency_name(code: str) -> str:
    return CURRENCY_NAMES.get(code, code)


def format_money(minor_units: int | None, currency: str) -> str:
    """Render a minor-unit amount as ``\u20a625,118.00 (NGN)``.

    The ISO code is always part of the output - a bare symbol is not acceptable
    here: screen readers, plain-text email clients and forwarded receipts must
    receive the currency as text, and ``\u20a6`` must never be mistaken for ``$``.
    """
    if minor_units is None:
        return ""
    amount = f"{minor_units / 100:,.2f}"
    symbol = CURRENCY_SYMBOLS.get(currency)
    return f"{symbol}{amount} ({currency})" if symbol else f"{amount} {currency}"


def format_product_price(plan: str, interval: str = MONTHLY) -> str | None:
    """Human product-price string for a plan (``$19``). None for custom."""
    normalized = normalize_plan(plan)
    usd = (
        get_plan_annual_price_usd(normalized)
        if (interval or MONTHLY).strip().lower() == ANNUAL
        else PLAN_PRICES_USD.get(normalized, 0)
    )
    if not usd:
        return None
    return format_money(int(usd) * 100, PRODUCT_CURRENCY)


def converted_payment_amount(product_minor: int, rate: float) -> int:
    """Convert a USD minor-unit price to payment-currency minor units.

    ``product_minor`` is USD cents and ``rate`` is payment-currency units per
    1 USD, so the product ``cents x (units/USD)`` is already expressed in
    payment-currency minor units (kobo for NGN). Rounded to the nearest minor
    unit - $19.00 at ₦1,322/USD -> 1,900 x 1,322 = 2,511,800 kobo = ₦25,118.00.
    """
    return int(round(product_minor * rate))


def resolve_payment_price(
    plan: str, interval: str = MONTHLY, *, rate: float | None = None
) -> PaymentPrice:
    """The canonical resolution of "what will this plan cost and be charged as".

    ``rate`` is the live exchange rate (payment-currency units per 1 USD). It
    is required to price a non-USD charge and is deliberately NOT read here -
    the caller must supply it, so the quoted figure and the charged figure are
    the product of one explicit resolution. When the processing currency is
    USD, no rate is needed and the published USD amount is charged directly.
    """
    normalized = normalize_plan(plan)
    interval = (interval or MONTHLY).strip().lower()
    interval = ANNUAL if interval == ANNUAL else MONTHLY

    usd_annual = get_plan_annual_price_usd(normalized)
    if interval == ANNUAL:
        product_minor = usd_annual * 100 if usd_annual is not None else None
    else:
        product_minor = PLAN_PRICES_USD.get(normalized, 0) * 100

    currency = payment_currency()
    amount: int | None = None
    if currency == PRODUCT_CURRENCY:
        # A USD deployment charges its published USD amounts directly.
        amount = (
            PLAN_ANNUAL_AMOUNTS.get(normalized)
            if interval == ANNUAL
            else PLAN_AMOUNTS.get(normalized)
        )
    elif rate is not None and rate > 0 and product_minor:
        amount = converted_payment_amount(product_minor, float(rate))
    return PaymentPrice(
        plan=normalized,
        interval=interval,
        product_currency=PRODUCT_CURRENCY,
        product_amount=product_minor or None,
        payment_currency=currency,
        payment_amount=amount,
    )


def checkout_amount(plan: str, interval: str = MONTHLY, *, rate: float | None = None) -> int:
    """Amount in minor units to send to Paystack.

    Raises instead of guessing: a missing exchange rate for a non-USD
    processing currency must never fall back to the USD figure.
    """
    price = resolve_payment_price(plan, interval, rate=rate)
    if not price.is_configured:
        raise PaymentPriceNotConfigured(price)
    return int(price.payment_amount or 0)


def minimum_product_amount(
    plan: str, interval: str = MONTHLY, *, rate: float | None = None
) -> int | None:
    """The smallest payment that covers the plan, in payment-currency minor units.

    Used by webhook/verify integrity checks. It is the *resolved payment
    price* (USD converted at the live rate) - not the raw USD list price -
    because that is what a correctly configured checkout collects.
    """
    amount = resolve_payment_price(plan, interval, rate=rate).payment_amount
    return int(amount) if amount else None


class PaymentPriceNotConfigured(RuntimeError):
    """Raised when checkout is requested for a currency with no resolvable rate."""

    def __init__(self, price: PaymentPrice) -> None:
        self.price = price
        super().__init__(
            f"No {price.payment_currency} payment price is available for plan "
            f"'{price.plan}' ({price.interval}): no live exchange rate is "
            f"available to convert the USD list price."
        )


#: Canonical disclosures per processing currency. A currency only gets a notice
#: once the business has written and approved its wording: ``None`` means "no
#: disclosure is defined for this currency", never "reuse the NGN paragraph".
#: USD is absent deliberately - when Paystack charges in the same currency the
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
    """Plans RELIASTRA charges for on self-serve - the only ones that can have
    a payment price. Free is never charged, Enterprise is Contact Sales."""
    return sorted(
        plan
        for plan, availability in PLAN_BILLING_AVAILABILITY.items()
        if availability == "self_serve" and PLAN_AMOUNTS.get(plan)
    )


def checkout_ready(*, rate: float | None = None) -> bool:
    """Are payment prices resolvable for every self-serve plan/interval?

    A pricing page must not offer "Upgrade to Pro" for a currency it cannot
    price: with no available rate, checkout would either fail mid-flow or -
    worse - charge the USD minor-unit figure as Naira.
    """
    if not currency_mismatch():
        return True
    if rate is None or rate <= 0:
        return False
    for plan in self_serve_plans():
        for interval in (MONTHLY, ANNUAL):
            if resolve_payment_price(plan, interval, rate=rate).payment_amount is None:
                return False
    return True


def resolved_payment_amounts(*, rate: float | None = None) -> dict[str, dict[str, str]]:
    """``plan -> interval -> display`` for every resolvable payment price.

    Only amounts the current rate actually resolves appear. A pricing card must
    never compose a Naira figure itself - if it is not in this map, the card
    states the currency without inventing a number.
    """
    out: dict[str, dict[str, str]] = {}
    for plan in self_serve_plans():
        row: dict[str, str] = {}
        for interval in (MONTHLY, ANNUAL):
            price = resolve_payment_price(plan, interval, rate=rate)
            if price.is_configured:
                row[interval] = format_money(
                    price.payment_amount, price.payment_currency
                )
        if row:
            out[plan] = row
    return out


def currency_info(*, rate: float | None = None) -> dict:
    """The payload every customer-facing payment surface renders from.

    ``rate`` is the live exchange rate the charge is converted at; when it is
    None the payload reports ``checkout_ready: False`` and empty
    ``plan_payment_amounts`` (the UI then states the currency without a
    figure). Returned as a plain dict so both the public pricing endpoint and
    the authenticated billing endpoint can embed the identical object.
    """
    currency = payment_currency()
    return {
        "product_currency": PRODUCT_CURRENCY,
        "payment_currency": currency,
        "payment_currency_name": currency_name(currency),
        "payment_symbol": CURRENCY_SYMBOLS.get(currency, currency),
        "differs_from_product_currency": currency_mismatch(),
        "notice": customer_currency_notice(),
        "checkout_ready": checkout_ready(rate=rate),
        "plan_payment_amounts": resolved_payment_amounts(rate=rate),
        # The processor is part of the disclosure contract: every payment
        # surface names who charges the customer.
        "payment_provider": PAYMENT_PROVIDER,
        "payment_provider_display": PAYMENT_PROVIDER_DISPLAY,
    }


def transparency_lines(
    plan: str,
    interval: str = MONTHLY,
    *,
    rate: float | None = None,
    price: PaymentPrice | None = None,
) -> dict[str, str | None]:
    """The mandatory customer-facing transparency triple for one plan.

    Renders exactly the three facts the product spec requires on every
    RELIASTRA-owned payment surface::

        Product price:     $19.00 (USD)
        Actual charge:     ₦25,118.00 (NGN)
        Payment provider:  Paystack

    ``actual_charge`` is the *resolved payment price* - the USD list price
    converted at ``rate`` - the same integer that is sent to Paystack. It is
    ``None`` when no rate is available (and the surface then states the
    currency without a figure). ``product_price`` is ``None`` for
    custom-priced plans, which route to Contact Sales instead of checkout.

    Web, receipts and emails all call this so the three lines can never
    disagree with each other or with the charge.
    """
    price = price or resolve_payment_price(plan, interval, rate=rate)
    return {
        "product_price": format_money(price.product_amount, price.product_currency) or None,
        "actual_charge": (
            format_money(price.payment_amount, price.payment_currency)
            if price.is_configured
            else None
        ),
        "payment_provider": PAYMENT_PROVIDER,
        "payment_provider_display": PAYMENT_PROVIDER_DISPLAY,
        "currency_label": currency_name(price.payment_currency),
    }
