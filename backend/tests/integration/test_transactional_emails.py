"""Transactional emails as actually delivered, and the currency of a charge.

These run against the real FastAPI app (embedded Postgres, same as CI) with
SMTP captured by the ``otp_test_harness`` fixture in ``conftest``. The point is
to assert on the bytes the customer receives — not on a template read in
isolation:

* welcome / verification / password-reset / receipt / confirmation emails all
  carry the canonical support footer exactly once, in HTML *and* plain text;
* pricing, plan-details and payment initialization agree on one currency;
* a non-USD checkout charges the published payment price, never the USD
  minor-unit figure, and refuses outright when no price is published.
"""

from __future__ import annotations

import re
import uuid
from email import message_from_string
from typing import Any

import pytest

from app.config import settings
from app.core.payment_pricing import NGN_CURRENCY_NOTICE
from app.infrastructure.email_layout import TRANSACTIONAL_SUPPORT_FOOTER
from tests.helpers import TEST_OTP_CODE, register_and_verify

NGN_CATALOG = {"pro": {"monthly": 6000000, "annual": 60000000}}


@pytest.fixture(autouse=True)
def _ngn_payment_prices(monkeypatch):
    """Publish the NGN payment prices an operator would set in production."""
    monkeypatch.setattr(settings, "PAYSTACK_CURRENCY", "NGN")
    monkeypatch.setattr(settings, "PAYSTACK_NGN_PLAN_PRICES", NGN_CATALOG)


def _footer_count(body: str) -> int:
    return body.count(TRANSACTIONAL_SUPPORT_FOOTER)


def assert_delivered_email(msg: dict[str, Any], *, label: str) -> None:
    text, html = msg["body"], msg.get("html_body") or ""
    assert text, f"{label}: no plain-text part"
    assert html, f"{label}: no HTML part"
    assert _footer_count(html) == 1, f"{label}: footer must appear exactly once"
    assert _footer_count(text) == 1, f"{label}: footer must appear exactly once"
    # The footer must be a footer region, not a paragraph tacked onto content.
    assert html.index('id="reliastra-email-footer"') > html.index(
        "</div>", html.index('<div class="body">')
    )
    # Both parts are valid alternatives of one MIME message.
    # Rebuild the message the way EmailClient does, so the assertion runs on a
    # real multipart/alternative payload and not on the strings alone.
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    message = MIMEMultipart("alternative")
    message["Subject"] = msg["subject"]
    message.attach(MIMEText(text, "plain", "utf-8"))
    message.attach(MIMEText(html, "html", "utf-8"))
    parsed = message_from_string(message.as_string())
    assert parsed.is_multipart()
    parts = [
        part.get_payload(decode=True).decode("utf-8") for part in parsed.get_payload()
    ]
    assert len(parts) == 2
    assert any(TRANSACTIONAL_SUPPORT_FOOTER in part for part in parts)


# ── Signup / verification / reset ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_signup_and_verification_emails_carry_the_footer(
    async_client, otp_test_harness
):
    email = f"footer-{uuid.uuid4().hex[:8]}@reliastra.com"
    res = await async_client.post(
        "/v1/auth/register",
        json={
            "email": email,
            "password": "SuperSecret123!",
            "full_name": "Footer Tester",
            "org_name": "Footer Org",
        },
    )
    assert res.status_code == 201, res.text

    # The one-time code is an account/security email — footer exactly once.
    code_mail = otp_test_harness[-1]
    assert_delivered_email(code_mail, label="verification code")
    assert TEST_OTP_CODE in code_mail["body"]
    # Code instructions must not be buried under the footer.
    assert code_mail["body"].index(TEST_OTP_CODE) < code_mail["body"].index(
        TRANSACTIONAL_SUPPORT_FOOTER
    )

    verify = await async_client.post(
        "/v1/auth/verify-otp", json={"email": email, "code": TEST_OTP_CODE}
    )
    assert verify.status_code == 200, verify.text

    welcome = next(m for m in otp_test_harness if "Welcome" in m["subject"])
    assert_delivered_email(welcome, label="welcome")
    assert "Footer Tester" in welcome["body"]
    assert "Footer Org" in welcome["body"]


@pytest.mark.asyncio
async def test_password_reset_email_carries_the_footer(async_client, otp_test_harness):
    res = await async_client.post(
        "/v1/auth/forgot-password", json={"email": "nobody@reliastra.com"}
    )
    assert res.status_code == 200, res.text
    # Unknown address: neutral response and no mail.
    assert not [m for m in otp_test_harness if "password" in m["subject"].lower()]

    body = await register_and_verify(
        async_client,
        {
            "email": f"reset-{uuid.uuid4().hex[:8]}@reliastra.com",
            "password": "SuperSecret123!",
            "full_name": "Reset Tester",
        },
    )
    email = body["user"]["email"]
    otp_test_harness.clear()
    res = await async_client.post("/v1/auth/forgot-password", json={"email": email})
    assert res.status_code == 200, res.text
    reset = next(m for m in otp_test_harness if "Reset" in m["subject"])
    assert_delivered_email(reset, label="password reset")
    # Security instructions are still ahead of the footer.
    assert "never ask you for your password" in reset["body"]
    assert reset["body"].index("never ask you for your password") < reset[
        "body"
    ].index(TRANSACTIONAL_SUPPORT_FOOTER)


@pytest.mark.asyncio
async def test_verification_link_email_carries_the_footer(
    async_client, otp_test_harness
):
    """The magic-link verification email is transactional too."""
    email = f"link-{uuid.uuid4().hex[:8]}@reliastra.com"
    reg = await async_client.post(
        "/v1/auth/register",
        json={
            "email": email,
            "password": "SuperSecret123!",
            "full_name": "Link Tester",
        },
    )
    assert reg.status_code == 201, reg.text
    otp_test_harness.clear()

    res = await async_client.post("/v1/auth/send-verification", json={"email": email})
    assert res.status_code == 200, res.text
    msg = next(
        m for m in otp_test_harness if "Verify your Reliastra email" in m["subject"]
    )
    assert_delivered_email(msg, label="verification link")
    assert "/verify-email?token=" in msg["body"]
    assert "expires in 60 minutes" in msg["body"]

    # Unknown address: identical neutral response, and no email is sent.
    otp_test_harness.clear()
    unknown = await async_client.post(
        "/v1/auth/send-verification", json={"email": "ghost@reliastra.com"}
    )
    assert unknown.status_code == 200, unknown.text
    assert otp_test_harness == []


# ── Pricing / plan / checkout agree on one currency ─────────────────────────


@pytest.mark.asyncio
async def test_pricing_endpoint_discloses_the_processing_currency(async_client):
    res = await async_client.get("/v1/pricing")
    assert res.status_code == 200, res.text
    payload = res.json()
    payment = payload["payment"]
    assert payment["payment_currency"] == "NGN"
    assert payment["product_currency"] == "USD"
    assert payment["differs_from_product_currency"] is True
    assert payment["notice"] == NGN_CURRENCY_NOTICE
    pro = next(p for p in payload["plans"] if p["plan"] == "pro")
    assert pro["price_usd"] == 39
    # The published payment price, formatted with the code as text.
    assert pro["payment_amount_display"] == "\u20a660,000.00 (NGN)"
    assert re.search(r"\(NGN\)", pro["payment_amount_display"])


@pytest.mark.asyncio
async def test_currency_endpoint_is_public_and_matches_pricing(async_client):
    currency = (await async_client.get("/v1/billing/currency")).json()
    pricing = (await async_client.get("/v1/pricing")).json()["payment"]
    assert currency == pricing


@pytest.mark.asyncio
async def test_plan_details_expose_next_charge_in_the_payment_currency(
    async_client, auth_data
):
    res = await async_client.get("/v1/billing/plan", headers=auth_data["headers"])
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["payment"]["payment_currency"] == "NGN"
    assert data["payment"]["notice"] == NGN_CURRENCY_NOTICE
    # A free org has no next charge to promise.
    assert data.get("next_charge_amount_display") is None


@pytest.mark.asyncio
async def test_initialize_sends_the_published_payment_price(async_client, auth_data, mocker):
    captured: dict[str, Any] = {}

    async def fake_initialize(self, **kwargs):  # noqa: ANN001
        captured.update(kwargs)
        return {
            "status": True,
            "data": {
                "authorization_url": "https://checkout.paystack.com/ref-e2e",
                "reference": "ref-e2e",
                "access_code": "ac",
            },
        }

    mocker.patch(
        "app.modules.billing.service.PaystackClient.initialize_transaction",
        new=fake_initialize,
    )
    res = await async_client.post(
        "/v1/billing/initialize",
        headers=auth_data["headers"],
        json={"plan": "pro", "billing_interval": "monthly"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    # Amount and currency sent to Paystack == amount and currency shown to the
    # customer: the published NGN price, not the USD cents figure.
    assert captured["amount"] == NGN_CATALOG["pro"]["monthly"]
    assert captured["currency"] == "NGN"
    assert captured["amount"] != 3900
    assert body["currency"] == "NGN"
    assert body["amount_minor"] == NGN_CATALOG["pro"]["monthly"]
    assert body["amount_display"] == "\u20a660,000.00 (NGN)"
    # Metadata lets the webhook restate the same charge without re-deriving.
    assert captured["metadata"]["currency"] == "NGN"


@pytest.mark.asyncio
async def test_initialize_refuses_when_no_payment_price_is_published(
    async_client, auth_data, mocker, monkeypatch
):
    monkeypatch.setattr(settings, "PAYSTACK_NGN_PLAN_PRICES", None)
    called = mocker.patch(
        "app.modules.billing.service.PaystackClient.initialize_transaction",
        new=AsyncMockLike(),
    )
    res = await async_client.post(
        "/v1/billing/initialize",
        headers=auth_data["headers"],
        json={"plan": "pro", "billing_interval": "monthly"},
    )
    assert res.status_code in (400, 422), res.text
    assert "finalized" in res.text
    assert called.awaited is False


class AsyncMockLike:
    """Records whether it was awaited without importing unittest.mock."""

    def __init__(self) -> None:
        self.awaited = False

    async def __call__(self, *args, **kwargs):
        self.awaited = True
        raise AssertionError("must not be called")

    def __await__(self):  # pragma: no cover - defensive
        return self.__call__().__await__()


# ── Payment emails on a real verification ───────────────────────────────────


@pytest.mark.asyncio
async def test_confirmed_payment_emails_confirmation_and_receipt(
    async_client, auth_data, mocker, otp_test_harness
):
    """Provisioning a plan sends a confirmation + receipt with the real charge."""
    from unittest.mock import AsyncMock, MagicMock

    reference = f"ref-{uuid.uuid4().hex[:10]}"
    verify_result = {
        "status": True,
        "data": {
            "status": "success",
            "amount": NGN_CATALOG["pro"]["monthly"],
            "currency": "NGN",
            "reference": reference,
            "paid_at": "2026-01-05T10:00:00+00:00",
            "next_payment_date": "2026-02-05T10:00:00+00:00",
            "transaction_date": "2026-01-05T10:00:00+00:00",
            "customer": {"customer_code": "CUS_1"},
            "metadata": {
                "org_id": auth_data["org_id"],
                "plan": "pro",
                "billing_interval": "monthly",
            },
        },
    }
    client = MagicMock()
    client.verify_transaction = AsyncMock(return_value=verify_result)
    mocker.patch("app.modules.billing.service.billing_service.client", client)

    otp_test_harness.clear()
    res = await async_client.post(
        f"/v1/billing/verify?reference={reference}", headers=auth_data["headers"]
    )
    assert res.status_code == 200, res.text
    assert res.json()["verified"] is True

    subjects = [m["subject"] for m in otp_test_harness]
    confirmation = next(m for m in otp_test_harness if "subscription confirmed" in m["subject"])
    receipt = next(m for m in otp_test_harness if "receipt" in m["subject"].lower())
    assert subjects

    for msg, label in ((confirmation, "confirmation"), (receipt, "receipt")):
        assert_delivered_email(msg, label=label)

    # Mandatory transparency triple. The receipt must state the product
    # price, the amount ACTUALLY charged (with the ISO code Paystack settled
    # in) and the provider — and the USD figure may appear only as the
    # clearly-labelled product price, never as the charge.
    assert "\u20a660,000.00 (NGN)" in receipt["body"]
    assert "\u20a660,000.00 (NGN)" in receipt["html_body"]
    assert "Product price: $39.00 (USD)" in receipt["body"]
    assert "Actual charge: \u20a660,000.00 (NGN)" in receipt["body"]
    assert "Payment provider: Paystack" in receipt["body"]
    assert "payment was collected by Paystack in NGN" in receipt["body"]
    assert reference in receipt["body"]
    assert "Pro" in confirmation["body"]
    # The confirmation mail carries the same triple.
    assert "Product price: $39.00 (USD)" in confirmation["body"]
    assert "Actual charge: \u20a660,000.00 (NGN)" in confirmation["body"]
    assert "Payment provider: Paystack" in confirmation["body"]

    # ── The charge is ALSO persisted as a transaction record: receipts and
    # the billing page read history from the provider's own figures.
    tx_res = await async_client.get(
        "/v1/billing/transactions", headers=auth_data["headers"]
    )
    assert tx_res.status_code == 200, tx_res.text
    items = tx_res.json()["items"]
    match = next(t for t in items if t["reference"] == reference)
    assert match["charged_currency"] == "NGN"
    assert match["charged_amount_minor"] == NGN_CATALOG["pro"]["monthly"]
    assert match["charged_amount_display"] == "\u20a660,000.00 (NGN)"
    assert match["product_currency"] == "USD"
    assert match["product_amount_minor"] == 3900
    assert match["product_price_display"] == "$39.00 (USD)"
    assert match["status"] == "success"


@pytest.mark.asyncio
async def test_receipt_is_sent_once_per_reference(
    async_client, auth_data, mocker, otp_test_harness
):
    """A webhook retry + frontend verify for the same payment = one receipt."""
    from unittest.mock import AsyncMock, MagicMock

    import fakeredis.aioredis

    fake = fakeredis.aioredis.FakeRedis(decorate=True)
    mocker.patch(
        "app.infrastructure.redis_client.get_redis", return_value=fake
    )

    reference = f"ref-once-{uuid.uuid4().hex[:8]}"
    verify_result = {
        "status": True,
        "data": {
            "status": "success",
            "amount": NGN_CATALOG["pro"]["monthly"],
            "currency": "NGN",
            "reference": reference,
            "paid_at": "2026-01-06T10:00:00+00:00",
            "next_payment_date": "2026-02-06T10:00:00+00:00",
            "transaction_date": "2026-01-06T10:00:00+00:00",
            "customer": {"customer_code": "CUS_2"},
            "metadata": {
                "org_id": auth_data["org_id"],
                "plan": "pro",
                "billing_interval": "monthly",
            },
        },
    }
    client = MagicMock()
    client.verify_transaction = AsyncMock(return_value=verify_result)
    mocker.patch("app.modules.billing.service.billing_service.client", client)

    otp_test_harness.clear()
    for _ in range(2):
        res = await async_client.post(
            f"/v1/billing/verify?reference={reference}", headers=auth_data["headers"]
        )
        assert res.status_code == 200, res.text
    receipts = [m for m in otp_test_harness if "receipt" in m["subject"].lower()]
    assert len(receipts) == 1, [m["subject"] for m in otp_test_harness]


# ── Legacy copy must not survive ────────────────────────────────────────────


def test_no_hardcoded_plan_price_in_billing_email_copy():
    """Trial/billing emails derive prices; they never restate "$39/mo"."""
    root = settings.__module__.split(".")[0]
    del root
    from app.modules.billing import notifications as billing_notifications
    import inspect

    source = inspect.getsource(billing_notifications)
    assert "$39" not in source
    assert "3900" not in source


def test_every_transactional_module_uses_the_shared_layout():
    """No template may hand-roll a footer div or the support paragraph again."""
    import pathlib

    import app as app_pkg

    root = pathlib.Path(app_pkg.__file__).parent
    offenders: list[str] = []
    for path in sorted(root.rglob("*.py")):
        if "email_layout" in path.name or "migrations" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        if 'class="footer"' in text or TRANSACTIONAL_SUPPORT_FOOTER in text:
            offenders.append(str(path.relative_to(root)))
    assert offenders == [], f"footer copy duplicated outside email_layout: {offenders}"
