"""Protocol-level tests: a real MCP handshake over a real client session.

These use ``mcp.client.Client`` against the server object, so the wire protocol is
exercised rather than the tool functions: capability negotiation, ``tools/list``,
``resources/read``, ``prompts/get``, structured output, and the elicitation round
trip that gates every write.

Each test opens and closes its own client inside the test body. An async *fixture*
cannot be used here: pytest-asyncio runs a fixture's teardown in a different task
than its setup, and the client session's anyio cancel scope then fails to exit.
Keeping the session inside one test body is what makes the teardown legal.
"""

from __future__ import annotations

import json
import re

import pytest
from mcp.client import Client
from mcp.server.mcpserver.exceptions import ToolError
from mcp.shared.exceptions import MCPError

from mcp_server.tools._base import ToolContext

from .conftest import DEPENDENCY_ID, GOOD_KEY


async def test_initialize_negotiates_a_current_protocol_version(built):
    server, deps, api = built
    async with Client(server) as client:
        assert client.server_info.name == "reliastra"
        assert client.server_info.version == "0.1.0"
        assert client.protocol_version in {"2025-11-25", "2026-07-28"}


async def test_server_advertises_tools_resources_and_prompts(built):
    server, deps, api = built
    async with Client(server) as client:
        capabilities = client.server_capabilities
        assert capabilities.tools is not None
        assert capabilities.resources is not None
        assert capabilities.prompts is not None


def _flat(text: str) -> str:
    """Collapse wrapping so assertions do not depend on where lines break."""
    return " ".join(text.split())


async def test_instructions_tell_the_agent_where_to_start(built):
    server, deps, api = built
    async with Client(server) as client:
        instructions = _flat(client.instructions or "")
        assert "reliastra_get_capabilities" in instructions
        # The distinctions the brief requires an agent to keep straight.
        assert "HTTP(S) endpoints" in instructions
        assert "correlation" in instructions.lower()
        assert "not a request your application made" in instructions
        assert "READ A NULL AS A NULL" in instructions
        assert "confirmed by the user" in instructions.lower() or "user" in instructions


async def test_every_tool_declares_a_schema_and_annotations(built):
    server, deps, api = built
    async with Client(server) as client:
        tools = (await client.list_tools()).tools
        assert len(tools) == len(deps.registered_tools)
        for tool in tools:
            assert tool.name.startswith("reliastra_"), tool.name
            assert tool.input_schema["type"] == "object", tool.name
            assert tool.description and len(tool.description) > 200, tool.name
            annotations = tool.annotations
            assert annotations is not None, tool.name
            assert annotations.title, tool.name
            assert annotations.read_only_hint is not None, tool.name
            # openWorldHint must be true: every tool consults the outside world.
            assert annotations.open_world_hint is True, tool.name
            # The Context parameter is injected, never exposed to the caller.
            assert "ctx" not in tool.input_schema.get("properties", {}), tool.name


async def test_tool_descriptions_answer_what_it_proves_and_when_not_to_use(built):
    """An agent chooses tools from descriptions; they must carry that guidance."""
    server, deps, api = built
    async with Client(server) as client:
        for tool in (await client.list_tools()).tools:
            text = tool.description.upper()
            assert "WHAT THE OUTPUT PROVES" in text or "WHAT IT RETURNS" in text, tool.name
            assert "WHEN NOT TO USE" in text or "NEXT:" in text, tool.name


async def test_successful_call_returns_text_and_structured_content(built):
    server, deps, api = built
    async with Client(server) as client:
        result = await client.call_tool("reliastra_search_observatory", {})
        assert result.is_error is False
        assert result.content and result.content[0].type == "text"
        # Text and structured content must agree; an agent may use either.
        assert json.loads(result.content[0].text) == result.structured_content
        assert result.structured_content["ok"] is True


async def test_output_schema_is_advertised_for_structured_output(built):
    server, deps, api = built
    async with Client(server) as client:
        tool = next(
            t for t in (await client.list_tools()).tools
            if t.name == "reliastra_get_capabilities"
        )
        assert tool.output_schema is not None
        assert tool.output_schema["type"] == "object"


@pytest.mark.parametrize("name", ["reliastra_does_not_exist", "reliastra_drop_table", ""])
async def test_unknown_tool_is_refused_and_cannot_reach_the_api(built, name):
    """Asserted at the server layer.

    Going through a client session would work too, but the session's anyio task
    group turns the resulting error into an ExceptionGroup on teardown, which
    obscures the thing being tested: an unknown name is refused, and nothing is
    sent upstream.
    """
    from mcp_server.tools._base import ToolContext  # noqa: F401  (import parity)

    server, deps, api = built
    with pytest.raises(ToolError):
        await server.call_tool(name, {})
    assert api.calls == [], "an unknown tool must not produce any upstream request"


# ── Resources ───────────────────────────────────────────────────────────────


async def test_resources_are_listed_with_metadata(built):
    server, deps, api = built
    async with Client(server) as client:
        resources = (await client.list_resources()).resources
        uris = {str(resource.uri) for resource in resources}
        assert uris == {
            "reliastra://capabilities",
            "reliastra://methodology",
            "reliastra://limitations",
            "reliastra://integration-guide",
        }
        for resource in resources:
            assert resource.name and resource.description and resource.mime_type


async def test_resource_template_is_listed(built):
    server, deps, api = built
    async with Client(server) as client:
        templates = (await client.list_resource_templates()).resource_templates
        assert [t.uri_template for t in templates] == ["reliastra://observatory/{provider}"]


@pytest.mark.parametrize(
    "uri,mime",
    [
        ("reliastra://capabilities", "application/json"),
        ("reliastra://methodology", "application/json"),
        ("reliastra://limitations", "application/json"),
        ("reliastra://integration-guide", "text/markdown"),
    ],
)
async def test_each_resource_reads_and_is_valid(built, uri, mime):
    server, deps, api = built
    async with Client(server) as client:
        result = await client.read_resource(uri)
        contents = result.contents
        assert len(contents) == 1
        assert contents[0].mime_type == mime
        text = contents[0].text
        assert text
        if mime == "application/json":
            document = json.loads(text)
            assert isinstance(document, dict)
        # No resource may require a credential or return tenant data.
        assert api.calls == [], f"{uri} must be served without calling the API"


async def test_capabilities_resource_lists_both_surfaces(built):
    server, deps, api = built
    async with Client(server) as client:
        text = (await client.read_resource("reliastra://capabilities")).contents[0].text
        document = json.loads(text)
        assert document["public_operations"]
        assert document["authenticated_operations"]
        assert document["methodology"]["attribution"]["methodology_version"] == "v1.1"
        assert document["limitations"]


async def test_methodology_resource_states_the_unavailable_claims(built):
    """The distinctions an agent must preserve are in the resource, not just prose."""
    server, deps, api = built
    async with Client(server) as client:
        text = (await client.read_resource("reliastra://methodology")).contents[0].text
        document = json.loads(text)
        distinctions = document["distinctions_an_agent_must_preserve"]
        assert "NOT AVAILABLE" in distinctions["incident_reported_by_an_external_source"]
        assert "NOT AVAILABLE" in distinctions["causally_established_relationship"]
        assert distinctions["provider_independently_observed_failing"]


async def test_limitations_resource_explains_how_to_read_a_null(built):
    server, deps, api = built
    async with Client(server) as client:
        text = (await client.read_resource("reliastra://limitations")).contents[0].text
        document = json.loads(text)
        nulls = document["how_to_read_a_null"]
        assert "not 100%" in nulls["uptime_percentage=null"]
        assert "never a pass" in nulls["verified=null"]
        assert "ambiguous" in nulls["empty observation list"]
        # The GitHub Action EXISTS (ReliaAstra/reliastra-action@v1), so it must not
        # appear in a list of things that do not. A false negative here is as bad as
        # a fabricated capability: it tells an agent to hand-roll a CI step.
        assert not any(
            "github action" in item["thing"].lower()
            for item in document["things_that_do_not_exist"]
        )
        assert any(
            "OpenAPI schema" in item["thing"] for item in document["things_that_do_not_exist"]
        )


async def test_integration_guide_quotes_real_commands_and_endpoints(built):
    server, deps, api = built
    async with Client(server) as client:
        text = (await client.read_resource("reliastra://integration-guide")).contents[0].text
        assert "reliastra deps add" in text
        assert "reliastra keys create" in text
        assert "POST /v1/dependencies" in text or "/v1/dependencies" in text
        assert "write:dependencies" in text
        assert "pip install reliastra" in text
        assert "streamable-http" in text or "mcpServers" in text
        # The action is real, so the guide must present a usable step built only
        # from declared inputs, and must record where the interface came from.
        assert "## 5. GitHub Action (CI)" in text
        assert "uses: ReliaAstra/reliastra-action@v1" in text
        assert "reliastra-action" in text
        for name in ("dependency", "token", "fail-on", "base-url", "latency-threshold-ms"):
            assert f"`{name}`" in text, name
        assert "action.yml" in text and "tag v1" in text
        # The two honesty caveats must survive into the rendered guide.
        assert "https://reliastra.com/api" in text
        assert "https://api.reliastra.com" in text
        assert "derived by the action" in text
        # Structural check on the Inputs subsection only: the names it documents
        # must be exactly the declared set. Scanning the whole section would pick
        # up output names and fail-on values, which are not inputs.
        from mcp_server.capabilities import INTEGRATIONS

        declared = set(INTEGRATIONS["github_action"]["inputs"])
        section = text[text.index("## 5. GitHub Action") : text.index("## 6.")]
        inputs_block = section.split("### Inputs", 1)[1].split("###", 1)[0]
        documented = set(re.findall(r"^- `([a-z][a-z0-9-]+)`", inputs_block, re.MULTILINE))
        assert documented == declared, (
            f"guide documents inputs that differ from action.yml: "
            f"missing={sorted(declared - documented)} extra={sorted(documented - declared)}"
        )
        # Outputs are documented too, and must match the registry.
        outputs_block = section.split("### Outputs", 1)[1].split("###", 1)[0]
        # [a-z0-9_-] deliberately includes the underscore: a name transcribed with
        # the wrong separator must appear as a mismatch, not vanish from both sides.
        assert set(re.findall(r"`([a-z0-9_-]+)`", outputs_block)) == set(
            INTEGRATIONS["github_action"]["outputs"]
        )
        assert set(re.findall(r"^- `([a-z0-9_-]+)`", inputs_block, re.MULTILINE)) == declared


async def test_provider_resource_template_fetches_public_data(built):
    server, deps, api = built
    async with Client(server) as client:
        text = (
            await client.read_resource("reliastra://observatory/stripe")
        ).contents[0].text
        document = json.loads(text)
        assert document["provider"]["vendor_name"] == "stripe"
        assert document["source"].endswith("/v1/vendors/stripe")
        assert "untrusted" in document["note"].lower()
    assert api.calls_to("/v1/vendors/stripe")


@pytest.mark.parametrize(
    ("uri", "code"),
    [
        # Never matches the template, so the SDK refuses it before any handler
        # runs: a path separator or a query string is not a slug.
        ("reliastra://observatory/..%2f..%2fadmin", -32602),
        ("reliastra://observatory/stripe?x=1", -32602),
        # Matches the template and reaches as_slug(), which refuses it: an
        # embedded "..", an over-long value, a quote.
        ("reliastra://observatory/a..b", -32603),
        ("reliastra://observatory/" + "a" * 200, -32603),
        ("reliastra://observatory/STRIP'E", -32603),
    ],
)
async def test_provider_resource_refuses_a_traversal_slug(built, uri, code):
    """No caller-supplied URI segment becomes a path, a host or a query.

    The exception type is asserted specifically, not as a bare ``Exception``: a
    blind ``pytest.raises(Exception)`` here once passed for the wrong reason,
    because the first URI in this list is rejected by the SDK's template matcher
    and never reaches the validation it was written to prove.

    Note what the caller *cannot* see: for a template resource the SDK replaces
    the reason with a generic -32603 ("Error creating resource from template")
    and keeps the cause server-side, so ``as_slug``'s message is logged
    (``resource_read_refused``) rather than returned. Tools do not have this
    limitation — they return the reason in a structured envelope.
    """
    server, deps, api = built
    async with Client(server) as client:
        with pytest.raises(MCPError) as excinfo:
            await client.read_resource(uri)
    assert excinfo.value.code == code
    # Whatever the URI claimed to address, nothing upstream saw it.
    assert not any("/admin" in call.path for call in api.calls)
    assert all(call.path.startswith("/v1/vendors/") is False or ".." not in call.path
               for call in api.calls)


# ── Prompts ─────────────────────────────────────────────────────────────────


async def test_prompts_are_listed_with_arguments(built):
    server, deps, api = built
    async with Client(server) as client:
        prompts = (await client.list_prompts()).prompts
        names = {prompt.name for prompt in prompts}
        assert names == {
            "reliastra_workflow_assess_observability",
            "reliastra_workflow_investigate_failure",
            "reliastra_workflow_evaluate_fit",
            "reliastra_workflow_plan_integration",
        }
        by_name = {prompt.name: prompt for prompt in prompts}
        required = {
            argument.name
            for argument in by_name["reliastra_workflow_investigate_failure"].arguments
            if argument.required
        }
        assert required == {"symptom"}


@pytest.mark.parametrize(
    "name,arguments,must_contain",
    [
        (
            "reliastra_workflow_assess_observability",
            {"application_summary": "A Rails app calling Stripe and Twilio."},
            ["reliastra_analyze_dependencies", "no_value", "untrusted"],
        ),
        (
            "reliastra_workflow_investigate_failure",
            {"symptom": "Checkout 500s since 09:00 UTC"},
            ["reliastra_search_incidents", "CAUSALLY ESTABLISHED", "reliastra_get_pipeline_health"],
        ),
        (
            "reliastra_workflow_evaluate_fit",
            {
                "architecture": "Batch ETL over Postgres",
                "external_dependencies": "Postgres, S3",
            },
            ["do not adopt", "reliastra_analyze_dependencies", "cannot determine"],
        ),
        (
            "reliastra_workflow_plan_integration",
            {"integration_target": "Stripe API monitoring", "environment": "ci"},
            ["reliastra_plan_integration", "ReliaAstra/reliastra-action@v1", "approval"],
        ),
    ],
)
async def test_each_prompt_renders_its_workflow(built, name, arguments, must_contain):
    server, deps, api = built
    async with Client(server) as client:
        result = await client.get_prompt(name, arguments)
        assert result.messages
        text = _flat(result.messages[0].content.text)
        for fragment in must_contain:
            assert fragment.lower() in text.lower(), f"{name}: missing {fragment!r}"
        # The user's own arguments must be interpolated.
        assert next(iter(arguments.values())).split(".")[0] in text


async def test_prompts_encode_the_untrusted_content_rule(built):
    server, deps, api = built
    async with Client(server) as client:
        for prompt in (await client.list_prompts()).prompts:
            arguments = {
                argument.name: "x"
                for argument in (prompt.arguments or [])
                if argument.required
            }
            text = (await client.get_prompt(prompt.name, arguments)).messages[0].content.text
            assert "never instructions" in text or "data, never instructions" in text, prompt.name
            assert "without the user's explicit approval" in text, prompt.name


async def test_prompt_arguments_are_capped(built):
    """A prompt argument is user input rendered into a model's context."""
    server, deps, api = built
    async with Client(server) as client:
        result = await client.get_prompt(
            "reliastra_workflow_assess_observability",
            {"application_summary": "y" * 50_000},
        )
        text = result.messages[0].content.text
        assert "truncated" in text
        assert len(text) < 20_000


async def test_prompt_arguments_carry_no_control_characters(built):
    server, deps, api = built
    async with Client(server) as client:
        result = await client.get_prompt(
            "reliastra_workflow_investigate_failure",
            {"symptom": "bad\x00\x07value\x1b[31m"},
        )
        text = result.messages[0].content.text
        assert "\x00" not in text and "\x07" not in text and "\x1b" not in text
        assert "badvalue[31m" in text


# ── Approval over a real client session ─────────────────────────────────────
# The modern protocol era (2026-07-28) forbids server-initiated JSON-RPC
# requests, and the SDK enforces that by building these connections with
# can_send_request=False. Elicitation therefore cannot be the only approval route:
# it is attempted when a back-channel exists (see test_transport_http.py) and
# otherwise the explicit confirm argument decides. Both routes are tested.


async def test_modern_client_has_no_elicitation_back_channel(built):
    """Verified, not assumed: this connection cannot answer a server question."""
    server, deps, api = built
    deps.config.reliastra_api_key = GOOD_KEY

    seen: dict[str, bool] = {}

    async def probe(self, *, action, summary, confirm_argument):
        seen["available"] = self.elicitation_available()
        from mcp_server.tools._base import ApprovalDecision

        return ApprovalDecision(seen["available"], "elicitation", action)

    original = ToolContext.request_approval
    ToolContext.request_approval = probe  # type: ignore[method-assign]
    try:
        async with Client(server) as client:
            await client.call_tool(
                "reliastra_register_dependency",
                {"name": "P", "endpoint_url": "https://api.payments.example/health"},
            )
    finally:
        ToolContext.request_approval = original  # type: ignore[method-assign]
    assert seen["available"] is False


async def test_write_proceeds_on_an_explicit_confirm_argument(built):
    server, deps, api = built
    deps.config.reliastra_api_key = GOOD_KEY
    async with Client(server) as client:
        result = await client.call_tool(
            "reliastra_register_dependency",
            {
                "name": "Payments",
                "endpoint_url": "https://api.payments.example/health",
                "confirm": True,
            },
        )
    assert result.is_error is False, result.structured_content
    assert len(api.created_dependencies) == 1


async def test_write_is_refused_without_any_approval(built):
    server, deps, api = built
    deps.config.reliastra_api_key = GOOD_KEY
    async with Client(server) as client:
        result = await client.call_tool(
            "reliastra_register_dependency",
            {"name": "Payments", "endpoint_url": "https://api.payments.example/health"},
        )
    assert result.is_error is True
    error = result.structured_content["error"]
    assert error["category"] == "forbidden"
    assert error["approval_mechanism"] == "none"
    assert "confirm=true" in error["message"]
    assert api.created_dependencies == []


async def test_write_is_blocked_when_the_client_declines_an_elicitation(built):
    """Where a back-channel does exist, a decline is final."""
    import mcp_types as t

    from mcp_server.tools._base import ApprovalDecision

    server, deps, api = built
    deps.config.reliastra_api_key = GOOD_KEY

    asked: list[str] = []

    async def decline(self, *, action, summary, confirm_argument):
        asked.append(action)
        return ApprovalDecision(False, "elicitation", action, reason="user declined")

    original = ToolContext.request_approval
    ToolContext.request_approval = decline  # type: ignore[method-assign]
    try:
        async with Client(server) as client:
            result = await client.call_tool(
                "reliastra_register_dependency",
                {
                    "name": "Payments",
                    "endpoint_url": "https://api.payments.example/health",
                    # An agent asserting confirmation cannot override a human no.
                    "confirm": True,
                },
            )
    finally:
        ToolContext.request_approval = original  # type: ignore[method-assign]
    assert asked, "the gate must have been consulted"
    assert result.is_error is True
    assert result.structured_content["error"]["category"] == "forbidden"
    assert api.created_dependencies == []
    assert t.ElicitResult is not None  # the type is real and used by the client path


async def test_write_is_blocked_when_the_client_cannot_elicit_and_no_confirm(built):
    server, deps, api = built
    deps.config.reliastra_api_key = GOOD_KEY
    async with Client(server) as client:  # default callback refuses elicitation
        result = await client.call_tool(
            "reliastra_trigger_check", {"dependency_id": DEPENDENCY_ID}
        )
    assert result.is_error is True
    assert result.structured_content["error"]["approval_mechanism"] == "none"
    assert api.queued_checks == []
