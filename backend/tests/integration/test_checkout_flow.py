"""The RELIASTRA-owned checkout, end to end, against the real request path.

These tests are the payment-shaped version of a rule stated elsewhere in this
repository: the browser displays, the backend decides. Every case below asserts
on what actually went to Paystack and what was persisted, because a checkout
page can look perfect while asking for the wrong amount.

Coverage, in the order the customer meets it:

* the quote is the only thing the page needs, is priced from the same
  resolution as the transaction, and refuses to offer checkout it cannot honour;
* the transaction is opened with the published amount, the processing currency,
  a card-only channel array, and no provider plan code;
* a client that volunteers an amount, a currency or a method is ignored or
  refused, never obeyed;
* verification is what activates a subscription — cross-organization, replayed,
  underpaid, wrong-currency and unsupported-channel payments all end in a
  classified refusal with the plan unchanged;
* the persisted record states what was charged (amount, currency, reference,
  verified-at) and later repricing cannot rewrite it.
"""

from __future__ import annotations

import json as _json
import uuid as _uuid
from typing import Any
from unittest.mock import AsyncMock as _AsyncMock, MagicMock as _MagicMock

import pytest

from app.core.checkout_reasons import CheckoutReason
from app.core.payment_channels import INTERNATIONAL_CARD_METHOD_ID

from tests.helpers import register_and_verify


def _paystack_verify_success(**overrides: Any) -> dict[str, Any]:
    """A provider verification response, in the shape Paystack actually returns."""
    data: dict[str, Any] = {
        "status": "success",
        "amount": 6_000_000,
        "currency": "NGN",
        "channel": "card",
        "reference": overrides.pop("reference", "ref_x"),
        "paid_at": "2026-01-05T10:00:00+00:00",
        "transaction_date": "2026-01-05T10:00:00+00:00",
        "receipt_number": "RS-1234",
        "gateway_reference": "GATEWAY-1",
        "customer": {"customer_code": "CUS_1", "email": "owner@reliastra.com"},
        "authorization": {
            "authorization_code": "AUTH_1",
            "brand": "VISA",
            "last4": "4242",
            "country_code": "US",
        },
    }
    data.update(overrides)
    return {"status": True, "data": data}


def _stub_verify(monkeypatch, result: dict[str, Any]) -> _MagicMock:
    client = _MagicMock()
    client.verify_transaction = _AsyncMock(return_value=result)
    monkeypatch.setattr(
        "app.modules.billing.service.billing_service.client", client
    )
    return client


@pytest.fixture(autouse=True)
def _provider_is_configured(monkeypatch):
    """Checkout is offered only when a provider can actually be reached.

    The test settings deliberately ship without Paystack credentials, and the
    quote gates on them — correctly, since a page that promises a payment it
    cannot take is worse than one that says so. These tests are about the quote
    and the transaction, so they configure the pair the way a deployment would.
    """
    from app.config import settings

    monkeypatch.setattr(settings, "PAYSTACK_SECRET_KEY", "sk_test_integration")
    monkeypatch.setattr(settings, "PAYSTACK_PUBLIC_KEY", "pk_test_integration")


@pytest.fixture
def _fresh_fx_cache(monkeypatch):
    """Read the rate as if nothing were cached, and cache nothing afterwards.

    The shared test Redis outlives a single test, and an FX lookup failure is
    cached on purpose in production; without this, whichever FX test ran first
    would decide what the second one saw.
    """
    from app.core import fx_reference as fx

    async def _none():
        return None

    async def _store(*_a, **_k):
        return None

    monkeypatch.setattr(fx, "_cache_read", _none)
    monkeypatch.setattr(fx, "_cache_store", _store)


async def _second_organization(async_client) -> dict[str, Any]:
    body = await register_and_verify(
        async_client,
        {
            "email": f"org2-{_uuid.uuid4().hex[:8]}@reliastra.com",
            "password": "SecurePassword123!",
            "full_name": "Second Org",
            "org_name": "Second Reliastra Org",
        },
    )
    return {
        "headers": {
            "Authorization": f"Bearer {body['tokens']['access_token']}",
            "X-Organization-ID": body["organization"]["id"],
        },
        "org_id": body["organization"]["id"],
    }


# ── The quote ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_quote_is_the_render_model_and_offers_card_only(
    async_client, auth_data
):
    res = await async_client.get(
        "/v1/billing/checkout/quote?plan=pro&interval=monthly",
        headers=auth_data["headers"],
    )
    assert res.status_code == 200, res.text
    quote = res.json()
    # The transparency triple, as strings, from the server.
    assert quote["product_price_display"] == "$39.00 (USD)"
    assert quote["payment_amount_display"] == "\u20a660,000.00 (NGN)"
    assert quote["payment_provider"] == "Paystack"
    assert quote["payment_currency"] == "NGN"
    assert quote["product_currency"] == "USD"
    # The disclosure the page must reproduce verbatim.
    assert "priced in USD" in quote["currency_notice"]
    # A global customer is offered exactly one rail.
    assert quote["channels"] == ["card"]
    assert [m["id"] for m in quote["payment_methods"]] == [INTERNATIONAL_CARD_METHOD_ID]
    assert quote["payment_methods"][0]["handles_card_data"] == "provider"
    # Identity the page must not have to ask anyone else for.
    assert quote["billing_email"] == auth_data["email"]
    assert quote["organization_name"] == "Reliastra Test Org"
    assert quote["available"] is True
    assert quote["unavailable_reason"] is None
    assert quote["price_token"]


@pytest.mark.asyncio
async def test_fx_reference_is_labelled_context_and_never_prices_the_charge(
    async_client, auth_data, monkeypatch, _fresh_fx_cache
):
    """A rate may be shown; it must never decide anything.

    Stubbed to an absurd figure on purpose: if any part of pricing consulted the
    FX reference, the quoted charge would move with it. It does not, because the
    charge comes from the published price list and the rate is decoration with
    a source and a timestamp attached.
    """

    async def _absurd(*_a, **_k):
        return {
            "available": True,
            "source_currency": "USD",
            "payment_currency": "NGN",
            "rate": 999999.0,
            "source_timestamp": "Sun, 30 Aug 2026 00:00:00 +0000",
            "retrieved_at": "2026-08-30T00:00:00Z",
            "provider": "Test Source",
            "provider_url": "https://example.test",
            "label": "Exchange rate reference (estimate \u2014 not the price you pay)",
            "disclaimer": (
                "Exchange rate shown is a market reference estimate only. It is "
                "provided for context and is never used to determine your actual "
                "charge."
            ),
        }

    monkeypatch.setattr("app.core.fx_reference._fetch_rate", _absurd)
    quote = (
        await async_client.get(
            "/v1/billing/checkout/quote?plan=pro", headers=auth_data["headers"]
        )
    ).json()
    assert quote["fx_reference"]["rate"] == 999999.0
    assert quote["fx_reference"]["provider"] == "Test Source"
    assert quote["fx_reference"]["source_timestamp"]
    assert "never used to determine your actual charge" in quote["fx_reference"]["disclaimer"]
    # And the charge is the published price, untouched.
    assert quote["payment_amount_minor"] == 6_000_000


@pytest.mark.asyncio
async def test_no_fx_source_means_no_estimate_shown(
    async_client, auth_data, monkeypatch, _fresh_fx_cache
):
    """Unreachable rate \u2192 the field is null, never a stale or invented number."""

    async def _down(*_a, **_k):
        return None

    monkeypatch.setattr("app.core.fx_reference._fetch_rate", _down)
    quote = (
        await async_client.get(
            "/v1/billing/checkout/quote?plan=pro", headers=auth_data["headers"]
        )
    ).json()
    assert quote["fx_reference"] is None
    assert quote["payment_amount_minor"] == 6_000_000
    assert quote["available"] is True


@pytest.mark.asyncio
async def test_annual_quote_prices_the_year_not_twelve_months(async_client, auth_data):
    res = await async_client.get(
        "/v1/billing/checkout/quote?plan=pro&interval=annual",
        headers=auth_data["headers"],
    )
    assert res.status_code == 200, res.text
    quote = res.json()
    assert quote["billing_interval"] == "annual"
    assert quote["period_word"] == "year"
    assert quote["product_price_display"] == "$390.00 (USD)"
    assert quote["payment_amount_display"] == "\u20a6600,000.00 (NGN)"


@pytest.mark.asyncio
async def test_quote_refuses_to_offer_checkout_it_cannot_honour(
    async_client, auth_data, monkeypatch
):
    """No price published for the processing currency → no CTA, and no number.

    The alternative is a page that quotes the customer a figure the business has
    never published, and a Paystack transaction that either fails or bills them
    for something nobody priced.
    """
    from app.config import settings

    monkeypatch.setattr(settings, "PAYSTACK_NGN_PLAN_PRICES", None)
    res = await async_client.get(
        "/v1/billing/checkout/quote?plan=pro", headers=auth_data["headers"]
    )
    assert res.status_code == 200, res.text
    quote = res.json()
    assert quote["available"] is False
    assert quote["unavailable_reason"] == CheckoutReason.PRICE_NOT_CONFIGURED
    assert quote["payment_amount_display"] is None
    assert "being finalized" in quote["unavailable_message"]


@pytest.mark.asyncio
async def test_quote_routes_enterprise_to_a_human(async_client, auth_data):
    res = await async_client.get(
        "/v1/billing/checkout/quote?plan=enterprise", headers=auth_data["headers"]
    )
    assert res.status_code == 200, res.text
    quote = res.json()
    assert quote["available"] is False
    assert quote["unavailable_reason"] == CheckoutReason.PLAN_NOT_SELFSERVE
    assert quote["product_price_display"] is None


@pytest.mark.asyncio
async def test_quote_requires_a_session(async_client):
    res = await async_client.get("/v1/billing/checkout/quote?plan=pro")
    assert res.status_code == 401, res.text


# ── What goes to Paystack ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_transaction_is_opened_with_a_card_only_channel_array(
    async_client, auth_data, monkeypatch
):
    from tests.integration.test_billing_api import _intercept_paystack

    from app.config import settings

    monkeypatch.setattr(settings, "PAYSTACK_PUBLIC_KEY", "pk_test_public")
    monkeypatch.setattr(settings, "PAYSTACK_SECRET_KEY", "sk_test_do_not_echo_me")
    captured = _intercept_paystack(monkeypatch)
    quote = (
        await async_client.get(
            "/v1/billing/checkout/quote?plan=pro", headers=auth_data["headers"]
        )
    ).json()
    res = await async_client.post(
        "/v1/billing/initialize",
        headers=auth_data["headers"],
        json={
            "plan": "pro",
            "billing_interval": "monthly",
            "payment_method": INTERNATIONAL_CARD_METHOD_ID,
            "expected_price_token": quote["price_token"],
        },
    )
    assert res.status_code == 200, res.text
    body = captured["body"]
    assert body["channels"] == ["card"], "the wire must not offer a local rail"
    assert body["amount"] == 6_000_000
    assert body["currency"] == "NGN"
    assert "plan" not in body, "a plan code would override the amount"
    payload = res.json()
    assert payload["channels"] == ["card"]
    assert payload["access_code"]
    assert payload["inline_js_enabled"] is True
    assert payload["inline_js_url"] == "https://js.paystack.co/v1/inline.js"
    # The public key only: the secret never appears in a response body.
    assert payload["public_key"] == "pk_test_public"
    assert "secret" not in _json.dumps(payload).lower()
    assert "sk_test_do_not_echo_me" not in _json.dumps(payload)


@pytest.mark.asyncio
async def test_without_a_public_key_the_hosted_page_is_still_payable(
    async_client, auth_data, monkeypatch
):
    """One rail less, not one customer less.

    The popup needs the publishable key. Without it the response still carries
    the transaction's authorization URL, so the checkout completes on Paystack's
    hosted page and returns to the same RELIASTRA verification \u2014 the payment
    must never depend on a browser feature we could not enable.
    """
    from app.config import settings

    monkeypatch.setattr(settings, "PAYSTACK_PUBLIC_KEY", "")
    _intercept = __import__(
        "tests.integration.test_billing_api", fromlist=["_intercept_paystack"]
    )._intercept_paystack
    _intercept(monkeypatch)
    res = await async_client.post(
        "/v1/billing/initialize",
        headers=auth_data["headers"],
        json={"plan": "pro"},
    )
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["inline_js_enabled"] is False
    assert payload["authorization_url"]
    assert payload["access_code"]


@pytest.mark.asyncio
async def test_a_client_volunteering_an_amount_is_ignored_not_rejected(
    async_client, auth_data, monkeypatch
):
    """Pricing is not a client input, and a mismatch is not a client error.

    A body claiming ``amount: 1`` and ``currency: USD`` still opens the
    published NGN transaction. Rejecting it outright would be worse for real
    customers than ignoring it: older clients, extensions and a curl command in
    a support thread all send extra fields, and none of them may change what is
    charged. The field is simply not part of the contract.
    """
    from tests.integration.test_billing_api import _intercept_paystack

    captured = _intercept_paystack(monkeypatch)
    res = await async_client.post(
        "/v1/billing/initialize",
        headers=auth_data["headers"],
        json={
            "plan": "pro",
            "billing_interval": "monthly",
            "amount": 1,
            "currency": "USD",
            "channels": ["card", "bank", "ussd"],
            "email": "attacker@example.com",
        },
    )
    assert res.status_code == 200, res.text
    body = captured["body"]
    assert body["amount"] == 6_000_000
    assert body["currency"] == "NGN"
    assert body["channels"] == ["card"]
    # The payer identity is the organization's owner, not whoever the body named.
    assert body["email"] == "owner@reliastra.com"


@pytest.mark.asyncio
async def test_requesting_a_local_method_is_refused_before_paystack_sees_it(
    async_client, auth_data, monkeypatch
):
    from tests.integration.test_billing_api import _intercept_paystack

    captured = _intercept_paystack(monkeypatch)
    res = await async_client.post(
        "/v1/billing/initialize",
        headers=auth_data["headers"],
        json={"plan": "pro", "payment_method": "ussd"},
    )
    assert res.status_code == 409, res.text
    error = res.json()["error"]
    assert error["code"] == "CHECKOUT_FAILED"
    assert {"field": "reason", "issue": CheckoutReason.METHOD_UNAVAILABLE} in error["details"]
    inits = [c for c in captured["calls"] if "transaction/initialize" in c[0]]
    assert inits == [], "a refused method must never reach the gateway"


@pytest.mark.asyncio
async def test_a_stale_quote_stops_the_payment_instead_of_requoting_silently(
    async_client, auth_data, monkeypatch
):
    """The price moved while the page sat open: stop, do not charge.

    The customer approved the figure on screen. If the backend's published price
    no longer matches it, sending the new one anyway is a surprise charge, and
    sending the old one is charging below the list price. Either way the answer
    is to show the customer the current price and let them decide again.
    """
    from tests.integration.test_billing_api import _intercept_paystack

    captured = _intercept_paystack(monkeypatch)
    res = await async_client.post(
        "/v1/billing/initialize",
        headers=auth_data["headers"],
        json={"plan": "pro", "expected_price_token": "0" * 16},
    )
    assert res.status_code == 409, res.text
    error = res.json()["error"]
    assert {"field": "reason", "issue": CheckoutReason.QUOTE_STALE} in error["details"]
    assert "no money" in error["message"].lower() or "nothing has been charged" in error["message"].lower()
    inits = [c for c in captured["calls"] if "transaction/initialize" in c[0]]
    assert inits == []


@pytest.mark.asyncio
async def test_initialization_requires_a_session(async_client):
    res = await async_client.post("/v1/billing/initialize", json={"plan": "pro"})
    assert res.status_code == 401, res.text


# ── Verification decides entitlement ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_verified_payment_activates_and_records_who_and_when(
    async_client, auth_data, monkeypatch
):
    reference = f"ref_ok_{_uuid.uuid4().hex[:8]}"
    _stub_verify(
        monkeypatch,
        _paystack_verify_success(
            reference=reference,
            metadata={
                "org_id": auth_data["org_id"],
                "plan": "pro",
                "billing_interval": "monthly",
            },
        ),
    )
    res = await async_client.post(
        f"/v1/billing/verify?reference={reference}", headers=auth_data["headers"]
    )
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["verified"] is True
    assert payload["activated"] is True
    assert payload["duplicate_payment"] is False
    assert payload["period_word"] == "month"
    assert payload["amount_display"] == "\u20a660,000.00 (NGN)"

    plan = await async_client.get("/v1/billing/plan", headers=auth_data["headers"])
    assert plan.json()["plan"] == "pro"

    row = next(
        t
        for t in (
            await async_client.get(
                "/v1/billing/transactions", headers=auth_data["headers"]
            )
        ).json()["items"]
        if t["reference"] == reference
    )
    assert row["verified_at"], "verification time is part of the record"
    assert row["duplicate"] is False
    assert row["status"] == "success"
    assert row["charged_currency"] == "NGN"

    # Re-verifying is safe and states what happened, without re-activating.
    again = await async_client.post(
        f"/v1/billing/verify?reference={reference}", headers=auth_data["headers"]
    )
    assert again.status_code == 200, again.text
    body = again.json()
    assert body["verified"] is True
    # The plan did not change a second time, and the screen must not claim it did.
    assert body["activated"] is False
    assert body["duplicate_payment"] is False


@pytest.mark.asyncio
async def test_a_payment_for_another_organization_cannot_be_applied(
    async_client, auth_data, monkeypatch
):
    """The reference is not an entitlement token.

    Verification checks the payment belongs to the caller's organization — via
    the metadata the transaction was opened with, and via the customer record —
    before anything is activated, so a reference seen elsewhere buys nothing.
    """
    other = await _second_organization(async_client)
    reference = f"ref_theft_{_uuid.uuid4().hex[:8]}"
    _stub_verify(
        monkeypatch,
        _paystack_verify_success(
            reference=reference,
            metadata={
                "org_id": other["org_id"],
                "plan": "pro",
                "billing_interval": "monthly",
            },
        ),
    )
    res = await async_client.post(
        f"/v1/billing/verify?reference={reference}", headers=auth_data["headers"]
    )
    assert res.status_code == 403, res.text
    error = res.json()["error"]
    assert {"field": "reason", "issue": CheckoutReason.ORG_MISMATCH} in error["details"]
    # Deliberately vague about *whose* it is: an error that only fires for
    # existing references would let somebody walk the ID space and find out which
    # payments exist.
    assert "another organization" not in error["message"].lower()
    assert "nothing has been applied" in error["message"].lower()
    plan = await async_client.get("/v1/billing/plan", headers=auth_data["headers"])
    assert plan.json()["plan"] == "free", "someone else's payment must not upgrade us"


@pytest.mark.asyncio
async def test_underpaid_payment_is_not_activated(async_client, auth_data, monkeypatch):
    reference = f"ref_short_{_uuid.uuid4().hex[:8]}"
    _stub_verify(
        monkeypatch,
        _paystack_verify_success(
            reference=reference,
            amount=1000,
            metadata={
                "org_id": auth_data["org_id"],
                "plan": "pro",
                "billing_interval": "monthly",
            },
        ),
    )
    res = await async_client.post(
        f"/v1/billing/verify?reference={reference}", headers=auth_data["headers"]
    )
    assert res.status_code == 409, res.text
    error = res.json()["error"]
    assert {"field": "reason", "issue": CheckoutReason.AMOUNT_MISMATCH} in error["details"]
    # The message is RELIASTRA's sentence, not the provider's, and it never
    # claims the customer was not charged: they may well have been.
    assert "reconcile" in error["message"].lower()
    plan = await async_client.get("/v1/billing/plan", headers=auth_data["headers"])
    assert plan.json()["plan"] == "free"


@pytest.mark.asyncio
async def test_wrong_currency_payment_is_not_activated(
    async_client, auth_data, monkeypatch
):
    reference = f"ref_usd_{_uuid.uuid4().hex[:8]}"
    _stub_verify(
        monkeypatch,
        _paystack_verify_success(
            reference=reference,
            amount=3900,
            currency="USD",
            metadata={
                "org_id": auth_data["org_id"],
                "plan": "pro",
                "billing_interval": "monthly",
            },
        ),
    )
    res = await async_client.post(
        f"/v1/billing/verify?reference={reference}", headers=auth_data["headers"]
    )
    assert res.status_code == 409, res.text
    assert {
        "field": "reason",
        "issue": CheckoutReason.CURRENCY_MISMATCH,
    } in res.json()["error"]["details"]


@pytest.mark.asyncio
async def test_payment_over_an_unoffered_channel_is_not_activated(
    async_client, auth_data, monkeypatch
):
    """A bank transfer that arrived for a card-only plan is a support case.

    The customer is not punished for it — nothing is silently dropped — but the
    subscription is not flipped either, because the price of a local rail and
    the price of an international card charge are not the same transaction.
    """
    reference = f"ref_bank_{_uuid.uuid4().hex[:8]}"
    _stub_verify(
        monkeypatch,
        _paystack_verify_success(
            reference=reference,
            channel="bank",
            metadata={
                "org_id": auth_data["org_id"],
                "plan": "pro",
                "billing_interval": "monthly",
            },
        ),
    )
    res = await async_client.post(
        f"/v1/billing/verify?reference={reference}", headers=auth_data["headers"]
    )
    # 409: the payment is real, our records disagree about how it arrived, and no
    # retry from the browser resolves that. The reason slug is what lets the UI
    # say so without a support ticket.
    assert res.status_code == 409, res.text
    error = res.json()["error"]
    assert {"field": "reason", "issue": CheckoutReason.CHANNEL_POLICY} in error["details"]
    plan = await async_client.get("/v1/billing/plan", headers=auth_data["headers"])
    assert plan.json()["plan"] == "free"


@pytest.mark.asyncio
async def test_provider_channel_we_cannot_read_still_activates(
    async_client, auth_data, monkeypatch
):
    """A missing ``channel`` field is the gateway's, not the customer's fault.

    Everything that decides ownership and amount is present, so the payment is
    applied. This is the asymmetry on purpose: refuse a rail we excluded, never
    refuse a shape we failed to predict.
    """
    reference = f"ref_noch_{_uuid.uuid4().hex[:8]}"
    payload = _paystack_verify_success(
        reference=reference,
        metadata={
            "org_id": auth_data["org_id"],
            "plan": "pro",
            "billing_interval": "monthly",
        },
    )
    payload["data"].pop("channel")
    _stub_verify(monkeypatch, payload)
    res = await async_client.post(
        f"/v1/billing/verify?reference={reference}", headers=auth_data["headers"]
    )
    assert res.status_code == 200, res.text
    assert res.json()["verified"] is True
    plan = await async_client.get("/v1/billing/plan", headers=auth_data["headers"])
    assert plan.json()["plan"] == "pro"


@pytest.mark.asyncio
async def test_metadata_arriving_as_a_json_string_still_provisions(
    async_client, auth_data, monkeypatch
):
    """Paystack echoes ``metadata`` back as it was sent — sometimes as a string.

    Parsing it defensively is not optional: a payment that has cleared and then
    throws on the way into the database is money taken and a plan not delivered.
    """
    reference = f"ref_strmeta_{_uuid.uuid4().hex[:8]}"
    payload = _paystack_verify_success(reference=reference, amount=60_000_000)
    payload["data"]["metadata"] = _json.dumps(
        {
            "org_id": auth_data["org_id"],
            "plan": "pro",
            "billing_interval": "annual",
            "actor_user_id": auth_data["user_id"],
        }
    )
    _stub_verify(monkeypatch, payload)
    res = await async_client.post(
        f"/v1/billing/verify?reference={reference}", headers=auth_data["headers"]
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["verified"] is True
    assert body["billing_interval"] == "annual"
    plan = await async_client.get("/v1/billing/plan", headers=auth_data["headers"])
    assert plan.json()["plan"] == "pro"
    assert plan.json()["billing_interval"] == "annual"


@pytest.mark.asyncio
async def test_verification_is_scoped_to_the_session(async_client, auth_data, monkeypatch):
    _stub_verify(monkeypatch, _paystack_verify_success(reference="ref_x"))
    res = await async_client.post("/v1/billing/verify?reference=ref_x")
    assert res.status_code == 401, res.text


# ── The record outlives the price list ───────────────────────────────────────


@pytest.mark.asyncio
async def test_history_states_what_was_charged_even_after_a_repricing(
    async_client, auth_data, monkeypatch
):
    """A repricing must not rewrite what somebody already paid.

    The stored row is the provider's figure, so history stays truthful after the
    business changes its price list — which is the whole reason the transaction
    table records the charge instead of the UI re-deriving it.
    """
    reference = f"ref_repriced_{_uuid.uuid4().hex[:8]}"
    _stub_verify(
        monkeypatch,
        _paystack_verify_success(
            reference=reference,
            metadata={
                "org_id": auth_data["org_id"],
                "plan": "pro",
                "billing_interval": "monthly",
            },
        ),
    )
    res = await async_client.post(
        f"/v1/billing/verify?reference={reference}", headers=auth_data["headers"]
    )
    assert res.status_code == 200, res.text

    from app.config import settings

    monkeypatch.setattr(settings, "PAYSTACK_NGN_PLAN_PRICES", {"pro_monthly": 9_900_000})

    hist = await async_client.get(
        "/v1/billing/transactions", headers=auth_data["headers"]
    )
    row = next(
        t for t in hist.json()["items"] if t["reference"] == reference
    )
    assert row["charged_amount_minor"] == 6_000_000
    assert row["charged_amount_display"] == "\u20a660,000.00 (NGN)"
    assert row["charged_currency"] == "NGN"
    assert row["provider"].lower() == "paystack"


# ── Provider answered vs provider unreachable ───────────────────────────────


def _status_error(code: int) -> Exception:
    import httpx

    request = httpx.Request("GET", "https://api.paystack.co/transaction/verify/x")
    return httpx.HTTPStatusError(
        "provider replied", request=request, response=httpx.Response(code, request=request)
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "error, expected_status, expected_reason",
    [
        (_status_error(404), 409, CheckoutReason.NOT_FOUND),
        (_status_error(500), 503, CheckoutReason.VERIFICATION_UNAVAILABLE),
        (__import__("httpx").ConnectError("boom"), 503, CheckoutReason.VERIFICATION_UNAVAILABLE),
    ],
)
async def test_a_provider_answer_and_a_provider_failure_are_never_the_same_state(
    async_client, auth_data, monkeypatch, error, expected_status, expected_reason
):
    """404 means "no such payment"; 500/timeout means "we do not know yet".

    Collapsing them into one error is how a checkout ends up telling a customer
    their payment failed when it may have succeeded — the sentence that causes a
    second payment. So the two states are asserted to differ in status, in reason
    and in what they promise about the money.
    """
    client = _MagicMock()
    client.verify_transaction = _AsyncMock(side_effect=error)
    monkeypatch.setattr("app.modules.billing.service.billing_service.client", client)

    res = await async_client.post(
        "/v1/billing/verify?reference=ref_whatever", headers=auth_data["headers"]
    )
    assert res.status_code == expected_status, res.text
    error_body = res.json()["error"]
    assert {
        "field": "reason",
        "issue": expected_reason,
    } in error_body["details"]
    message = error_body["message"].lower()
    if expected_reason == CheckoutReason.NOT_FOUND:
        assert "could not find" in message
        assert "nothing has been applied" in message
    else:
        # The unknown case must never be phrased as a failure of the payment.
        assert "not lost" in message or "automatically" in message
        assert "failed" not in message
