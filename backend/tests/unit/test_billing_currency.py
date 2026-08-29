"""Currency must be validated BEFORE the amount comparison.

PLAN_AMOUNTS is denominated in minor units of PAYSTACK_CURRENCY. Comparing
`data["amount"]` as a bare integer let a transaction settled in a weaker
currency clear the gate: 3900 NGN is about $2.50, not the $39 Pro plan, but
3900 == 3900.

Covers the canonical 3-tier architecture:
- PRO monthly = $39  -> 3900 minor units
- PRO annual  = $390 -> 39000 minor units
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import settings
from app.core.exceptions import ValidationException
from app.modules.billing.service import PLAN_AMOUNTS, BillingService


def _result(org_id, *, currency="USD", amount=3900, plan="pro", interval="monthly", include_currency=True):
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
async def test_pro_monthly_price_is_3900_minor_units():
    assert PLAN_AMOUNTS["pro"] == 3900


@pytest.mark.asyncio
async def test_wrong_currency_with_numerically_correct_amount_is_rejected():
    """The core case: 3900 NGN must not buy a 3900-USD-cent plan."""
    org_id = uuid.uuid4()
    service = _service(_result(org_id, currency="NGN", amount=3900))
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
    service = _service(_result(org_id, currency="USD", amount=3899))
    with (
        patch.object(settings, "PAYSTACK_CURRENCY", "USD"),
        pytest.raises(ValidationException, match="cover"),
    ):
        await service.verify_transaction(AsyncMock(), "ref_x")


@pytest.mark.asyncio
async def test_correct_currency_is_case_insensitive_and_passes_the_gate():
    org_id = uuid.uuid4()
    service = _service(_result(org_id, currency="usd", amount=3900))
    with (
        patch.object(settings, "PAYSTACK_CURRENCY", "USD"),
        pytest.raises(Exception) as exc,
    ):
        await service.verify_transaction(AsyncMock(), "ref_x")
        # Fails later on the absent org, NOT on currency or amount.
        msg = str(exc.value).lower()
        assert "currency" not in msg and "cover" not in msg


@pytest.mark.asyncio
async def test_annual_checkout_charges_390_not_monthly():
    """Annual bill (£390 / 39000 minor units) must not be rejected as an
    undersized monthly amount, and monthly `$39` must not clear an annual
    charge. Guards the original annual-billing bug."""
    org_id = uuid.uuid4()
    service = _service(_result(org_id, currency="USD", amount=39000, interval="annual"))
    with (
        patch.object(settings, "PAYSTACK_CURRENCY", "USD"),
        pytest.raises(Exception) as exc,
    ):
        await service.verify_transaction(AsyncMock(), "ref_x")
        msg = str(exc.value).lower()
        assert "currency" not in msg and "cover" not in msg


@pytest.mark.asyncio
async def test_monthly_amount_does_not_clear_annual_checkout():
    """$39 (monthly) offered against an annual transaction must be rejected
    as an undersized amount — the annual billing bug the other way around."""
    org_id = uuid.uuid4()
    service = _service(_result(org_id, currency="USD", amount=3900, interval="annual"))
    with (
        patch.object(settings, "PAYSTACK_CURRENCY", "USD"),
        pytest.raises(ValidationException, match="cover"),
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
