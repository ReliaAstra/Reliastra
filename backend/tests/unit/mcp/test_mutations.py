"""State-changing tools: approval, idempotency, audit, and 202 semantics.

The property under test is that a write happens **only** when a human approved it,
that retrying one cannot duplicate it, and that "queued" is never reported as
"done".
"""

from __future__ import annotations

import json

import pytest

from mcp_server.tools._base import ApprovalDecision, ToolContext

from .conftest import (
    DEPENDENCY_ID,
    GOOD_KEY,
    call_tool,
    call_tool_expect_error,
)

AUTH = {"authorization": f"Bearer {GOOD_KEY}"}
SAFE_URL = "https://api.payments.example/health"


@pytest.fixture
def approving_gate(monkeypatch):
    """Make the approval gate accept, and record what the user was shown."""
    shown: list[dict] = []

    async def request_approval(self, *, action, summary, confirm_argument):
        shown.append(
            {"action": action, "summary": summary, "confirm_argument": confirm_argument}
        )
        return ApprovalDecision(True, "elicitation", action)

    monkeypatch.setattr(ToolContext, "request_approval", request_approval, raising=True)
    return shown


@pytest.fixture
def audit_records():
    """Capture the audit log directly.

    The MCP loggers set ``propagate = False`` so their JSON does not get duplicated
    through the root logger, which also means ``caplog`` cannot see them. Attaching
    a handler to the named logger is the honest way to assert on audit output.
    """
    import logging

    from mcp_server.tools._base import audit_log

    records: list[logging.LogRecord] = []

    class _Capture(logging.Handler):
        def emit(self, record):
            records.append(record)

    handler = _Capture()
    audit_log.addHandler(handler)
    previous_level = audit_log.level
    previous_disabled = audit_log.disabled
    audit_log.setLevel(logging.INFO)
    # The session-scoped alembic fixture in tests/conftest.py runs migrations, and
    # app/db/migrations/env.py calls logging.config.fileConfig, whose default
    # disable_existing_loggers=True mutes every logger created before it - this one
    # included. get_logger now clears that flag, but the fixture asserts the real
    # state rather than assuming it.
    audit_log.disabled = False
    try:
        yield records
    finally:
        audit_log.removeHandler(handler)
        audit_log.setLevel(previous_level)
        audit_log.disabled = previous_disabled


@pytest.fixture
def declining_gate(monkeypatch):
    """Make the approval gate decline, as a user cancelling the prompt would."""

    async def request_approval(self, *, action, summary, confirm_argument):
        return ApprovalDecision(
            False, "elicitation", action, reason="The user was asked and declined."
        )

    monkeypatch.setattr(ToolContext, "request_approval", request_approval, raising=True)


# ── Registration ────────────────────────────────────────────────────────────


async def test_registration_posts_the_verified_contract(make_built, approving_gate):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    payload = await call_tool(
        server,
        "reliastra_register_dependency",
        {
            "name": "Payments API",
            "endpoint_url": SAFE_URL,
            "method": "HEAD",
            "expected_status_codes": [200, 204],
            "check_interval_seconds": 60,
            "timeout_seconds": 5,
            "regions": ["eu-west"],
        },
    )
    assert payload["ok"] is True
    post = api.calls_with_method("POST")[-1]
    assert post.path == "/v1/dependencies"
    assert post.json_body == {
        "name": "Payments API",
        "endpoint_url": SAFE_URL,
        "method": "HEAD",
        "expected_status_codes": [200, 204],
        "check_interval_seconds": 60,
        "timeout_seconds": 5,
        "regions": ["eu-west"],
        "is_active": True,
    }
    assert post.api_key == GOOD_KEY
    assert payload["data"]["upstream_status"] == 201
    assert payload["data"]["created"]["name"] == "Payments API"


async def test_registration_sends_a_stable_idempotency_key(make_built, approving_gate):
    """Retrying identical arguments must replay, not duplicate."""
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    arguments = {"name": "Payments", "endpoint_url": SAFE_URL}
    first = await call_tool(server, "reliastra_register_dependency", arguments)
    second = await call_tool(server, "reliastra_register_dependency", arguments)
    keys = [call.idempotency_key for call in api.calls_with_method("POST")]
    assert keys[0] and keys[0] == keys[1], "the key must be stable across retries"
    assert first["data"]["idempotency_key"] == second["data"]["idempotency_key"]
    # The fake replays the cached response for a repeated key, as the real API does.
    assert first["data"]["created"]["id"] == second["data"]["created"]["id"]
    assert len(api.created_dependencies) == 1, "one logical registration, one record"


async def test_different_arguments_produce_a_different_idempotency_key(make_built, approving_gate):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    await call_tool(
        server, "reliastra_register_dependency", {"name": "A", "endpoint_url": SAFE_URL}
    )
    await call_tool(
        server,
        "reliastra_register_dependency",
        {"name": "A", "endpoint_url": SAFE_URL, "check_interval_seconds": 90},
    )
    keys = [call.idempotency_key for call in api.calls_with_method("POST")]
    assert keys[0] != keys[1], "a different request is a different registration"
    assert len(api.created_dependencies) == 2


async def test_idempotency_key_does_not_embed_the_credential(make_built, approving_gate):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    await call_tool(
        server, "reliastra_register_dependency", {"name": "A", "endpoint_url": SAFE_URL}
    )
    key = api.calls_with_method("POST")[-1].idempotency_key
    assert GOOD_KEY not in key
    assert key.startswith("mcp-")
    assert len(key) <= 40


async def test_confirmation_shows_what_will_be_created(make_built, approving_gate):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    await call_tool(
        server,
        "reliastra_register_dependency",
        {"name": "Payments", "endpoint_url": SAFE_URL, "check_interval_seconds": 60},
    )
    prompt = approving_gate[0]
    assert prompt["confirm_argument"] is False, "the argument defaults to unapproved"
    assert "register a new monitored dependency" in prompt["action"]
    summary = prompt["summary"]
    assert summary["name"] == "Payments"
    assert summary["endpoint"] == SAFE_URL
    assert summary["scopes_needed"] == "write:dependencies"
    assert "quota" in summary["side_effect"]


async def test_declined_confirmation_writes_nothing(make_built, declining_gate):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    failure = await call_tool_expect_error(
        server, "reliastra_register_dependency", {"name": "A", "endpoint_url": SAFE_URL}
    )
    assert failure["category"] == "forbidden"
    assert "not approved" in failure["message"]
    assert failure["approval_mechanism"] == "elicitation"
    assert api.calls_with_method("POST") == []
    assert api.created_dependencies == []


async def test_confirmation_can_be_disabled_for_unattended_use(make_built):
    """Documented weakening: no elicitation, and the write proceeds."""
    server, deps, api = make_built(
        reliastra_api_key=GOOD_KEY, mutation_confirmation_required=False
    )
    payload = await call_tool(
        server, "reliastra_register_dependency", {"name": "A", "endpoint_url": SAFE_URL}
    )
    assert payload["ok"] is True
    assert len(api.created_dependencies) == 1


async def test_ssrf_preflight_runs_before_confirmation_and_request(make_built, approving_gate):
    """A dangerous target is refused locally; the user is not even asked."""
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    failure = await call_tool_expect_error(
        server,
        "reliastra_register_dependency",
        {"name": "metadata", "endpoint_url": "http://169.254.169.254/latest/meta-data/"},
    )
    assert failure["category"] == "invalid_input"
    assert approving_gate == [], "no confirmation prompt for a target that cannot be registered"
    assert api.calls_with_method("POST") == []


@pytest.mark.parametrize(
    "arguments,expected_fragment",
    [
        ({"name": "", "endpoint_url": SAFE_URL}, "name"),
        ({"name": "x" * 151, "endpoint_url": SAFE_URL}, "name"),
        ({"name": "A", "endpoint_url": SAFE_URL, "expected_status_codes": [999]}, "status codes"),
        ({"name": "A", "endpoint_url": SAFE_URL, "alert_threshold_ms": 0}, "alert_threshold_ms"),
        ({"name": "A", "endpoint_url": SAFE_URL, "alert_threshold_ms": -5}, "alert_threshold_ms"),
    ],
)
async def test_local_argument_validation_precedes_any_request(
    make_built, approving_gate, arguments, expected_fragment
):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    failure = await call_tool_expect_error(server, "reliastra_register_dependency", arguments)
    assert failure["category"] == "invalid_input"
    assert expected_fragment in failure["message"]
    assert api.calls == []


async def test_registration_notes_explain_the_delay_before_detection(make_built, approving_gate):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    payload = await call_tool(
        server,
        "reliastra_register_dependency",
        {"name": "A", "endpoint_url": SAFE_URL, "check_interval_seconds": 300},
    )
    notes = " ".join(payload["meta"]["notes"])
    assert "600s" in notes, "2 x 300s must be stated"
    assert "does not prove the endpoint is reachable" in notes
    assert "always null" in notes, "headers are never returned decrypted"


async def test_plaintext_http_target_is_flagged_not_refused(make_built, approving_gate):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    payload = await call_tool(
        server,
        "reliastra_register_dependency",
        {"name": "Legacy", "endpoint_url": "http://legacy.example/health"},
    )
    assert payload["ok"] is True, "plaintext is a legitimate choice, not an error"
    assert any("unencrypted" in note for note in payload["meta"]["notes"])


async def test_upstream_refusal_is_reported_with_its_own_code(make_built, approving_gate):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    api.api_key_status = 403
    failure = await call_tool_expect_error(
        server, "reliastra_register_dependency", {"name": "A", "endpoint_url": SAFE_URL}
    )
    assert failure["category"] == "forbidden"
    assert failure["upstream_code"] == "FORBIDDEN"
    assert api.created_dependencies == []


async def test_unparseable_success_body_is_reported_as_unknown_not_success(make_built, approving_gate):
    """A write whose outcome is unclear must never be reported as a clean success."""
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    api.inject("/v1/dependencies", (201, "not-an-object"))
    failure = await call_tool_expect_error(
        server, "reliastra_register_dependency", {"name": "A", "endpoint_url": SAFE_URL}
    )
    assert failure["category"] == "upstream_invalid"
    assert "may exist" in failure["message"]
    assert "Idempotency-Key" in failure["message"]


# ── Manual probe ────────────────────────────────────────────────────────────


async def test_trigger_check_accepts_202_and_explains_it(make_built, approving_gate):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    payload = await call_tool(
        server, "reliastra_trigger_check", {"dependency_id": DEPENDENCY_ID}
    )
    assert payload["ok"] is True
    assert payload["data"]["upstream_status"] == 202
    assert payload["data"]["queued"]["queued"][0]["task_id"] == "t-1"
    notes = " ".join(payload["meta"]["notes"])
    assert "QUEUED" in notes
    assert "not that it ran" in notes
    assert "reliastra_get_dependency_observations" in notes


async def test_trigger_check_sends_no_idempotency_key(make_built, approving_gate):
    """Replaying a cached 202 would report a task that was not queued this time."""
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    await call_tool(server, "reliastra_trigger_check", {"dependency_id": DEPENDENCY_ID})
    await call_tool(server, "reliastra_trigger_check", {"dependency_id": DEPENDENCY_ID})
    posts = api.calls_with_method("POST")
    assert len(posts) == 2
    assert all(call.idempotency_key is None for call in posts)
    assert len(api.queued_checks) == 2


async def test_trigger_check_region_is_optional(make_built, approving_gate):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    await call_tool(server, "reliastra_trigger_check", {"dependency_id": DEPENDENCY_ID})
    assert api.calls_with_method("POST")[-1].json_body == {"dependency_id": DEPENDENCY_ID}
    await call_tool(
        server,
        "reliastra_trigger_check",
        {"dependency_id": DEPENDENCY_ID, "region": "eu-west"},
    )
    assert api.calls_with_method("POST")[-1].json_body == {
        "dependency_id": DEPENDENCY_ID,
        "region": "eu-west",
    }


async def test_trigger_check_declined_queues_nothing(make_built, declining_gate):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    failure = await call_tool_expect_error(
        server, "reliastra_trigger_check", {"dependency_id": DEPENDENCY_ID}
    )
    assert failure["category"] == "forbidden"
    assert api.calls_with_method("POST") == []
    assert api.queued_checks == []


async def test_trigger_check_validates_the_dependency_id(make_built, approving_gate):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    failure = await call_tool_expect_error(
        server, "reliastra_trigger_check", {"dependency_id": "not-a-uuid"}
    )
    assert failure["category"] == "invalid_input"
    assert api.calls == []


# ── Audit ───────────────────────────────────────────────────────────────────


async def test_successful_write_is_audited_without_secrets(make_built, approving_gate, audit_records):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    await call_tool(
        server,
        "reliastra_register_dependency",
        {"name": "Payments", "endpoint_url": SAFE_URL},
    )
    records = [r for r in audit_records if r.getMessage() == "mcp_mutation"]
    assert records, "a state change must be audited"
    assert len(records) == 1, f"one action, one audit line: {[r.outcome for r in records]}"
    entry = records[0]
    assert entry.outcome == "succeeded"
    assert entry.tool == "reliastra_register_dependency"
    assert entry.caller, "the audit record must identify the caller"
    assert GOOD_KEY not in entry.caller, "the audit identity is a fingerprint, not the key"
    assert entry.endpoint_host == "api.payments.example"
    assert entry.upstream_status == 201
    assert getattr(entry, "endpoint_url", None) is None, "the full URL is not audited"
    assert json.dumps(entry.__dict__, default=str).count(GOOD_KEY) == 0


async def test_declined_write_is_audited_too(make_built, declining_gate, audit_records):
    """An attempt that did not happen is part of the accountability record."""
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    await call_tool_expect_error(
        server, "reliastra_register_dependency", {"name": "A", "endpoint_url": SAFE_URL}
    )
    outcomes = [r.outcome for r in audit_records if r.getMessage() == "mcp_mutation"]
    assert "declined:elicitation" in outcomes


async def test_failed_write_is_audited_with_its_category(make_built, approving_gate, audit_records):
    server, deps, api = make_built(reliastra_api_key=GOOD_KEY)
    api.api_key_status = 403
    await call_tool_expect_error(
        server, "reliastra_register_dependency", {"name": "A", "endpoint_url": SAFE_URL}
    )
    outcomes = [r.outcome for r in audit_records if r.getMessage() == "mcp_mutation"]
    assert any(outcome.startswith("failed:") for outcome in outcomes), outcomes


# ── Registration surface ────────────────────────────────────────────────────


async def test_write_tools_are_absent_on_a_read_only_server(make_built):
    server, deps, api = make_built(allow_mutations=False)
    names = {tool.name for tool in await server.list_tools()}
    assert "reliastra_register_dependency" not in names
    assert "reliastra_trigger_check" not in names
    assert "reliastra_get_capabilities" in names


async def test_write_tools_are_annotated_as_not_read_only(built):
    server, deps, api = built
    tools = {tool.name: tool for tool in await server.list_tools()}
    for name in ("reliastra_register_dependency", "reliastra_trigger_check"):
        annotations = tools[name].annotations
        assert annotations.read_only_hint is False, name
        assert annotations.destructive_hint is False, name
    # Registration is safe to retry (idempotency key); a probe is not.
    assert tools["reliastra_register_dependency"].annotations.idempotent_hint is True
    assert tools["reliastra_trigger_check"].annotations.idempotent_hint is False


async def test_read_tools_are_annotated_read_only(built):
    server, deps, api = built
    for tool in await server.list_tools():
        if tool.name in {"reliastra_register_dependency", "reliastra_trigger_check"}:
            continue
        assert tool.annotations.read_only_hint is True, tool.name
        assert tool.annotations.destructive_hint is False, tool.name


async def test_wire_schema_rejects_wrong_typed_arguments(built):
    """Type errors are caught by the generated schema before any code runs."""
    from mcp.server.mcpserver.exceptions import ToolError

    server, deps, api = built
    with pytest.raises(ToolError):
        await server.call_tool(
            "reliastra_register_dependency",
            {"name": "A", "endpoint_url": SAFE_URL, "expected_status_codes": "200"},
        )
    assert api.calls == []
