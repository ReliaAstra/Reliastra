"""Tool behaviour: envelope shape, provenance, and honest reporting of each surface.

The envelope contract matters because an agent reasons from it. Every success says
where the data came from, whether it was cached, and that retrieved text is
untrusted; every failure says what category it is and whether retrying could help.
"""

from __future__ import annotations

import pytest

from mcp_server.sanitization import UNTRUSTED_CONTENT_NOTICE

from .conftest import (
    DEPENDENCY_ID,
    GOOD_KEY,
    INCIDENT_ID,
    PUBLIC_INCIDENT,
    VERIFICATION_ID,
    call_tool,
    call_tool_expect_error,
)

AUTH = {"authorization": f"Bearer {GOOD_KEY}"}


# ── Envelope contract ───────────────────────────────────────────────────────


async def test_every_success_carries_provenance_and_the_untrusted_notice(built):
    server, deps, api = built
    deps.config.reliastra_api_key = GOOD_KEY
    checks = [
        ("reliastra_get_capabilities", {}),
        ("reliastra_search_observatory", {}),
        ("reliastra_get_provider", {"provider": "stripe"}),
        ("reliastra_get_provider_metrics", {"provider": "stripe"}),
        ("reliastra_get_provider_timeline", {"provider": "stripe"}),
        ("reliastra_get_pipeline_health", {}),
        ("reliastra_search_incidents", {}),
        ("reliastra_get_public_incident", {"incident_id": INCIDENT_ID}),
        ("reliastra_get_incident_evidence", {"incident_id": INCIDENT_ID}),
        ("reliastra_verify_evidence", {"verification_id": VERIFICATION_ID}),
        ("reliastra_list_dependencies", {}),
        ("reliastra_get_dependency_observations", {}),
        ("reliastra_list_workspace_incidents", {}),
        ("reliastra_get_evidence_report", {}),
    ]
    for name, arguments in checks:
        payload = await call_tool(server, name, arguments)
        meta = payload["meta"]
        assert meta["tool"] == name, name
        assert meta["request_id"].startswith("mcp_"), name
        assert meta["source"], f"{name} must name the upstream operation"
        assert meta["fetched_at"], name
        assert "cached" in meta, name
        assert meta["untrusted_content"] == UNTRUSTED_CONTENT_NOTICE, name
        assert isinstance(meta["notes"], list) and meta["notes"], name


async def test_source_names_the_real_endpoint(built):
    server, deps, api = built
    payload = await call_tool(server, "reliastra_get_provider", {"provider": "stripe"})
    assert payload["meta"]["source"] == "GET /v1/vendors/stripe"

    payload = await call_tool(
        server, "reliastra_get_provider_timeline", {"provider": "stripe", "window": "7d"}
    )
    assert "window=7d" in payload["meta"]["source"]


async def test_authenticated_flag_reflects_the_credential(built):
    server, deps, api = built
    anonymous = await call_tool(server, "reliastra_search_observatory")
    assert anonymous["meta"]["authenticated_caller"] is False

    deps.config.reliastra_api_key = GOOD_KEY
    authed = await call_tool(server, "reliastra_list_dependencies")
    assert authed["meta"]["authenticated_caller"] is True


# ── Capability discovery ────────────────────────────────────────────────────


async def test_capabilities_reports_the_tools_that_actually_exist(built):
    server, deps, api = built
    payload = await call_tool(server, "reliastra_get_capabilities")
    registered = payload["data"]["server"]["registered_tools"]
    assert set(registered) == set(deps.registered_tools)
    assert len(registered) >= 15
    assert "reliastra_get_capabilities" in registered


async def test_capabilities_protocol_version_is_the_negotiated_one(built):
    server, deps, api = built
    payload = await call_tool(server, "reliastra_get_capabilities")
    assert payload["data"]["server"]["protocol_version"] == "2026-07-28"


async def test_capabilities_makes_no_upstream_call_by_default(built):
    """Discovery must work with no credential and no reachable API."""
    server, deps, api = built
    payload = await call_tool(server, "reliastra_get_capabilities")
    assert api.calls == [], "the default capability document must be built locally"
    assert payload["data"]["pricing"]["live"] is False
    assert "static fallback" in payload["data"]["pricing"]["source"]


async def test_capabilities_include_live_fetches_pricing_and_pipeline(built):
    server, deps, api = built
    payload = await call_tool(
        server, "reliastra_get_capabilities", {"include_live": True}
    )
    assert payload["data"]["pricing"]["live"] is True
    assert payload["data"]["pricing"]["source"] == "GET /v1/pricing"
    assert payload["data"]["pipeline_health"]["status"] == "healthy"
    assert api.calls_to("/v1/pricing") and api.calls_to("/v1/checks/health")


async def test_capabilities_survives_a_dead_api_with_live_requested(built):
    """A degraded upstream must not break discovery; it must be reported."""
    server, deps, api = built
    import httpx

    api.fail_always("/v1/pricing", httpx.ConnectError("down"))
    api.fail_always("/v1/checks/health", httpx.ConnectError("down"))
    payload = await call_tool(
        server, "reliastra_get_capabilities", {"include_live": True}
    )
    assert payload["ok"] is True
    assert payload["data"]["pricing"]["live"] is False
    notes = " ".join(payload["meta"]["notes"])
    assert "pricing" in notes and "pipeline_health" in notes


async def test_capabilities_hides_mutations_on_a_read_only_server(make_built):
    server, deps, api = make_built(allow_mutations=False)
    payload = await call_tool(server, "reliastra_get_capabilities")
    assert payload["data"]["mutations_available"] is False
    assert "reliastra_register_dependency" not in payload["data"]["server"]["registered_tools"]


# ── Observatory ─────────────────────────────────────────────────────────────


async def test_observatory_search_passes_validated_parameters_upstream(built):
    server, deps, api = built
    await call_tool(server, "reliastra_search_observatory", {"limit": 5})
    call = api.calls_to("/v1/vendors")[-1]
    assert call.query["limit"] == ["5"]
    assert call.query["public"] == ["true"]


async def test_observatory_search_by_category_uses_the_category_route(built):
    server, deps, api = built
    payload = await call_tool(
        server, "reliastra_search_observatory", {"category": "Payments"}
    )
    assert api.calls_to("/v1/vendors/categories/payments")
    assert payload["meta"]["source"] == "GET /v1/vendors/categories/payments"
    assert payload["data"]["category"]["slug"] == "payments"


async def test_local_name_filter_is_labelled_as_local(built):
    """A client-side filter must never look like a server-side search."""
    server, deps, api = built
    payload = await call_tool(
        server, "reliastra_search_observatory", {"name_contains": "stripe"}
    )
    local = payload["data"]["local_filter"]
    assert local["applied_by"].startswith("this MCP server")
    assert "no text search" in local["warning"]
    assert local["matched"] == 1


async def test_local_name_filter_that_matches_nothing_warns_not_concludes(built):
    server, deps, api = built
    payload = await call_tool(
        server, "reliastra_search_observatory", {"name_contains": "nonexistent-xyz"}
    )
    assert payload["data"]["count"] == 0
    assert "does not mean the provider is absent" in payload["data"]["local_filter"]["warning"]


async def test_limit_is_clamped_to_the_configured_maximum(built):
    server, deps, api = built
    deps.config.max_page_size = 50
    await call_tool(server, "reliastra_search_observatory", {"limit": 5000})
    assert api.calls_to("/v1/vendors")[-1].query["limit"] == ["50"]


async def test_invalid_window_is_rejected_by_the_schema(built):
    """Literal-typed parameters are validated before any request is made.

    Over the wire the SDK turns this into an ``isError`` result carrying the
    validation message; calling the server object directly surfaces the ToolError.
    Either way the assertion that matters is that nothing reached the API.
    """
    from mcp.server.mcpserver.exceptions import ToolError

    server, deps, api = built
    with pytest.raises(ToolError):
        await server.call_tool(
            "reliastra_get_provider_timeline", {"provider": "stripe", "window": "3y"}
        )
    assert api.calls == [], "an invalid enum must not reach the API"


async def test_unknown_provider_is_a_clean_not_found(built):
    server, deps, api = built
    failure = await call_tool_expect_error(
        server, "reliastra_get_provider", {"provider": "nonexistent"}
    )
    assert failure["category"] == "not_found"
    assert failure["retryable"] is False


async def test_provider_notes_warn_about_stale_and_null_values(built):
    server, deps, api = built
    payload = await call_tool(server, "reliastra_get_provider", {"provider": "stripe"})
    notes = " ".join(payload["meta"]["notes"])
    assert "not a live probe" in notes
    assert "nothing was measured" in notes
    assert "scheduling labels" in notes


async def test_timeline_truncation_is_reported_not_silent(make_built):
    server, deps, api = make_built(max_result_items=1)
    api.inject(
        "/v1/vendors/stripe/timeline",
        {
            "vendor_name": "stripe",
            "buckets": [{"bucket_start": f"t{i}"} for i in range(5)],
        },
    )
    payload = await call_tool(
        server, "reliastra_get_provider_timeline", {"provider": "stripe"}
    )
    assert len(payload["data"]["buckets"]) == 1
    assert payload["data"]["buckets_truncated"] is True
    assert any("truncated" in note.lower() for note in payload["meta"]["notes"])


# ── Incidents ───────────────────────────────────────────────────────────────


async def test_incident_search_forwards_every_filter(built):
    server, deps, api = built
    await call_tool(
        server,
        "reliastra_search_incidents",
        {
            "provider": "stripe",
            "status": "resolved",
            "failure_kind": "http_5xx",
            "since": "2026-10-01T00:00:00Z",
            "limit": 5,
        },
    )
    query = api.calls_to("/v1/public/incidents")[-1].query
    assert query["vendor"] == ["stripe"]
    assert query["status"] == ["resolved"]
    assert query["failure_kind"] == ["http_5xx"]
    assert query["since"] == ["2026-10-01T00:00:00Z"]
    assert query["limit"] == ["5"]


async def test_invalid_timestamp_is_refused_locally(built):
    server, deps, api = built
    failure = await call_tool_expect_error(
        server, "reliastra_search_incidents", {"since": "last tuesday"}
    )
    assert failure["category"] == "invalid_input"
    assert api.calls == []


async def test_incident_records_carry_the_interpretation_block(built):
    """The correlation/causation distinction travels with the data."""
    server, deps, api = built
    listed = await call_tool(server, "reliastra_search_incidents")
    interpretation = listed["data"]["interpretation"]
    assert "does_not_establish" in interpretation
    assert any("your application" in item for item in interpretation["does_not_establish"])
    assert "not a validated causal model" in " ".join(interpretation["does_not_establish"])
    assert "does not ingest" in interpretation["external_incident_feeds"]

    detail = await call_tool(
        server, "reliastra_get_public_incident", {"incident_id": INCIDENT_ID}
    )
    assert detail["data"]["interpretation"]["establishes"]


async def test_incident_detail_notes_explain_a_null_evidence_field(built):
    server, deps, api = built
    api.inject(
        f"/v1/public/incidents/{INCIDENT_ID}", {**PUBLIC_INCIDENT, "evidence": None}
    )
    payload = await call_tool(
        server, "reliastra_get_public_incident", {"incident_id": INCIDENT_ID}
    )
    assert payload["data"]["evidence"] is None
    assert any("NOT BEEN GENERATED YET" in note for note in payload["meta"]["notes"])


# ── Evidence and verification ───────────────────────────────────────────────


async def test_evidence_artifact_reports_provenance_from_headers(built):
    server, deps, api = built
    payload = await call_tool(
        server, "reliastra_get_incident_evidence", {"incident_id": INCIDENT_ID}
    )
    provenance = payload["data"]["provenance"]
    assert provenance["data_hash"] == "a" * 64
    assert provenance["version"] == 1
    assert provenance["artifact_schema_version"] == "2.0"
    assert provenance["methodology_version"] == "v1.1"
    assert payload["data"]["available"] is True
    assert payload["data"]["artifact"]["schema_version"] == "2.0"
    assert any("parsed JSON view" in note for note in payload["meta"]["notes"])


async def test_pinned_evidence_version_uses_the_immutable_route(built):
    server, deps, api = built
    payload = await call_tool(
        server, "reliastra_get_incident_evidence", {"incident_id": INCIDENT_ID, "version": 1}
    )
    assert f"/v1/public/incidents/{INCIDENT_ID}/evidence/versions/1" in payload["meta"]["source"]
    assert payload["data"]["provenance"]["pinned"] is True


async def test_evidence_version_must_be_positive(built):
    server, deps, api = built
    for bad in (0, -1):
        failure = await call_tool_expect_error(
            server, "reliastra_get_incident_evidence", {"incident_id": INCIDENT_ID, "version": bad}
        )
        assert failure["category"] == "invalid_input"
    assert api.calls == []


async def test_oversized_artifact_gives_a_url_instead_of_a_truncated_hash(built):
    """Half a hash-covered document looks like tampering, so it is never returned."""
    server, deps, api = built
    import mcp_server.tools.evidence as evidence_module

    original = evidence_module.MAX_ARTIFACT_BYTES
    evidence_module.MAX_ARTIFACT_BYTES = 32
    try:
        payload = await call_tool(
            server, "reliastra_get_incident_evidence", {"incident_id": INCIDENT_ID}
        )
    finally:
        evidence_module.MAX_ARTIFACT_BYTES = original
    assert payload["data"]["artifact"] is None
    omitted = payload["data"]["artifact_omitted"]
    assert omitted["authoritative_url"].endswith(f"/v1/public/incidents/{INCIDENT_ID}/evidence")
    assert "not truncated" in omitted["how_to_read_it"]


async def test_verification_verdict_summary_separates_authenticity_from_impact(built):
    server, deps, api = built
    payload = await call_tool(
        server, "reliastra_verify_evidence", {"verification_id": VERIFICATION_ID}
    )
    verdict = payload["data"]["verdict_summary"]
    assert verdict["found"] is True
    assert verdict["verified"] is True
    assert verdict["usable_as_proof_of_authenticity"] is True
    assert verdict["usable_as_proof_of_impact"] is False
    # The public verification material must survive redaction.
    assert payload["data"]["authenticity"]["signature"] == "Zm9vYmFy"
    assert payload["data"]["data_hash"] == "a" * 64


async def test_verification_not_found_is_data_not_an_error(built):
    server, deps, api = built
    api.verification_found = False
    payload = await call_tool(
        server, "reliastra_verify_evidence", {"verification_id": VERIFICATION_ID}
    )
    assert payload["ok"] is True
    assert payload["data"]["found"] is False
    assert payload["data"]["verdict_summary"]["usable_as_proof_of_authenticity"] is False
    assert any("unguessable" in note for note in payload["meta"]["notes"])


async def test_verification_is_never_cached(make_built):
    """A verification verdict is re-derived per request upstream, so it must not be
    served from a local cache: a stale 'verified' is a false authenticity claim."""
    server, deps, api = make_built(public_cache_ttl_s=300)
    await call_tool(server, "reliastra_verify_evidence", {"verification_id": VERIFICATION_ID})
    await call_tool(server, "reliastra_verify_evidence", {"verification_id": VERIFICATION_ID})
    assert len(api.calls_to(f"/v1/verify/{VERIFICATION_ID}")) == 2


# ── Workspace ───────────────────────────────────────────────────────────────


async def test_workspace_dependency_detail_and_list_use_different_routes(built):
    server, deps, api = built
    deps.config.reliastra_api_key = GOOD_KEY
    listed = await call_tool(server, "reliastra_list_dependencies")
    assert listed["meta"]["source"] == "GET /v1/dependencies"
    assert listed["data"]["count"] == 1

    detail = await call_tool(
        server, "reliastra_list_dependencies", {"dependency_id": DEPENDENCY_ID}
    )
    assert detail["meta"]["source"] == f"GET /v1/dependencies/{DEPENDENCY_ID}"
    assert detail["data"]["dependency"]["name"] == "Payments API"


async def test_observations_scope_is_stated(built):
    server, deps, api = built
    deps.config.reliastra_api_key = GOOD_KEY
    all_observations = await call_tool(server, "reliastra_get_dependency_observations")
    assert all_observations["meta"]["source"] == "GET /v1/checks/recent"
    assert all_observations["data"]["scope"].startswith("all dependencies")

    one = await call_tool(
        server, "reliastra_get_dependency_observations", {"dependency_id": DEPENDENCY_ID}
    )
    assert one["meta"]["source"] == f"GET /v1/dependencies/{DEPENDENCY_ID}/results"
    assert one["data"]["scope"] == "one dependency"


async def test_observations_note_separates_probe_from_request(built):
    server, deps, api = built
    deps.config.reliastra_api_key = GOOD_KEY
    payload = await call_tool(server, "reliastra_get_dependency_observations")
    notes = " ".join(payload["meta"]["notes"])
    assert "not a request your application made" in notes
    assert "reliastra_get_pipeline_health" in notes


async def test_workspace_incident_evidence_uses_both_routes(built):
    server, deps, api = built
    deps.config.reliastra_api_key = GOOD_KEY
    payload = await call_tool(
        server,
        "reliastra_list_workspace_incidents",
        {"incident_id": INCIDENT_ID, "include_evidence": True},
    )
    assert "/v1/incidents/" in payload["meta"]["source"]
    assert "evidence" in payload["meta"]["source"]
    assert payload["data"]["evidence"]["incident_id"] == INCIDENT_ID


async def test_workspace_incident_attribution_note_states_the_ceiling(built):
    server, deps, api = built
    deps.config.reliastra_api_key = GOOD_KEY
    payload = await call_tool(server, "reliastra_list_workspace_incidents")
    scores = payload["data"]["interpretation"]["attribution_scores"]
    assert "55.0" in scores
    assert "unknown" in scores


async def test_bare_list_response_has_no_invented_cursor(built):
    """A route that returns a plain list has no cursor; inventing one is a lie."""
    server, deps, api = built
    deps.config.reliastra_api_key = GOOD_KEY
    payload = await call_tool(server, "reliastra_get_dependency_observations")
    assert payload["data"]["next_cursor"] is None
    assert payload["data"]["has_more"] is False


async def test_workspace_tools_accept_a_bearer_header_credential(built):
    """The remote path: the credential arrives on the request, not in the process."""
    server, deps, api = built
    assert deps.config.reliastra_api_key is None
    payload = await call_tool(
        server, "reliastra_list_dependencies", headers=AUTH
    )
    assert payload["ok"] is True
    assert api.calls_to("/v1/dependencies")[-1].api_key == GOOD_KEY


async def test_two_callers_get_their_own_credential_upstream(built):
    server, deps, api = built
    await call_tool(server, "reliastra_list_dependencies", headers=AUTH)
    other = {"authorization": "Bearer rel_another_tenant_key_999"}
    api.api_key_status = 403
    await call_tool_expect_error(server, "reliastra_list_dependencies", headers=other)
    keys = [call.api_key for call in api.calls_to("/v1/dependencies")]
    assert keys[0] == GOOD_KEY
    assert keys[-1] == "rel_another_tenant_key_999"
    assert GOOD_KEY not in keys[-1]
