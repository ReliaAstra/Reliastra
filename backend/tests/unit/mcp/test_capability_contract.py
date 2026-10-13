"""The capability registry must not drift from the product it describes.

This is the anti-fabrication guarantee. ``mcp_server/capabilities.py`` is a
transcription of the deployed product, and a transcription that drifts becomes a
lie an agent repeats to a user. So every load-bearing literal is asserted against
the backend module that owns it, and **every API path the registry claims exists is
checked against the real FastAPI route table**.

It follows the convention already established in this repository by
``frontend/src/lib/__tests__/product-contract.test.ts``, which reads the backend
source for the same reason: the motivating bug there was a homepage that rendered
``attribution: external_dependency``, a classification the engine cannot produce.

If a test here fails, the registry is wrong (or the product changed and the
registry was not updated). Fix the registry; do not weaken the assertion.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytest

from mcp_server.capabilities import (
    AUTHENTICATED_OPERATIONS,
    CREDENTIALS,
    INTEGRATIONS,
    LIMITATIONS,
    METHODOLOGY,
    MUTATION_OPERATIONS,
    PUBLIC_OPERATIONS,
    STATIC_PRICING,
    build_capabilities,
    scopes_for_tool,
)
from mcp_server.config import McpServerConfig

REPO_ROOT = Path(__file__).resolve().parents[4]
CLI_HELP = REPO_ROOT / "cli" / "cmd" / "reliastra" / "help.go"

ALL_OPERATIONS = (*PUBLIC_OPERATIONS, *AUTHENTICATED_OPERATIONS)


# ── Backend sources of truth ────────────────────────────────────────────────


@pytest.fixture(scope="module")
def backend():
    """Import the backend modules that own each transcribed value."""
    from app.api.deps import _has_scope, _infer_scope
    from app.config import settings
    from app.main import app
    from app.modules.attribution.service import AttributionEngine
    from app.modules.checks.constants import QUORUM_MIN_REGIONS, QUORUM_WINDOW_SECONDS
    from app.modules.checks.detection import DetectionRule
    from app.modules.dependencies.constants import (
        DEFAULT_EXPECTED_STATUS_CODES,
        DEFAULT_REGIONS,
        DEFAULT_TIMEOUT_SECONDS,
        HttpMethod,
    )
    from app.modules.dependencies.schemas import ALLOWED_REGIONS
    from app.modules.evidence.generation import EVIDENCE_SCHEMA_VERSION
    from app.modules.incidents.public_service import FAILURE_KINDS
    from app.platform.commercial.entitlements import (
        PLAN_CHECK_INTERVALS,
        PLAN_DEPENDENCY_LIMITS,
        PLAN_DISPLAY_NAMES,
        PLAN_FEATURES,
        PLAN_PRICES_USD,
        PLAN_RETENTION_DAYS,
        PLAN_TEAM_LIMITS,
    )

    return {
        "settings": settings,
        "app": app,
        "attribution": AttributionEngine,
        "detection_rule": DetectionRule,
        "evidence_schema": EVIDENCE_SCHEMA_VERSION,
        "failure_kinds": FAILURE_KINDS,
        "quorum": (QUORUM_MIN_REGIONS, QUORUM_WINDOW_SECONDS),
        "regions": ALLOWED_REGIONS,
        "methods": [method.value for method in HttpMethod],
        "defaults": (DEFAULT_EXPECTED_STATUS_CODES, DEFAULT_REGIONS, DEFAULT_TIMEOUT_SECONDS),
        "plans": {
            "display": PLAN_DISPLAY_NAMES,
            "price": PLAN_PRICES_USD,
            "deps": PLAN_DEPENDENCY_LIMITS,
            "team": PLAN_TEAM_LIMITS,
            "interval": PLAN_CHECK_INTERVALS,
            "retention": PLAN_RETENTION_DAYS,
            "features": PLAN_FEATURES,
        },
        "infer_scope": _infer_scope,
        "has_scope": _has_scope,
    }


@pytest.fixture(scope="module")
def route_table(backend) -> dict[str, set[str]]:
    """Every path the real app serves, mapped to its methods."""
    spec = backend["app"].openapi()
    return {
        path: {method.upper() for method in operations if method.upper() in _HTTP_METHODS}
        for path, operations in spec["paths"].items()
    }


_HTTP_METHODS = {"GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"}


# ── 1. Every claimed operation really exists ────────────────────────────────


def test_every_claimed_path_exists_in_the_real_api(route_table):
    """The core anti-fabrication check.

    A registry entry naming a route the API does not serve would let an agent tell
    a user to call an endpoint that 404s — or worse, to describe a capability the
    product does not have.
    """
    missing = []
    for operation in ALL_OPERATIONS:
        methods = route_table.get(operation.path)
        if methods is None:
            missing.append(f"{operation.method} {operation.path} (no such path)")
        elif operation.method not in methods:
            missing.append(
                f"{operation.method} {operation.path} (path exists, serves {sorted(methods)})"
            )
    assert not missing, "Registry claims operations the API does not serve:\n" + "\n".join(missing)


def _route_security(backend, operation) -> list | None:
    """The OpenAPI security requirement the real route declares."""
    spec = backend["app"].openapi()
    methods = spec["paths"].get(operation.path, {})
    entry = methods.get(operation.method.lower())
    assert entry is not None, f"{operation.method} {operation.path} not in the schema"
    return entry.get("security")


def test_public_operations_really_need_no_credential(backend):
    """A 'public' claim must mean the route declares no security requirement.

    FastAPI emits a ``security`` entry only for routes that actually depend on
    HTTPBearer/APIKeyHeader, so this checks the real dependency graph rather than
    trusting the registry's own ``auth`` flag.
    """
    wrong = []
    for operation in PUBLIC_OPERATIONS:
        if _route_security(backend, operation) is not None:
            wrong.append(f"{operation.method} {operation.path}")
    assert not wrong, (
        "Registry claims these are credential-free but the API guards them:\n"
        + "\n".join(wrong)
    )


def test_authenticated_operations_really_require_a_credential(backend):
    """And nothing claimed as authenticated is served without one."""
    wrong = []
    for operation in AUTHENTICATED_OPERATIONS:
        if _route_security(backend, operation) is None:
            wrong.append(f"{operation.method} {operation.path}")
    assert not wrong, (
        "Registry claims these need an API key but the route declares no security "
        "requirement:\n" + "\n".join(wrong)
    )


def test_authenticated_scopes_match_the_backend_inference(backend):
    """Every authenticated path must map to the scope the registry names.

    ``_infer_scope`` is deny-by-default: a path it does not map is unreachable with
    an API key at all, so a registry entry for one would advertise a dead end.
    """
    from app.api.deps import _infer_scope

    for operation in AUTHENTICATED_OPERATIONS:
        scope = _scope_for(_infer_scope, operation)
        assert scope is not None, (
            f"{operation.path} is claimed reachable with an API key, but "
            "_infer_scope returns None for it, which is a hard deny."
        )
        if operation.scope:
            assert scope == operation.scope, (
                f"{operation.method} {operation.path}: registry says "
                f"{operation.scope!r}, backend infers {scope!r}"
            )


def _scope_for(infer_scope, operation) -> str | None:
    """Run the backend's own scope inference against a synthetic request."""
    from starlette.datastructures import Headers
    from starlette.requests import Request

    scope = {
        "type": "http",
        "method": operation.method,
        "path": _concrete_path(operation.path),
        "headers": Headers({}).raw,
        "query_string": b"",
    }
    return infer_scope(Request(scope))


def _concrete_path(template: str) -> str:
    """Replace {placeholders} with a plausible concrete segment."""
    return re.sub(r"\{[^}]+\}", "00000000-0000-0000-0000-000000000000", template)


def test_mutation_operations_are_writes(backend):
    """Anything named a mutation must be a non-GET on a real write route."""
    for operation in ALL_OPERATIONS:
        if operation.name in MUTATION_OPERATIONS:
            assert operation.method in {"POST", "PATCH", "PUT", "DELETE"}, operation.name
            assert operation.auth is True
            assert operation.scope and operation.scope.startswith("write:"), operation.name


def test_no_unmounted_b2b_surface_is_claimed(route_table):
    """Unmounted routers must not appear as capabilities.

    app/bootstrap/routers.py deliberately leaves agencies, partners, badges,
    vendor_submissions, growth, status_page, public_analytics and outreach_admin
    unmounted. A registry entry pointing at one would advertise a surface that is
    not served.
    """
    from app.bootstrap.routers import unmounted_routers

    unmounted = {entry.name for entry in unmounted_routers()}
    forbidden_prefixes = {
        "/v1/agencies", "/v1/partners", "/v1/badges", "/v1/vendor-submissions",
        "/v1/growth", "/v1/status", "/v1/public/analytics", "/v1/outreach",
    }
    assert unmounted, "expected some routers to be unmounted; has the mount table changed?"
    for operation in ALL_OPERATIONS:
        for prefix in forbidden_prefixes:
            assert not operation.path.startswith(prefix), (
                f"{operation.path} belongs to an unmounted B2B surface"
            )


# ── 2. Methodology literals ─────────────────────────────────────────────────


def test_attribution_weights_and_version_match_the_engine(backend):
    engine = backend["attribution"]
    assert METHODOLOGY["attribution"]["methodology_version"] == engine.METHODOLOGY_VERSION
    assert METHODOLOGY["attribution"]["signal_weights"] == engine.WEIGHTS
    assert set(METHODOLOGY["attribution"]["signal_weights"]) == set(engine.WEIGHTS)
    assert METHODOLOGY["attribution"]["corroboration_signals"] == list(
        engine.CORROBORATION_SIGNALS
    )


def test_attribution_thresholds_match_the_engine_source(backend):
    """Thresholds are inline in compute_attribution, so read the source text."""
    from app.modules import attribution

    source = (Path(attribution.__file__).parent / "service.py").read_text()
    for classification, threshold in METHODOLOGY["attribution"][
        "classification_thresholds"
    ].items():
        assert f"confidence >= {threshold}" in source, classification
        assert f'"{classification}"' in source, classification


def test_classification_list_is_exactly_the_engine_output(backend):
    from app.modules import attribution

    source = (Path(attribution.__file__).parent / "service.py").read_text()
    for classification in METHODOLOGY["attribution"]["classifications"]:
        assert f'classification = "{classification}"' in source, classification


def test_max_score_without_corroboration_is_arithmetic(backend):
    """55.0 is not a magic number: it is the sum of the non-corroboration weights."""
    engine = backend["attribution"]
    corroboration = set(engine.CORROBORATION_SIGNALS)
    reachable = sum(
        weight for name, weight in engine.WEIGHTS.items() if name not in corroboration
    )
    assert METHODOLOGY["attribution"]["max_score_without_corroboration"] == round(
        reachable * 100, 1
    )


def test_detection_rules_and_topology_match_config(backend):
    settings = backend["settings"]
    rule = backend["detection_rule"]
    detection = METHODOLOGY["detection"]
    assert detection["failure_rule_id"] == rule.SINGLE_CONSECUTIVE_FAILURES.value
    assert detection["recovery_rule_id"] == rule.SINGLE_CONSECUTIVE_SUCCESSES.value
    assert detection["consecutive_failures_to_open"] == settings.SINGLE_TOPOLOGY_FAILURE_CHECKS
    assert METHODOLOGY["observation_topology"] == settings.OBSERVATION_TOPOLOGY
    assert METHODOLOGY["deployed_observation_region"] == settings.CHECK_WORKER_REGION
    assert METHODOLOGY["observation_points"] == (
        1 if settings.OBSERVATION_TOPOLOGY == "single" else None
    ), "observation_points must follow OBSERVATION_TOPOLOGY, not be asserted independently"


def test_quorum_rules_are_reported_as_undeployed(backend):
    min_regions, window = backend["quorum"]
    rule = backend["detection_rule"]
    quorum = METHODOLOGY["detection"]["quorum_rules_defined_but_unused"]
    assert quorum["ids"] == [
        rule.MULTI_OBSERVATION_QUORUM.value,
        rule.MULTI_RECOVERY_QUORUM.value,
    ]
    assert quorum["min_regions"] == min_regions
    assert quorum["window_seconds"] == window
    assert METHODOLOGY["detection"]["quorum_rules_deployed"] is (
        METHODOLOGY["observation_topology"] == "multi"
    )


def test_cadence_numbers_are_the_three_distinct_values(backend):
    settings = backend["settings"]
    plans = backend["plans"]
    cadence = METHODOLOGY["cadence"]
    assert cadence["scheduler_interval_s"] == settings.CHECK_SCHEDULE_SECONDS
    assert cadence["plan_minimum_interval_s"] == {
        plan: plans["interval"][plan] for plan in ("free", "pro", "enterprise")
    }
    from app.modules.dependencies.schemas import DependencyCreateRequest

    field = DependencyCreateRequest.model_fields["check_interval_seconds"]
    schema = DependencyCreateRequest.model_json_schema()["properties"][
        "check_interval_seconds"
    ]
    assert cadence["per_dependency_default_interval_s"] == field.default
    assert cadence["per_dependency_configurable_range_s"] == [
        schema["minimum"],
        schema["maximum"],
    ]


def test_evidence_scheme_matches_generation_module(backend):
    evidence = METHODOLOGY["evidence"]
    assert evidence["schema_version"] == backend["evidence_schema"]
    assert evidence["payload_hash"] == "SHA-256"
    assert evidence["signature_algorithm"] == "Ed25519"
    settings = backend["settings"]
    assert evidence["report_download_token_ttl_days"] == settings.REPORT_TOKEN_TTL_DAYS
    assert evidence["public_incident_window_days"] == settings.PUBLIC_INCIDENT_WINDOW_DAYS


def test_region_labels_match_the_allowed_set(backend):
    assert set(METHODOLOGY["allowed_region_labels"]) == set(backend["regions"])


# ── 3. Plan and pricing literals ────────────────────────────────────────────


def test_static_pricing_matches_entitlements(backend):
    plans = backend["plans"]
    pro = STATIC_PRICING["plans"]["pro"]
    assert pro["display_name"] == plans["display"]["pro"]
    assert pro["price_usd_per_month"] == plans["price"]["pro"]
    assert pro["dependency_limit"] == plans["deps"]["pro"]
    assert pro["team_member_limit"] == plans["team"]["pro"]
    assert pro["min_check_interval_s"] == plans["interval"]["pro"]
    assert pro["retention_days"] == plans["retention"]["pro"]
    from app.platform.commercial.entitlements import PLAN_ANNUAL_PRICES_USD

    assert pro["annual_billing"] is None
    assert PLAN_ANNUAL_PRICES_USD["pro"] is None, "the product has no annual billing"
    assert pro["features"] == plans["features"]["pro"]

    free = STATIC_PRICING["plans"]["free"]
    assert free["price_usd_per_month"] == plans["price"]["free"]
    assert free["dependency_limit"] == plans["deps"]["free"]
    assert free["retention_days"] == plans["retention"]["free"]
    assert free["features"]["api_access"] == plans["features"]["free"]["api_access"]


def test_api_access_is_a_paid_entitlement_and_the_registry_says_so(backend):
    """The single most consequential auth fact for an agent using this server."""
    features = backend["plans"]["features"]
    assert features["free"]["api_access"] is False
    assert features["pro"]["api_access"] is True
    assert CREDENTIALS["plan_entitlement"], "registry must state the plan requirement"
    assert "paid" in CREDENTIALS["plan_entitlement"].lower()
    assert any("paid plan" in limitation for limitation in LIMITATIONS)


# ── 4. Integration claims ───────────────────────────────────────────────────


def test_cli_commands_are_quoted_from_help_go():
    """No invented flags: every command string must appear in the CLI's help source."""
    assert CLI_HELP.exists(), f"CLI help source moved? expected {CLI_HELP}"
    source = CLI_HELP.read_text()
    usages = set(re.findall(r'usage:\s+"([^"]+)"', source))
    assert usages, "could not extract usage strings; has help.go's shape changed?"
    for command in INTEGRATIONS["cli"]["verified_commands"]:
        # The registry prefixes each entry with "reliastra "; help.go stores the
        # usage from "reliastra " onward. Compare on that exact string.
        assert command in usages, f"CLI command not found in help.go: {command}"


def test_cli_environment_variables_are_documented_in_help_go():
    source = CLI_HELP.read_text()
    for name in INTEGRATIONS["cli"]["environment"]:
        assert name in source, f"environment variable not in help.go: {name}"


def test_cli_exit_codes_match_help_go():
    source = CLI_HELP.read_text()
    for code, text in INTEGRATIONS["cli"]["exit_codes"].items():
        assert f'{{"{code}", "{text}"}}' in source, f"exit code {code} text drifted"


def test_github_action_interface_is_transcribed_from_its_published_action_yml():
    """Pin the action's real interface.

    Transcribed from action.yml at tag v1 of ReliaAstra/reliastra-action on
    2026-10-13. This repository cannot verify it from source, so the registry
    carries the provenance and this test carries the transcription: if either
    drifts, the plan tool starts inventing inputs.
    """
    action = INTEGRATIONS["github_action"]
    assert action["exists"] is True
    assert action["repository"] == "https://github.com/ReliaAstra/reliastra-action"
    assert action["ref"] == "v1"
    assert action["published_tags"] == ("v1", "v1.0.0")
    assert action["runs"] == {"using": "node20", "main": "dist/index.js"}
    # `uses:` must be owner/repo@ref and must agree with the repository URL and ref.
    owner_repo = "/".join(action["repository"].rstrip("/").split("/")[-2:])
    assert action["uses"] == f"{owner_repo}@{action['ref']}"
    assert action["example"].startswith(f"- uses: {action['uses']}\n")
    assert "action.yml" in action["verified_against"]
    assert "fetched" in action["verified_against"]

    # Exactly the inputs action.yml declares - no more, no fewer.
    assert set(action["inputs"]) == {
        "dependency", "token", "fail-on", "base-url", "wait-seconds",
        "timeout-seconds", "retries", "history-limit", "latency-threshold-ms",
        "incident-status", "result-format", "output-file", "annotate",
    }
    # `dependency` is the only required input.
    assert [k for k, v in action["inputs"].items() if v["required"]] == ["dependency"]
    # Defaults, verbatim from action.yml. An empty default means "no default",
    # which for latency-threshold-ms disables `degraded` unless the dependency
    # carries alert_threshold_ms. That distinction must survive transcription.
    defaults = {k: v["default"] for k, v in action["inputs"].items()}
    assert defaults["fail-on"] == "down"
    assert defaults["base-url"] == "https://reliastra.com/api"
    assert defaults["wait-seconds"] == "0"
    assert defaults["timeout-seconds"] == "30"
    assert defaults["retries"] == "2"
    assert defaults["history-limit"] == "40"
    assert defaults["incident-status"] == "all"
    assert defaults["result-format"] == "text"
    assert defaults["annotate"] == "true"
    assert defaults["token"] is None
    assert defaults["latency-threshold-ms"] is None
    assert defaults["output-file"] is None

    assert action["fail_on_values"] == (
        "up", "degraded", "down", "blocked", "unverified", "pipeline-error", "stale",
    )
    assert len(action["outputs"]) == 24
    for name in ("verdict", "exit-code", "evidence-hash", "attribution-status",
                 "observation-point", "observation-points", "pipeline-state",
                 "methodology-version"):
        assert name in action["outputs"], name
    assert action["exit_codes"] == {
        "0": "Success.", "1": "Usage error.", "2": "The API returned an error.",
        "3": "Authentication required, rejected, or expired.",
        "4": "A verification claim did not hold.",
        "5": "Authenticated, but not permitted to do this.",
        "6": "Network: the API could not be reached.", "130": "Cancelled.",
    }
    assert action["modes"] == ("authenticated", "public")
    # The registry must not claim non-existence anywhere.
    assert not any("no Reliastra GitHub Action" in lim for lim in LIMITATIONS)


def test_action_inputs_used_by_this_readme_exist_in_the_registry():
    """Catch registry/README drift offline.

    The root README shows a workflow snippet. Every input it passes must be a real
    declared input, so the two documents cannot disagree without a test failing.
    """
    readme = (REPO_ROOT / "README.md").read_text()
    block = readme[readme.index("uses: ReliaAstra/reliastra-action"):]
    block = block[: block.index("```")]
    declared = set(INTEGRATIONS["github_action"]["inputs"])
    used = re.findall(r"^\s{4}([a-z][a-z0-9-]*):", block, re.MULTILINE)
    assert used, "the README snippet no longer passes any input"
    for name in used:
        assert name in declared, f"README passes an input the action does not declare: {name}"
    assert "ReliaAstra/reliastra-action@v1" in readme


def test_this_repository_does_not_define_or_consume_the_action():
    """A true fact that must NOT be read as "the action does not exist".

    The action is a separate repository, so no grep of this repo can find its
    definition - that is exactly the reasoning error that once produced a false
    negative capability claim. This test pins the narrow fact (this repo's own CI
    does not use it) and the registry's provenance note is what makes the wider
    claim verifiable.
    """
    workflows = REPO_ROOT / ".github" / "workflows"
    for path in workflows.glob("*.yml"):
        text = path.read_text().lower()
        assert "uses: reliastra/reliastra-action" not in text, path.name
        assert "uses: reliaastra/reliastra-action" not in text, path.name
    assert not (REPO_ROOT / "action.yml").exists()
    # The registry says where the interface came from, not that it is absent.
    assert "separate repository" in INTEGRATIONS["github_action"]["notes"] or (
        any("separate repository" in lim for lim in LIMITATIONS)
    )


def test_api_key_header_forms_match_deps_source(backend):
    """Each header form the registry advertises must be one get_current_user accepts."""
    from app.api import deps

    source = Path(deps.__file__).read_text()
    assert 'APIKeyHeader(name="X-API-Key"' in source
    accepted = INTEGRATIONS["rest_api"]["auth_headers_accepted"]
    assert any(header.startswith("X-API-Key:") for header in accepted)
    assert any(header.startswith("Authorization: Bearer rel_") for header in accepted)
    assert any(header.startswith("Authorization: ApiKey rel_") for header in accepted)
    assert any(header.startswith("Authorization: rel_") for header in accepted)
    for header in accepted:
        marker = header.split(":", 1)[0].strip()
        assert marker.lower() in {"x-api-key", "authorization"}
    # The bare and ApiKey-scheme forms are both accepted by get_current_user.
    assert 'auth_header.lower().startswith("rel_")' in source
    assert 'auth_header.lower().startswith("apikey ")' in source


def test_rate_limits_match_the_limiter_definitions(backend):
    from app.platform.web import rate_limit

    source = Path(rate_limit.__file__).read_text()
    limits = CREDENTIALS["rate_limits"]
    assert 'limit=1000, window_seconds=60, key_prefix="rl_apikey"' in source
    assert limits["api_key"].startswith("1000 requests/min")
    assert 'limit=300, window_seconds=60, key_prefix="rl_vendor"' in source
    assert limits["public_reads"].startswith("300 requests/min")
    assert 'key_prefix="rl_reader"' in source


def test_scope_semantics_match_the_backend(backend):
    """write implies read; '*' grants everything; unknown is denied."""
    has_scope = backend["has_scope"]
    assert has_scope(["write:dependencies"], "read:dependencies") is True
    assert has_scope(["read:dependencies"], "write:dependencies") is False
    assert has_scope(["*"], "write:checks") is True
    assert has_scope([], "read:evidence") is False
    assert "A write grant implies read" in CREDENTIALS["scopes_model"]
    for scope in CREDENTIALS["known_scopes"]:
        action, _, resource = scope.partition(":")
        assert action in {"read", "write"} and resource


def test_openapi_schema_is_really_not_published(backend):
    """The registry claims the schema is withheld; verify both layers."""
    assert INTEGRATIONS["rest_api"]["openapi_schema"].startswith("Not published")
    from app.config import Settings

    # Layer 1: the flag defaults off, so no route is registered at all.
    assert Settings.model_fields["EXPOSE_API_SCHEMA"].default is False
    # Layer 2: the proxy refuses the paths even if layer 1 is misconfigured.
    caddy = (REPO_ROOT / "deploy" / "production" / "Caddyfile").read_text()
    assert "handle /openapi.json*" in caddy
    assert "abort" in caddy


# ── 5. Registry self-consistency ────────────────────────────────────────────


def test_operation_names_are_unique():
    names = [operation.name for operation in ALL_OPERATIONS]
    assert len(names) == len(set(names)), "duplicate operation names"


def test_every_mcp_tool_name_in_the_registry_is_registered(built_tools):
    """A registry entry pointing at a tool that does not exist is a broken promise."""
    claimed = {
        operation.mcp_tool for operation in ALL_OPERATIONS if operation.mcp_tool
    }
    assert claimed <= built_tools, f"registry names tools the server does not register: {claimed - built_tools}"


def test_every_registered_read_tool_is_backed_by_the_registry(built_tools):
    """And the reverse: no tool should exist that the registry cannot account for.

    The two local analysis tools are the only exceptions, because they are
    computation over caller-supplied input rather than an API operation.
    """
    backed = {operation.mcp_tool for operation in ALL_OPERATIONS if operation.mcp_tool}
    local_only = {
        "reliastra_analyze_dependencies",
        "reliastra_plan_integration",
        "reliastra_get_capabilities",
    }
    unaccounted = built_tools - backed - local_only
    assert not unaccounted, f"tools with no registry entry: {unaccounted}"


def test_scopes_for_tool_is_derived_not_restatement(backend):
    assert scopes_for_tool("reliastra_register_dependency") == ("write:dependencies",)
    assert scopes_for_tool("reliastra_trigger_check") == ("write:checks",)
    assert "read:dependencies" in scopes_for_tool("reliastra_list_dependencies")
    assert scopes_for_tool("reliastra_get_capabilities") == ()


@pytest.fixture
def built_tools() -> set[str]:
    from mcp_server.config import load_config
    from mcp_server.server import create_server

    config = load_config(reliastra_api_url="https://api.test.local", log_json=False)
    _server, deps = create_server(config)
    return set(deps.registered_tools)


# ── 6. Permission-aware output ──────────────────────────────────────────────


def test_unauthenticated_view_hides_workspace_operations():
    document = build_capabilities(authenticated=False, allow_mutations=True)
    paths = {operation["path"] for operation in document["operations"]}
    assert "/v1/dependencies" not in paths
    assert "/v1/incidents" not in paths
    assert "/v1/vendors" in paths
    assert document["mutations_available"] is False
    assert document["credentials"]["note"].startswith("No credential was supplied")


def test_authenticated_view_adds_workspace_and_mutations():
    document = build_capabilities(authenticated=True, allow_mutations=True)
    paths = {operation["path"] for operation in document["operations"]}
    assert "/v1/dependencies" in paths
    assert "/v1/evidence" in paths
    assert document["mutations_available"] is True
    write_paths = {
        operation["path"]
        for operation in document["operations"]
        if operation.get("required_scope", "").startswith("write:")
    }
    assert write_paths == {"/v1/dependencies", "/v1/checks/run", "/v1/incidents/{inc_id}/correlate"}


def test_read_only_deployment_does_not_list_mutations_at_all():
    """A server that cannot write must not advertise that it can."""
    document = build_capabilities(authenticated=True, allow_mutations=False)
    write_operations = [
        operation
        for operation in document["operations"]
        if operation.get("required_scope", "").startswith("write:")
    ]
    assert write_operations == []
    assert document["mutations_available"] is False


def test_document_is_json_serialisable():
    import json

    document = build_capabilities(
        authenticated=True, allow_mutations=True, registered_tools=("reliastra_get_capabilities",)
    )
    encoded = json.dumps(document, default=str)
    assert len(encoded) > 1000
    assert "reliastra_get_capabilities" in encoded


def test_limitations_state_the_things_that_do_not_exist():
    joined = " ".join(LIMITATIONS).lower()
    assert "unknown" in joined
    assert "one observation point" in joined
    assert "paid plan" in joined
    # The action EXISTS. What is limited is where its interface can be verified
    # from, and the limitation must say that instead of denying the action.
    assert "separate repository" in joined
    assert "reliastra-action" in joined
    assert "no reliastra github action" not in joined


def test_failure_kind_values_in_the_registry_are_the_backends(backend):
    """The incident tool exposes these as Literal types; check the source set."""
    from mcp_server.tools.incidents import FailureKind

    allowed = set(get_args_literals(FailureKind))
    assert allowed == set(backend["failure_kinds"])


def test_dependency_methods_in_the_registry_are_the_backends(backend):
    from mcp_server.tools.mutations import HttpMethod

    assert set(get_args_literals(HttpMethod)) == set(backend["methods"])


def test_region_literals_are_the_backends(backend):
    from mcp_server.tools.mutations import Region

    assert set(get_args_literals(Region)) == set(backend["regions"])


def get_args_literals(literal_type) -> tuple:
    from typing import get_args

    return get_args(literal_type)


# ── 7. Documented configuration must be real ────────────────────────────────
#
# The same anti-fabrication rule applies to configuration: an operator following
# backend/.env.example must not set a variable that does nothing, and must not be
# left without one that does. A documented default that differs from the code is
# as much a lie as a documented endpoint that does not exist.

ENV_EXAMPLE = REPO_ROOT / "backend" / ".env.example"
MAIN_MODULE = REPO_ROOT / "backend" / "mcp_server" / "__main__.py"


def _mcp_section() -> str:
    """The MCP block of ``backend/.env.example``, from its header to EOF."""
    text = ENV_EXAMPLE.read_text(encoding="utf-8")
    start = text.index("# ── MCP SERVER ")
    return text[start:]


def _documented_assignments() -> dict[str, str]:
    """Uncommented ``NAME=value`` lines in the MCP section."""
    found: dict[str, str] = {}
    for line in _mcp_section().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        name, _, value = stripped.partition("=")
        found[name.strip()] = value.strip()
    return found


def _field_for(env_name: str) -> str | None:
    """The config field an environment name addresses, if any."""
    candidate = env_name.lower()
    fields = McpServerConfig.model_fields
    if candidate in fields:
        return candidate
    if candidate.startswith("mcp_") and candidate[len("mcp_"):] in fields:
        return candidate[len("mcp_"):]
    return None


def _expected_env_name(field: str) -> str:
    """The spelling .env.example documents: always the unambiguous prefixed one."""
    return field.upper() if field.startswith("mcp_") else f"MCP_{field.upper()}"


def _rendered_default(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else str(value)
    return "" if value is None else str(value)


def test_every_documented_mcp_variable_maps_to_a_real_setting():
    assignments = _documented_assignments()
    assert len(assignments) >= 30, "the MCP section looks truncated"
    unknown = {name for name in assignments if _field_for(name) is None}
    assert not unknown, (
        f"backend/.env.example documents variables McpServerConfig does not read: "
        f"{sorted(unknown)}. An operator setting one of these changes nothing."
    )


def test_every_setting_is_documented():
    section = _mcp_section()
    missing = [
        field
        for field in McpServerConfig.model_fields
        if _expected_env_name(field) not in section and field.upper() not in section
    ]
    assert not missing, (
        f"McpServerConfig reads settings backend/.env.example never mentions: "
        f"{sorted(missing)}"
    )


def test_documented_defaults_match_the_code():
    defaults = McpServerConfig.model_fields
    mismatched: list[str] = []
    for name, documented in _documented_assignments().items():
        field = _field_for(name)
        assert field is not None, name
        real = defaults[field].default
        if documented == "":
            # Documented as deliberately unset: it must genuinely have no
            # meaningful default rather than hiding one.
            if real not in (None, "", False, 0):
                mismatched.append(f"{name}=(blank) but the default is {real!r}")
        elif documented != _rendered_default(real):
            mismatched.append(f"{name}={documented} but the default is {real!r}")
    assert not mismatched, "\n".join(mismatched)


def test_transport_is_a_command_line_flag_not_an_environment_variable():
    """No MCP_TRANSPORT variable exists; documenting one would be a fabrication."""
    assert "MCP_TRANSPORT" not in _documented_assignments()
    assert "MCP_TRANSPORT" not in _mcp_section() or "no MCP_TRANSPORT" in _mcp_section()
    source = MAIN_MODULE.read_text(encoding="utf-8")
    assert '"--transport"' in source
    assert "stdio" in source and "streamable-http" in source
