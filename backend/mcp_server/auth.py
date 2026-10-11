"""Caller credentials and instance-local rate limiting.

Credential model (API-key pass-through, per user decision):
- Remote (Streamable HTTP): every request must carry
  ``Authorization: Bearer <reliastra-api-key>``. The middleware validates the
  *format* only (``rel_`` prefix, sane length); validity, scopes and tenant
  isolation are enforced by the Reliastra API itself on each call. Invalid or
  missing credentials are rejected at the transport with plain HTTP 401/429 —
  they never reach a tool.
- Local (stdio): the key comes from ``RELIASTRA_API_KEY``; it may be absent,
  in which case only public tools work and authed tools fail closed.

The resolved key travels in a :class:`ContextVar` (never globals, never the
shared HTTP client), set per request and always reset afterwards, so one
caller's credential cannot leak into another request — including across the
stateless HTTP transport where consecutive requests may belong to different
tenants.

Rate limiting is an in-memory sliding window, per credential (or per client
IP for unauthenticated public reads). It is instance-local: a fleet needs
gateway-level limiting in front. Limits are documented in the capability
registry rather than hidden.
"""

from __future__ import annotations

import time
from collections import deque
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse

from .config import McpServerConfig
from .observability import METRICS

_request_api_key: ContextVar[str | None] = ContextVar("mcp_request_api_key", default=None)


def get_caller_key(fallback: str | None = None) -> str | None:
    """Credential for this request: per-request key first, env fallback."""
    return _request_api_key.get() or fallback


class RateLimiter:
    """Sliding-window limiter. ``allow`` returns retry-after seconds on deny."""

    def __init__(self, per_minute: int) -> None:
        self._per_minute = per_minute
        self._hits: dict[str, deque[float]] = {}

    def allow(self, key: str) -> float | None:
        now = time.monotonic()
        window_start = now - 60.0
        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] <= window_start:
            hits.popleft()
        if len(hits) >= self._per_minute:
            return max(0.0, hits[0] + 60.0 - now)
        hits.append(now)
        # Opportunistic cleanup so idle callers don't accumulate forever.
        if len(self._hits) > 4096:
            for stale in [k for k, v in self._hits.items() if not v]:
                del self._hits[stale]
        return None


def _bearer_key(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None
    key = value.strip()
    return key if key.startswith("rel_") and len(key) >= 12 else None


class McpAuthMiddleware(BaseHTTPMiddleware):
    """Transport gate for the remote server. No bypass paths exist."""

    def __init__(self, app, config: McpServerConfig, limiter: RateLimiter) -> None:  # type: ignore[no-untyped-def]
        super().__init__(app)
        self._config = config
        self._limiter = limiter

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):  # type: ignore[no-untyped-def]
        if request.url.path == "/healthz":
            return await call_next(request)
        key = _bearer_key(request)
        if key is None:
            return JSONResponse(
                {"error": "missing or malformed Authorization: Bearer <rel_...api-key>"},
                status_code=401,
            )
        identity = f"key:{key[-8:]}"  # suffix only; never the key itself
        retry_after = self._limiter.allow(identity)
        if retry_after is not None:
            METRICS.rate_limited()
            return JSONResponse(
                {"error": "rate limit exceeded, back off and retry"},
                status_code=429,
                headers={"Retry-After": str(int(retry_after) + 1)},
            )
        token = _request_api_key.set(key)
        try:
            return await call_next(request)
        finally:
            _request_api_key.reset(token)
