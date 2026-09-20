"""app.core.rate_limit — backward-compatibility alias.

Canonical home: ``app.platform.web.rate_limit``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.web.rate_limit import (  # noqa: F401
    RateLimitExceededException,
    Request,
    SlidingWindowRateLimiter,
    annotations,
    api_key_limiter,
    check_trigger_limiter,
    client_ip_from_request,
    enforce_rate_limit,
    ip_limiter,
    ipaddress,
    logger,
    logging,
    public_vendor_limiter,
    settings,
    time,
)

__all__ = [
    "RateLimitExceededException",
    "Request",
    "SlidingWindowRateLimiter",
    "annotations",
    "api_key_limiter",
    "check_trigger_limiter",
    "client_ip_from_request",
    "enforce_rate_limit",
    "ip_limiter",
    "ipaddress",
    "logger",
    "logging",
    "public_vendor_limiter",
    "settings",
    "time",

]
