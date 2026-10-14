"""Reliability: timeouts, retries, circuit breaking, and honest failure reporting.

The property that matters most is the last group: an upstream outage must surface as
an explicit failure, never as an empty success. An agent that receives ``items: []``
when the API is down will tell a user "no incidents", which is a false statement
about the world produced by an infrastructure problem.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest

from mcp_server.cache import PublicCache
from mcp_server.config import load_config
from mcp_server.errors import ToolFailure
from mcp_server.upstream import ReliastraClient, _CircuitBreaker

from .conftest import (
    API_BASE,
    GOOD_KEY,
    INCIDENT_ID,
    VENDOR_RECORD,
    VERIFICATION_ID,
    call_tool,
    call_tool_expect_error,
)

# ── Never turn an upstream failure into an empty success ────────────────────


async def test_upstream_outage_is_never_an_empty_incident_list(built):
    """The single most dangerous failure mode for an evidence product."""
    server, deps, api = built
    api.fail_always("/v1/public/incidents", httpx.ConnectError("connection refused"))
    failure = await call_tool_expect_error(server, "reliastra_search_incidents")
    assert failure["category"] == "upstream_unavailable"
    assert failure["retryable"] is True
    assert "connection refused" not in json.dumps(failure)


async def test_upstream_outage_is_never_an_empty_dependency_list(built):
    server, deps, api = built
    deps.config.reliastra_api_key = GOOD_KEY
    api.fail_always("/v1/dependencies", httpx.ConnectError("no route to host"))
    failure = await call_tool_expect_error(server, "reliastra_list_dependencies")
    assert failure["category"] == "upstream_unavailable"


async def test_upstream_outage_is_never_an_empty_observatory(built):
    server, deps, api = built
    api.fail_always("/v1/vendors", httpx.ReadTimeout("read timed out"))
    failure = await call_tool_expect_error(server, "reliastra_search_observatory")
    assert failure["category"] == "upstream_timeout"
    assert failure["retryable"] is True


async def test_non_json_upstream_body_is_refused_not_guessed(built):
    server, deps, api = built
    api.inject("/v1/vendors", (200, "<html>gateway error page</html>"))
    # The fake returns a JSON-encoded string for a str payload, so simulate a
    # genuinely unparseable body at the transport level instead.
    def html_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"<html>not json</html>",
                              headers={"content-type": "text/html"})

    deps.client._http = httpx.AsyncClient(
        base_url=API_BASE, transport=httpx.MockTransport(html_handler)
    )
    failure = await call_tool_expect_error(server, "reliastra_search_observatory")
    assert failure["category"] == "upstream_invalid"
    assert "not valid JSON" in failure["message"]


async def test_error_envelope_behind_a_200_is_never_an_empty_success(built):
    """A success status carrying the API's error body is a contract violation.

    This suite found the failure mode for real: an invalid key was answered with
    HTTP 200 and ``{"error": {"code": "UNAUTHORIZED", ...}}``, and the tool
    reported ``ok: true`` with ``dependencies: []`` — telling an agent "nothing
    is monitored" when the truth was "you may not look". The client now refuses
    such a body instead of parsing it as data.
    """
    server, deps, api = built
    deps.config.reliastra_api_key = GOOD_KEY
    api.inject(
        "/v1/dependencies",
        (200, {"error": {"code": "UNAUTHORIZED", "message": "Invalid API key"}}),
    )
    failure = await call_tool_expect_error(server, "reliastra_list_dependencies")
    # The status is no evidence, so the envelope's own code classifies it.
    assert failure["category"] == "forbidden"
    assert failure["retryable"] is False
    assert "Invalid API key" not in json.dumps(failure)
    assert GOOD_KEY not in json.dumps(failure)


async def test_error_envelope_with_an_unknown_code_is_an_upstream_error(built):
    """An unrecognised envelope code is reported, not retried and not guessed at."""
    server, deps, api = built
    api.inject("/v1/vendors", (200, {"error": {"code": "TEAPOT", "message": "nope"}}))
    failure = await call_tool_expect_error(server, "reliastra_search_observatory")
    assert failure["category"] == "upstream_error"
    assert failure["retryable"] is False
    assert "nope" in failure["message"]


async def test_partial_success_body_is_not_mistaken_for_an_error_envelope(built):
    """The guard is deliberately narrow.

    A payload that carries data *alongside* an ``error`` key is a partial-success
    shape, not a refusal, and must still be served. Only a body whose entire
    content is the error envelope is discarded.
    """
    server, deps, api = built
    api.inject(
        "/v1/vendors",
        (200, {"items": [VENDOR_RECORD], "error": {"code": "PARTIAL", "message": "one skipped"}}),
    )
    result = await call_tool(server, "reliastra_search_observatory")
    assert result["ok"] is True
    assert result["data"]["providers"], "the data in a partial body must survive"


async def test_oversized_upstream_response_is_refused_not_truncated(make_built):
    server, deps, api = make_built(upstream_max_response_bytes=4096)
    big = {"items": [{"vendor_name": f"v{i}", "description": "x" * 200} for i in range(60)]}
    api.inject("/v1/vendors", big)
    failure = await call_tool_expect_error(server, "reliastra_search_observatory")
    assert failure["category"] == "upstream_invalid"
    assert "larger than" in failure["message"]


async def test_verification_service_degraded_is_reported_not_flattened(built):
    """503 from /v1/verify means 'could not check', not 'invalid' and not 'absent'."""
    server, deps, api = built
    api.verification_degraded = True
    payload = await call_tool(
        server, "reliastra_verify_evidence", {"verification_id": VERIFICATION_ID}
    )
    verdict = payload["data"]["verdict_summary"]
    assert verdict["found"] is False
    assert verdict["service_degraded"] is True
    assert verdict["usable_as_proof_of_authenticity"] is False
    assert payload["data"]["service_degraded"] is True
    assert any("SERVICE DEGRADED" in note for note in payload["meta"]["notes"])


async def test_verification_null_is_not_a_pass(built):
    server, deps, api = built
    api.verification_verified = None
    payload = await call_tool(
        server, "reliastra_verify_evidence", {"verification_id": VERIFICATION_ID}
    )
    verdict = payload["data"]["verdict_summary"]
    assert verdict["verified"] is None
    assert verdict["usable_as_proof_of_authenticity"] is False
    assert any("never a pass" in note for note in payload["meta"]["notes"])


async def test_pipeline_unhealthy_503_is_data_not_an_error(built):
    """A 503 body from /v1/checks/health IS the answer."""
    server, deps, api = built
    api.pipeline_healthy = False
    payload = await call_tool(server, "reliastra_get_pipeline_health")
    assert payload["ok"] is True
    assert payload["data"]["status"] == "stale"
    assert payload["data"]["beat_alive"] is False
    assert payload["meta"]["upstream_status"] == 503
    assert any("HTTP 503" in note for note in payload["meta"]["notes"])


async def test_missing_evidence_artifact_is_reported_as_absent(built):
    server, deps, api = built
    api.evidence_available = False
    payload = await call_tool(
        server, "reliastra_get_incident_evidence", {"incident_id": INCIDENT_ID}
    )
    assert payload["data"]["available"] is False
    assert payload["data"]["artifact"] is None
    reason = payload["data"]["reason"].lower()
    assert "no frozen evidence artifact" in reason
    assert "timing, not unverifiability" in reason
    assert any("404" in note or "not unverifiable" in note for note in payload["meta"]["notes"])


# ── Retries ─────────────────────────────────────────────────────────────────


async def test_transient_failure_is_retried_and_succeeds(built):
    """One 503 then a good response: the caller sees success, having retried."""
    server, deps, api = built
    api.inject("/v1/vendors", 503, {"items": [], "next_cursor": None, "has_more": False})
    payload = await call_tool(server, "reliastra_search_observatory")
    assert payload["ok"] is True
    assert len(api.calls_to("/v1/vendors")) == 2


async def test_retries_are_bounded(make_built):
    server, deps, api = make_built(upstream_max_retries=2)
    api.fail_always("/v1/vendors", 503)
    failure = await call_tool_expect_error(server, "reliastra_search_observatory")
    assert failure["category"] == "upstream_unavailable"
    # 1 initial attempt + 2 retries, and no more.
    assert len(api.calls_to("/v1/vendors")) == 3


async def test_mutations_are_never_retried(make_built):
    """A retried write is a duplicated write. Retry must be off for POST."""
    server, deps, api = make_built(
        reliastra_api_key=GOOD_KEY, mutation_confirmation_required=False
    )
    api.fail_always("/v1/dependencies", 503)
    await call_tool_expect_error(
        server,
        "reliastra_register_dependency",
        {"name": "x", "endpoint_url": "https://api.example.com/health"},
    )
    assert len(api.calls_with_method("POST")) == 1, "a write must never be retried"


async def test_client_errors_are_not_retried(built):
    server, deps, api = built
    api.fail_always("/v1/vendors", 404)
    await call_tool_expect_error(server, "reliastra_search_observatory")
    assert len(api.calls_to("/v1/vendors")) == 1


async def test_retry_after_header_is_honoured_but_capped(make_built):
    """A hostile Retry-After must not stall a tool call for minutes.

    The cap is 5s, so the budget must exceed it for the retry to complete; what is
    being asserted is the *elapsed time*, which must be near the cap and nowhere
    near the 600s the upstream asked for.
    """
    server, deps, api = make_built(tool_timeout_s=20.0, upstream_max_retries=1)

    attempts = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        if attempts["n"] == 1:
            return httpx.Response(
                503,
                content=json.dumps({"error": {"code": "X", "message": "wait"}}).encode(),
                headers={"retry-after": "600", "content-type": "application/json"},
            )
        return httpx.Response(
            200,
            content=json.dumps({"items": [], "has_more": False}).encode(),
            headers={"content-type": "application/json"},
        )

    deps.client._http = httpx.AsyncClient(base_url=API_BASE, transport=httpx.MockTransport(handler))
    started = asyncio.get_event_loop().time()
    payload = await call_tool(server, "reliastra_search_observatory")
    elapsed = asyncio.get_event_loop().time() - started
    assert payload["ok"] is True
    assert attempts["n"] == 2, "the retry must have happened"
    # _MAX_BACKOFF_S is 5s: a 600s Retry-After must not be honoured literally.
    assert elapsed < 12, f"took {elapsed}s; Retry-After was honoured uncapped"
    assert elapsed > 0.5, "the backoff should have been applied at all"


# ── Circuit breaker ─────────────────────────────────────────────────────────


async def test_circuit_opens_after_consecutive_failures_and_fails_fast(make_built):
    server, deps, api = make_built(circuit_breaker_threshold=3, upstream_max_retries=0)
    api.fail_always("/v1/vendors", httpx.ConnectError("down"))

    for _ in range(3):
        await call_tool_expect_error(server, "reliastra_search_observatory")
    assert deps.client.breaker_open is True

    calls_before = len(api.calls)
    failure = await call_tool_expect_error(server, "reliastra_search_observatory")
    assert failure["category"] == "upstream_unavailable"
    assert "circuit open" in failure["message"]
    assert len(api.calls) == calls_before, "an open circuit must not call upstream"


async def test_circuit_half_opens_after_cooldown(built):
    deps_config = load_config(
        reliastra_api_url=API_BASE,
        log_json=False,
        public_cache_ttl_s=0,
        circuit_breaker_threshold=2,
        circuit_breaker_cooldown_s=0.01,
        upstream_max_retries=0,
    )
    client = ReliastraClient(deps_config, transport=httpx.MockTransport(_always_down))
    for _ in range(2):
        with pytest.raises(ToolFailure):
            await client.get_public("/v1/vendors", request_id="t")
    assert client.breaker_open
    await asyncio.sleep(0.02)
    # Half-open: the next call is allowed through and fails on the network again,
    # which is the honest outcome, not a permanent lockout.
    with pytest.raises(ToolFailure) as excinfo:
        await client.get_public("/v1/vendors", request_id="t")
    assert excinfo.value.category == "upstream_unavailable"
    await client.aclose()


def _always_down(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("down")


async def test_circuit_breaker_unit_semantics():
    breaker = _CircuitBreaker(threshold=2, cooldown_s=0.01)
    await breaker.success()
    assert not breaker.is_open
    await breaker.failure()
    assert not breaker.is_open, "one failure must not open the circuit"
    await breaker.failure()
    assert breaker.is_open
    from mcp_server.upstream import CircuitOpen

    with pytest.raises(CircuitOpen):
        await breaker.check()
    await asyncio.sleep(0.02)
    await breaker.check()  # half-open: allowed through
    assert not breaker.is_open


async def test_successful_call_closes_the_circuit(make_built):
    server, deps, api = make_built(
        circuit_breaker_threshold=2, upstream_max_retries=0, circuit_breaker_cooldown_s=0.01
    )
    breaker_error = httpx.ConnectError("down")
    api.inject("/v1/vendors", breaker_error, breaker_error)
    for _ in range(2):
        await call_tool_expect_error(server, "reliastra_search_observatory")
    assert deps.client.breaker_open
    # The injection queue is now empty, so the next call reaches a healthy route.
    await asyncio.sleep(0.02)
    payload = await call_tool(server, "reliastra_search_observatory")
    assert payload["ok"] is True
    assert not deps.client.breaker_open


# ── Timeouts and concurrency ────────────────────────────────────────────────


async def test_tool_execution_timeout_is_bounded(make_built):
    """A hung upstream must cost one failed call, not a wedged server."""
    server, deps, api = make_built(tool_timeout_s=0.2, upstream_max_retries=0)

    async def slow(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(5)
        return httpx.Response(200, content=b'{"items": []}',
                              headers={"content-type": "application/json"})

    deps.client._http = httpx.AsyncClient(
        base_url=API_BASE, transport=httpx.MockTransport(slow)
    )
    failure = await call_tool_expect_error(server, "reliastra_search_observatory")
    assert failure["category"] in {"timeout", "upstream_timeout"}


async def test_concurrency_is_bounded_by_the_semaphore(make_built):
    server, deps, api = make_built(max_inflight_requests=2)
    peak = {"now": 0, "max": 0}

    async def counting(request: httpx.Request) -> httpx.Response:
        peak["now"] += 1
        peak["max"] = max(peak["max"], peak["now"])
        await asyncio.sleep(0.05)
        peak["now"] -= 1
        return httpx.Response(
            200,
            content=json.dumps({"items": [], "has_more": False}).encode(),
            headers={"content-type": "application/json"},
        )

    deps.client._http = httpx.AsyncClient(
        base_url=API_BASE, transport=httpx.MockTransport(counting)
    )
    results = await asyncio.gather(
        *[call_tool(server, "reliastra_search_observatory") for _ in range(8)]
    )
    assert all(payload["ok"] for payload in results), "a burst should queue, not fail"
    assert peak["max"] <= 2, f"peak concurrency was {peak['max']}"


async def test_admission_queue_is_bounded_and_refuses_explicitly(make_built):
    """Past the queue bound, a call gets an honest retryable refusal."""
    from mcp_server.tools._base import AdmissionControl

    admission = AdmissionControl(limit=1, max_waiting=1)
    assert await admission.acquire() is True
    # One waiter is allowed; the second is refused rather than queued indefinitely.
    waiting = asyncio.create_task(admission.acquire())
    await asyncio.sleep(0)
    assert await admission.acquire() is False
    admission.release()
    assert await waiting is True
    admission.release()
    assert admission.snapshot()["in_flight"] == 0


async def test_unexpected_exception_becomes_a_generic_internal_error(built, caplog):
    """A defect here must not leak a traceback or an internal value to the caller."""
    server, deps, api = built

    async def exploding(ctx) -> dict[str, Any]:
        raise ValueError("internal detail: connection string postgres://u:p@host")

    from mcp_server.tools import _base

    _base.register_tool(
        server, deps, exploding,
        name="reliastra_test_explode", title="t", description="d", read_only=True,
    )
    result = await _base_and_invoke(server, "reliastra_test_explode")
    assert result.is_error is True
    payload = result.structured_content
    assert payload["error"]["category"] == "internal"
    assert "postgres://" not in json.dumps(payload)
    assert "internal detail" not in json.dumps(payload)
    assert payload["error"]["retryable"] is False


async def _base_and_invoke(server, name):
    from .conftest import make_context

    return await server.call_tool(name, {}, make_context(server))


# ── Error mapping ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "status,expected_category",
    [
        (401, "forbidden"),
        (403, "forbidden"),
        (404, "not_found"),
        (422, "invalid_input"),
        (429, "upstream_rate_limited"),
        (500, "upstream_error"),
        (502, "upstream_unavailable"),
    ],
)
async def test_upstream_status_maps_to_a_stable_category(
    make_built, status, expected_category
):
    server, deps, api = make_built(upstream_max_retries=0)
    api.fail_always("/v1/vendors", status)
    failure = await call_tool_expect_error(server, "reliastra_search_observatory")
    assert failure["category"] == expected_category, status


async def test_upstream_rate_limit_is_retryable_and_says_so(built):
    server, deps, api = built
    api.fail_always("/v1/vendors", 429)
    failure = await call_tool_expect_error(server, "reliastra_search_observatory")
    assert failure["category"] == "upstream_rate_limited"
    assert failure["retryable"] is True


async def test_auth_failure_does_not_echo_the_credential_or_detail(make_built):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    api.api_key_status = 403
    failure = await call_tool_expect_error(server, "reliastra_list_dependencies")
    rendered = json.dumps(failure)
    assert GOOD_KEY not in rendered
    assert failure["category"] == "forbidden"
    assert "scope" in failure["message"].lower()


async def test_non_v1_path_is_refused_by_the_client(built):
    """The client may only address the canonical API surface."""
    server, deps, api = built
    with pytest.raises(ToolFailure) as excinfo:
        await deps.client.get_public("https://evil.example/steal", request_id="t")
    assert excinfo.value.category == "internal"
    assert api.calls == []


# ── Caching: public only ────────────────────────────────────────────────────


def test_cache_refuses_to_store_a_non_public_path():
    """Tenant data must never be cacheable, structurally."""
    cache = PublicCache(ttl_s=60, max_entries=16)
    for path in (
        "/v1/dependencies",
        "/v1/incidents",
        "/v1/evidence",
        "/v1/checks/recent",
        "/v1/api-keys",
        "/v1/orgs/current",
    ):
        with pytest.raises(ValueError):
            cache.make_key(path, None)
    # Public paths are fine.
    for path in ("/v1/vendors", "/v1/public/incidents", "/v1/verify/x", "/v1/pricing"):
        assert cache.make_key(path, {"a": 1})


async def test_authenticated_reads_are_never_cached(make_built):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY, public_cache_ttl_s=300)
    await call_tool(server, "reliastra_list_dependencies")
    await call_tool(server, "reliastra_list_dependencies")
    assert len(api.calls_to("/v1/dependencies")) == 2
    assert deps.client.cache.stats()["entries"] == 0


async def test_public_reads_are_cached_and_report_freshness(make_built):
    server, deps, api = make_built(public_cache_ttl_s=300)
    first = await call_tool(server, "reliastra_search_observatory")
    second = await call_tool(server, "reliastra_search_observatory")
    assert len(api.calls_to("/v1/vendors")) == 1, "second read must be served from cache"
    assert first["meta"]["cached"] is False
    assert second["meta"]["cached"] is True
    assert second["meta"]["age_s"] >= 0
    assert second["meta"]["ttl_s"] == 300
    assert "fresh_until" in second["meta"]


async def test_liveness_endpoints_are_never_cached(make_built):
    server, deps, api = make_built(public_cache_ttl_s=300)
    await call_tool(server, "reliastra_get_pipeline_health")
    await call_tool(server, "reliastra_get_pipeline_health")
    assert len(api.calls_to("/v1/checks/health")) == 2


async def test_cache_expiry_is_discarded_not_served_stale(make_built):
    server, deps, api = make_built(public_cache_ttl_s=0.01)
    await call_tool(server, "reliastra_search_observatory")
    await asyncio.sleep(0.02)
    payload = await call_tool(server, "reliastra_search_observatory")
    assert len(api.calls_to("/v1/vendors")) == 2
    assert payload["meta"]["cached"] is False


def test_cache_is_bounded():
    cache = PublicCache(ttl_s=60, max_entries=4)
    for index in range(20):
        cache.put(f"/v1/vendors?i={index}", {"i": index})
    assert cache.stats()["entries"] == 4
    # Oldest entries were evicted; newest survive.
    assert cache.get("/v1/vendors?i=19") is not None
    assert cache.get("/v1/vendors?i=0") is None


def test_cache_disabled_when_ttl_is_zero():
    cache = PublicCache(ttl_s=0, max_entries=16)
    assert cache.enabled is False
    cache.put("/v1/vendors", {"x": 1})
    assert cache.get("/v1/vendors") is None


# ── Trace and correlation propagation ───────────────────────────────────────


async def test_requests_carry_request_id_and_traceparent(built):
    """Upstream calls must join the caller's trace, in the backend's own format."""
    server, deps, api = built
    await call_tool(server, "reliastra_search_observatory")
    call = api.last_call()
    assert call.headers.get("x-request-id", "").startswith("mcp_")
    traceparent = call.headers.get("traceparent")
    assert traceparent, "traceparent must be propagated"

    from mcp_server.observability import parse_traceparent

    parsed = parse_traceparent(traceparent)
    assert parsed is not None
    trace_id, sampled = parsed
    assert len(trace_id) == 32 and sampled is True


async def test_backend_trace_parser_accepts_what_we_emit():
    """The integration claim, verified rather than assumed."""
    from app.platform.observability.tracing import parse_traceparent as backend_parse
    from mcp_server.observability import format_traceparent, new_span_id, new_trace_id

    emitted = format_traceparent(new_trace_id(), new_span_id())
    parsed = backend_parse(emitted)
    assert parsed is not None, "the backend must be able to join our trace"
    assert parsed.trace_id == emitted.split("-")[1]


async def test_incoming_traceparent_is_joined_not_replaced(built):
    server, deps, api = built
    incoming = "00-" + "ab" * 16 + "-" + "cd" * 8 + "-01"
    await call_tool(
        server,
        "reliastra_search_observatory",
        headers={"traceparent": incoming},
    )
    sent = api.last_call().headers["traceparent"]
    assert sent.split("-")[1] == "ab" * 16, "the caller's trace id must be preserved"
    assert sent.split("-")[2] != "cd" * 8, "a child span id must be minted"


async def test_invalid_incoming_traceparent_starts_a_new_trace(built):
    server, deps, api = built
    await call_tool(
        server, "reliastra_search_observatory", headers={"traceparent": "garbage"}
    )
    sent = api.last_call().headers["traceparent"]
    from mcp_server.observability import parse_traceparent

    assert parse_traceparent(sent) is not None
