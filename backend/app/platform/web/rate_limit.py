from __future__ import annotations

import ipaddress
import logging
import secrets
import time

from fastapi import Request

from app.config import settings
from app.platform.web.errors import RateLimitExceededException

logger = logging.getLogger(__name__)

# Hard ceiling on any single Redis pipeline call (seconds).
_RATE_LIMIT_REDIS_TIMEOUT = 2.0

# Maximum trusted proxy hops honored from X-Forwarded-For. The immediate
# reverse proxy appends one entry; deeper client-supplied entries are ignored
# so clients cannot spoof arbitrary IPs past the proxy.
_TRUSTED_PROXY_HOPS = getattr(settings, "TRUSTED_PROXY_HOPS", 1)


def client_ip_from_request(request: Request) -> str:
    """Return the client IP for rate limiting / audit purposes.

    Load balancers terminate TLS, so ``request.client.host`` is the LB's IP
    and every tenant would share one rate-limit bucket. Instead we read
    ``X-Forwarded-For`` and take the entry added by the *last trusted hop*
    (rightmost position), validating it is a real IP address before trusting
    it. If the header is missing or malformed we fall back to the socket peer
    address.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded and _TRUSTED_PROXY_HOPS > 0:
        hops = [part.strip() for part in forwarded.split(",") if part.strip()]
        if hops:
            candidate = (
                hops[-1]
                if len(hops) <= _TRUSTED_PROXY_HOPS
                else hops[-_TRUSTED_PROXY_HOPS]
            )
            try:
                ipaddress.ip_address(candidate)
                return candidate
            except ValueError:
                logger.debug("Ignoring invalid X-Forwarded-For entry: %r", candidate)
    client = request.client
    return client.host if client else "unknown_ip"


class SlidingWindowRateLimiter:
    def __init__(
        self,
        limit: int,
        window_seconds: int = 60,
        key_prefix: str = "rate_limit",
    ) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.key_prefix = key_prefix

    async def is_redis_available(self) -> bool:
        """Check if Redis is reachable without raising."""
        try:
            from app.platform.integrations.redis import safe_redis_ping

            return await safe_redis_ping()
        except Exception:
            return False

    async def check(self, identifier: str) -> bool:
        """
        Check and record request for identifier.
        Raises RateLimitExceededException if limit is exceeded.
        Returns True if within limit.
        When Redis is unavailable, the request is allowed through (fail-open)
        to prevent Redis outages from blocking all public and auth endpoints.
        """
        try:
            import asyncio

            from app.platform.integrations.redis import get_redis

            redis = get_redis()
            now = time.time()
            window_start = now - self.window_seconds
            key = f"{self.key_prefix}:{identifier}"

            pipeline = redis.pipeline()
            pipeline.zremrangebyscore(key, 0, window_start)
            pipeline.zcard(key)
            pipeline.zadd(key, {f"{now}:{time.time_ns()}": now})
            pipeline.expire(key, self.window_seconds * 2)
            results = await asyncio.wait_for(
                pipeline.execute(), timeout=_RATE_LIMIT_REDIS_TIMEOUT
            )

            current_count = results[1]
            if current_count >= self.limit:
                raise RateLimitExceededException(
                    message=f"Rate limit exceeded ({self.limit} req / {self.window_seconds}s)"
                )
            return True
        except RateLimitExceededException:
            raise
        except Exception as exc:
            # Fail-open: allow the request when Redis is unavailable.
            # This prevents a Redis outage from blocking all rate-limited
            # endpoints (auth, public vendors, etc.). Log for alerting.
            logger.warning(
                "Rate limiter unavailable (Redis error), allowing request through: %s",
                exc,
            )
            return True


# Pre-configured rate limiters
api_key_limiter = SlidingWindowRateLimiter(
    limit=1000, window_seconds=60, key_prefix="rl_apikey"
)
ip_limiter = SlidingWindowRateLimiter(limit=100, window_seconds=60, key_prefix="rl_ip")
# Public vendor surfaces (landing live-data + /track) fetch detail, timeline
# and history per vendor in parallel: one page load is ~20 requests (doubled
# by StrictMode remount), plus a 15s auto-refresh. 60/min self-429s a single
# localhost client (all local traffic shares one IP key) and single-tab
# browsing behind NAT. 300/min still caps abuse at 5 rps average.
public_vendor_limiter = SlidingWindowRateLimiter(
    limit=300, window_seconds=60, key_prefix="rl_vendor"
)
# Manual check triggering is a diagnostic, not a data path: generous enough to
# prove the pipeline repeatedly, tight enough that it cannot be used to drive
# probe traffic at a target or to fill the broker. Keyed per organization, not
# per IP, so a shared NAT cannot be locked out of its own diagnostics.
check_trigger_limiter = SlidingWindowRateLimiter(
    limit=30, window_seconds=60, key_prefix="rl_checkrun"
)


# Header the web app presents when it reads public vendor data server-side.
_READER_HEADER = "x-reliastra-reader"

#: Rate-limit identity of the site's own reader. One bucket by design: it is a
#: single server process, and its budget is sized for rendering the public site
#: rather than for one human client.
INTERNAL_READER_IDENTITY = "internal_reader"

# A mismatched token is a misconfiguration worth surfacing, but it is presented
# on every server-side read - dozens per rendered page - so it is reported once
# per process rather than once per request.
_reader_token_mismatch_reported = False


def internal_reader_identity(request: Request) -> str | None:
    """Return the rate-limit identity of the site's own reader, or None.

    The web app renders every public observatory record server-side, so from
    the API's socket all of those reads arrive from one address - in the
    all-in-one image, ``127.0.0.1``. Keyed by IP they share a bucket with every
    browser call the web app proxies, and a single crawler walking the
    observatory exhausts it for the whole site. The failure then surfaces as
    records that cannot be read: exactly the pages the crawler came for, and
    exactly the ones that must stay indexable.

    The reader authenticates with a shared secret in ``X-Reliastra-Reader``
    (``settings.INTERNAL_READER_TOKEN``, compared in constant time). When it
    matches, the caller is identified as the site's reader and gets its own
    budget. Anything else - no header, wrong token, no token configured -
    returns None and the caller is limited by IP as before. This is a
    rate-limiting identity only: it grants no data access, and every endpoint
    it applies to is already public and unauthenticated.
    """
    global _reader_token_mismatch_reported

    configured = settings.INTERNAL_READER_TOKEN
    if not configured:
        return None

    presented = request.headers.get(_READER_HEADER)
    if not presented:
        return None

    if secrets.compare_digest(presented, configured):
        return INTERNAL_READER_IDENTITY

    if not _reader_token_mismatch_reported:
        _reader_token_mismatch_reported = True
        # The token itself is never logged: a secret in a log is a secret in
        # every log aggregation pipeline downstream.
        logger.warning(
            "Rejected an X-Reliastra-Reader token that does not match "
            "INTERNAL_READER_TOKEN; falling back to IP rate limiting "
            "(further mismatches are not logged)"
        )
    return None


# The web app's own server-side reads. Sized for rendering the public site: one
# record page is a handful of upstream reads and every visitor shares this one
# process, so 3000/min (~50 rps) is an order of magnitude above what the
# public surface costs while still bounding a runaway render loop.
internal_reader_limiter = SlidingWindowRateLimiter(
    limit=3000, window_seconds=60, key_prefix="rl_reader"
)


async def enforce_public_read_limit(request: Request) -> None:
    """Rate-limit a public read, on the reader's own budget when it is the site.

    Public vendor endpoints are read by two very different callers: individual
    clients, who should be limited per client, and the web app rendering a page
    on their behalf, whose reads all arrive from one address. Using one IP-keyed
    bucket for both is what made the public observatory 429 itself.
    """
    reader = internal_reader_identity(request)
    if reader is not None:
        await enforce_rate_limit(request, internal_reader_limiter, identifier=reader)
        return
    await enforce_rate_limit(request, public_vendor_limiter)


async def enforce_rate_limit(
    request: Request, limiter: SlidingWindowRateLimiter, identifier: str | None = None
) -> None:
    if identifier is None:
        identifier = client_ip_from_request(request)
    await limiter.check(identifier)
