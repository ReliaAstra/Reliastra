"""app.infrastructure.redis_client — backward-compatibility alias.

Canonical home: ``app.platform.integrations.redis``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.integrations.redis import (  # noqa: F401
    Any,
    aioredis,
    asyncio,
    close_redis,
    get_redis,
    logger,
    logging,
    safe_redis_claim,
    safe_redis_delete,
    safe_redis_exists,
    safe_redis_get,
    safe_redis_incr,
    safe_redis_ping,
    safe_redis_set,
    safe_redis_setex,
    set_test_redis,
    settings,
    _SOCKET_CONNECT_TIMEOUT,
    _SOCKET_TIMEOUT,
    _redis_client,
)

__all__ = [
    "Any",
    "aioredis",
    "asyncio",
    "close_redis",
    "get_redis",
    "logger",
    "logging",
    "safe_redis_claim",
    "safe_redis_delete",
    "safe_redis_exists",
    "safe_redis_get",
    "safe_redis_incr",
    "safe_redis_ping",
    "safe_redis_set",
    "safe_redis_setex",
    "set_test_redis",
    "settings",

]
