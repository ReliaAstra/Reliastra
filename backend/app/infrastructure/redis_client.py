import asyncio
import logging
from typing import Any
import redis.asyncio as aioredis
from app.config import settings

logger = logging.getLogger(__name__)

_redis_client: aioredis.Redis | None = None

# Tight timeouts so an unreachable Redis never blocks the event loop.
# socket_connect_timeout: max seconds to establish a TCP connection.
# socket_timeout: max seconds to wait for a response after connected.
_SOCKET_CONNECT_TIMEOUT = 1.5
_SOCKET_TIMEOUT = 1.5


def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=_SOCKET_CONNECT_TIMEOUT,
            socket_timeout=_SOCKET_TIMEOUT,
            retry_on_timeout=False,
        )
    return _redis_client


async def safe_redis_get(key: str, timeout: float = 2.0) -> str | None:
    """Get a key from Redis with an overall asyncio timeout.

    Returns ``None`` on *any* failure (Redis down, timeout, decoding error)
    so callers never need to wrap this in try/except.
    """
    try:
        redis = get_redis()
        return await asyncio.wait_for(redis.get(key), timeout=timeout)
    except Exception:
        logger.debug("safe_redis_get failed for key=%s", key, exc_info=True)
        return None


async def safe_redis_set(key: str, value: str, ex: int | None = None, timeout: float = 2.0) -> bool:
    """Set a key in Redis with an overall asyncio timeout.

    Returns ``True`` on success, ``False`` on any failure.
    """
    try:
        redis = get_redis()
        await asyncio.wait_for(redis.set(key, value, ex=ex), timeout=timeout)
        return True
    except Exception:
        logger.debug("safe_redis_set failed for key=%s", key, exc_info=True)
        return False


async def safe_redis_setex(key: str, seconds: int, value: str, timeout: float = 2.0) -> bool:
    """SET-EX wrapper with asyncio timeout safety."""
    try:
        redis = get_redis()
        await asyncio.wait_for(
            redis.setex(key, seconds, value), timeout=timeout
        )
        return True
    except Exception:
        logger.debug("safe_redis_setex failed for key=%s", key, exc_info=True)
        return False


async def safe_redis_claim(
    key: str, value: str = "1", ex: int | None = None, timeout: float = 2.0
) -> bool | None:
    """SET NX that distinguishes "already claimed" from "Redis unavailable".

    Returns:
        True  — the key was newly created; the caller owns the claim.
        False — the key already existed; this is a genuine duplicate.
        None  — Redis could not be reached, so duplication is UNKNOWN.

    This is the ONLY SET-NX primitive. Its predecessor ``safe_redis_set_nx``
    returned a plain ``bool``, collapsing "duplicate" and "Redis down" into
    ``False`` — which silently turned a Redis outage into "everything is a
    duplicate" and dropped Paystack payments and outage alerts on the floor.
    It was deleted rather than deprecated so the ambiguity cannot come back.

    Callers MUST branch on all three states explicitly (``is True`` /
    ``is False`` / ``is None``); ``if not claimed`` is a bug here, because it
    treats an unreachable Redis as a duplicate.
    """
    try:
        redis = get_redis()
        result = await asyncio.wait_for(
            redis.set(key, value, nx=True, ex=ex), timeout=timeout
        )
        return bool(result)
    except Exception:
        logger.warning(
            "safe_redis_claim could not reach Redis for key=%s; "
            "caller must decide whether to fail open",
            key,
            exc_info=True,
        )
        return None


async def safe_redis_incr(key: str, timeout: float = 2.0) -> int | None:
    """INCR wrapper — returns the new value, or None on Redis failure."""
    try:
        redis = get_redis()
        return int(await asyncio.wait_for(redis.incr(key), timeout=timeout))
    except Exception:
        logger.debug("safe_redis_incr failed for key=%s", key, exc_info=True)
        return None


async def safe_redis_ping(timeout: float = 2.0) -> bool:
    """Ping Redis with asyncio timeout. Returns True if reachable."""
    try:
        redis = get_redis()
        await asyncio.wait_for(redis.ping(), timeout=timeout)
        return True
    except Exception:
        return False


async def safe_redis_delete(key: str, timeout: float = 2.0) -> bool:
    """Delete a key with asyncio timeout safety."""
    try:
        redis = get_redis()
        await asyncio.wait_for(redis.delete(key), timeout=timeout)
        return True
    except Exception:
        logger.debug("safe_redis_delete failed for key=%s", key, exc_info=True)
        return False


async def safe_redis_exists(key: str, timeout: float = 2.0) -> bool:
    """Check key existence with asyncio timeout safety."""
    try:
        redis = get_redis()
        result = await asyncio.wait_for(redis.exists(key), timeout=timeout)
        return bool(result)
    except Exception:
        return False


def set_test_redis(client: Any) -> None:
    global _redis_client
    _redis_client = client


async def close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.close()
        _redis_client = None
