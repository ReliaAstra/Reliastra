"""app.infrastructure.ipgeo — backward-compatibility alias.

Canonical home: ``app.platform.integrations.ipgeo``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.integrations.ipgeo import (  # noqa: F401
    annotations,
    country_from_headers,
    get_redis,
    hash_ip,
    hashlib,
    httpx,
    ipaddress,
    is_public_ip,
    logger,
    logging,
    resolve_country,
    safe_redis_get,
    safe_redis_setex,
)

__all__ = [
    "annotations",
    "country_from_headers",
    "get_redis",
    "hash_ip",
    "hashlib",
    "httpx",
    "ipaddress",
    "is_public_ip",
    "logger",
    "logging",
    "resolve_country",
    "safe_redis_get",
    "safe_redis_setex",

]
