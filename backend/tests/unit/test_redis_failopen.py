"""Regression tests: a Redis outage must never silently drop work.

`safe_redis_set_nx` swallows connection errors and returns False, so callers
that tried to fail open with `except Exception: return True` never ran that
branch. The result was that with Redis down every Paystack webhook was
skipped as a "duplicate" (while still answering 200, so Paystack never
retried) and every alert was suppressed as a duplicate. These tests pin the
corrected behaviour.
"""
import pytest
from unittest.mock import AsyncMock, patch

from app.infrastructure.redis_client import safe_redis_claim


@pytest.mark.asyncio
async def test_safe_redis_claim_returns_none_when_redis_is_down():
    with patch(
        "app.infrastructure.redis_client.get_redis",
        side_effect=ConnectionError("connection refused"),
    ):
        assert await safe_redis_claim("k") is None


@pytest.mark.asyncio
async def test_safe_redis_claim_distinguishes_claimed_from_duplicate():
    redis = AsyncMock()
    redis.set = AsyncMock(return_value=True)
    with patch("app.infrastructure.redis_client.get_redis", return_value=redis):
        assert await safe_redis_claim("k") is True
    redis.set = AsyncMock(return_value=None)  # key already existed
    with patch("app.infrastructure.redis_client.get_redis", return_value=redis):
        assert await safe_redis_claim("k") is False


@pytest.mark.asyncio
async def test_webhook_is_processed_when_idempotency_store_is_down():
    """Redis down must NOT be read as "duplicate" — that drops the payment."""
    from app.modules.billing.service import BillingService

    service = BillingService()
    with patch(
        "app.infrastructure.redis_client.safe_redis_claim",
        new=AsyncMock(return_value=None),
    ):
        assert await service._claim_webhook_event("evt_1") is True


@pytest.mark.asyncio
async def test_webhook_duplicate_is_still_skipped():
    from app.modules.billing.service import BillingService

    service = BillingService()
    with patch(
        "app.infrastructure.redis_client.safe_redis_claim",
        new=AsyncMock(return_value=False),
    ):
        assert await service._claim_webhook_event("evt_1") is False


@pytest.mark.asyncio
async def test_alert_is_not_suppressed_when_dedupe_store_is_down():
    """An unreachable Redis must never silence outage notifications."""
    from app.modules.notifications.service import NotificationService

    service = NotificationService()
    alert = AsyncMock()
    with patch.object(service, "_alert_fingerprint", return_value="fp"), patch(
        "app.infrastructure.redis_client.safe_redis_claim",
        new=AsyncMock(return_value=None),
    ):
        assert await service._is_duplicate_alert(alert) is False


@pytest.mark.asyncio
async def test_alert_duplicate_is_still_suppressed():
    from app.modules.notifications.service import NotificationService

    service = NotificationService()
    alert = AsyncMock()
    with patch.object(service, "_alert_fingerprint", return_value="fp"), patch(
        "app.infrastructure.redis_client.safe_redis_claim",
        new=AsyncMock(return_value=False),
    ):
        assert await service._is_duplicate_alert(alert) is True
