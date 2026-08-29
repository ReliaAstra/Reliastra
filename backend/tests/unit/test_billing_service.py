import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.config import settings
from app.core.permissions import Plan
from app.modules.billing.schemas import InitializePaymentRequest
from app.modules.billing.service import BillingService


@pytest.mark.asyncio
async def test_get_plan_details():
    repo = MagicMock()
    org_id = uuid.uuid4()
    fake_org = MagicMock(
        id=org_id,
        plan=Plan.PRO.value,
        created_at=datetime.now(timezone.utc) - timedelta(days=365),
    )
    fake_subscription = MagicMock(
        status="active",
        current_period_end=datetime.now(timezone.utc),
        billing_interval="monthly",
    )
    repo.get_org = AsyncMock(return_value=fake_org)
    repo.get_subscription = AsyncMock(return_value=fake_subscription)

    service = BillingService(repository=repo)
    res = await service.get_plan_details(AsyncMock(), org_id)

    assert res.plan == Plan.PRO.value
    assert res.subscription_status == "active"
    assert res.min_check_interval_seconds == 15
    assert res.max_dependencies == 50
    assert res.data_retention_days == 90


@pytest.mark.asyncio
async def test_initialize_payment(monkeypatch):
    org_id = uuid.uuid4()
    repository = MagicMock()
    repository.get_org = AsyncMock(
        return_value=MagicMock(id=org_id, plan=Plan.FREE.value)
    )
    client = MagicMock()
    client.initialize_transaction = AsyncMock(
        return_value={
            "status": True,
            "data": {
                "authorization_url": "https://checkout.paystack.com/test",
                "reference": "ref_test",
                "access_code": "access_test",
            },
        }
    )
    # The NGN charge amount is operator-published. Tests pin a value so the
    # assertion proves checkout sends *that* number in *that* currency, not a
    # converted (or leftover USD) one.
    monkeypatch.setattr(
        settings, "PAYSTACK_NGN_PLAN_PRICES", {"pro": {"monthly": 6000000}}
    )
    service = BillingService(repository=repository, client=client)
    response = await service.initialize_payment(
        AsyncMock(),
        org_id,
        InitializePaymentRequest(
            plan="pro", email="owner@example.com"
        ),
    )
    assert response.reference == "ref_test"
    assert response.currency == "NGN"
    assert response.amount_minor == 6000000
    client.initialize_transaction.assert_awaited_once()
    sent = client.initialize_transaction.await_args.kwargs
    assert sent["amount"] == 6000000
    assert sent["currency"] == "NGN"


@pytest.mark.asyncio
async def test_initialize_payment_refuses_without_published_price(monkeypatch):
    """Unpublished payment price => no Paystack transaction, ever."""
    import pytest

    from app.core.exceptions import ValidationException

    monkeypatch.setattr(settings, "PAYSTACK_NGN_PLAN_PRICES", None)
    org_id = uuid.uuid4()
    repository = MagicMock()
    repository.get_org = AsyncMock(
        return_value=MagicMock(id=org_id, plan=Plan.FREE.value)
    )
    client = MagicMock()
    client.initialize_transaction = AsyncMock()

    service = BillingService(repository=repository, client=client)
    with pytest.raises(ValidationException, match="being finalized"):
        await service.initialize_payment(
            AsyncMock(),
            org_id,
            InitializePaymentRequest(plan="pro", email="owner@example.com"),
        )
    client.initialize_transaction.assert_not_awaited()


@pytest.mark.asyncio
async def test_handle_webhook(monkeypatch):
    secret = "paystack-unit-secret"
    monkeypatch.setattr(settings, "PAYSTACK_SECRET_KEY", secret)
    payload = {"event": "unit.test", "data": {}}
    raw_body = b'{"event":"unit.test","data":{}}'
    signature = hmac.new(
        secret.encode(), raw_body, hashlib.sha512
    ).hexdigest()

    service = BillingService()
    response = await service.handle_webhook(
        AsyncMock(), payload, signature=signature, raw_body=raw_body
    )
    assert response.received is True
    assert response.event_type == "unit.test"
