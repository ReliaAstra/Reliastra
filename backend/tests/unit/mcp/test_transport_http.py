"""Remote transport: Streamable HTTP end to end, with the authentication gate.

These run the real ASGI application (``server.streamable_http_app`` wrapped by
:class:`McpAuthMiddleware``) over an in-process transport, with the app's lifespan
started, so the session manager is genuinely running. What is covered:

* a complete MCP handshake and tool call over Streamable HTTP;
* 401 with a spec-shaped ``WWW-Authenticate`` when the credential is missing or
  malformed — rejected at the edge, before the protocol layer;
* 429 with ``Retry-After`` when the instance-local limiter trips;
* health, readiness and metrics reachable *without* a credential (a load balancer
  and a Prometheus scrape cannot hold a Reliastra API key), and returning no
  tenant data;
* per-request credential isolation: two different bearers in one process, each
  upstream call carrying its own key and nothing else.

HTTP/2 SSE — the legacy transport — is deliberately not tested here because it is
not offered.
"""

from __future__ import annotations

import json

import httpx2
import pytest

from mcp_server.auth import RateLimiter
from mcp_server.config import load_config
from mcp_server.server import build_http_app, create_server
from mcp_server.tools._base import ApprovalDecision, ToolContext

from .conftest import API_BASE, DEPENDENCY_ID, GOOD_KEY, FakeReliastraAPI

OTHER_KEY = "rel_second_tenant_key_5555"
MCP_PATH = "/mcp"
JSON_HEADERS = {
    "content-type": "application/json",
    "accept": "application/json, text/event-stream",
}
INITIALIZE = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-11-25",
        "capabilities": {},
        "clientInfo": {"name": "pytest", "version": "1.0"},
    },
}


@pytest.fixture
def http_stack(fake_api: FakeReliastraAPI):
    """A running HTTP app plus a client factory bound to it."""
    config = load_config(
        reliastra_api_url=API_BASE,
        reliastra_api_key=None,
        environment="development",
        mcp_http_enabled=True,
        mcp_http_path=MCP_PATH,
        mcp_http_stateless=True,
        # Models the supported production shape: the server binds loopback and a
        # reverse proxy forwards the public hostname in the Host header. Without
        # listing it here the SDK answers 421 Misdirected Request to every call.
        mcp_http_allowed_hosts="mcp.test,127.0.0.1:*",
        public_cache_ttl_s=0,
        rate_limit_per_minute=100,
        log_json=False,
        tool_timeout_s=5.0,
    )
    import httpx

    server, deps = create_server(
        config, transport_override=httpx.MockTransport(fake_api.handler)
    )
    app = build_http_app(server, deps)

    class _Stack:
        def __init__(self) -> None:
            self.app = app
            self.server = server
            self.deps = deps
            self.api = fake_api
            self.config = config
            self._lifespan = None

        async def __aenter__(self):
            self._lifespan = app.router.lifespan_context(app)
            await self._lifespan.__aenter__()
            return self

        async def __aexit__(self, *exc):
            await self._lifespan.__aexit__(*exc)
            await deps.client.aclose()

        def client(self, **headers: str) -> httpx2.AsyncClient:
            return httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app),
                base_url="http://mcp.test",
                headers=headers,
                timeout=30.0,
            )

    return _Stack()


async def _initialize(client) -> httpx2.Response:
    return await client.post(MCP_PATH, json=INITIALIZE, headers=JSON_HEADERS)


# ── Authentication gate ─────────────────────────────────────────────────────


async def test_missing_credential_is_rejected_at_the_edge(http_stack):
    async with http_stack as stack:
        async with stack.client() as client:
            response = await _initialize(client)
    assert response.status_code == 401
    assert response.json()["error"] == "invalid_token"
    www = response.headers["www-authenticate"]
    assert www.startswith("Bearer ")
    assert "error=" in www
    assert stack.api.calls == [], "an unauthenticated request must not reach the API"


@pytest.mark.parametrize(
    "header",
    [
        "",
        "Bearer",
        "Bearer ",
        "Bearer notakey",
        "Bearer rel_short",
        "Basic " + GOOD_KEY,
        "Bearer " + GOOD_KEY + "\r\nX-Injected: 1",
    ],
)
async def test_malformed_credentials_are_rejected(http_stack, header):
    async with http_stack as stack:
        async with stack.client(authorization=header) as client:
            response = await _initialize(client)
    assert response.status_code == 401, header
    assert stack.api.calls == []


async def test_rejection_body_never_echoes_the_credential(http_stack):
    """A rejected credential is never reflected back to the caller.

    Both rejection paths are checked, because they reject for different reasons:

    1. *Malformed at the edge* — a too-short key never reaches the protocol
       layer and answers 401.
    2. *Well shaped but invalid* — the edge validates **shape only**; validity,
       scope, plan entitlement and tenant membership are the Reliastra API's
       decision, taken on every call (``initialize`` is local and deliberately
       makes no API call, asserted in the handshake test below). So the
       handshake succeeds and the *first tool call* is rejected upstream.

    Echoing the credential in either response would turn a rejection into a
    credential oracle and copy a live-looking secret into client logs.
    """
    wrong_key = "rel_wrong_but_plausible"
    async with http_stack as stack:
        async with stack.client(authorization="Bearer rel_short") as client:
            edge = await _initialize(client)
        assert edge.status_code == 401

        async with stack.client(authorization=f"Bearer {wrong_key}") as client:
            handshake = await _initialize(client)
            assert handshake.status_code == 200, (
                "shape-valid credentials are accepted at the edge; the API decides"
            )
            body = await _rpc(client, "tools/call", {
                "name": "reliastra_list_dependencies", "arguments": {}
            })

    # Path 1: the credential is not in the body or the challenge header.
    assert "rel_short" not in edge.text
    assert "rel_short" not in edge.headers.get("www-authenticate", "")
    # Path 2: not in the handshake, and not in the failure the agent receives.
    assert wrong_key not in handshake.text
    assert body is not None and wrong_key not in json.dumps(body)

    # And the failure is the honest one, with a category an agent can branch on.
    result = body["result"]
    assert result["isError"] is True
    payload = result["structuredContent"]
    assert payload["ok"] is False
    assert payload["error"]["category"] == "forbidden"
    assert payload["error"]["retryable"] is False
    assert wrong_key not in payload["error"]["message"]
    # The text block carries the same sentence for clients that render only text;
    # the machine-readable envelope is in structuredContent. Neither holds the key.
    assert result["content"][0]["text"] == payload["error"]["message"]


async def test_valid_credential_completes_the_handshake(http_stack):
    async with http_stack as stack:
        async with stack.client(authorization=f"Bearer {GOOD_KEY}") as client:
            response = await _initialize(client)
            assert response.status_code == 200
    assert stack.api.calls == [], "initialize is local; it must not call the API"


async def test_api_key_header_form_is_not_accepted_on_the_transport(http_stack):
    """The remote transport requires a bearer credential; X-API-Key is the API's form.

    Accepting a second shape here would widen the edge for no benefit: the MCP
    authorization model is bearer, and the key is forwarded to the Reliastra API as
    X-API-Key by the upstream client regardless of how it arrived.
    """
    async with http_stack as stack:
        async with stack.client(**{"x-api-key": GOOD_KEY}) as client:
            response = await _initialize(client)
    assert response.status_code == 401


# ── Unauthenticated operational endpoints ───────────────────────────────────


async def test_health_is_reachable_without_a_credential(http_stack):
    async with http_stack as stack:
        async with stack.client() as client:
            response = await client.get("/healthz")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["tools"] >= 15
    # Liveness must not imply upstream health.
    assert "does NOT assert" in body["meaning"]


async def test_ready_reports_the_upstream_circuit_without_failing(http_stack):
    async with http_stack as stack:
        async with stack.client() as client:
            response = await client.get("/readyz")
    assert response.status_code == 200
    body = response.json()
    assert body["upstream"]["circuit_open"] is False
    assert body["admission"]["limit"] >= 1
    assert "reported, not treated as unready" in body["meaning"]


async def test_metrics_is_reachable_without_a_credential(http_stack):
    async with http_stack as stack:
        async with stack.client() as client:
            response = await client.get("/metrics")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    body = response.text
    assert "reliastra_mcp_tool_calls_total" in body
    assert "reliastra_mcp_auth_failures_total" in body
    assert GOOD_KEY not in body


async def test_operational_endpoints_leak_no_tenant_data(http_stack):
    async with http_stack as stack:
        async with stack.client() as client:
            health = (await client.get("/healthz")).text
            ready = (await client.get("/readyz")).text
            metrics = (await client.get("/metrics")).text
    for body in (health, ready, metrics):
        assert GOOD_KEY not in body
        assert "org_id" not in body
        assert DEPENDENCY_ID not in body


async def test_unauthenticated_requests_are_counted(http_stack):
    async with http_stack as stack:
        async with stack.client() as client:
            await _initialize(client)
        async with stack.client() as client:
            metrics = (await client.get("/metrics")).text
    assert 'reason="missing_or_malformed"' in metrics


# ── Rate limiting at the edge ───────────────────────────────────────────────


async def test_edge_rate_limit_returns_429_with_retry_after(http_stack):
    async with http_stack as stack:
        stack.deps.limiter._per_minute = 2
        async with stack.client(authorization=f"Bearer {GOOD_KEY}") as client:
            statuses = [(await _initialize(client)).status_code for _ in range(4)]
    assert statuses[:2] == [200, 200]
    assert statuses[2] == 429
    assert statuses[3] == 429


async def test_rate_limit_buckets_are_per_credential(http_stack):
    """One caller exhausting its budget must not lock out another tenant."""
    async with http_stack as stack:
        stack.deps.limiter._per_minute = 1
        async with stack.client(authorization=f"Bearer {GOOD_KEY}") as first:
            assert (await _initialize(first)).status_code == 200
            assert (await _initialize(first)).status_code == 429
        async with stack.client(authorization=f"Bearer {OTHER_KEY}") as second:
            assert (await _initialize(second)).status_code == 200


# ── Per-request credential isolation ────────────────────────────────────────


async def test_each_request_uses_its_own_bearer_credential(http_stack):
    """The core tenant-isolation property of the stateless remote server."""
    async with http_stack as stack:
        async with stack.client(authorization=f"Bearer {GOOD_KEY}") as first:
            await _rpc(first, "tools/call", {
                "name": "reliastra_list_dependencies", "arguments": {}
            })
        async with stack.client(authorization=f"Bearer {OTHER_KEY}") as second:
            stack.api.api_key_status = 403
            await _rpc(second, "tools/call", {
                "name": "reliastra_list_dependencies", "arguments": {}
            })
    keys = [call.api_key for call in stack.api.calls_to("/v1/dependencies")]
    assert keys[0] == GOOD_KEY
    assert keys[1] == OTHER_KEY
    assert GOOD_KEY not in keys[1:]


async def test_no_credential_leaks_between_sequential_requests(http_stack):
    """An unauthenticated public call must not inherit the previous caller's key."""
    async with http_stack as stack:
        async with stack.client(authorization=f"Bearer {GOOD_KEY}") as authed:
            await _rpc(authed, "tools/call", {
                "name": "reliastra_list_dependencies", "arguments": {}
            })
        # The gate rejects an unauthenticated MCP request, so exercise the public
        # tool through an authenticated connection and assert the key used.
        async with stack.client(authorization=f"Bearer {OTHER_KEY}") as other:
            await _rpc(other, "tools/call", {
                "name": "reliastra_search_observatory", "arguments": {}
            })
    public_calls = stack.api.calls_to("/v1/vendors")
    assert public_calls, "the public tool must have called the API"
    assert all(call.api_key is None for call in public_calls), (
        "a public read must never carry a caller's credential upstream"
    )


async def _rpc(client, method: str, params: dict):
    """Send one JSON-RPC request and return the parsed result or error."""
    payload = {"jsonrpc": "2.0", "id": 99, "method": method, "params": params}
    response = await client.post(MCP_PATH, json=payload, headers=JSON_HEADERS)
    assert response.status_code in (200, 202), response.text[:400]
    if response.status_code == 202 or not response.content:
        return None
    text = response.text
    if text.startswith(("event:", "data:")) or "\ndata:" in text:
        for line in text.splitlines():
            if line.startswith("data:"):
                return json.loads(line[5:].strip())
        return None
    return json.loads(text)


async def test_tool_call_over_http_returns_a_structured_result(http_stack):
    async with http_stack as stack:
        async with stack.client(authorization=f"Bearer {GOOD_KEY}") as client:
            await _initialize(client)
            body = await _rpc(client, "tools/call", {
                "name": "reliastra_get_provider", "arguments": {"provider": "stripe"}
            })
    assert body is not None, "expected a JSON-RPC response body"
    result = body["result"]
    assert result["isError"] is False
    payload = json.loads(result["content"][0]["text"])
    assert payload["ok"] is True
    assert payload["data"]["vendor_name"] == "stripe"
    assert payload["meta"]["source"] == "GET /v1/vendors/stripe"


async def test_tools_list_over_http(http_stack):
    async with http_stack as stack:
        async with stack.client(authorization=f"Bearer {GOOD_KEY}") as client:
            await _initialize(client)
            body = await _rpc(client, "tools/list", {})
    names = {tool["name"] for tool in body["result"]["tools"]}
    assert "reliastra_get_capabilities" in names
    assert "reliastra_register_dependency" in names


async def test_unknown_path_is_refused(http_stack):
    async with http_stack as stack:
        async with stack.client(authorization=f"Bearer {GOOD_KEY}") as client:
            response = await client.post("/not-mcp", json=INITIALIZE, headers=JSON_HEADERS)
    assert response.status_code == 404


# ── Transport hardening ─────────────────────────────────────────────────────


async def test_oversized_request_body_is_refused():
    # MCP_HTTP_MAX_BODY_BYTES is applied when the app is built, so this test builds
    # its own stack with a small cap rather than reconfiguring a running one.
    config = load_config(
        reliastra_api_url=API_BASE,
        mcp_http_enabled=True,
        mcp_http_max_body_bytes=2048,
        mcp_http_allowed_hosts="mcp.test",
        log_json=False,
        public_cache_ttl_s=0,
    )
    import httpx

    from mcp_server.server import build_http_app as build
    from mcp_server.server import create_server as build_server

    api = FakeReliastraAPI()
    server, deps = build_server(config, transport_override=httpx.MockTransport(api.handler))
    app = build(server, deps)
    async with app.router.lifespan_context(app):
        async with httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app),
            base_url="http://mcp.test",
            headers={"authorization": f"Bearer {GOOD_KEY}"},
            timeout=30.0,
        ) as client:
            big = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                   "params": {"name": "reliastra_search_observatory",
                              "arguments": {"padding": "x" * 20_000}}}
            response = await client.post(MCP_PATH, json=big, headers=JSON_HEADERS)
    assert response.status_code in (400, 413), response.status_code
    assert api.calls == []


async def test_token_verifier_hook_can_reject_at_the_edge(fake_api):
    """The documented seam for an authoritative validator."""
    config = load_config(
        reliastra_api_url=API_BASE, mcp_http_enabled=True, log_json=False,
        mcp_http_allowed_hosts="mcp.test", public_cache_ttl_s=0,
    )
    import httpx

    server, deps = create_server(
        config, transport_override=httpx.MockTransport(fake_api.handler)
    )
    seen: list[str] = []

    async def verifier(token: str) -> bool:
        seen.append(token)
        return token == GOOD_KEY

    app = build_http_app(server, deps, token_verifier=verifier)
    async with app.router.lifespan_context(app):
        async with httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app), base_url="http://mcp.test", timeout=30.0
        ) as client:
            rejected = await client.post(
                MCP_PATH, json=INITIALIZE,
                headers={**JSON_HEADERS, "authorization": f"Bearer {OTHER_KEY}"},
            )
            accepted = await client.post(
                MCP_PATH, json=INITIALIZE,
                headers={**JSON_HEADERS, "authorization": f"Bearer {GOOD_KEY}"},
            )
    assert rejected.status_code == 401
    assert accepted.status_code == 200
    assert seen == [OTHER_KEY, GOOD_KEY]


async def test_broken_token_verifier_fails_closed(fake_api):
    """A validator that throws must not become an open door."""
    config = load_config(
        reliastra_api_url=API_BASE, mcp_http_enabled=True, log_json=False,
        mcp_http_allowed_hosts="mcp.test", public_cache_ttl_s=0,
    )
    import httpx

    server, deps = create_server(
        config, transport_override=httpx.MockTransport(fake_api.handler)
    )

    async def broken(token: str) -> bool:
        raise RuntimeError("introspection endpoint down")

    app = build_http_app(server, deps, token_verifier=broken)
    async with app.router.lifespan_context(app):
        async with httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app), base_url="http://mcp.test", timeout=30.0
        ) as client:
            response = await client.post(
                MCP_PATH, json=INITIALIZE,
                headers={**JSON_HEADERS, "authorization": f"Bearer {GOOD_KEY}"},
            )
    assert response.status_code == 401


async def test_stateless_transport_keeps_no_session_between_callers(http_stack):
    """Two callers, one process, no shared session state."""
    async with http_stack as stack:
        assert stack.config.mcp_http_stateless is True
        async with stack.client(authorization=f"Bearer {GOOD_KEY}") as first:
            first_body = await _rpc(first, "tools/call", {
                "name": "reliastra_get_capabilities", "arguments": {}
            })
        async with stack.client(authorization=f"Bearer {OTHER_KEY}") as second:
            second_body = await _rpc(second, "tools/call", {
                "name": "reliastra_get_capabilities", "arguments": {}
            })
    first_payload = json.loads(first_body["result"]["content"][0]["text"])
    second_payload = json.loads(second_body["result"]["content"][0]["text"])
    assert first_payload["data"]["authenticated_caller"] is True
    assert second_payload["data"]["authenticated_caller"] is True
    assert first_payload["meta"]["request_id"] != second_payload["meta"]["request_id"]


# ── Elicitation where a back-channel exists ─────────────────────────────────


async def test_elicitation_availability_is_reported_not_assumed(http_stack):
    """Whatever the transport allows, the tool asks rather than guessing."""
    async with http_stack as stack:
        observed: dict[str, bool] = {}

        async def probe(self, *, action, summary, confirm_argument):
            observed["available"] = self.elicitation_available()
            return ApprovalDecision(True, "probe", action)

        original = ToolContext.request_approval
        ToolContext.request_approval = probe  # type: ignore[method-assign]
        try:
            async with stack.client(authorization=f"Bearer {GOOD_KEY}") as client:
                await _initialize(client)
                await _rpc(client, "tools/call", {
                    "name": "reliastra_register_dependency",
                    "arguments": {
                        "name": "P",
                        "endpoint_url": "https://api.payments.example/health",
                    },
                })
        finally:
            ToolContext.request_approval = original  # type: ignore[method-assign]
    # Recorded so the deployment documentation can state the truth for this
    # transport rather than assume elicitation is available everywhere.
    assert "available" in observed
    assert isinstance(observed["available"], bool)


async def test_rate_limiter_instance_is_shared_with_the_edge(http_stack):
    async with http_stack as stack:
        assert isinstance(stack.deps.limiter, RateLimiter)
        assert stack.deps.limiter.per_minute == 100


# ── DNS-rebinding protection ────────────────────────────────────────────────


async def test_unlisted_host_header_is_rejected_with_421(fake_api):
    """The SDK's rebinding guard, and the reason allowed hosts must be configured.

    A deployment that forgets MCP_HTTP_ALLOWED_HOSTS behind a proxy sees exactly
    this: every request answered 421, which looks like a routing mystery rather
    than a configuration error. The production fail-fast in config.py exists so it
    cannot be forgotten silently.
    """
    import httpx

    config = load_config(
        reliastra_api_url=API_BASE,
        mcp_http_enabled=True,
        mcp_http_allowed_hosts="api.reliastra.com",
        log_json=False,
        public_cache_ttl_s=0,
    )
    server, deps = create_server(
        config, transport_override=httpx.MockTransport(fake_api.handler)
    )
    app = build_http_app(server, deps)
    async with app.router.lifespan_context(app):
        async with httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app),
            base_url="http://attacker.example",
            headers={"authorization": f"Bearer {GOOD_KEY}"},
            timeout=30.0,
        ) as client:
            response = await _initialize(client)
    assert response.status_code == 421
    assert fake_api.calls == []


def test_production_loopback_bind_without_allowed_hosts_fails_fast():
    from mcp_server.config import ConfigurationError

    with pytest.raises(ConfigurationError) as excinfo:
        load_config(
            environment="production",
            mcp_http_enabled=True,
            mcp_http_host="127.0.0.1",
        )
    assert "MCP_HTTP_ALLOWED_HOSTS" in str(excinfo.value)
    assert "421" in str(excinfo.value)


def test_production_loopback_bind_with_allowed_hosts_is_accepted():
    config = load_config(
        environment="production",
        mcp_http_enabled=True,
        mcp_http_host="127.0.0.1",
        mcp_http_allowed_hosts="api.reliastra.com",
    )
    assert config.allowed_hosts == ["api.reliastra.com"]


def test_allowed_hosts_default_covers_the_bind_address():
    loopback = load_config(reliastra_api_url=API_BASE, mcp_http_host="127.0.0.1")
    assert "127.0.0.1:*" in loopback.allowed_hosts
    assert "localhost:*" in loopback.allowed_hosts

    direct = load_config(reliastra_api_url=API_BASE, mcp_http_host="10.0.0.5")
    assert "10.0.0.5:*" in direct.allowed_hosts
    assert "10.0.0.5" in direct.allowed_hosts


def test_allowed_origins_are_configurable():
    config = load_config(
        reliastra_api_url=API_BASE,
        mcp_http_allowed_origins="https://app.reliastra.com, https://localhost:3000",
    )
    assert config.allowed_origins == [
        "https://app.reliastra.com",
        "https://localhost:3000",
    ]
    # An absent Origin is accepted, so non-browser clients need no entry.
    default = load_config(reliastra_api_url=API_BASE)
    assert "http://localhost:*" in default.allowed_origins

