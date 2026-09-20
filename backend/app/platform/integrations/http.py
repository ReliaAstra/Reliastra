"""Shared outbound HTTP clients (one pool per integration).

Every outbound call goes through here so pooling, timeouts, User-Agent and
trace propagation are configured once instead of per module:

* :func:`get_shared_client` — pooled ``httpx.AsyncClient`` per *name*,
  created on first use, closed by :func:`aclose_shared_clients` (or by the
  module-level ``close_*`` delegating to it).
* :func:`build_client` — a fresh caller-managed client for per-call lifecycles
  (``async with build_client(...) as client``). Same defaults, no sharing.
* :class:`TracingTransport` — wraps any transport and injects the ambient
  ``traceparent`` + ``X-Request-ID`` into each request.

Tests: :func:`reset_shared_clients` drops every pool (the autouse
``_reset_http_pools`` fixture in ``tests/conftest.py`` calls it), so a client
built under one test's mocks never serves another test.
"""

from __future__ import annotations

import logging

import httpx

from app.platform.observability.tracing import traced_headers

logger = logging.getLogger(__name__)

#: Identifies Reliastra's own outbound traffic (support threads start here).
DEFAULT_USER_AGENT = "Reliastra/1.0 (+https://reliastra.com)"

_clients: dict[str, httpx.AsyncClient] = {}


class TracingTransport(httpx.AsyncBaseTransport):
    """Transport wrapper that propagates the ambient trace downstream.

    Reads :func:`traced_headers` at request time (not client-build time) so
    a pooled client propagates each caller's own trace, and never overrides
    headers the caller set explicitly.
    """

    def __init__(self, wrapped: httpx.AsyncBaseTransport) -> None:
        self._wrapped = wrapped

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        for name, value in traced_headers().items():
            if name.lower() not in request.headers:
                request.headers[name] = value
        return await self._wrapped.handle_async_request(request)

    async def aclose(self) -> None:
        await self._wrapped.aclose()


def build_client(
    name: str,
    *,
    timeout: float | httpx.Timeout = 10.0,
    limits: httpx.Limits | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
    headers: dict[str, str] | None = None,
    follow_redirects: bool = False,
) -> httpx.AsyncClient:
    """Build a fresh client with Reliastra defaults (caller owns its lifecycle)."""
    merged = {"user-agent": DEFAULT_USER_AGENT}
    if headers:
        merged.update(headers)
    base = transport or httpx.AsyncHTTPTransport(
        limits=limits or httpx.Limits(max_connections=20, max_keepalive_connections=5)
    )
    # A caller-supplied (e.g. SSRF-pinned) transport is wrapped, never
    # replaced: pinning stays authoritative for where the bytes go.
    return httpx.AsyncClient(
        transport=TracingTransport(base),
        timeout=timeout,
        headers=merged,
        follow_redirects=follow_redirects,
    )


def get_shared_client(
    name: str,
    *,
    timeout: float | httpx.Timeout = 10.0,
    limits: httpx.Limits | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
    headers: dict[str, str] | None = None,
) -> httpx.AsyncClient:
    """Return the pooled client for *name*, creating it on first use.

    The first call wins: later calls with different parameters return the
    existing pool (a pool is one configuration by construction). Use distinct
    names for genuinely different configurations.
    """
    client = _clients.get(name)
    if client is None:
        client = build_client(name, timeout=timeout, limits=limits, transport=transport, headers=headers)
        _clients[name] = client
        logger.debug("created shared HTTP client %r", name)
    return client


async def aclose_shared_client(name: str) -> None:
    """Close and drop the pooled client for *name* (no-op when absent)."""
    client = _clients.pop(name, None)
    if client is not None:
        try:
            await client.aclose()
        except Exception:  # pragma: no cover - close must never raise
            logger.debug("error closing shared HTTP client %r", name, exc_info=True)


async def aclose_shared_clients() -> None:
    """Close and drop every pooled client (lifespan shutdown)."""
    for name in list(_clients):
        await aclose_shared_client(name)


async def reset_shared_clients() -> None:
    """Test helper: close every pool so the next test builds fresh clients."""
    await aclose_shared_clients()
