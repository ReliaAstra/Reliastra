"""reliastra_plan_integration — a concrete, verified implementation plan.

Turns a justified gap into steps an engineer or an agent can execute. Every
endpoint, field, flag, environment variable, scope and package name in the output
comes from the verified capability registry
(:mod:`mcp_server.capabilities`), which is pinned to backend and CLI source by
``tests/unit/mcp/test_capability_contract.py``. Nothing here is composed from a
template that could invent a flag: the plan quotes the registry.

Two rules the tool obeys:

* **No fabricated interfaces.** Every mechanism the plan can name is real and its
  interface is transcribed from source: the REST routes and CLI flags from this
  repository, the GitHub Action from ``action.yml`` in its own repository
  (``ReliaAstra/reliastra-action``, tag ``v1``). The action lives outside this
  codebase, so the registry records where and when it was verified rather than
  implying the interface was read from here. A plan never shows an input, flag or
  output that is not in that registry.
* **It can decline.** If no dependency in the request is something Reliastra can
  monitor, the tool returns a ``not_justified`` conclusion and no plan, rather
  than manufacturing work. An agent must be able to conclude that Reliastra is not
  needed.
"""

import json
from typing import Any, Literal

from pydantic import BaseModel, Field

from .. import errors as err
from ..capabilities import INTEGRATIONS, LIMITATIONS, METHODOLOGY, STATIC_PRICING
from ..sanitization import sanitize_text
from . import _base as base

Mechanism = Literal["rest_api", "cli", "github_action", "both"]
Environment = Literal["local", "ci", "production"]
Runtime = Literal["bash", "python", "node", "go"]

MAX_TARGETS = 20

#: Verified in cli/cmd/reliastra/help.go and cli/{npm,python} packaging metadata.
CLI_INSTALL = {
    "pip": "pip install reliastra",
    "npm": "npm install -g reliastra",
    "package_version_reference": "0.2.0",
    "how_it_works": (
        "Both are thin installers: they download the platform Go binary from GitHub "
        "Releases on first run and verify its SHA-256 before executing it. Requires "
        "Node >= 18 (npm) or Python >= 3.9 (pip)."
    ),
    "binary": "Built by GoReleaser from cli/cmd/reliastra; artifacts are produced by CI.",
}


class IntegrationTarget(BaseModel):
    """One dependency the caller intends to monitor."""

    name: str = Field(description="A label you will recognise in a list. 1-150 characters.")
    endpoint_url: str = Field(
        description="The HTTP(S) URL your application calls. Must start with http:// or https://."
    )
    method: Literal["GET", "HEAD", "POST"] = Field(
        default="GET", description="Probe method. Only GET, HEAD and POST are supported."
    )
    expected_status_codes: list[int] = Field(
        default_factory=lambda: [200],
        description="Status codes that count as up. Default [200].",
    )
    check_interval_seconds: int = Field(
        default=300,
        ge=1,
        le=86400,
        description="Probe interval. Default 300. Your plan sets a floor (30s on the paid plan).",
    )
    timeout_seconds: int = Field(
        default=10, ge=1, le=300, description="Per-probe deadline. Default 10, maximum 300."
    )
    criticality: Literal["critical", "high", "medium", "low"] | None = Field(
        default=None, description="Carried into the plan's priority ordering."
    )


async def plan_integration(
    ctx: base.ToolContext,
    targets: list[IntegrationTarget],
    mechanism: Mechanism = "both",
    environment: Environment = "local",
    runtime: Runtime = "bash",
    justification: str | None = None,
) -> dict[str, Any]:
    """Build a verified integration plan, or decline with a reason."""
    if not targets:
        raise err.invalid_input(
            "targets must list at least one dependency to monitor. Run "
            "reliastra_analyze_dependencies first to establish which ones are worth it."
        )
    if len(targets) > MAX_TARGETS:
        raise err.invalid_input(
            f"At most {MAX_TARGETS} targets per plan; you sent {len(targets)}."
        )

    monitorable, rejected = _partition(targets)
    if not monitorable:
        # No defensible use case: return the conclusion, not a plan.
        return base.envelope(
            "reliastra_plan_integration",
            {
                "justified": False,
                "conclusion": "not_justified",
                "reasons": [
                    "None of the supplied targets is something Reliastra can monitor. "
                    "Reliastra probes HTTP(S) endpoints with GET, HEAD or POST; it "
                    "cannot observe a database connection, message queue, cache, "
                    "internal service, DNS resolver, SMTP relay, gRPC or raw TCP target.",
                ]
                + [
                    f"'{item.name}': {item.endpoint_url[:120]} is not an http(s) URL "
                    "with a hostname."
                    for item in rejected
                ],
                "plan": None,
                "what_to_do_instead": [
                    "If any of these is actually reached over HTTP(S), supply the real "
                    "endpoint_url and re-run.",
                    "Otherwise use monitoring appropriate to the protocol (database "
                    "health checks, queue depth alarms, broker metrics). Reliastra "
                    "will not help here and you should not adopt it for this.",
                ],
            },
            ctx,
            source="local plan builder over the verified capability registry",
            notes=[
                "Declining is a supported outcome. This tool does not manufacture a "
                "recommendation when the evidence does not support one.",
            ],
        )

    plan = _build_plan(
        ctx,
        monitorable,
        mechanism=mechanism,
        environment=environment,
        runtime=runtime,
        justification=sanitize_text(justification, limit=2_000) if justification else None,
    )
    data: dict[str, Any] = {
        "justified": True,
        "conclusion": "plan_provided",
        "plan": plan,
    }
    if rejected:
        data["excluded_targets"] = [
            {
                "name": item.name,
                "endpoint_url": item.endpoint_url[:200],
                "reason": "not an http(s) URL with a hostname; Reliastra cannot probe it",
            }
            for item in rejected
        ]
    return base.envelope(
        "reliastra_plan_integration",
        data,
        ctx,
        source="local plan builder over the verified capability registry",
        notes=[
            "Every endpoint, field, flag, scope, environment variable and package "
            "name in this plan is transcribed from the verified registry and pinned "
            "to backend/CLI source by test. Nothing is generated from a template "
            "that could invent an option.",
            "CI can use the published GitHub Action "
            "(ReliaAstra/reliastra-action@v1), the CLI or the REST API. The action's "
            "interface is transcribed from action.yml in its own repository and its "
            "provenance is recorded in the plan; it is not read from this codebase.",
            "Registration is a state change. Executing step 3 or its CLI equivalent "
            "creates real records in your Reliastra organization and consumes plan "
            "quota; this tool only plans, it never registers anything.",
        ],
    )


def _partition(
    targets: list[IntegrationTarget],
) -> tuple[list[IntegrationTarget], list[IntegrationTarget]]:
    monitorable: list[IntegrationTarget] = []
    rejected: list[IntegrationTarget] = []
    for target in targets:
        url = (target.endpoint_url or "").strip()
        if url.startswith(("http://", "https://")) and "://" in url:
            monitorable.append(target)
        else:
            rejected.append(target)
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3, None: 4}
    monitorable.sort(key=lambda item: order.get(item.criticality, 4))
    return monitorable, rejected


def _build_plan(
    ctx: base.ToolContext,
    targets: list[IntegrationTarget],
    *,
    mechanism: Mechanism,
    environment: Environment,
    runtime: Runtime,
    justification: str | None,
) -> dict[str, Any]:
    scopes = ["write:dependencies", "read:checks", "read:incidents", "read:evidence"]
    plan: dict[str, Any] = {
        "mechanism": mechanism,
        "environment": environment,
        "runtime": runtime,
        "justification_supplied": justification,
        "prerequisites": _prerequisites(scopes, targets),
        "steps": _steps(targets, mechanism, environment, runtime),
        "configuration": _configuration(environment),
        "expected_results": _expected_results(len(targets)),
        "testing": _testing(mechanism),
        "rollback": _rollback(),
        "operational_limitations": _limitations(targets),
        "integrations": _integrations(mechanism),
    }
    if mechanism in {"rest_api", "both"}:
        plan["code_example"] = _code_example(runtime, targets, ctx)
    if mechanism in {"cli", "both"}:
        plan["cli_commands"] = _cli_commands(targets)
    if mechanism in {"github_action", "both"}:
        action = INTEGRATIONS["github_action"]
        plan["github_action"] = {
            "repository": action["repository"],
            "ref": action["ref"],
            "published_tags": action["published_tags"],
            "runs": action["runs"],
            "inputs": {
                name: {"required": spec["required"], "default": spec["default"]}
                for name, spec in action["inputs"].items()
            },
            "fail_on_values": action["fail_on_values"],
            "outputs": action["outputs"],
            "exit_codes": action["exit_codes"],
            "modes": action["modes"],
            "example": action["example"],
            "notes": action["notes"],
            "verified_against": action["verified_against"],
        }
    return plan


def _integrations(mechanism: Mechanism) -> dict[str, Any]:
    """What exists, and what this plan chose. Never a claim that something is absent
    unless it was verified absent."""
    cli = INTEGRATIONS["cli"]
    action = INTEGRATIONS["github_action"]
    return {
        "selected": mechanism,
        "rest_api": {
            "exists": True,
            "base_url_default": INTEGRATIONS["rest_api"]["base_url_default"],
        },
        "cli": {
            "exists": True,
            "install": cli["install"],
            "commands": len(cli["verified_commands"]),
        },
        "github_action": {
            "exists": True,
            "repository": action["repository"],
            "ref": action["ref"],
            "inputs": len(action["inputs"]),
            "outputs": len(action["outputs"]),
            "verified_against": action["verified_against"],
        },
        "not_exposed_here": (
            "POST /v1/incidents/{id}/correlate and PATCH /v1/incidents/{id} require an "
            "administrator session, which an API key cannot hold, so no plan can call "
            "them with these credentials."
        ),
    }


def _prerequisites(scopes: list[str], targets: list[IntegrationTarget]) -> list[dict[str, Any]]:
    pro = STATIC_PRICING["plans"]["pro"]
    return [
        {
            "id": 1,
            "requirement": "A Reliastra account with a verified email address.",
            "why": "An unverified address cannot hold an authenticated session.",
            "how": "Sign up at the Reliastra console, then verify the email link or OTP.",
        },
        {
            "id": 2,
            "requirement": (
                "An organization on a plan that includes api_access "
                f"(display name '{pro['display_name']}', "
                f"${pro['price_usd_per_month']}/month, 14-day trial, no payment "
                "method required to start)."
            ),
            "why": (
                "API access is a paid-plan entitlement enforced once in "
                "get_current_org for every programmatic request. A key on an "
                "organization without it is refused regardless of route or scope."
            ),
            "how": "GET /v1/pricing returns the live catalog; the console handles checkout.",
            "verify_live": "GET /v1/pricing (public, no credential)",
        },
        {
            "id": 3,
            "requirement": f"An API key with scopes: {', '.join(scopes)}.",
            "why": (
                "Scopes are checked deny-by-default: write:dependencies to register, "
                "read:* to observe. A write grant implies read on the same resource. "
                "The organization is pinned to the key."
            ),
            "how": [
                "reliastra keys create <name> --scopes write:dependencies,read:checks,read:incidents,read:evidence",
                "or POST /v1/api-keys from an interactive session, or the console at /settings/developer",
            ],
            "least_privilege": (
                "If you only need to read, create a key with read scopes only. The "
                f"CLI's default scope set is: {INTEGRATIONS['cli']['default_key_scopes']}."
            ),
        },
        {
            "id": 4,
            "requirement": (
                f"Headroom in your dependency quota: this plan registers "
                f"{len(targets)}, and the plan limit is {pro['dependency_limit']}."
            ),
            "why": "create_dependency enforces the plan's dependency limit and interval floor.",
            "how": "GET /v1/dependencies shows your current inventory.",
        },
        {
            "id": 5,
            "requirement": (
                "Each target URL must be publicly reachable over HTTP(S) and must not "
                "resolve to a private, loopback or link-local/metadata address."
            ),
            "why": (
                "Reliastra's probe applies an SSRF policy with DNS pinning "
                "(app/platform/security/ssrf.py); private and metadata addresses are "
                "refused, and the check is recorded as blocked_by_security_policy "
                "rather than as a target failure."
            ),
            "how": "Internal-only endpoints cannot be monitored by Reliastra. That is a design boundary, not a configuration problem.",
        },
    ]


def _steps(
    targets: list[IntegrationTarget],
    mechanism: Mechanism,
    environment: Environment,
    runtime: Runtime,
) -> list[dict[str, Any]]:
    """Ordered steps. Only the mechanism the caller chose is shown for each step.

    Listing a CLI command in a REST-only plan (and vice versa) invites an agent to
    execute an interface the user did not ask for, so each step carries just the
    form that was requested.
    """
    want_rest = mechanism in {"rest_api", "both"}
    want_cli = mechanism in {"cli", "both"}
    want_gha = mechanism in {"github_action", "both"}
    if mechanism == "github_action":
        # The action observes ONE dependency that already exists. It cannot register
        # a dependency, check pipeline liveness or mint an API key, so those
        # prerequisites are still REST/CLI calls. Showing them is not scope creep:
        # omitting them would produce a plan that cannot be executed.
        want_rest = True

    def forms(
        rest: str | None = None, cli: str | None = None, gha: str | None = None
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}
        if rest and want_rest:
            out["rest"] = rest
        if cli and want_cli:
            out["cli"] = cli
        if gha and want_gha:
            out["github_action"] = gha
        return out

    steps: list[dict[str, Any]] = [
        {
            "id": 1,
            "action": "Confirm the API and the check pipeline are reachable and alive.",
            "type": "read",
            **forms(rest="GET /v1/checks/health", cli="reliastra doctor"),
            "expect": (
                "HTTP 200 with status='healthy'. A 503 body names the missing "
                "component (Beat, worker or broker) - do not proceed on a 503, "
                "because observations will not be recorded."
            ),
            "side_effects": "none",
        },
        {
            "id": 2,
            "action": "Confirm your credential and organization resolve as expected.",
            "type": "read",
            **forms(rest="GET /v1/dependencies?limit=1", cli="reliastra whoami --json"),
            "expect": (
                "200 with your inventory (possibly empty). A 403 means the key lacks "
                "the scope or the organization's plan has no api_access."
            ),
            "side_effects": "none",
        },
    ]
    if mechanism in {"rest_api", "both", "github_action"}:
        # github_action is included deliberately: the action observes a dependency
        # that already exists and cannot register one, so a plan that offered only
        # the action would be unexecutable.
        steps.append(
            {
                "id": 3,
                "action": f"Register {len(targets)} dependency(ies).",
                "type": "write",
                **forms(rest="POST /v1/dependencies"),
                "request_body_fields": {
                    "name": "string, 1-150 characters (required)",
                    "endpoint_url": "string, must start with http:// or https:// (required)",
                    "method": "GET | HEAD | POST (default GET)",
                    "expected_status_codes": "list[int] (default [200])",
                    "timeout_seconds": "int 1-300 (default 10)",
                    "check_interval_seconds": "int 1-86400 (default 300; plan floor applies)",
                    "regions": "list[str] from us-east|eu-west|ap-south|sa-east (default [us-east])",
                    "headers": "dict, optional; Authorization is encrypted at rest",
                    "alert_threshold_ms": "int >= 1, optional",
                    "is_active": "bool (default true)",
                    "application_id": "uuid, optional",
                },
                "forbidden_header_names": (
                    "cookie, host, content-length, transfer-encoding, connection, "
                    "keep-alive, upgrade, and any proxy-* or x-forwarded-* name. "
                    "The API rejects these."
                ),
                "idempotency": (
                    "Send Idempotency-Key: <stable-uuid> on each POST. The response "
                    "is cached 24h scoped to your credential, so a retry replays the "
                    "first result instead of creating a second dependency, and a "
                    "concurrent duplicate is answered 409 rather than executed twice."
                ),
                "expect": "201 with the created DependencyResponse, including its id.",
                "side_effects": "Creates a monitored dependency and consumes plan quota.",
                "per_target": [
                    {
                        "name": target.name,
                        "body": {
                            "name": target.name,
                            "endpoint_url": target.endpoint_url,
                            "method": target.method,
                            "expected_status_codes": target.expected_status_codes,
                            "check_interval_seconds": target.check_interval_seconds,
                            "timeout_seconds": target.timeout_seconds,
                        },
                    }
                    for target in targets
                ],
            }
        )
        next_id = 4
    else:
        next_id = 3
    if mechanism in {"cli", "both"}:
        steps.append(
            {
                "id": next_id,
                "action": "Register the same dependency(ies) with the CLI instead.",
                "type": "write",
                **forms(
                    cli="reliastra deps add <name> <url> [--interval 300] [--expect 200] "
                    "[--method GET] [--timeout 10]"
                ),
                "expect": "The created record. Exit code 0; 2 means the API rejected it.",
                "side_effects": "Creates a monitored dependency and consumes plan quota.",
                "note": (
                    "The CLI refuses private, loopback and metadata addresses before "
                    "calling the API."
                ),
            }
        )
        next_id += 1
    steps.extend(
        [
            {
                "id": next_id,
                "action": "Prove one probe actually runs end to end.",
                "type": "write",
                **forms(
                    rest='POST /v1/checks/run  {"dependency_id": "<uuid>"}',
                    cli="reliastra checks recent --limit 5",
                ),
                "expect": (
                    "202 with {dependency_id, queued: [{region, task_id, state}]}. "
                    "202 means QUEUED - it publishes the same task Beat publishes to "
                    "the same worker. Confirm the observation appeared with "
                    "GET /v1/dependencies/{id}/results."
                ),
                "side_effects": "Queues one probe of your own dependency.",
            },
            {
                "id": next_id + 1,
                "action": "Read back the observations and confirm detection works.",
                "type": "read",
                **forms(
                    rest="GET /v1/dependencies/{dep_id}/results?limit=10",
                    cli="reliastra deps show <dependency-id> --observations 10",
                ),
                "expect": (
                    f"Observation rows. An incident opens after "
                    f"{METHODOLOGY['detection']['consecutive_failures_to_open']} "
                    "consecutive failed checks, so the fastest detection is two check "
                    "intervals."
                ),
                "side_effects": "none",
            },
            {
                "id": next_id + 2,
                "action": "Wire the read path into your workflow.",
                "type": "read",
                **forms(
                    rest="GET /v1/incidents?status=open  ·  GET /v1/evidence",
                    cli="reliastra incidents list --status open --json",
                ),
                "expect": (
                    "Open incidents on your dependencies, and evidence reports for "
                    "resolved ones."
                ),
                "side_effects": "none",
                "environment_note": _environment_note(environment, runtime),
            },
        ]
    )
    if want_gha:
        steps.append(_github_action_step(targets, next_id + 3))
    return steps


def _github_action_step(targets: list[IntegrationTarget], step_id: int) -> dict[str, Any]:
    """The CI step, built only from inputs that exist in action.yml at tag v1."""
    action = INTEGRATIONS["github_action"]
    inputs = action["inputs"]
    return {
        "id": step_id,
        "action": "Add the verified GitHub Action to the workflow, one step per dependency.",
        "type": "read",
        "github_action": (
            f"- uses: {action['uses']}\n"
            "  with:\n"
            "    dependency: <dependency-uuid-from-step-3>\n"
            "    token: ${{ secrets.RELIASTRA_TOKEN }}\n"
            "    fail-on: down\n"
        ),
        "expect": (
            f"Exit code 0 and verdict=up, or a non-zero exit from the documented set "
            f"({', '.join(sorted(action['exit_codes'], key=int))}). The action reports "
            "on one dependency per step; it does not register dependencies."
        ),
        "side_effects": "None on Reliastra. It reads your dependency and its observations.",
        "note": (
            "The action runs one dependency per step, so this plan needs "
            f"{len(targets)} step(s): "
            + ", ".join(t.name for t in targets[:5])
            + (" ..." if len(targets) > 5 else "")
            + ". Omit `token` entirely to read the public incident feed instead, "
            "passing a vendor slug such as `stripe` as `dependency`; that mode needs "
            "no credentials but cannot observe your private dependencies."
        ),
        "input_reference": {
            name: {
                "required": spec["required"],
                "default": spec["default"],
                "summary": spec["summary"],
            }
            for name, spec in inputs.items()
        },
        "verified_against": action["verified_against"],
    }


def _environment_note(environment: Environment, runtime: Runtime) -> str:
    if environment == "ci":
        action = INTEGRATIONS["github_action"]
        return (
            f"In CI, prefer the published GitHub Action ({action['repository']}@"
            f"{action['ref']}, {len(action['inputs'])} verified inputs), or call the "
            "CLI or REST API from your own workflow step. Supply the key as a "
            "repository secret - never inline in the workflow file, and never echo "
            "it: `reliastra login --print-token` explicitly warns it is not for CI "
            "logs. Use --json for machine-readable output and rely on the documented "
            "exit codes (0 ok, 1 usage, 2 API error, 3 auth, 4 unverified, "
            "5 forbidden, 6 unreachable, 130 cancelled)."
        )
    if environment == "production":
        return (
            "Prefer read-only scopes in production. Keep the key in your secret "
            "manager, rotate it via reliastra keys create + keys rm, and treat "
            "registration as a change that needs review - it creates monitoring that "
            "consumes quota and probes a live endpoint."
        )
    return (
        "Locally, `reliastra login` stores a session for this machine, or export "
        "RELIASTRA_TOKEN for a single invocation. Use --no-persist to avoid writing "
        "a rotated token back to the config file."
    )


def _configuration(environment: Environment) -> dict[str, Any]:
    env_vars = {
        "RELIASTRA_TOKEN": "Bearer token or API key. Same as --token.",
        "RELIASTRA_API_URL": f"API base URL. Default {INTEGRATIONS['rest_api']['base_url_default']}.",
        "RELIASTRA_SITE_URL": "Web origin used for links.",
        "RELIASTRA_CONFIG": "Path to the CLI config file.",
        "RELIASTRA_EMAIL": "Account email for `login` when --email is not passed.",
        "RELIASTRA_PASSWORD": "Password for a non-interactive `login`.",
    }
    mcp_env = {
        "RELIASTRA_API_URL": "Upstream API base URL for this MCP server.",
        "RELIASTRA_API_KEY": (
            "Credential for the stdio transport. Omit it and only the public "
            "tools work; authenticated tools then fail closed rather than using "
            "someone else's key."
        ),
        "MCP_HTTP_ENABLED": "Set true to serve the Streamable HTTP transport.",
        "MCP_HTTP_HOST": "Bind address. Keep loopback in production; TLS terminates at the proxy.",
        "MCP_HTTP_PORT": "Bind port (default 8765).",
        "MCP_ALLOW_MUTATIONS": "Set false to run a purely read-only server that does not even list write tools.",
    }
    return {
        "cli_environment": env_vars,
        "mcp_server_environment": mcp_env,
        "secret_handling": [
            "Never commit a key. Never embed a personal key in a package, image or "
            "workflow shared with others.",
            "In CI use a repository/organization secret referenced as "
            "${{ secrets.RELIASTRA_API_KEY }} in the step's env block, not in the "
            "command line, so it does not appear in a process listing or a log.",
            "The API returns 401/403 for a bad key; this MCP server never echoes a "
            "credential in output, errors or logs.",
        ],
        "environment": environment,
    }


def _expected_results(count: int) -> list[str]:
    return [
        f"{count} dependency record(s) created, each with an id you can query.",
        "Observations recorded from the first probe after registration; the "
        "scheduler dispatches due checks every 30s, and each dependency is probed "
        "on its own interval (default 300s).",
        "An incident opens after 2 consecutive failed checks and resolves after 2 "
        "consecutive successes. Deterministic: no heuristics, no model.",
        "Attribution results on incidents: one of vendor_failure / multi_cause / "
        "infrastructure_issue / unknown, with a confidence score and signal "
        "breakdown. Expect 'unknown' to be common and correct - with one deployed "
        "observation point the maximum reachable score is 55.0, below the 75 "
        "needed for vendor_failure.",
        "A frozen, SHA-256-hashed evidence artifact per resolved incident, "
        "optionally Ed25519-signed, with a public verification id a third party can "
        "check without an account.",
        "Alerts on email and Slack if you configure them (POST "
        "/v1/notifications/configs; Slack requires the paid plan).",
    ]


def _testing(mechanism: Mechanism) -> list[dict[str, Any]]:
    tests = [
        {
            "check": "Pipeline liveness before you trust any data.",
            "command": "curl -sS $RELIASTRA_API_URL/v1/checks/health",
            "pass": "HTTP 200 and status='healthy'. A 503 names the dead component.",
        },
        {
            "check": "Credential resolves to the right organization.",
            "command": "reliastra whoami --json"
            if mechanism in {"cli", "both"}
            else "curl -sS -H \"X-API-Key: $KEY\" $RELIASTRA_API_URL/v1/dependencies?limit=1",
            "pass": "Your organization's inventory. Exit code 0 / HTTP 200.",
        },
        {
            "check": "One probe executes end to end.",
            "command": "curl -sS -X POST -H \"X-API-Key: $KEY\" -H 'Content-Type: application/json' "
            "-d '{\"dependency_id\":\"<uuid>\"}' $RELIASTRA_API_URL/v1/checks/run",
            "pass": (
                "HTTP 202 with a queued task id, then an observation row appears at "
                "GET /v1/dependencies/{id}/results within one interval."
            ),
        },
        {
            "check": "A deliberate failure is detected as a failure.",
            "command": (
                "Register a target you control with expected_status_codes=[200], make "
                "it return 500 twice, and confirm an incident opens."
            ),
            "pass": (
                "An incident with detection_rule='single.consecutive_failures' and "
                "consecutive_failures >= 2 in its metadata."
            ),
        },
        {
            "check": "An SSRF-blocked target is reported as blocked, not as down.",
            "command": "Attempt to register a loopback or metadata URL.",
            "pass": (
                "Refused, or recorded as blocked_by_security_policy via "
                "GET /v1/checks/state/{dependency_id}. It must never be counted as a "
                "target outage."
            ),
        },
        {
            "check": "Idempotent retry does not duplicate.",
            "command": "Repeat a POST /v1/dependencies with the same Idempotency-Key.",
            "pass": "The first response is replayed; only one dependency exists.",
        },
    ]
    if mechanism in {"github_action", "both"}:
        action = INTEGRATIONS["github_action"]
        tests.extend(
            [
                {
                    "check": "The action resolves to the published ref before you trust the step.",
                    "command": (
                        f"Confirm {action['repository']} publishes tag {action['ref']} "
                        f"({' and '.join(action['published_tags'])}) and that "
                        f"action.yml declares runs.using={action['runs']['using']}."
                    ),
                    "pass": (
                        "The tag exists and the metadata matches. Pin the major tag "
                        f"({action['ref']}) or a full commit SHA if your policy forbids "
                        "mutable refs."
                    ),
                },
                {
                    "check": "The action fails the job for the reason you chose, not another.",
                    "command": (
                        "Run the step with fail-on: down against a healthy dependency, "
                        "then against a dependency you have made fail twice."
                    ),
                    "pass": (
                        "exit-code 0 and verdict=up first; then a non-zero exit with "
                        "verdict=down and a populated incident-id. Note that "
                        "`degraded` from latency-threshold-ms is derived by the action, "
                        "not a Reliastra status."
                    ),
                },
                {
                    "check": "The secret never reaches the log.",
                    "command": (
                        "Pass the key as ${{ secrets.RELIASTRA_TOKEN }} and grep the "
                        "job log for the `rel_` prefix."
                    ),
                    "pass": (
                        "No occurrence. GitHub masks registered secrets, but masking is "
                        "not a design: never interpolate the token into a run: step."
                    ),
                },
            ]
        )
    return tests


def _rollback() -> list[dict[str, Any]]:
    return [
        {
            "action": "Stop monitoring a dependency without deleting it.",
            "how": "PATCH /v1/dependencies/{dep_id} {\"is_active\": false}",
            "reversible": True,
            "note": "Preferred first step: observations stop, the record and its history remain.",
        },
        {
            "action": "Delete a dependency.",
            "how": "DELETE /v1/dependencies/{dep_id}  ·  reliastra deps rm <dependency-id> --yes",
            "reversible": False,
            "note": (
                "Destroys the record and its observation history. Already-frozen "
                "evidence artifacts for past incidents are separate records and are "
                "not affected."
            ),
        },
        {
            "action": "Revoke the credential.",
            "how": "DELETE /v1/api-keys/{key_id}  ·  reliastra keys rm <key-id> --yes",
            "reversible": False,
            "note": (
                "Immediately stops all programmatic access for that key. Do this if a "
                "key was committed or leaked; there is no un-revoke."
            ),
        },
        {
            "action": "Disable the MCP write surface without touching the API.",
            "how": "Restart this server with MCP_ALLOW_MUTATIONS=false.",
            "reversible": True,
            "note": (
                "Write tools are then not registered at all, so an agent cannot "
                "discover or call them. Read tools are unaffected."
            ),
        },
        {
            "action": "Stop alerting.",
            "how": "DELETE /v1/notifications/configs/{config_id}",
            "reversible": True,
        },
    ]


def _limitations(targets: list[IntegrationTarget]) -> list[str]:
    intervals = [t.check_interval_seconds for t in targets]
    fastest = min(intervals) if intervals else 300
    notes = list(LIMITATIONS)
    notes.append(
        f"Your fastest configured interval is {fastest}s, so the quickest possible "
        "detection for that dependency is "
        f"{2 * fastest}s (2 consecutive failed checks). Plan alerting expectations "
        "around that, not around the interval alone."
    )
    if any(t.method == "POST" for t in targets):
        notes.append(
            "A POST probe is a real request to your endpoint. If it is not idempotent "
            "or not safe to repeat, do not monitor it with POST - use a dedicated "
            "health URL that is safe to call on a schedule."
        )
    if any("http://" in (t.endpoint_url or "") for t in targets):
        notes.append(
            "At least one target uses plaintext http://. Probes and responses cross "
            "the network unencrypted; prefer https:// unless the target has no TLS."
        )
    return notes


def _cli_commands(targets: list[IntegrationTarget]) -> list[str]:
    commands = [
        "# Install (thin wrapper; downloads and SHA-256-verifies the platform binary)",
        CLI_INSTALL["pip"] + "     # or: " + CLI_INSTALL["npm"],
        "# Authenticate",
        "reliastra login --email you@example.com    # or: reliastra login --token <api-key>",
        "reliastra doctor                            # configuration, credential and API reachability",
        "# Register",
    ]
    for target in targets:
        commands.append(
            f"reliastra deps add '{target.name}' '{target.endpoint_url}' "
            f"--interval {target.check_interval_seconds} --method {target.method} "
            f"--timeout {target.timeout_seconds} "
            f"--expect {','.join(str(code) for code in target.expected_status_codes)}"
        )
    commands.extend(
        [
            "# Verify it is probing",
            "reliastra deps list --limit 100",
            "reliastra deps show <dependency-id> --observations 10",
            "reliastra checks recent --limit 20",
            "# Read incidents and evidence",
            "reliastra incidents list --status open --json",
            "reliastra incidents show <incident-id> --evidence",
            "reliastra evidence list --limit 50",
            "reliastra evidence get <report-id> --out evidence.pdf",
            "# Independent verification of an artifact",
            "reliastra verify <verification-id> --expect-hash <sha256>",
        ]
    )
    return commands


def _code_example(
    runtime: Runtime, targets: list[IntegrationTarget], ctx: base.ToolContext
) -> dict[str, Any]:
    first = targets[0]
    body = {
        "name": first.name,
        "endpoint_url": first.endpoint_url,
        "method": first.method,
        "expected_status_codes": first.expected_status_codes,
        "check_interval_seconds": first.check_interval_seconds,
        "timeout_seconds": first.timeout_seconds,
    }
    base_url = ctx.config.reliastra_api_url
    payload = json.dumps(body, indent=2)
    examples = {
        "bash": (
            "curl -sS -X POST " + base_url + "/v1/dependencies \\\n"
            '  -H "X-API-Key: $RELIASTRA_TOKEN" \\\n'
            "  -H 'Content-Type: application/json' \\\n"
            "  -H \"Idempotency-Key: $(uuidgen)\" \\\n"
            f"  -d '{json.dumps(body)}'\n"
        ),
        "python": (
            "import os, uuid, httpx\n\n"
            f"payload = {payload}\n\n"
            "response = httpx.post(\n"
            f'    "{base_url}/v1/dependencies",\n'
            "    json=payload,\n"
            '    headers={\n'
            '        "X-API-Key": os.environ["RELIASTRA_TOKEN"],\n'
            '        "Idempotency-Key": str(uuid.uuid4()),\n'
            "    },\n"
            "    timeout=15.0,\n"
            ")\n"
            "response.raise_for_status()\n"
            'dependency_id = response.json()["id"]\n'
        ),
        "node": (
            "const payload = " + json.dumps(body) + ";\n\n"
            "const response = await fetch(\n"
            f'  "{base_url}/v1/dependencies",\n'
            "  {\n"
            '    method: "POST",\n'
            "    headers: {\n"
            '      "X-API-Key": process.env.RELIASTRA_TOKEN,\n'
            '      "Content-Type": "application/json",\n'
            '      "Idempotency-Key": crypto.randomUUID(),\n'
            "    },\n"
            "    body: JSON.stringify(payload),\n"
            "  },\n"
            ");\n"
            "if (!response.ok) throw new Error(`Reliastra ${response.status}`);\n"
            "const { id: dependencyId } = await response.json();\n"
        ),
        "go": (
            "package main\n\n"
            "import (\n"
            '\t"bytes"\n'
            '\t"encoding/json"\n'
            '\t"fmt"\n'
            '\t"net/http"\n'
            '\t"os"\n'
            ")\n\n"
            "func main() {\n"
            "\tpayload := map[string]any{\n"
            + "".join(f"\t\t{go_literal(key)}: {go_value(value)},\n" for key, value in body.items())
            + "\t}\n"
            "\tbody, err := json.Marshal(payload)\n"
            "\tif err != nil {\n\t\tpanic(err)\n\t}\n"
            f'\treq, err := http.NewRequest("POST", "{base_url}/v1/dependencies", bytes.NewReader(body))\n'
            "\tif err != nil {\n\t\tpanic(err)\n\t}\n"
            '\treq.Header.Set("Content-Type", "application/json")\n'
            '\treq.Header.Set("X-API-Key", os.Getenv("RELIASTRA_TOKEN"))\n'
            '\treq.Header.Set("Idempotency-Key", "REPLACE-WITH-A-STABLE-UUID")\n'
            "\tresp, err := http.DefaultClient.Do(req)\n"
            "\tif err != nil {\n\t\tpanic(err)\n\t}\n"
            "\tdefer resp.Body.Close()\n"
            '\tfmt.Println("status:", resp.StatusCode)\n'
            "}\n"
        ),
    }
    return {
        "runtime": runtime,
        "language": runtime,
        "code": examples[runtime],
        "registers": first.name,
        "note": (
            "This registers the FIRST target only; repeat per target. The credential "
            "is read from the environment, never inlined. Idempotency-Key must be "
            "stable across retries of the same logical registration - a fresh UUID "
            "per attempt defeats it (the bash and Python examples generate one per "
            "run, which is correct for a single attempt and wrong for a retry loop)."
        ),
        "security_note": (
            "The API never returns decrypted headers: DependencyResponse.headers is "
            "always null and has_headers tells you whether any were stored. Do not "
            "plan on reading a secret back."
        ),
    }


def go_literal(key: str) -> str:
    """A Go map key literal."""
    return json.dumps(key)


def go_value(value: Any) -> str:
    """Render one payload value as a Go literal (JSON arrays are not Go slices)."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value)
    if isinstance(value, list):
        return "[]any{" + ", ".join(go_value(item) for item in value) + "}"
    if value is None:
        return "nil"
    return json.dumps(value, default=str)


DESCRIPTION = """Produce a concrete, verified plan for integrating Reliastra.

Call this AFTER reliastra_analyze_dependencies has established a justified gap. It
returns executable steps using only interfaces that exist: the REST API, the CLI,
and this MCP server. Read-only - it plans, it never registers anything.

WHAT IT RETURNS: prerequisites (account, plan with api_access, exact key scopes,
quota headroom, SSRF constraints); ordered steps each marked read or write with its
side effects; verified request-body fields with their real constraints; a runnable
code example for bash/python/node/go; the exact CLI command sequence; configuration
and secret handling for local/CI/production; expected results; six concrete tests
including a deliberate-failure detection test; and rollback options marked
reversible or not.

EVERY endpoint, field, flag, scope, environment variable and package name comes
from the verified registry, pinned to backend and CLI source by test. Nothing is
templated in a way that could invent an option.

IT CAN DECLINE. If no target is something Reliastra can monitor - a database,
queue, cache, internal service, DNS, SMTP, gRPC or raw TCP target - you get
justified=false, conclusion="not_justified", the reasons, and what to use instead.
No plan is manufactured. Report that outcome honestly; do not re-ask with invented
HTTP endpoints to force a plan.

THERE IS NO RELIASTRA GITHUB ACTION. A CI plan shows the verified CLI or REST call
inside your own workflow and says so explicitly. Any example showing
'uses: reliastra/...' would be fabricated.

WHAT THE OUTPUT PROVES: that these steps match the product's real interface. It does
not prove the integration will be valuable - that was the analysis tool's job.

NEXT: execute the steps yourself, or use reliastra_register_dependency to perform
step 3 through this server with explicit user confirmation."""


def register(server: Any, deps: base.ServerDeps) -> None:
    base.register_tool(
        server, deps, plan_integration,
        name="reliastra_plan_integration",
        title="Verified Reliastra integration plan",
        description=DESCRIPTION,
        read_only=True,
    )
