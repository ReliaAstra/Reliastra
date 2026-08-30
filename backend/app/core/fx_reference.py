"""FX reference rate — customer context only, never a pricing input.

Global B2B customers see a USD list price ($39) and an NGN charge (the
published Paystack price). The gap between the two invites the question
"what rate did you use?" — this module answers it *without* answering it
commercially:

* the rate is fetched from a **verifiable public source** (default:
  ExchangeRate-API's open endpoint at ``open.er-api.com``, no key, its own
  update timestamp), so anyone can reproduce the number;
* it is always labelled a **reference estimate**, timestamped, and paired
  with the disclaimer from ``app.core.payment_pricing``;
* it is **never consulted to determine a charge**. Nothing in
  ``app.core.payment_pricing`` imports this module; the amount sent to
  Paystack comes solely from the published payment-price catalog. A unit
  test (``tests/unit/test_fx_reference.py``) enforces that boundary, so a
  future "just multiply by the rate" shortcut has to break an explicit
  guard first.

Failure behaviour is deliberately boring: if fetching or parsing fails, the
estimate is *absent* (``None``) and payment surfaces hide the reference
panel. There is no cached-forever value, no fallback number, and no
synthesized rate — an unavailable reference is honest, a wrong one is not.

Caching: Redis when available (shared across workers), otherwise a
process-local TTL cache; both also short-cache *failures* so an offline
source cannot turn every page render into a 4-second stall.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.core.payment_pricing import (
    FX_REFERENCE_DISCLAIMER,
    PRODUCT_CURRENCY,
    payment_currency,
)

logger = logging.getLogger(__name__)

#: Short TTL for a failed fetch — long enough to stop hammering a dead
#: endpoint, short enough that a recovered source shows up quickly.
_FAILURE_TTL_SECONDS = 120

_redis_cache_key = "billing:fx_reference:v1"

# Process-local fallback cache: (payload_json, expires_at_monotonic).
# ``payload_json`` is the serialized payload even for failures (a JSON
# sentinel), so Redis and memory behave identically.
_memory_cache: tuple[str, float] | None = None

_UNAVAILABLE = json.dumps({"unavailable": True})


def fx_reference_enabled() -> bool:
    """Should a reference estimate be offered at all?

    Off when the deployment is disabled, or when nothing would be explained:
    if Paystack settles in the same currency as the list price there is no
    FX question to answer, and showing a rate would imply one.
    """
    if not settings.FX_REFERENCE_ENABLED:
        return False
    return payment_currency() != PRODUCT_CURRENCY


async def _cache_store(payload_json: str, ttl: int) -> None:
    global _memory_cache
    _memory_cache = (payload_json, time.monotonic() + max(int(ttl), 5))
    from app.infrastructure.redis_client import safe_redis_set

    # Cross-worker refresh; best-effort — safe_redis_set swallows its own
    # errors, and the memory cache already holds the value either way.
    await safe_redis_set(_redis_cache_key, payload_json, ex=max(int(ttl), 5))


async def _cache_read() -> str | None:
    from app.infrastructure.redis_client import safe_redis_get

    value = await safe_redis_get(_redis_cache_key)
    if value:
        return value
    if _memory_cache is None:
        return None
    payload, expires_at = _memory_cache
    if time.monotonic() >= expires_at:
        return None
    return payload


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


async def _fetch_rate() -> dict | None:
    """One attempt at the configured source. Never raises."""
    target = payment_currency()
    try:
        async with httpx.AsyncClient(
            timeout=settings.FX_REFERENCE_TIMEOUT_SECONDS
        ) as client:
            response = await client.get(settings.FX_REFERENCE_URL)
            response.raise_for_status()
            payload = response.json()
        if not isinstance(payload, dict):
            return None
        # Pin the quote currency to the source's own declaration: a document
        # not actually expressed in USD would silently mis-label the rate.
        base = str(payload.get("base") or "").strip().upper()
        rates = payload.get("rates")
        if base != PRODUCT_CURRENCY or not isinstance(rates, dict):
            return None
        rate = rates.get(target)
        if rate is None:
            return None
        rate = float(rate)
        if rate <= 0:
            return None
        retrieved_at = datetime.now(timezone.utc)
        source_stamp = str(
            payload.get("time_last_update_utc")
            or payload.get("date")
            or payload.get("timestamp")
            or ""
        ).strip()
        return {
            "available": True,
            "source_currency": PRODUCT_CURRENCY,
            "payment_currency": target,
            "rate": round(rate, 4),
            # Both timestamps are part of the contract: when the source said
            # it was true, and when we looked.
            "source_timestamp": source_stamp or None,
            "retrieved_at": _iso(retrieved_at),
            "provider": settings.FX_REFERENCE_PROVIDER,
            "provider_url": settings.FX_REFERENCE_PROVIDER_URL,
            "source_url": settings.FX_REFERENCE_URL,
            "label": "Exchange rate reference (estimate — not the price you pay)",
            "disclaimer": FX_REFERENCE_DISCLAIMER,
        }
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        logger.info("FX reference fetch failed (%s); hiding the estimate", exc)
        return None


async def fx_reference_payload() -> dict | None:
    """The customer-facing FX estimate, or ``None`` when unavailable.

    ``None`` means the UI shows *no* reference — it must not show a stale or
    invented one.
    """
    if not fx_reference_enabled():
        return None

    cached = await _cache_read()
    if cached is not None:
        try:
            data = json.loads(cached)
        except ValueError:
            data = None
        if isinstance(data, dict):
            if data.get("unavailable"):
                return None
            data.pop("unavailable", None)
            return data

    payload = await _fetch_rate()
    await _cache_store(
        json.dumps(payload or {"unavailable": True}),
        settings.FX_REFERENCE_CACHE_TTL_SECONDS
        if payload
        else _FAILURE_TTL_SECONDS,
    )
    return payload
