"""Redis degradation semantics: an outage is an infrastructure condition,
NEVER evidence that an event is a duplicate.

Root cause these tests lock down: the old `safe_redis_set_nx` caught Redis
connection errors internally and returned False, so "key already exists" and
"Redis is unreachable" were indistinguishable. Callers that tried to fail
open with `except Exception: return True` had unreachable except-branches and
all failed CLOSED — Paystack payments were dropped as "duplicates" (with a
200, so no retry), every alert was suppressed, and fresh idempotency keys
returned 409.
"""

import hashlib
import hmac
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import settings
from app.core.exceptions import ServiceUnavailableException
from app.infrastructure.redis_client import safe_redis_claim
from app.modules.billing.service import BillingService

WEBHOOK_SECRET = "sk_test_regression"


# ─────────────────────────────────────────────────────────────────────────
# The claim primitive
# ─────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_claim_returns_true_when_key_is_newly_created():
    redis = MagicMock()
    redis.set = AsyncMock(return_value=True)
    with patch("app.infrastructure.redis_client.get_redis", return_value=redis):
        assert await safe_redis_claim("k") is True


@pytest.mark.asyncio
async def test_claim_returns_false_for_a_genuine_duplicate():
    redis = MagicMock()
    redis.set = AsyncMock(return_value=None)  # real redis-py SET NX miss
    with patch("app.infrastructure.redis_client.get_redis", return_value=redis):
        assert await safe_redis_claim("k") is False


@pytest.mark.asyncio
async def test_claim_returns_none_when_redis_is_unreachable():
    """The whole bug in one assertion: unavailable must NOT be False."""
    with patch(
        "app.infrastructure.redis_client.get_redis",
        side_effect=ConnectionError("connection refused"),
    ):
        result = await safe_redis_claim("k")
    assert result is None
    assert result is not False


@pytest.mark.asyncio
async def test_claim_returns_none_on_timeout():
    async def _hang(*a, **k):
        import asyncio

        await asyncio.sleep(5)

    redis = MagicMock()
    redis.set = _hang
    with patch("app.infrastructure.redis_client.get_redis", return_value=redis):
        assert await safe_redis_claim("k", timeout=0.05) is None


def test_ambiguous_set_nx_helper_is_gone():
    """It had zero call sites; deleting it stops the ambiguity returning."""
    import app.infrastructure.redis_client as rc

    assert not hasattr(rc, "safe_redis_set_nx")


# ─────────────────────────────────────────────────────────────────────────
# Paystack webhook
# ─────────────────────────────────────────────────────────────────────────


def _signed(payload: dict) -> tuple[dict, bytes, str]:
    raw = json.dumps(payload).encode()
    sig = hmac.new(WEBHOOK_SECRET.encode(), raw, hashlib.sha512).hexdigest()
    return payload, raw, sig


def _charge_payload(reference="ref_regression"):
    return {
        "event": "charge.success",
        "data": {"reference": reference, "amount": 9900, "currency": "USD"},
    }


async def _call(service, payload):
    body, raw, sig = _signed(payload)
    return await service.handle_webhook(AsyncMock(), body, signature=sig, raw_body=raw)


@pytest.mark.asyncio
async def test_webhook_first_delivery_is_processed():
    service = BillingService()
    service.verify_transaction = AsyncMock()
    with (
        patch.object(settings, "PAYSTACK_SECRET_KEY", WEBHOOK_SECRET),
        patch(
            "app.infrastructure.redis_client.safe_redis_claim",
            new=AsyncMock(return_value=True),
        ),
    ):
        res = await _call(service, _charge_payload())
    assert res.received is True
    service.verify_transaction.assert_awaited_once()


@pytest.mark.asyncio
async def test_webhook_duplicate_delivery_is_not_processed_twice():
    service = BillingService()
    service.verify_transaction = AsyncMock()
    with (
        patch.object(settings, "PAYSTACK_SECRET_KEY", WEBHOOK_SECRET),
        patch(
            "app.infrastructure.redis_client.safe_redis_claim",
            new=AsyncMock(return_value=False),
        ),
    ):
        res = await _call(service, _charge_payload())
    assert res.received is True
    service.verify_transaction.assert_not_awaited()


@pytest.mark.asyncio
async def test_webhook_refuses_retryably_when_idempotency_store_is_down():
    """Must NOT be read as a duplicate, and must NOT acknowledge with 200."""
    service = BillingService()
    service.verify_transaction = AsyncMock()
    with (
        patch.object(settings, "PAYSTACK_SECRET_KEY", WEBHOOK_SECRET),
        patch(
            "app.infrastructure.redis_client.safe_redis_claim",
            new=AsyncMock(return_value=None),
        ),
        pytest.raises(ServiceUnavailableException) as exc,
    ):
        await _call(service, _charge_payload())
    assert exc.value.status_code == 503, "must be retryable, not 2xx/4xx"
    service.verify_transaction.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "event",
    [
        "refund.processed",
        "charge.refunded",
        "charge.dispute.create",
        "subscription.disable",
    ],
)
async def test_refund_and_chargeback_events_get_the_same_protection(event):
    """Money-reversing events must never be silently swallowed either."""
    service = BillingService()
    payload = {
        "event": event,
        "data": {"reference": f"ref_{event}", "amount": 9900, "currency": "USD"},
    }
    with (
        patch.object(settings, "PAYSTACK_SECRET_KEY", WEBHOOK_SECRET),
        patch(
            "app.infrastructure.redis_client.safe_redis_claim",
            new=AsyncMock(return_value=None),
        ),
        pytest.raises(ServiceUnavailableException),
    ):
        await _call(service, payload)


@pytest.mark.asyncio
async def test_claim_helper_propagates_all_three_states():
    service = BillingService()
    for redis_state in (True, False, None):
        with patch(
            "app.infrastructure.redis_client.safe_redis_claim",
            new=AsyncMock(return_value=redis_state),
        ):
            assert await service._claim_webhook_event("evt") is redis_state


# ─────────────────────────────────────────────────────────────────────────
# Alert deduplication
# ─────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "redis_state,expected_duplicate",
    [(True, False), (False, True), (None, False)],
    ids=["claimed->new", "already_claimed->duplicate", "redis_down->NOT_duplicate"],
)
async def test_alert_dedupe_states(redis_state, expected_duplicate):
    from app.modules.notifications.service import NotificationService

    service = NotificationService()
    alert = MagicMock()
    alert.title = "Vendor down"
    with (
        patch.object(service, "_alert_fingerprint", return_value="fp"),
        patch(
            "app.infrastructure.redis_client.safe_redis_claim",
            new=AsyncMock(return_value=redis_state),
        ),
    ):
        assert await service._is_duplicate_alert(alert) is expected_duplicate
