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


def _stub_fx_rate(monkeypatch, rate):
    """Pin the live exchange rate the checkout converts at (None = unavailable)."""
    from app.core import fx_reference

    async def _fetch(*_a, **_k):
        if rate is None:
            return None
        return {
            "available": True,
            "source_currency": "USD",
            "payment_currency": "NGN",
            "rate": rate,
            "source_timestamp": "Sun, 30 Aug 2026 00:00:00 +0000",
            "retrieved_at": "2026-08-30T00:00:00Z",
            "provider": "ExchangeRate-API",
            "provider_url": "https://www.exchangerate-api.com",
            "source_url": "https://open.er-api.com/v6/latest/USD",
            "label": "Exchange rate (converts your USD price to NGN)",
            "disclaimer": "d",
        }

    async def _none(*_a, **_k):
        return None

    async def _noop(*_a, **_k):
        return None

    monkeypatch.setattr(fx_reference, "_fetch_rate", _fetch)
    monkeypatch.setattr(fx_reference, "_cache_read", _none)
    monkeypatch.setattr(fx_reference, "_cache_store", _noop)
    fx_reference._memory_cache = None


@pytest.mark.asyncio
async def test_get_plan_details():
    repo = MagicMock()
    org_id = uuid.uuid4()
    fake_org = MagicMock(
        id=org_id,
        plan=Plan.PRO.value,
        created_at=datetime.now(timezone.utc) - timedelta(days=365),
    )
    # NOTE: `name` is reserved by MagicMock at construction (it names the
    # mock); assign afterwards so org.name resolves to a real string.
    fake_org.name = "Test Org"
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
    # The NGN charge amount is the USD price converted at the live rate. Pin
    # the rate so the assertion proves checkout sends *that* conversion in
    # *that* currency, not a leftover USD figure.
    _stub_fx_rate(monkeypatch, 1322.0)
    # The payer address is resolved from organization membership, not taken from
    # the request, so the identity lookups are stubbed to answer as they would
    # for a real member. (tests/integration/test_checkout_flow.py covers the
    # refusal for an address that belongs to no member - this test is about the
    # amount.)
    from app.modules.organizations.repository import OrganizationRepository
    from app.modules.users.repository import UserRepository

    member = MagicMock(user_id=uuid.uuid4(), role="owner")
    owner_user = MagicMock(id=member.user_id, email="owner@example.com")
    monkeypatch.setattr(
        OrganizationRepository, "list_members", AsyncMock(return_value=[member])
    )
    monkeypatch.setattr(UserRepository, "get_by_id", AsyncMock(return_value=owner_user))
    monkeypatch.setattr(
        UserRepository, "get_by_email", AsyncMock(return_value=owner_user)
    )

    service = BillingService(repository=repository, client=client)
    response = await service.initialize_payment(
        AsyncMock(),
        org_id,
        InitializePaymentRequest(
            plan="pro", email="owner@example.com", terms_accepted=True
        ),
    )
    assert response.reference == "ref_test"
    assert response.currency == "NGN"
    assert response.amount_minor == 2_511_800
    client.initialize_transaction.assert_awaited_once()
    sent = client.initialize_transaction.await_args.kwargs
    assert sent["amount"] == 2_511_800
    assert sent["currency"] == "NGN"


@pytest.mark.asyncio
async def test_initialize_payment_refuses_without_a_rate(monkeypatch):
    """No exchange rate => no Paystack transaction, ever."""
    import pytest

    from app.core.exceptions import ValidationException

    _stub_fx_rate(monkeypatch, None)
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
            InitializePaymentRequest(plan="pro", email="owner@example.com", terms_accepted=True),
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
