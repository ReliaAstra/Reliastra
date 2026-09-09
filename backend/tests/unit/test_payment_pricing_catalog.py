"""The conversion contract between USD product pricing and NGN payment pricing.

These tests lock the commercial invariants of the FX-pricing refactor:

* the USD product price list is exactly ``Free $0 · Pro $19/mo · Pro $190/yr ·
  Enterprise custom``;
* the NGN payment price is the USD price **converted at the live rate**
  (``round(USD minor units x rate)``), and a missing rate disables checkout
  instead of guessing - never the USD minor units, never a fixed figure;
* every payment surface reads the same transparency triple
  (Product price / Actual charge / Payment provider);
* the mandated disclosure sentence is this exact wording, on the backend and
  (via the drift guard in ``test_transactional_email_footer``) the frontend;
* the pricing core takes the rate as an explicit input and never imports the
  FX layer itself - so the quote, the display and the charge are one
  resolution of one rate.
"""

from __future__ import annotations

import ast
import inspect
from pathlib import Path

import pytest

from app.config import settings
from app.core.payment_pricing import (
    ANNUAL,
    CURRENCY_NOTICES,
    MONTHLY,
    NGN_CURRENCY_NOTICE,
    PAYMENT_PROVIDER,
    PAYMENT_PROVIDER_DISPLAY,
    PRODUCT_CURRENCY,
    PaymentPriceNotConfigured,
    checkout_amount,
    checkout_ready,
    converted_payment_amount,
    currency_info,
    format_money,
    resolve_payment_price,
    resolved_payment_amounts,
    transparency_lines,
)
from app.core.permissions import (
    PLAN_ANNUAL_PRICES_USD,
    PLAN_BILLING_AVAILABILITY,
    PLAN_PRICES_USD,
)

#: The contract-testing rate named in the bug report (NGN per 1 USD).
RATE = 1322.0


# ── canonical USD product pricing (unchanged by anything NGN-related) ────────


def test_canonical_usd_price_list():
    assert PRODUCT_CURRENCY == "USD"
    assert PLAN_PRICES_USD["free"] == 0
    assert PLAN_PRICES_USD["pro"] == 19
    assert PLAN_ANNUAL_PRICES_USD["pro"] == 190
    assert PLAN_ANNUAL_PRICES_USD["enterprise"] is None  # custom - never a number
    assert PLAN_BILLING_AVAILABILITY["enterprise"] == "contact_sales"
    assert PLAN_BILLING_AVAILABILITY["pro"] == "self_serve"


def test_product_price_minor_units_are_usd_cents():
    monthly = resolve_payment_price("pro", MONTHLY, rate=RATE)
    annual = resolve_payment_price("pro", ANNUAL, rate=RATE)
    assert monthly.product_currency == "USD"
    assert monthly.product_amount == 1900
    assert annual.product_amount == 19000


# ── the NGN payment price is the USD price converted at the live rate ────────


def test_conversion_is_round_minor_units_times_rate():
    # cents x (NGN/USD) == kobo: 1900 x 1322 = 2,511,800 -> ₦25,118.00.
    assert converted_payment_amount(1900, 1322.0) == 2_511_800
    assert converted_payment_amount(19000, 1322.0) == 25_118_000
    # Fractional kobo round to the nearest minor unit, never truncate.
    assert converted_payment_amount(1900, 1322.5) == round(1900 * 1322.5)


def test_payment_amount_is_the_usd_price_converted_not_a_fixed_figure():
    monthly = resolve_payment_price("pro", MONTHLY, rate=RATE)
    assert monthly.payment_currency == "NGN"
    assert monthly.payment_amount == 2_511_800
    assert monthly.payment_amount != monthly.product_amount
    annual = resolve_payment_price("pro", ANNUAL, rate=RATE)
    assert annual.payment_amount == 25_118_000
    assert checkout_amount("pro", MONTHLY, rate=RATE) == 2_511_800


def test_payment_amount_moves_with_the_rate():
    """A different rate is a different charge - the figure is the conversion."""
    assert checkout_amount("pro", MONTHLY, rate=RATE) == 2_511_800
    assert checkout_amount("pro", MONTHLY, rate=1650.0) == round(1900 * 1650.0)


def test_enterprise_and_free_never_have_payment_prices():
    """Enterprise is Contact Sales, Free has nothing to charge."""
    for plan in ("enterprise", "free"):
        for interval in (MONTHLY, ANNUAL):
            price = resolve_payment_price(plan, interval, rate=RATE)
            assert price.payment_amount is None
            assert price.is_configured is False
    with pytest.raises(PaymentPriceNotConfigured):
        checkout_amount("enterprise", MONTHLY, rate=RATE)


def test_missing_rate_disables_checkout_instead_of_guessing():
    price = resolve_payment_price("pro", MONTHLY)
    assert price.payment_amount is None
    assert price.is_configured is False
    assert checkout_ready() is False
    with pytest.raises(PaymentPriceNotConfigured):
        checkout_amount("pro", MONTHLY)
    # The product price is untouched: checkout stops, it does not reprice.
    assert price.product_amount == 1900
    # A non-positive rate is treated exactly like an absent one.
    for bad in (0, -1):
        assert resolve_payment_price("pro", MONTHLY, rate=bad).payment_amount is None


def test_usd_deployment_charges_the_product_price_directly(monkeypatch):
    """A USD deployment needs no rate - it charges the USD price directly."""
    monkeypatch.setattr(settings, "PAYSTACK_CURRENCY", "USD")
    monthly = resolve_payment_price("pro", MONTHLY)
    assert monthly.payment_currency == "USD"
    assert monthly.payment_amount == 1900  # cents - same currency as the list
    assert monthly.is_configured is True
    assert checkout_ready() is True
    # With matching currencies there is nothing to disclose.
    assert currency_info()["notice"] is None
    assert currency_info()["differs_from_product_currency"] is False


# ── the mandatory transparency triple ────────────────────────────────────────


def test_transparency_triple_words_and_values():
    lines = transparency_lines("pro", MONTHLY, rate=RATE)
    assert lines["product_price"] == "$19.00 (USD)"
    assert lines["actual_charge"] == "\u20a625,118.00 (NGN)"
    assert lines["payment_provider"] == "Paystack"
    assert lines["payment_provider"] == PAYMENT_PROVIDER
    assert PAYMENT_PROVIDER_DISPLAY.startswith(PAYMENT_PROVIDER)
    annual = transparency_lines("pro", ANNUAL, rate=RATE)
    assert annual["product_price"] == "$190.00 (USD)"
    assert annual["actual_charge"] == "\u20a6251,180.00 (NGN)"


def test_enterprise_transparency_has_no_invented_numbers():
    lines = transparency_lines("enterprise", MONTHLY, rate=RATE)
    assert lines["product_price"] is None  # custom pricing, never $0
    assert lines["actual_charge"] is None
    assert lines["payment_provider"] == PAYMENT_PROVIDER


def test_missing_rate_never_falls_back_to_a_number():
    assert transparency_lines("pro", MONTHLY)["actual_charge"] is None
    assert resolved_payment_amounts() == {}


def test_money_formatting_always_carries_the_iso_code():
    assert format_money(1900, "USD") == "$19.00 (USD)"
    assert format_money(2_511_800, "NGN") == "\u20a625,118.00 (NGN)"
    assert format_money(None, "NGN") == ""


# ── mandated disclosure wording ──────────────────────────────────────────────


def test_mandated_disclosure_sentence():
    assert (
        NGN_CURRENCY_NOTICE
        == "RELIASTRA's plans are priced in USD. Our current Paystack payment "
        "flow processes payments in NGN. We are awaiting confirmation of "
        "additional payment options for international customers."
    )
    assert CURRENCY_NOTICES["NGN"] == NGN_CURRENCY_NOTICE
    # The sentence names all three facts: USD pricing, NGN charging, USD future.
    for required in ("USD", "NGN", "Paystack"):
        assert required in NGN_CURRENCY_NOTICE


def test_currency_info_embeds_provider_and_resolved_amounts():
    info = currency_info(rate=RATE)
    assert info["payment_provider"] == "Paystack"
    assert info["checkout_ready"] is True
    assert info["plan_payment_amounts"]["pro"]["monthly"] == "\u20a625,118.00 (NGN)"
    assert info["plan_payment_amounts"]["pro"]["annual"] == "\u20a6251,180.00 (NGN)"


# ── architecture guard: the rate is passed in, never imported ────────────────


#: (module, banned import substrings). The pricing core and the legacy plan
#: list must not reach into the FX/display layer - the rate is handed to
#: ``resolve_payment_price`` as an explicit argument by the request path, so
#: one resolution of one rate prices the quote, the display and the charge.
PRICING_PATH_MODULES = (
    (
        "app/core/payment_pricing.py",
        ("fx_reference", "payment_disclosure"),
    ),
    (
        "app/core/permissions.py",
        ("fx_reference", "payment_disclosure"),
    ),
    (
        "app/modules/billing/service.py",
        ("fx_reference",),
    ),
)


@pytest.mark.parametrize("relative,banned", PRICING_PATH_MODULES)
def test_price_resolution_never_imports_the_fx_layer(relative, banned):
    """No module on the charge path may import the FX layer directly.

    Static guard: the conversion rate must be an explicit input to the pricing
    core (resolved once by the request path through ``payment_disclosure``),
    so a handler can never fetch a rate, quote a figure and charge another.
    """
    source = (Path(__file__).resolve().parents[2] / relative).read_text(encoding="utf-8")
    tree = ast.parse(source)
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)
    assert not any(any(b in name for b in banned) for name in imported), (
        f"{relative} must not import the FX layer - the rate is passed in, "
        "not fetched on the charge path."
    )
    # No call into the FX module anywhere in the pricing-path source.
    assert "fx_reference_payload(" not in source


def test_charge_amount_is_a_function_of_the_rate_argument():
    """Behavioural twin of the import guard: only the passed rate prices."""
    assert "rate" in inspect.signature(resolve_payment_price).parameters
    # Without a rate the charge is unresolved (and refuses), not a guess.
    with pytest.raises(PaymentPriceNotConfigured):
        checkout_amount("pro", MONTHLY)
    # With a rate the charge is exactly the conversion of that rate.
    assert checkout_amount("pro", MONTHLY, rate=1322.0) == 2_511_800
