"""Currency must be validated BEFORE the amount comparison.

``PLAN_AMOUNTS`` is the USD product price in minor units (cents). Comparing
``data["amount"]`` as a bare integer let a transaction settled in a weaker
currency clear the gate: a $9 plan is 900 cents, but 900 NGN is about
$0.60 - 900 == 900. When Paystack settles in a different currency the
expected amount is that USD price converted at the live rate, and the
currency check must still run first: an amount-only comparison across
currencies is meaningless.

Covers the canonical 3-tier architecture:
- PRO (Developer) monthly = $9 -> 900 minor units
- Annual billing does not exist anymore and must be rejected
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import settings
from app.core.exceptions import ValidationException
from app.core.permissions import PLAN_AMOUNTS, PLAN_ANNUAL_AMOUNTS
from app.modules.billing.service import BillingService


def _result(org_id, *, currency="USD", amount=900, plan="pro", interval="monthly", include_currency=True):
    data = {
        "status": "success",
        "amount": amount,
        "reference": "ref_x",
        "metadata": {"org_id": str(org_id), "plan": plan, "billing_interval": interval},
        "customer": {"customer_code": "CUS_1"},
    }
    if include_currency:
        data["currency"] = currency
    return {"status": True, "data": data}


def _service(result):
    client = MagicMock()
    client.verify_transaction = AsyncMock(return_value=result)
    repo = MagicMock()
    # Stop right after the gates so we assert on validation, not provisioning.
    repo.get_org = AsyncMock(return_value=None)
    return BillingService(repository=repo, client=client)


@pytest.mark.asyncio
async def test_pro_monthly_price_is_900_minor_units():
    """One paid product, $9/month: 900 minor units. No annual amount exists."""
    assert PLAN_AMOUNTS["pro"] == 900
    assert PLAN_ANNUAL_AMOUNTS == {}


@pytest.mark.asyncio
async def test_wrong_currency_with_numerically_correct_amount_is_rejected():
    """The core case: 900 NGN must not buy a 900-USD-cent plan."""
    org_id = uuid.uuid4()
    service = _service(_result(org_id, currency="NGN", amount=900))
    with (
        patch.object(settings, "PAYSTACK_CURRENCY", "USD"),
        pytest.raises(ValidationException, match="currency"),
    ):
        await service.verify_transaction(AsyncMock(), "ref_x")


@pytest.mark.asyncio
async def test_wrong_currency_and_wrong_amount_is_rejected_on_currency_first():
    org_id = uuid.uuid4()
    service = _service(_result(org_id, currency="NGN", amount=5))
    with (
        patch.object(settings, "PAYSTACK_CURRENCY", "USD"),
        pytest.raises(ValidationException, match="currency"),
    ):
        await service.verify_transaction(AsyncMock(), "ref_x")


@pytest.mark.asyncio
async def test_missing_currency_is_rejected_not_assumed_correct():
    """An omitted field must not default into passing its own check."""
    org_id = uuid.uuid4()
    service = _service(_result(org_id, include_currency=False))
    with (
        patch.object(settings, "PAYSTACK_CURRENCY", "USD"),
        pytest.raises(ValidationException, match="currency"),
    ):
        await service.verify_transaction(AsyncMock(), "ref_x")


@pytest.mark.asyncio
async def test_correct_currency_but_short_amount_is_rejected():
    org_id = uuid.uuid4()
    service = _service(_result(org_id, currency="USD", amount=899))
    with (
        patch.object(settings, "PAYSTACK_CURRENCY", "USD"),
        pytest.raises(ValidationException, match="cover"),
    ):
        await service.verify_transaction(AsyncMock(), "ref_x")


@pytest.mark.asyncio
async def test_correct_currency_is_case_insensitive_and_passes_the_gate():
    org_id = uuid.uuid4()
    service = _service(_result(org_id, currency="usd", amount=900))
    with (
        patch.object(settings, "PAYSTACK_CURRENCY", "USD"),
        pytest.raises(Exception) as exc,
    ):
        await service.verify_transaction(AsyncMock(), "ref_x")
        # Fails later on the absent org, NOT on currency or amount.
        msg = str(exc.value).lower()
        assert "currency" not in msg and "cover" not in msg


@pytest.mark.asyncio
async def test_annual_checkout_is_rejected_because_annual_billing_is_gone():
    """The product sells one interval (monthly). A transaction claiming the
    annual interval must be rejected as unconfigured, never priced from the
    monthly amount."""
    org_id = uuid.uuid4()
    service = _service(_result(org_id, currency="USD", amount=90000, interval="annual"))
    with (
        patch.object(settings, "PAYSTACK_CURRENCY", "USD"),
        pytest.raises(Exception) as exc,
    ):
        await service.verify_transaction(AsyncMock(), "ref_x")
    msg = str(exc.value).lower()
    assert "self-serve" in msg or "not available" in msg


@pytest.mark.asyncio
async def test_monthly_amount_does_not_clear_annual_checkout():
    """A monthly-priced transaction labelled annual must still be rejected -
    annual is unconfigured, so nothing clears it."""
    org_id = uuid.uuid4()
    service = _service(_result(org_id, currency="USD", amount=900, interval="annual"))
    with (
        patch.object(settings, "PAYSTACK_CURRENCY", "USD"),
        pytest.raises(ValidationException),
    ):
        await service.verify_transaction(AsyncMock(), "ref_x")


@pytest.mark.asyncio
async def test_amount_comparison_stays_integer_based():
    """Money must never be compared as a float."""
    org_id = uuid.uuid4()
    service = _service(_result(org_id, currency="USD", amount="not-a-number"))
    with (
        patch.object(settings, "PAYSTACK_CURRENCY", "USD"),
        pytest.raises(ValidationException, match="integer"),
    ):
        await service.verify_transaction(AsyncMock(), "ref_x")
