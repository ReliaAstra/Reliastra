"""Live exchange rate - the single source that prices the NGN charge.

RELIASTRA lists prices in USD ($19) and collects payment in NGN. The NGN
charge is the USD price converted at the **live market rate** this module
fetches, so the number a customer sees as "the rate" is the very number the
charge was computed from:

* the rate is fetched from a **verifiable public source** (default:
  ExchangeRate-API's open endpoint at ``open.er-api.com``, no key, its own
  update timestamp), so anyone can reproduce the number;
* it is timestamped and paired with the disclaimer from
  ``app.core.payment_pricing``, which states plainly that the charge is the
  USD price converted at this rate;
* it **prices the charge**. ``app.core.payment_pricing`` still never imports
  this module (the rate is passed in explicitly), but the request path calls
  :func:`current_rate` and feeds the result into price resolution, so quote,
  display and transaction are one resolution of one cached rate.

Failure behaviour is deliberately boring: if fetching or parsing fails, the
rate is *absent* (``None``) and self-serve checkout refuses to price the
charge rather than inventing a number. There is no cached-forever value, no
fallback rate, and no synthesized rate - an unavailable rate is honest, a
wrong one is not.

Caching: Redis when available (shared across workers), otherwise a
process-local TTL cache; both also short-cache *failures* so an offline
source cannot turn every page render into a 4-second stall. The cache TTL
also bounds how far a displayed rate can drift from the market between
refreshes.
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

#: Short TTL for a failed fetch - long enough to stop hammering a dead
#: endpoint, short enough that a recovered source shows up quickly.
_FAILURE_TTL_SECONDS = 120

_redis_cache_key = "billing:fx_reference:v1"

# Process-local fallback cache: (payload_json, expires_at_monotonic).
# ``payload_json`` is the serialized payload even for failures (a JSON
# sentinel), so Redis and memory behave identically.
_memory_cache: tuple[str, float] | None = None

_UNAVAILABLE = json.dumps({"unavailable": True})


def fx_reference_enabled() -> bool:
    """Should the exchange rate be fetched at all?

    Off when the deployment is disabled, or when nothing would be converted:
    if Paystack settles in the same currency as the list price there is no
    FX question to answer, and showing (or fetching) a rate would imply one.
    """
    if not settings.FX_REFERENCE_ENABLED:
        return False
    return payment_currency() != PRODUCT_CURRENCY


async def _cache_store(payload_json: str, ttl: int) -> None:
    global _memory_cache
    _memory_cache = (payload_json, time.monotonic() + max(int(ttl), 5))
    from app.infrastructure.redis_client import safe_redis_set

    # Cross-worker refresh; best-effort - safe_redis_set swallows its own
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
        base = str(payload.get("base_code") or payload.get("base") or "").strip().upper()
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
            "label": "Exchange rate (converts your USD price to NGN)",
            "disclaimer": FX_REFERENCE_DISCLAIMER,
        }
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        logger.info("FX reference fetch failed (%s); hiding the estimate", exc)
        return None


async def fx_reference_payload() -> dict | None:
    """The customer-facing FX estimate, or ``None`` when unavailable.

    ``None`` means the UI shows *no* reference - it must not show a stale or
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


async def current_rate() -> float | None:
    """The live rate pricing uses to convert the USD price, or ``None``.

    Reuses :func:`fx_reference_payload` so the figure the customer sees as
    "the rate" is exactly the figure the charge was computed from - the same
    cache entry, the same source, the same timestamps. Returns ``None``
    whenever the reference would be hidden (disabled, currencies matching, or
    a failed fetch); pricing then refuses to convert rather than guessing.
    """
    if not fx_reference_enabled():
        return None
    payload = await fx_reference_payload()
    if not payload:
        return None
    rate = payload.get("rate")
    try:
        rate = float(rate)
    except (TypeError, ValueError):
        return None
    return rate if rate > 0 else None


def cached_rate() -> float | None:
    """The last successfully fetched rate, read from the process-local cache.

    Synchronous and I/O-free (it never touches Redis or the network), for
    callers that cannot await - the email renderers. Returns ``None`` when no
    rate is cached, when the cached entry is expired, or when the last fetch
    failed: callers then omit the figure rather than invent one.
    """
    if _memory_cache is None:
        return None
    payload, expires_at = _memory_cache
    if time.monotonic() >= expires_at:
        return None
    try:
        data = json.loads(payload)
    except ValueError:
        return None
    if not isinstance(data, dict) or data.get("unavailable"):
        return None
    rate = data.get("rate")
    try:
        rate = float(rate)
    except (TypeError, ValueError):
        return None
    return rate if rate > 0 else None
