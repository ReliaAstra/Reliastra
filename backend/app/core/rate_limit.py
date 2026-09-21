"""app.core.rate_limit — backward-compatibility alias.

Canonical home: ``app.platform.web.rate_limit``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.web.rate_limit import (  # noqa: F401
    INTERNAL_READER_IDENTITY,
    RateLimitExceededException,
    Request,
    SlidingWindowRateLimiter,
    annotations,
    api_key_limiter,
    check_trigger_limiter,
    client_ip_from_request,
    enforce_public_read_limit,
    enforce_rate_limit,
    internal_reader_identity,
    internal_reader_limiter,
    ip_limiter,
    ipaddress,
    logger,
    logging,
    public_vendor_limiter,
    secrets,
    settings,
    time,
    _RATE_LIMIT_REDIS_TIMEOUT,
    _READER_HEADER,
    _TRUSTED_PROXY_HOPS,
)

__all__ = [
    "INTERNAL_READER_IDENTITY",
    "RateLimitExceededException",
    "Request",
    "SlidingWindowRateLimiter",
    "annotations",
    "api_key_limiter",
    "check_trigger_limiter",
    "client_ip_from_request",
    "enforce_public_read_limit",
    "enforce_rate_limit",
    "internal_reader_identity",
    "internal_reader_limiter",
    "ip_limiter",
    "ipaddress",
    "logger",
    "logging",
    "public_vendor_limiter",
    "secrets",
    "settings",
    "time",

]
