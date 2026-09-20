"""Shared HTTP factory: one pool per integration, traced by default."""

import httpx
import pytest

from app.platform.integrations import http as http_factory
from app.platform.integrations.http import (
    DEFAULT_USER_AGENT,
    TracingTransport,
    aclose_shared_client,
    build_client,
    get_shared_client,
    reset_shared_clients,
)
from app.platform.observability.tracing import (
    get_trace_context,
    new_trace,
    reset_trace_context,
    set_trace_context,
)


@pytest.fixture(autouse=True)
async def _clean_pools():
    await reset_shared_clients()
    yield
    await reset_shared_clients()


def test_shared_client_is_pooled_per_name():
    first = get_shared_client("pooled-a")
    second = get_shared_client("pooled-a")
    assert first is second
    assert get_shared_client("pooled-b") is not first


def test_shared_client_carries_the_reliastra_user_agent():
    client = get_shared_client("pooled-ua")
    assert client.headers["user-agent"] == DEFAULT_USER_AGENT


def test_build_client_is_fresh_every_time():
    assert build_client("x") is not build_client("x")


@pytest.mark.asyncio
async def test_close_drops_the_pool_so_next_get_rebuilds():
    first = get_shared_client("pooled-close")
    await aclose_shared_client("pooled-close")
    assert first.is_closed
    second = get_shared_client("pooled-close")
    assert second is not first
    assert not second.is_closed


@pytest.mark.asyncio
async def test_reset_clears_everything():
    get_shared_client("pooled-r1")
    get_shared_client("pooled-r2")
    await reset_shared_clients()
    assert http_factory._clients == {}


@pytest.mark.asyncio
async def test_tracing_transport_propagates_the_ambient_trace():
    seen: dict[str, str] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.update(request.headers)
        return httpx.Response(200, json={"ok": True})

    token = set_trace_context(new_trace())
    try:
        transport = TracingTransport(httpx.MockTransport(handler))
        async with httpx.AsyncClient(transport=transport) as client:
            await client.get("https://example.com/")
    finally:
        reset_trace_context(token)
    assert get_trace_context() is None
    assert "traceparent" in seen


@pytest.mark.asyncio
async def test_tracing_transport_never_overrides_explicit_headers():
    seen: dict[str, str] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.update(request.headers)
        return httpx.Response(200, json={"ok": True})

    token = set_trace_context(new_trace())
    try:
        transport = TracingTransport(httpx.MockTransport(handler))
        async with httpx.AsyncClient(transport=transport) as client:
            await client.get("https://example.com/", headers={"traceparent": "custom"})
    finally:
        reset_trace_context(token)
    assert seen["traceparent"] == "custom"


@pytest.mark.asyncio
async def test_build_client_wraps_caller_transports():
    """SSRF-pinned transports keep working through the factory."""

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"ok": True})

    token = set_trace_context(new_trace())
    try:
        async with build_client(
            "wrapped", transport=httpx.MockTransport(handler)
        ) as client:
            response = await client.get("https://example.com/")
            assert response.status_code == 200
    finally:
        reset_trace_context(token)
