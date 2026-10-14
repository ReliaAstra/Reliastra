"""reliastra_plan_integration: no invented interfaces, and it can decline.

Every endpoint, flag, scope, environment variable and package name in a plan must
come from the verified registry. The tests here assert the plan quotes real things
and refuses to plan an unjustified integration.
"""

from __future__ import annotations

import json
import re

import pytest

from mcp_server.capabilities import INTEGRATIONS
from mcp_server.tools.planning import MAX_TARGETS

from .conftest import call_tool, call_tool_expect_error


def target(name, url="https://api.example.com/health", **kwargs):
    return {"name": name, "endpoint_url": url, **kwargs}


async def plan(server, targets, **arguments):
    payload = await call_tool(
        server, "reliastra_plan_integration", {"targets": targets, **arguments}
    )
    return payload["data"]


# ── Declining is a supported outcome ────────────────────────────────────────


@pytest.mark.parametrize(
    "url",
    [
        "postgres://db.internal:5432/app",
        "redis://cache.internal:6379",
        "amqp://broker.internal",
        "mongodb://db.internal/app",
        "not-a-url",
        "",
    ],
)
async def test_non_http_targets_produce_no_plan(built, url):
    server, deps, api = built
    data = await plan(server, [target("Primary DB", url)])
    assert data["justified"] is False
    assert data["conclusion"] == "not_justified"
    assert data["plan"] is None
    assert any("cannot observe" in reason for reason in data["reasons"])
    assert any("HTTP(S)" in reason for reason in data["reasons"])
    assert data["what_to_do_instead"], "a decline must still be actionable"
    assert any("should not adopt" in item.lower() for item in data["what_to_do_instead"])


async def test_empty_target_list_is_refused(built):
    server, deps, api = built
    failure = await call_tool_expect_error(
        server, "reliastra_plan_integration", {"targets": []}
    )
    assert failure["category"] == "invalid_input"
    assert "reliastra_analyze_dependencies" in failure["message"]


async def test_oversized_target_list_is_refused(built):
    server, deps, api = built
    failure = await call_tool_expect_error(
        server,
        "reliastra_plan_integration",
        {"targets": [target(f"t{i}", f"https://t{i}.example/h") for i in range(MAX_TARGETS + 1)]},
    )
    assert failure["category"] == "invalid_input"


async def test_mixed_targets_plan_for_the_monitorable_and_report_the_rest(built):
    server, deps, api = built
    data = await plan(
        server,
        [
            target("Payments", "https://api.payments.example/health"),
            target("Postgres", "postgres://db.internal/app"),
        ],
    )
    assert data["justified"] is True
    assert len(data["excluded_targets"]) == 1
    assert data["excluded_targets"][0]["name"] == "Postgres"
    assert "cannot probe" in data["excluded_targets"][0]["reason"]


# ── Plan content is real ────────────────────────────────────────────────────


async def test_plan_endpoints_exist_in_the_verified_registry(built):
    """Every REST path the plan mentions must be a registered operation."""
    from mcp_server.capabilities import AUTHENTICATED_OPERATIONS, PUBLIC_OPERATIONS

    known = {
        operation.path
        for operation in (*PUBLIC_OPERATIONS, *AUTHENTICATED_OPERATIONS)
    }
    server, deps, api = built
    data = await plan(server, [target("Payments")])
    mentioned = set()
    for step in data["plan"]["steps"]:
        rest = step.get("rest")
        if not rest:
            continue
        for fragment in rest.split("·"):
            for token in fragment.split():
                if token.startswith("/v1/"):
                    mentioned.add(token.split("?")[0].rstrip())
    assert mentioned, "the plan should mention REST paths"
    unknown = {path for path in mentioned if not _matches_any(path, known)}
    assert not unknown, f"plan invented endpoints: {unknown}"


def _matches_any(path: str, known: set[str]) -> bool:
    """Match a concrete path against registry templates."""
    import re

    for template in known:
        pattern = re.sub(r"\{[^}]+\}", r"[^/]+", template)
        if re.fullmatch(pattern, path):
            return True
    return False


async def test_plan_request_body_fields_match_the_api_contract(built):
    """No invented request fields, and the real constraints are quoted."""
    from app.modules.dependencies.schemas import DependencyCreateRequest

    server, deps, api = built
    data = await plan(server, [target("Payments")])
    write_step = next(step for step in data["plan"]["steps"] if step.get("type") == "write")
    documented = set(write_step["request_body_fields"])
    real = set(DependencyCreateRequest.model_fields)
    assert documented <= real, f"plan invented fields: {documented - real}"
    assert {"name", "endpoint_url", "method", "check_interval_seconds"} <= documented


async def test_plan_cli_commands_are_verified_commands(built):
    server, deps, api = built
    data = await plan(server, [target("Payments")], mechanism="both")
    verified = set(INTEGRATIONS["cli"]["verified_commands"])
    for command in data["plan"]["cli_commands"]:
        if command.startswith("#") or not command.strip():
            continue
        # Allow the install lines and concrete argument substitutions.
        if command.startswith(("pip install", "npm install")):
            continue
        stem = command.split("  ")[0]
        assert any(stem.startswith(entry.split(" [")[0].split(" <")[0]) for entry in verified), (
            f"plan invented a CLI command: {command}"
        )


async def test_ci_plan_recommends_the_published_action(built):
    """The action exists, so a CI plan must be able to use it."""
    server, deps, api = built
    data = await plan(server, [target("Payments")], environment="ci")
    plan_body = data["plan"]
    assert plan_body["integrations"]["github_action"]["exists"] is True
    assert plan_body["integrations"]["github_action"]["ref"] == "v1"

    ci_note = " ".join(step.get("environment_note", "") for step in plan_body["steps"])
    assert "ReliaAstra/reliastra-action@v1" in ci_note
    assert "no Reliastra GitHub Action" not in ci_note

    action_block = plan_body["github_action"]
    assert action_block["inputs"]["dependency"]["required"] is True
    assert action_block["inputs"]["fail-on"]["default"] == "down"
    assert "130" in action_block["exit_codes"]
    assert "uses: ReliaAstra/reliastra-action@v1" in action_block["example"]


async def test_plan_never_invents_an_action_input(built):
    """Every input the plan exposes must be one action.yml declares.

    Structural, not prose-scanning: the plan publishes inputs as machine-readable
    keys (the step's input_reference and the plan's github_action.inputs), so the
    declared set can be compared exactly. A fabricated input would appear there.
    """
    from mcp_server.capabilities import INTEGRATIONS

    declared = set(INTEGRATIONS["github_action"]["inputs"])
    server, deps, api = built
    for mechanism in ("github_action", "both"):
        data = await plan(
            server, [target("Payments"), target("Search")],
            mechanism=mechanism, environment="ci",
        )
        plan_body = data["plan"]
        assert set(plan_body["github_action"]["inputs"]) == declared, mechanism
        action_step = next(
            step for step in plan_body["steps"] if "input_reference" in step
        )
        assert set(action_step["input_reference"]) == declared, mechanism
        # The rendered YAML may only pass declared inputs in `with:` position.
        yaml_text = action_step["github_action"]
        # Only keys indented under `with:` are inputs; `with:` itself is YAML.
        assert "\n  with:\n" in yaml_text
        with_block = yaml_text.split("\n  with:\n", 1)[1]
        passed = re.findall(r"^    ([a-z][a-z0-9-]*):", with_block, re.MULTILINE)
        assert passed, "the rendered step passes no inputs"
        for name in passed:
            assert name in declared, f"{mechanism}: step passes undeclared input {name}"
        # `uses:` must be owner/repo@ref. A step reading `uses: reliastra-action@v1`
        # is unresolvable by GitHub, and it is the kind of omission that reads as
        # plausible in a test log.
        assert f"- uses: {INTEGRATIONS['github_action']['uses']}\n" in yaml_text
        assert yaml_text.startswith("- uses: ReliaAstra/reliastra-action@v1\n")
        assert "\n  uses: reliastra-action@" not in yaml_text
        # The example in the registry is the README's, verbatim in shape.
        assert plan_body["github_action"]["example"].startswith(
            "- uses: ReliaAstra/reliastra-action@v1"
        )


async def test_github_action_plan_still_shows_the_prerequisites_it_cannot_perform(built):
    """Choosing the action must not hide the steps the action cannot do."""
    server, deps, api = built
    data = await plan(
        server, [target("Payments")], mechanism="github_action", environment="ci"
    )
    steps = data["plan"]["steps"]
    rendered = json.dumps(steps)
    # Registering a dependency is not something the action does; the plan must say
    # how, or the step is unexecutable.
    assert "POST /v1/dependencies" in rendered
    assert any(step["type"] == "write" for step in steps)
    action_step = next(step for step in steps if "input_reference" in step)
    assert action_step["input_reference"]["dependency"]["required"] is True
    assert "action.yml" in action_step["verified_against"]
    # The action runs one dependency per step, and the plan must say how many.
    assert "1 step(s)" in action_step["note"]
    assert "Payments" in action_step["note"]


async def test_plan_environment_variables_are_the_real_ones(built):
    server, deps, api = built
    data = await plan(server, [target("Payments")])
    cli_env = set(data["plan"]["configuration"]["cli_environment"])
    assert cli_env == set(INTEGRATIONS["cli"]["environment"])
    assert "RELIASTRA_TOKEN" in cli_env


async def test_prerequisites_include_the_paid_plan_requirement(built):
    """The most common real-world blocker must be stated up front."""
    server, deps, api = built
    data = await plan(server, [target("Payments")])
    joined = json.dumps(data["plan"]["prerequisites"]).lower()
    assert "api_access" in joined
    assert "paid" in joined or "entitlement" in joined
    assert any("verified email" in item["requirement"].lower()
               for item in data["plan"]["prerequisites"])


async def test_prerequisites_include_the_ssrf_boundary(built):
    server, deps, api = built
    data = await plan(server, [target("Payments")])
    joined = json.dumps(data["plan"]["prerequisites"]).lower()
    assert "ssrf" in joined
    assert "loopback" in joined
    assert "blocked_by_security_policy" in joined


async def test_least_privilege_scopes_are_stated(built):
    server, deps, api = built
    data = await plan(server, [target("Payments")])
    key_prereq = next(
        item for item in data["plan"]["prerequisites"] if "scopes" in item["requirement"]
    )
    assert "write:dependencies" in key_prereq["requirement"]
    assert "read scopes only" in key_prereq["least_privilege"]


async def test_steps_are_ordered_and_marked_read_or_write(built):
    server, deps, api = built
    data = await plan(server, [target("Payments")])
    steps = data["plan"]["steps"]
    assert [step["id"] for step in steps] == list(range(1, len(steps) + 1))
    assert steps[0]["type"] == "read", "prove reachability before writing"
    writes = [step for step in steps if step["type"] == "write"]
    assert writes, "a registration plan must contain a write step"
    assert all(step["side_effects"] for step in steps)
    assert writes[0]["rest"] == "POST /v1/dependencies"
    assert "Idempotency-Key" in writes[0]["idempotency"]


async def test_forbidden_header_names_are_documented(built):
    """The API rejects proxy-injection headers; the plan must say so."""
    from app.modules.dependencies.schemas import _FORBIDDEN_HEADERS

    server, deps, api = built
    data = await plan(server, [target("Payments")])
    write_step = next(step for step in data["plan"]["steps"] if step.get("type") == "write")
    documented = write_step["forbidden_header_names"]
    for name in ("cookie", "host", "transfer-encoding"):
        assert name in documented
        assert name in _FORBIDDEN_HEADERS


# ── Code examples ───────────────────────────────────────────────────────────


@pytest.mark.parametrize("runtime", ["bash", "python", "node", "go"])
async def test_code_example_never_inlines_a_credential(built, runtime):
    server, deps, api = built
    data = await plan(server, [target("Payments")], runtime=runtime)
    code = data["plan"]["code_example"]["code"]
    assert "rel_" not in code, "a literal key must never appear in an example"
    assert runtime in data["plan"]["code_example"]["runtime"]
    if runtime == "bash":
        assert "$RELIASTRA_TOKEN" in code
    elif runtime == "python":
        assert 'os.environ["RELIASTRA_TOKEN"]' in code
    elif runtime == "node":
        assert "process.env.RELIASTRA_TOKEN" in code
    else:
        assert 'os.Getenv("RELIASTRA_TOKEN")' in code


async def test_go_example_is_valid_go_not_json(built):
    """JSON array syntax is not a Go slice; a broken example is worse than none."""
    server, deps, api = built
    data = await plan(
        server,
        [target("Payments", expected_status_codes=[200, 204])],
        runtime="go",
    )
    code = data["plan"]["code_example"]["code"]
    assert "[]any{200, 204}" in code, code
    assert "[200, 204]" not in code, "JSON array syntax leaked into Go"
    assert "package main" in code
    assert code.count("{") == code.count("}"), "unbalanced braces"


async def test_python_example_parses(built):
    server, deps, api = built
    data = await plan(server, [target("Payments")], runtime="python")
    code = data["plan"]["code_example"]["code"]
    compile(code, "<example>", "exec")


async def test_node_example_has_balanced_braces(built):
    server, deps, api = built
    data = await plan(server, [target("Payments")], runtime="node")
    code = data["plan"]["code_example"]["code"]
    assert code.count("{") == code.count("}")
    assert code.count("(") == code.count(")")


async def test_idempotency_caveat_is_disclosed(built):
    """A fresh UUID per attempt defeats idempotency; the plan must say so."""
    server, deps, api = built
    data = await plan(server, [target("Payments")], runtime="bash")
    assert "defeats it" in data["plan"]["code_example"]["note"]


async def test_headers_are_never_returned_by_the_api(built):
    server, deps, api = built
    data = await plan(server, [target("Payments")])
    assert "always null" in data["plan"]["code_example"]["security_note"]


# ── Mechanism and environment selection ─────────────────────────────────────


async def test_rest_only_plan_has_no_cli_command_list(built):
    server, deps, api = built
    data = await plan(server, [target("Payments")], mechanism="rest_api")
    assert data["plan"]["mechanism"] == "rest_api"
    assert "code_example" in data["plan"]
    assert "cli_commands" not in data["plan"]
    assert not any("cli" in step for step in data["plan"]["steps"]), (
        "a REST-only plan must not show CLI commands"
    )


async def test_cli_only_plan_has_no_code_example(built):
    server, deps, api = built
    data = await plan(server, [target("Payments")], mechanism="cli")
    assert "cli_commands" in data["plan"]
    assert "code_example" not in data["plan"]
    assert any("reliastra deps add" in step.get("cli", "") for step in data["plan"]["steps"])


async def test_cli_registration_command_carries_the_supplied_values(built):
    server, deps, api = built
    data = await plan(
        server,
        [target("Payments", "https://api.payments.example/health", check_interval_seconds=60,
                method="HEAD", timeout_seconds=5, expected_status_codes=[200, 204])],
    )
    command = next(line for line in data["plan"]["cli_commands"] if "deps add" in line)
    assert "'Payments'" in command
    assert "'https://api.payments.example/health'" in command
    assert "--interval 60" in command
    assert "--method HEAD" in command
    assert "--timeout 5" in command
    assert "--expect 200,204" in command


@pytest.mark.parametrize(
    "environment,expected",
    [
        ("ci", "repository secret"),
        ("production", "secret manager"),
        ("local", "reliastra login"),
    ],
)
async def test_environment_specific_secret_guidance(built, environment, expected):
    server, deps, api = built
    data = await plan(server, [target("Payments")], environment=environment)
    notes = " ".join(step.get("environment_note", "") for step in data["plan"]["steps"])
    assert expected in notes


async def test_targets_are_prioritised_by_criticality(built):
    server, deps, api = built
    data = await plan(
        server,
        [
            target("Low", "https://low.example/h", criticality="low"),
            target("Critical", "https://crit.example/h", criticality="critical"),
        ],
    )
    write_step = next(step for step in data["plan"]["steps"] if step.get("type") == "write")
    names = [entry["name"] for entry in write_step["per_target"]]
    assert names == ["Critical", "Low"]


# ── Operational expectations ────────────────────────────────────────────────


async def test_detection_latency_math_is_correct(built):
    """2 consecutive failures at a 60s interval means 120s, and the plan says so."""
    server, deps, api = built
    data = await plan(server, [target("Fast", "https://f.example/h", check_interval_seconds=60)])
    joined = " ".join(data["plan"]["operational_limitations"])
    assert "fastest configured interval is 60s" in joined
    assert "120s" in joined


async def test_post_probe_warning_is_raised(built):
    server, deps, api = built
    data = await plan(server, [target("Write", "https://w.example/h", method="POST")])
    joined = " ".join(data["plan"]["operational_limitations"])
    assert "real request to your endpoint" in joined


async def test_plaintext_http_target_is_flagged(built):
    server, deps, api = built
    data = await plan(server, [target("Legacy", "http://legacy.example/health")])
    joined = " ".join(data["plan"]["operational_limitations"])
    assert "plaintext http://" in joined


async def test_rollback_options_are_marked_reversible_or_not(built):
    server, deps, api = built
    data = await plan(server, [target("Payments")])
    rollback = data["plan"]["rollback"]
    assert any(item["reversible"] is True for item in rollback)
    assert any(item["reversible"] is False for item in rollback)
    deactivate = next(item for item in rollback if "is_active" in item["how"])
    assert deactivate["reversible"] is True
    delete = next(item for item in rollback if item["how"].startswith("DELETE /v1/dependencies"))
    assert delete["reversible"] is False


async def test_testing_steps_include_a_deliberate_failure_check(built):
    server, deps, api = built
    data = await plan(server, [target("Payments")])
    checks = " ".join(test["check"].lower() for test in data["plan"]["testing"])
    assert "deliberate failure" in checks
    assert "ssrf" in checks
    assert "idempotent" in checks
    assert "liveness" in checks


async def test_expected_results_describe_202_honestly(built):
    server, deps, api = built
    data = await plan(server, [target("Payments")])
    probe_step = next(step for step in data["plan"]["steps"] if step.get("rest", "").startswith("POST /v1/checks/run"))
    assert "QUEUED" in probe_step["expect"]


async def test_plan_is_json_serialisable_and_bounded(built):
    server, deps, api = built
    payload = await call_tool(
        server, "reliastra_plan_integration", {"targets": [target("Payments")]}
    )
    rendered = json.dumps(payload, default=str)
    assert len(rendered) < 60_000, "a plan must fit in an agent's context"
    assert payload["meta"]["source"].startswith("local plan builder")
