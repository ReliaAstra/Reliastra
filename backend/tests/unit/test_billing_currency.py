"""The plan-price check is denominated in PAYSTACK_CURRENCY minor units.

Comparing `data["amount"]` without checking `data["currency"]` let a
transaction settled in a weaker currency clear the amount gate (9900 NGN is
about $6, not $99) and unlock a paid tier.
"""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.config import settings
from app.core.exceptions import ValidationException
from app.modules.billing.service import BillingService


def _paystack_result(org_id, *, currency, amount=9900):
    return {
        "status": True,
        "data": {
            "status": "success",
            "amount": amount,
            "currency": currency,
            "reference": "ref_x",
            "metadata": {"org_id": str(org_id), "plan": "professional"},
            "customer": {"customer_code": "CUS_1"},
        },
    }


@pytest.mark.asyncio
async def test_mismatched_currency_is_rejected():
    org_id = uuid.uuid4()
    client = MagicMock()
    client.verify_transaction = AsyncMock(
        return_value=_paystack_result(org_id, currency="NGN")
    )
    service = BillingService(repository=MagicMock(), client=client)

    with patch.object(settings, "PAYSTACK_CURRENCY", "USD"):
        with pytest.raises(ValidationException, match="currency"):
            await service.verify_transaction(AsyncMock(), "ref_x")


@pytest.mark.asyncio
async def test_matching_currency_passes_the_currency_gate():
    """Same amount in the expected currency must get past the currency check."""
    org_id = uuid.uuid4()
    client = MagicMock()
    client.verify_transaction = AsyncMock(
        return_value=_paystack_result(org_id, currency="USD")
    )
    repo = MagicMock()
    repo.get_org = AsyncMock(return_value=None)  # stop right after the gate
    service = BillingService(repository=repo, client=client)

    with patch.object(settings, "PAYSTACK_CURRENCY", "USD"):
        # Fails later on the missing org, NOT on the currency check.
        with pytest.raises(Exception) as exc:
            await service.verify_transaction(AsyncMock(), "ref_x")
        assert "currency" not in str(exc.value).lower()
