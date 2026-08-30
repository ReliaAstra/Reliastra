"""The published-price contract between USD product pricing and NGN payment pricing.

These tests lock the commercial invariants of the billing refactor:

* the USD product price list is exactly ``Free $0 · Pro $39/mo · Pro $390/yr ·
  Enterprise custom``;
* NGN payment prices are **explicit published values** (never the USD minor
  units, never an FX product), and an unpublished price disables checkout
  instead of guessing;
* every payment surface reads the same transparency triple
  (Product price / Actual charge / Payment provider);
* the mandated disclosure sentence is this exact wording, on the backend and
  (via the drift guard in ``test_transactional_email_footer``) the frontend;
* nothing in the pricing path can consult an exchange rate — the FX reference
  is display-only by construction.
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
    currency_info,
    format_money,
    published_payment_amounts,
    resolve_payment_price,
    transparency_lines,
)
from app.core.permissions import (
    PLAN_ANNUAL_PRICES_USD,
    PLAN_BILLING_AVAILABILITY,
    PLAN_PRICES_USD,
)


# ── canonical USD product pricing (unchanged by anything NGN-related) ────────


def test_canonical_usd_price_list():
    assert PRODUCT_CURRENCY == "USD"
    assert PLAN_PRICES_USD["free"] == 0
    assert PLAN_PRICES_USD["pro"] == 39
    assert PLAN_ANNUAL_PRICES_USD["pro"] == 390
    assert PLAN_ANNUAL_PRICES_USD["enterprise"] is None  # custom — never a number
    assert PLAN_BILLING_AVAILABILITY["enterprise"] == "contact_sales"
    assert PLAN_BILLING_AVAILABILITY["pro"] == "self_serve"


def test_product_price_minor_units_are_usd_cents():
    monthly = resolve_payment_price("pro", MONTHLY)
    annual = resolve_payment_price("pro", ANNUAL)
    assert monthly.product_currency == "USD"
    assert monthly.product_amount == 3900
    assert annual.product_amount == 39000


# ── explicit NGN payment prices ───────────────────────────────────────────────


def test_default_ngn_catalog_is_explicit_not_usd_minor_units():
    """The published defaults are business decisions, not USD figures reused.

    A deployment that "forgot" to translate would charge 3,900 kobo (₦39!) as
    Naira — this test exists to make sure that number can never reappear as a
    payment price.
    """
    assert settings.PAYSTACK_NGN_PLAN_PRICES == {
        "pro": {"monthly": 6000000, "annual": 60000000}
    }
    monthly = resolve_payment_price("pro", MONTHLY)
    assert monthly.payment_currency == "NGN"
    assert monthly.payment_amount == 6_000_000
    assert monthly.payment_amount != monthly.product_amount
    annual = resolve_payment_price("pro", ANNUAL)
    assert annual.payment_amount == 60_000_000
    assert checkout_amount("pro", MONTHLY) == 6_000_000


def test_enterprise_and_free_never_have_payment_prices():
    """Enterprise is Contact Sales, Free has nothing to charge."""
    for plan in ("enterprise", "free"):
        for interval in (MONTHLY, ANNUAL):
            price = resolve_payment_price(plan, interval)
            assert price.payment_amount is None
            assert price.is_configured is False
    with pytest.raises(PaymentPriceNotConfigured):
        checkout_amount("enterprise", MONTHLY)


def test_unpublished_ngn_price_disables_checkout_instead_of_guessing(monkeypatch):
    monkeypatch.setattr(settings, "PAYSTACK_NGN_PLAN_PRICES", None)
    price = resolve_payment_price("pro", MONTHLY)
    assert price.payment_amount is None
    assert price.is_configured is False
    assert checkout_ready() is False
    with pytest.raises(PaymentPriceNotConfigured):
        checkout_amount("pro", MONTHLY)
    # The product price is untouched: checkout stops, it does not reprice.
    assert price.product_amount == 3900


def test_usd_deployment_charges_the_product_price_directly(monkeypatch):
    """Future USD support is a config change, not a code change."""
    monkeypatch.setattr(settings, "PAYSTACK_CURRENCY", "USD")
    monthly = resolve_payment_price("pro", MONTHLY)
    assert monthly.payment_currency == "USD"
    assert monthly.payment_amount == 3900  # cents — same currency as the list
    assert monthly.is_configured is True
    assert checkout_ready() is True
    # With matching currencies there is nothing to disclose.
    assert currency_info()["notice"] is None
    assert currency_info()["differs_from_product_currency"] is False


# ── the mandatory transparency triple ────────────────────────────────────────


def test_transparency_triple_words_and_values():
    lines = transparency_lines("pro", MONTHLY)
    assert lines["product_price"] == "$39.00 (USD)"
    assert lines["actual_charge"] == "\u20a660,000.00 (NGN)"
    assert lines["payment_provider"] == "Paystack"
    assert lines["payment_provider"] == PAYMENT_PROVIDER
    assert PAYMENT_PROVIDER_DISPLAY.startswith(PAYMENT_PROVIDER)
    annual = transparency_lines("pro", ANNUAL)
    assert annual["product_price"] == "$390.00 (USD)"
    assert annual["actual_charge"] == "\u20a6600,000.00 (NGN)"


def test_enterprise_transparency_has_no_invented_numbers():
    lines = transparency_lines("enterprise", MONTHLY)
    assert lines["product_price"] is None  # custom pricing, never $0
    assert lines["actual_charge"] is None
    assert lines["payment_provider"] == PAYMENT_PROVIDER


def test_unpublished_amount_never_falls_back_to_a_number(monkeypatch):
    monkeypatch.setattr(settings, "PAYSTACK_NGN_PLAN_PRICES", None)
    assert transparency_lines("pro", MONTHLY)["actual_charge"] is None
    assert published_payment_amounts() == {}


def test_money_formatting_always_carries_the_iso_code():
    assert format_money(3900, "USD") == "$39.00 (USD)"
    assert format_money(6_000_000, "NGN") == "\u20a660,000.00 (NGN)"
    assert format_money(None, "NGN") == ""


# ── mandated disclosure wording ──────────────────────────────────────────────


def test_mandated_disclosure_sentence():
    assert (
        NGN_CURRENCY_NOTICE
        == "RELIASTRA's plans are priced in USD. Our current Paystack payment "
        "flow processes payments in NGN. We are working toward enabling USD "
        "payment options for our global customers."
    )
    assert CURRENCY_NOTICES["NGN"] == NGN_CURRENCY_NOTICE
    # The sentence names all three facts: USD pricing, NGN charging, USD future.
    for required in ("USD", "NGN", "Paystack"):
        assert required in NGN_CURRENCY_NOTICE


def test_currency_info_embeds_provider_and_catalog():
    info = currency_info()
    assert info["payment_provider"] == "Paystack"
    assert info["checkout_ready"] is True
    assert info["plan_payment_amounts"]["pro"]["monthly"] == "\u20a660,000.00 (NGN)"
    assert info["plan_payment_amounts"]["pro"]["annual"] == "\u20a6600,000.00 (NGN)"


# ── architecture guard: the FX reference is display-only ─────────────────────


#: (module, banned import substrings). The pricing core and the legacy plan
#: list may not touch the display layer at all; the billing service may import
#: the display aggregator for RESPONSES but must never read the FX module
#: directly, and its amounts are proven rate-independent behaviourally below.
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
def test_price_resolution_never_imports_or_reads_fx(relative, banned):
    """No module on the charge path may consult the FX reference.

    Static guard: the amount sent to Paystack must remain a function of the
    published catalog alone. A "multiply by the fetched rate" shortcut would
    silently reprice every checkout and is rejected here, at review time,
    before it can ship.
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
        f"{relative} must not import the FX layer — rates are display "
        "context and can never feed a charge."
    )
    # No call into the FX module anywhere in the pricing-path source.
    assert "fx_reference_payload(" not in source


def test_charge_amount_is_immutable_under_any_fx_value():
    """Behavioural twin of the import guard: pricing ignores FX entirely."""
    from app.core import fx_reference

    assert "fx" not in {p.lower() for p in inspect.signature(resolve_payment_price).parameters}

    async def _no_rate():  # even a working source must not move the number
        return {"rate": 1_000_000.0, "available": True}

    original = fx_reference.fx_reference_payload
    fx_reference.fx_reference_payload = _no_rate
    try:
        assert checkout_amount("pro", MONTHLY) == 6_000_000
    finally:
        fx_reference.fx_reference_payload = original
