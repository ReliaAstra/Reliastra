"""IP geolocation for visitor analytics.

Resolution order (first hit wins):
1. CDN edge headers - ``CF-IPCountry`` (Cloudflare) or
   ``X-Vercel-IP-Country`` (Vercel). Free, instant, no egress.
2. ipinfo.io ``/{ip}?token=...`` when ``settings.IPINFO_TOKEN`` is set.
3. Free fallback ``https://ipapi.co/{ip}/country/`` (no key; rate-limited).
4. ``unknown``.

Every successful lookup is cached in Redis for 7 days keyed by a hashed IP,
so repeated visitors never re-hit the provider. Failures never raise into
the caller - analytics must not break page loads.
"""

from __future__ import annotations

import hashlib
import ipaddress
import logging

import httpx

from app.infrastructure.redis_client import get_redis, safe_redis_get, safe_redis_setex

logger = logging.getLogger(__name__)

_COUNTRY_TTL_SECONDS = 7 * 24 * 3600
_LOOKUP_TIMEOUT_SECONDS = 2.5


def hash_ip(ip: str, salt_user_agent: str | None = None) -> str:
    """Stable pseudonymized visitor key - raw IPs are never stored."""
    material = f"{ip}|{salt_user_agent or ''}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]


def is_public_ip(ip: str) -> bool:
    try:
        parsed = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return parsed.is_global and not parsed.is_loopback


def country_from_headers(headers) -> str | None:
    """CDN-provided country codes are trusted when present."""
    for name in ("cf-ipcountry", "x-vercel-ip-country"):
        value = headers.get(name)
        if value and value.strip() and value.upper() != "XX":
            return value.strip().upper()[:2]
    return None


async def _lookup_ipinfo(ip: str, token: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=_LOOKUP_TIMEOUT_SECONDS) as client:
            resp = await client.get(
                f"https://ipinfo.io/{ip}/country", params={"token": token}
            )
            if resp.status_code == 200:
                country = resp.text.strip().upper()
                return country[:2] or None
    except Exception:
        logger.debug("ipinfo lookup failed for %s", ip, exc_info=True)
    return None


async def _lookup_ipapi(ip: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=_LOOKUP_TIMEOUT_SECONDS) as client:
            resp = await client.get(f"https://ipapi.co/{ip}/country/")
            if resp.status_code == 200:
                country = resp.text.strip().upper()
                return country[:2] or None
    except Exception:
        logger.debug("ipapi lookup failed for %s", ip, exc_info=True)
    return None


async def resolve_country(
    ip: str,
    headers=None,
    ipinfo_token: str = "",
) -> str:
    """Return an ISO-3166 alpha-2 country code (upper-case) or ``unknown``.

    Cached per hashed IP so the public beacon stays cheap.
    """
    if not ip or not is_public_ip(ip):
        return "local"

    headers_country = country_from_headers(headers) if headers is not None else None
    visitor_key = hash_ip(ip)

    try:
        redis = get_redis()
    except Exception:
        redis = None

    cache_key = f"an:geo:{visitor_key}"

    # Edge header wins instantly and is worth caching too (stable per IP).
    if headers_country:
        if redis is not None:
            await safe_redis_setex(cache_key, _COUNTRY_TTL_SECONDS, headers_country)
        return headers_country

    if redis is not None:
        cached = await safe_redis_get(cache_key)
        if cached:
            return cached

    country = None
    if ipinfo_token:
        country = await _lookup_ipinfo(ip, ipinfo_token)
    if country is None:
        country = await _lookup_ipapi(ip)
    country = country or "unknown"

    if redis is not None and country != "unknown":
        await safe_redis_setex(cache_key, _COUNTRY_TTL_SECONDS, country)
    return country
