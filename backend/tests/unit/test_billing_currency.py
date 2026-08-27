"""Currency must be validated BEFORE the amount comparison.

PLAN_AMOUNTS is denominated in minor units of PAYSTACK_CURRENCY. Comparing
`data["amount"]` as a bare integer let a transaction settled in a weaker
currency clear the gate: 9900 NGN is about $6, not the $99 Professional
plan, but 9900 == 9900.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import settings
from app.core.exceptions import ValidationException
from app.modules.billing.service import PLAN_AMOUNTS, BillingService


def _result(org_id, *, currency="USD", amount=9900, include_currency=True):
    data = {
        "status": "success",
        "amount": amount,
        "reference": "ref_x",
        "metadata": {"org_id": str(org_id), "plan": "professional"},
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
async def test_professional_price_is_9900_minor_units():
    assert PLAN_AMOUNTS["professional"] == 9900


@pytest.mark.asyncio
async def test_wrong_currency_with_numerically_correct_amount_is_rejected():
    """The core case: 9900 NGN must not buy a 9900-USD-cent plan."""
    org_id = uuid.uuid4()
    service = _service(_result(org_id, currency="NGN", amount=9900))
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
    service = _service(_result(org_id, currency="USD", amount=9899))
    with (
        patch.object(settings, "PAYSTACK_CURRENCY", "USD"),
        pytest.raises(ValidationException, match="cover"),
    ):
        await service.verify_transaction(AsyncMock(), "ref_x")


@pytest.mark.asyncio
async def test_correct_currency_is_case_insensitive_and_passes_the_gate():
    org_id = uuid.uuid4()
    service = _service(_result(org_id, currency="usd", amount=9900))
    with (
        patch.object(settings, "PAYSTACK_CURRENCY", "USD"),
        pytest.raises(Exception) as exc,
    ):
        await service.verify_transaction(AsyncMock(), "ref_x")
        # Fails later on the absent org, NOT on currency or amount.
        msg = str(exc.value).lower()
        assert "currency" not in msg and "cover" not in msg


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
