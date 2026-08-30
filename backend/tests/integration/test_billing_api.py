import hashlib
import hmac
import json as _json

import pytest

from app.core.permissions import PLAN_DEPENDENCY_LIMITS, Plan

from app.config import settings


@pytest.mark.asyncio
async def test_billing_endpoints(async_client, auth_data, monkeypatch):
    headers = auth_data["headers"]

    plan_res = await async_client.get(
        "/v1/billing/plan", headers=headers
    )
    assert plan_res.status_code == 200, plan_res.text
    plan_data = plan_res.json()
    assert plan_data["plan"] == "free"
    # A newly-created free org is inside the 14-day trial, which grants
    # PRO limits. The stored plan stays "free"; only the effective
    # limits are lifted.
    assert plan_data["is_trial_active"] is True
    assert plan_data["max_dependencies"] == PLAN_DEPENDENCY_LIMITS[Plan.PRO.value]
    assert plan_data["subscription_status"] is None

    secret = "integration-paystack-secret"
    monkeypatch.setattr(settings, "PAYSTACK_SECRET_KEY", secret)
    body = b'{"event":"integration.test","data":{}}'
    signature = hmac.new(
        secret.encode(), body, hashlib.sha512
    ).hexdigest()
    webhook_res = await async_client.post(
        "/v1/billing/webhook",
        content=body,
        headers={
            "content-type": "application/json",
            "x-paystack-signature": signature,
        },
    )
    assert webhook_res.status_code == 200, webhook_res.text
    assert webhook_res.json()["received"] is True


# ── USD product price vs. NGN payment price: the Paystack contract ──────────
#
# What the backend sends to Paystack must be EXACTLY the published NGN amount
# and the explicit currency, and the persisted transaction must record what
# was actually charged. These are the acceptance tests for the pricing
# refactor: they read the actual HTTP body the Paystack client posts.
#
# Mechanics: the service constructs a fresh ``httpx.AsyncClient`` per call, so
# the tests swap in a subclass that installs a MockTransport — the already-
# built async_client (ASGITransport) is untouched, and everything the billing
# service sends upstream is captured verbatim.


import uuid as _uuid  # noqa: E402
from unittest.mock import (  # noqa: E402
    AsyncMock as _AsyncMock,
    MagicMock as _MagicMock,
)

import httpx as _httpx  # noqa: E402


def _intercept_paystack(monkeypatch):
    """Capture the JSON body POSTed to Paystack; answer with a mock success.

    Returns the capture dict — tests assert on ``captured["body"]``.
    """
    captured: dict = {"calls": []}

    async def handler(request: _httpx.Request) -> _httpx.Response:
        body = _json.loads(request.content) if request.content else {}
        captured["calls"].append((request.url.path, body))
        if request.url.path.endswith("/transaction/initialize"):
            ref = f"ref_{abs(hash(request.url.path)) % 10**8:08d}"
            captured["body"] = body
            captured["reference"] = ref
            return _httpx.Response(
                200,
                json={
                    "status": True,
                    "data": {
                        "authorization_url": f"https://checkout.paystack.com/{ref}",
                        "access_code": "mock-access",
                        "reference": ref,
                    },
                },
            )
        return _httpx.Response(404, json={"status": False})

    original = _httpx.AsyncClient

    class _Client(original):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = _httpx.MockTransport(handler)
            original.__init__(self, *args, **kwargs)

    monkeypatch.setattr("app.modules.billing.service.httpx.AsyncClient", _Client)
    # The module-level client captured the secret at import; patch the
    # instance so _headers() is satisfied for this test only.
    from app.modules.billing.service import paystack_client as _pc

    monkeypatch.setattr(_pc, "secret_key", "sk_test_capture")
    return captured


@pytest.mark.asyncio
async def test_initialize_sends_the_published_ngn_amount_and_currency(
    async_client, auth_data, monkeypatch
):
    captured = _intercept_paystack(monkeypatch)
    res = await async_client.post(
        "/v1/billing/initialize",
        headers=auth_data["headers"],
        json={"plan": "pro", "billing_interval": "monthly"},
    )
    assert res.status_code == 200, res.text
    body = captured["body"]
    # The exact Paystack contract: minor units of NGN + explicit currency.
    assert body["amount"] == 6_000_000
    assert body["currency"] == "NGN"
    assert body["amount"] != 3900, "USD minor units must never be billed as Naira"
    # Metadata carries both sides for reconciliation and the webhook path.
    meta = body["metadata"]
    assert meta["currency"] == "NGN"
    assert meta["amount_minor"] == "6000000"
    assert meta["product_currency"] == "USD"
    assert meta["product_amount_minor"] == "3900"
    payload = res.json()
    assert payload["amount_minor"] == 6_000_000
    assert payload["currency"] == "NGN"
    assert payload["amount_display"] == "\u20a660,000.00 (NGN)"
    assert payload["product_price_display"] == "$39.00 (USD)"
    assert payload["payment_provider"] == "Paystack"


@pytest.mark.asyncio
async def test_initialize_annual_uses_the_annual_payment_price(
    async_client, auth_data, monkeypatch
):
    captured = _intercept_paystack(monkeypatch)
    res = await async_client.post(
        "/v1/billing/initialize",
        headers=auth_data["headers"],
        json={"plan": "pro", "billing_interval": "annual"},
    )
    assert res.status_code == 200, res.text
    assert captured["body"]["amount"] == 60_000_000
    assert captured["body"]["currency"] == "NGN"


@pytest.mark.asyncio
async def test_enterprise_checkout_is_refused_without_creating_anything(
    async_client, auth_data, monkeypatch
):
    """Enterprise is Contact Sales — never a self-serve NGN checkout."""
    captured = _intercept_paystack(monkeypatch)
    res = await async_client.post(
        "/v1/billing/initialize",
        headers=auth_data["headers"],
        json={"plan": "enterprise"},
    )
    assert res.status_code == 422, res.text
    assert "contact sales" in res.text.lower() or "custom" in res.text.lower()
    inits = [c for c in captured["calls"] if "transaction/initialize" in c[0]]
    assert inits == [], "Paystack must not be called for Enterprise"


@pytest.mark.asyncio
async def test_unpublished_price_disables_checkout_instead_of_guessing(
    async_client, auth_data, monkeypatch
):
    """No published NGN price → honest refusal, never a USD-as-NGN charge."""
    captured = _intercept_paystack(monkeypatch)
    monkeypatch.setattr(settings, "PAYSTACK_NGN_PLAN_PRICES", None)
    res = await async_client.post(
        "/v1/billing/initialize",
        headers=auth_data["headers"],
        json={"plan": "pro", "billing_interval": "monthly"},
    )
    assert res.status_code == 422, res.text
    inits = [c for c in captured["calls"] if "transaction/initialize" in c[0]]
    assert inits == [], "no checkout may start without a published price"


@pytest.mark.asyncio
async def test_verify_persists_the_actual_charge_and_history_lists_it(
    async_client, auth_data, mocker
):
    """The customer-visible record of the payment is the provider's figure."""
    reference = f"ref_persist_{_uuid.uuid4().hex[:8]}"
    verify_result = {
        "status": True,
        "data": {
            "status": "success",
            "amount": 6_000_000,
            "currency": "NGN",
            "reference": reference,
            "id": 12345,
            "domain": "reliastra.com",
            "channel": "card",
            "gateway_reference": "GATEWAY-1",
            "paid_at": "2026-01-05T10:00:00+00:00",
            "transaction_date": "2026-01-05T10:00:00+00:00",
            "next_payment_date": "2026-02-05T10:00:00+00:00",
            "customer": {"customer_code": "CUS_X", "email": "owner@reliastra.com"},
            "metadata": {
                "org_id": auth_data["org_id"],
                "plan": "pro",
                "billing_interval": "monthly",
            },
        },
    }
    client = _MagicMock()
    client.verify_transaction = _AsyncMock(return_value=verify_result)
    mocker.patch("app.modules.billing.service.billing_service.client", client)

    res = await async_client.post(
        f"/v1/billing/verify?reference={reference}", headers=auth_data["headers"]
    )
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["verified"] is True
    assert payload["currency"] == "NGN"
    assert payload["amount_minor"] == 6_000_000
    assert payload["product_price_display"] == "$39.00 (USD)"

    hist = await async_client.get(
        "/v1/billing/transactions", headers=auth_data["headers"]
    )
    assert hist.status_code == 200, hist.text
    items = hist.json()["items"]
    row = next(t for t in items if t["reference"] == reference)
    assert row["charged_amount_minor"] == 6_000_000
    assert row["charged_currency"] == "NGN"
    assert row["charged_amount_display"] == "\u20a660,000.00 (NGN)"
    assert row["product_amount_minor"] == 3900
    assert row["product_currency"] == "USD"
    assert row["status"] == "success"
    assert row["provider"].lower() == "paystack"
    # Re-verifying the same reference must not double-book the charge.
    res2 = await async_client.post(
        f"/v1/billing/verify?reference={reference}", headers=auth_data["headers"]
    )
    assert res2.status_code == 200, res2.text
    hist2 = await async_client.get(
        "/v1/billing/transactions", headers=auth_data["headers"]
    )
    same = [t for t in hist2.json()["items"] if t["reference"] == reference]
    assert len(same) == 1, "one payment, one history row"


@pytest.mark.asyncio
async def test_refund_webhook_marks_the_persisted_transaction(
    async_client, auth_data, mocker, monkeypatch
):
    reference = f"ref_refund_{_uuid.uuid4().hex[:8]}"
    verify_result = {
        "status": True,
        "data": {
            "status": "success",
            "amount": 6_000_000,
            "currency": "NGN",
            "reference": reference,
            "paid_at": "2026-01-05T10:00:00+00:00",
            "customer": {"customer_code": "CUS_R"},
            "metadata": {
                "org_id": auth_data["org_id"],
                "plan": "pro",
                "billing_interval": "monthly",
            },
        },
    }
    client = _MagicMock()
    client.verify_transaction = _AsyncMock(return_value=verify_result)
    mocker.patch("app.modules.billing.service.billing_service.client", client)
    res = await async_client.post(
        f"/v1/billing/verify?reference={reference}", headers=auth_data["headers"]
    )
    assert res.status_code == 200, res.text

    secret = "refund-webhook-secret"
    monkeypatch.setattr(settings, "PAYSTACK_SECRET_KEY", secret)
    body = _json.dumps(
        {"event": "refund.processed", "data": {"transaction_reference": reference}}
    ).encode()
    signature = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    wh = await async_client.post(
        "/v1/billing/webhook",
        content=body,
        headers={
            "content-type": "application/json",
            "x-paystack-signature": signature,
        },
    )
    assert wh.status_code == 200, wh.text
    hist = await async_client.get(
        "/v1/billing/transactions", headers=auth_data["headers"]
    )
    row = next(t for t in hist.json()["items"] if t["reference"] == reference)
    assert row["status"] == "refunded"


@pytest.mark.asyncio
async def test_pricing_endpoint_transparency_triple(async_client):
    res = await async_client.get("/v1/pricing")
    assert res.status_code == 200
    data = res.json()
    pro = next(p for p in data["plans"] if p["plan"] == "pro")
    assert pro["transparency"]["monthly"]["product_price"] == "$39.00 (USD)"
    assert pro["transparency"]["monthly"]["actual_charge"] == "\u20a660,000.00 (NGN)"
    assert pro["transparency"]["monthly"]["payment_provider"] == "Paystack"
    ent = next(p for p in data["plans"] if p["plan"] == "enterprise")
    assert ent["billing_availability"] == "contact_sales"
    assert ent["transparency"]["monthly"]["actual_charge"] is None
    assert ent["price_usd"] == 0  # custom pricing: no numeric charge anywhere
    assert data["payment"]["payment_provider"] == "Paystack"
