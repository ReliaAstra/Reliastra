"""MCP resources: the stable reference documents behind the tools.

Tools answer a question; resources are what an agent reads to know which question
to ask. These are the four documents an integration needs, plus one template for
reading a public provider record as a resource.

Two rules shape this module:

* **No tenant data, ever.** Every resource is either built from the verified local
  registry or fetched from a *public* Reliastra endpoint. Nothing here accepts or
  uses a credential, so a resource read cannot become a cross-tenant read. The
  workspace surface is tools-only, where the credential is resolved per request.
* **No fabricated content.** The integration guide quotes the same registry the
  capability tool returns. There is no separately-written copy of a flag list or an
  endpoint table that could drift from the code it describes.

URIs use the ``reliastra://`` scheme. The template segment is validated as a
catalog slug before it reaches a URL, so a traversal attempt
(``reliastra://observatory/../../secret``) is a validation failure rather than a
request to an attacker-chosen path.
"""

from __future__ import annotations

import json
from typing import Any

from . import errors as err
from .capabilities import (
    AUTHENTICATED_OPERATIONS,
    CREDENTIALS,
    DOCS,
    INTEGRATIONS,
    LIMITATIONS,
    METHODOLOGY,
    PRODUCT_LONG,
    PRODUCT_ONE_LINE,
    PUBLIC_OPERATIONS,
    STATIC_PRICING,
)
from .observability import get_logger
from .sanitization import UNTRUSTED_CONTENT_NOTICE, as_slug

log = get_logger("resources")


def _json(document: Any) -> str:
    return json.dumps(document, indent=2, default=str)


def capabilities_resource() -> str:
    """The verified capability catalog, unauthenticated view."""
    return _json(
        {
            "product": {"one_line": PRODUCT_ONE_LINE, "summary": PRODUCT_LONG},
            "methodology": METHODOLOGY,
            "public_operations": [op.as_dict() for op in PUBLIC_OPERATIONS],
            "authenticated_operations": [op.as_dict() for op in AUTHENTICATED_OPERATIONS],
            "integrations": INTEGRATIONS,
            "pricing": STATIC_PRICING,
            "limitations": list(LIMITATIONS),
            "docs": DOCS,
            "note": (
                "This is the unauthenticated view: authenticated operations are "
                "listed for reference with the scope each requires. For the view "
                "filtered to what YOUR credential can actually call, use the "
                "reliastra_get_capabilities tool."
            ),
        }
    )


def methodology_resource() -> str:
    """How observations become incidents, attributions and evidence."""
    return _json(
        {
            "summary": (
                "Reliastra probes external HTTP dependencies on a schedule, records "
                "every observation, opens an incident when a deterministic rule "
                "confirms a failure, attributes it with a weighted signal model, and "
                "freezes the result into a hashed, optionally signed artifact."
            ),
            "observation": {
                "what_is_probed": (
                    "HTTP(S) endpoints with method GET, HEAD or POST, evaluated "
                    "against expected status codes and a timeout."
                ),
                "topology": METHODOLOGY["observation_topology"],
                "observation_points": METHODOLOGY["observation_points"],
                "deployed_region": METHODOLOGY["deployed_observation_region"],
                "region_labels": METHODOLOGY["allowed_region_labels"],
                "caveat": METHODOLOGY["region_labels_are_not_vantage_points"],
                "cadence": METHODOLOGY["cadence"],
                "what_an_observation_is_not": (
                    "An observation is Reliastra's probe of a target, not a request "
                    "your application made. The two are different measurements of "
                    "the same endpoint and must not be presented as each other."
                ),
            },
            "detection": METHODOLOGY["detection"],
            "attribution": METHODOLOGY["attribution"],
            "evidence": METHODOLOGY["evidence"],
            "distinctions_an_agent_must_preserve": {
                "provider_independently_observed_failing": (
                    "A public incident: Reliastra's own checks confirmed it. The "
                    "strongest claim available, and still only about the provider."
                ),
                "incident_reported_by_an_external_source": (
                    "NOT AVAILABLE. Reliastra does not ingest provider status pages "
                    "or third-party incident feeds. Every public incident here was "
                    "detected by Reliastra's own checks."
                ),
                "failure_observed_by_the_caller": (
                    "Only exists if the caller monitors that dependency themselves "
                    "(workspace incidents). Reliastra cannot observe an application "
                    "it has not been given an endpoint for."
                ),
                "suspected_relationship": (
                    "Attribution with confidence below 75: multi_cause or unknown, "
                    "reported with its signal breakdown and its ceiling."
                ),
                "causally_established_relationship": (
                    "NOT AVAILABLE. Attribution is deterministic weighted-signal "
                    "correlation (v1.1), not a validated causal model. No Reliastra "
                    "output establishes that a provider failure caused your outage."
                ),
            },
        }
    )


def limitations_resource() -> str:
    """What Reliastra does not do, and what its outputs do not prove."""
    return _json(
        {
            "limitations": list(LIMITATIONS),
            "things_that_do_not_exist": [
                {"thing": "published OpenAPI schema", "status": "deliberately disabled and refused at the proxy"},
                {"thing": "external incident feed ingestion", "status": "does not exist"},
                {"thing": "causal root-cause determination", "status": "does not exist; attribution is correlation"},
                {"thing": "multi-region observation quorum", "status": "defined in code, not deployed (one observation point)"},
                {"thing": "non-HTTP monitoring (database, queue, cache, gRPC, DNS, TCP)", "status": "not supported"},
                {"thing": "application-level request tracing inside your code", "status": "not supported; Reliastra probes endpoints externally"},
                {"thing": "webhook management with an API key", "status": "denied by scope inference; needs an interactive session"},
                {"thing": "MCP OAuth authorization server", "status": "not operated; API keys are the credential"},
            ],
            "how_to_read_a_null": {
                "uptime_percentage=null": "nothing was measured in that window; not 100%, not an outage",
                "attribution='unknown'": "a valid verdict below the 50 threshold, not missing data",
                "attribution confidence <= 55 with one observation point": "the honest maximum reachable without corroboration",
                "evidence=null on an incident": "the freeze processor has not produced an artifact yet",
                "verified=null": "the check could not run; never a pass",
                "service_degraded=true": "verification could not be performed; not 'invalid' and not 'absent'",
                "empty observation list": "ambiguous: the target was quiet OR checks did not run. Use /v1/checks/health to tell them apart",
            },
            "untrusted_content": UNTRUSTED_CONTENT_NOTICE,
        }
    )


def integration_guide_resource() -> str:
    """A Markdown reference for integrating with Reliastra by REST, CLI or MCP."""
    rest = INTEGRATIONS["rest_api"]
    cli = INTEGRATIONS["cli"]
    action = INTEGRATIONS["github_action"]
    lines = [
        "# Reliastra integration reference",
        "",
        PRODUCT_ONE_LINE,
        "",
        "Everything below is transcribed from the deployed product and pinned to",
        "backend and CLI source by `tests/unit/mcp/test_capability_contract.py`.",
        "",
        "## 1. REST API",
        "",
        f"Base URL: `{rest['base_url_default']}` (override with `RELIASTRA_API_URL`).",
        "",
        "### Authentication",
        "",
        "A scoped API key (`rel_...`) pins one organization. Accepted as:",
        "",
    ]
    lines += [f"- `{header}`" for header in rest["auth_headers_accepted"]]
    lines += [
        "",
        rest["organization_header"],
        "",
        "**API access is a paid-plan entitlement**, enforced once for every",
        "programmatic request. A key on an organization without `api_access` is",
        "refused regardless of route or scope.",
        "",
        "### Scopes",
        "",
        "`action:resource` pairs, deny-by-default. A write grant implies read on the",
        "same resource. `*` grants everything. Known scopes:",
        "",
        "```",
        *[f"{scope}" for scope in _wrap(", ".join(_CREDENTIAL_SCOPES), 72)],
        "```",
        "",
        "### Conventions",
        "",
        f"- Errors: `{rest['error_envelope']}`",
        f"- Idempotency: {rest['idempotency']}",
        f"- Correlation: {rest['correlation']}",
        f"- Schema: {rest['openapi_schema']}",
        "",
        "### Rate limits",
        "",
        f"- API key: {CREDENTIALS['rate_limits']['api_key']}",
        f"- Public reads: {CREDENTIALS['rate_limits']['public_reads']}",
        f"- Behaviour: {CREDENTIALS['rate_limits']['behaviour']}",
        "",
        "## 2. Public endpoints (no credential)",
        "",
        "| Operation | Method and path |",
        "| --- | --- |",
    ]
    lines += [
        f"| {op.name} | `{op.method} {op.path}` |" for op in PUBLIC_OPERATIONS
    ]
    lines += [
        "",
        "## 3. Authenticated endpoints",
        "",
        "| Operation | Method and path | Scope |",
        "| --- | --- | --- |",
    ]
    lines += [
        f"| {op.name} | `{op.method} {op.path}` | `{op.scope}` |"
        for op in AUTHENTICATED_OPERATIONS
    ]
    lines += [
        "",
        "## 4. CLI",
        "",
        cli["distribution"],
        "",
        "```bash",
        "pip install reliastra      # thin installer; verifies the binary's SHA-256",
        "npm install -g reliastra   # same mechanism",
        "```",
        "",
        "### Commands",
        "",
        "```",
        *[command for command in cli["verified_commands"]],
        "```",
        "",
        "### Environment",
        "",
        *[f"- `{name}`" for name in cli["environment"]],
        "",
        "### Exit codes",
        "",
        *[f"- `{code}` — {text}" for code, text in cli["exit_codes"].items()],
        "",
        f"Default key scopes: `{cli['default_key_scopes']}`.",
        "",
        "## 5. GitHub Action (CI)",
        "",
        f"{action['name']} — `{action['uses']}`",
        f"(published tags: {', '.join(action['published_tags'])}; runtime "
        f"`{action['runs']['using']}`, entrypoint `{action['runs']['main']}`).",
        "",
        "```yaml",
        *action["example"].rstrip("\n").split("\n"),
        "```",
        "",
        "### Inputs",
        "",
        *[
            f"- `{name}`{' (required)' if spec['required'] else ''}"
            f"{'' if spec['default'] is None else ' [default: `' + str(spec['default']) + '`]'}"
            f" \u2014 {spec['summary']}"
            for name, spec in action["inputs"].items()
        ],
        "",
        f"`fail-on` accepts: {', '.join(action['fail_on_values'])}, plus `any` "
        "(everything except `up`) and `never` (status alone never fails).",
        "",
        "### Outputs",
        "",
        ", ".join(f"`{name}`" for name in action["outputs"]),
        "",
        "### Exit codes",
        "",
        *[f"- `{code}` — {text}" for code, text in action["exit_codes"].items()],
        "",
        "### Two things not to smooth over",
        "",
        f"- The action's `base-url` default is `{action['inputs']['base-url']['default']}`,",
        f"  while the CLI's default API root is `{INTEGRATIONS['rest_api']['base_url_default']}`.",
        "  Both are real; they are not the same string.",
        "- `degraded` caused by `latency-threshold-ms` is derived by the action, not",
        "  returned by Reliastra as a status, and `observation_points` is always 1.",
        "",
        f"Verified against: {action['verified_against']}. The action lives in a separate",
        "repository, so this interface cannot be re-derived from this codebase; if it",
        "changes upstream, this section is stale until it is re-transcribed.",
        "",
        "## 6. Model Context Protocol (this server)",
        "",
        "### stdio (local coding agents)",
        "",
        "```json",
        json.dumps(
            {
                "mcpServers": {
                    "reliastra": {
                        "command": "python",
                        "args": ["-m", "mcp_server", "--transport", "stdio"],
                        "cwd": "<repo>/backend",
                        "env": {
                            "RELIASTRA_API_KEY": "rel_...",
                            "RELIASTRA_API_URL": "https://api.reliastra.com",
                        },
                    }
                }
            },
            indent=2,
        ),
        "```",
        "",
        "### Streamable HTTP (remote)",
        "",
        "```json",
        json.dumps(
            {
                "mcpServers": {
                    "reliastra-remote": {
                        "type": "streamable-http",
                        "url": "https://api.reliastra.com/mcp",
                        "headers": {"Authorization": "Bearer rel_..."},
                    }
                }
            },
            indent=2,
        ),
        "```",
        "",
        "The remote transport always requires a per-request bearer credential. There",
        "is no configuration that disables it. Health (`/healthz`) and metrics",
        "(`/metrics`) are unauthenticated and return no tenant data.",
        "",
        "## 7. What does not exist",
        "",
        "- **Published OpenAPI schema:** disabled and refused at the proxy.",
        "- **External incident ingestion:** every public incident was detected by",
        "  Reliastra's own checks.",
        "- **Causal root cause:** attribution is deterministic correlation, not a",
        "  validated causal model.",
        "",
        "## 8. Documentation",
        "",
        *[f"- {label}: `{path}`" for label, path in DOCS.items() if label != "note"],
        "",
        DOCS["note"],
    ]
    return "\n".join(lines)


def _wrap(text: str, width: int) -> list[str]:
    words = text.split(", ")
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current}, {word}" if current else word
        if len(candidate) > width and current:
            lines.append(current + ",")
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


_CREDENTIAL_SCOPES = CREDENTIALS["known_scopes"]


def make_provider_resource(deps: Any) -> Any:
    """Build the provider-record handler bound to the shared client.

    A closure over ``deps`` rather than a module-level client, so a resource read
    shares one connection pool and one circuit breaker with the tools, and so tests
    can inject a transport without patching module state.
    """

    async def provider_record(provider: str) -> str:
        """One public provider record, fetched live. Public data only."""
        try:
            slug = as_slug(provider, field_name="provider")
        except err.ToolFailure as failure:
            # The SDK turns any exception raised here into a generic
            # ``UnexpectedResourceError`` (-32603, "Error creating resource from
            # template <uri>") and keeps the cause server-side only
            # (mcp/server/mcpserver/resources/templates.py). So the *reason* a
            # read was refused never reaches the caller on the wire. It is logged
            # here instead: a refusal an operator cannot diagnose is a support
            # ticket with no answer. The offending value is the caller's own
            # input, length-capped, and the credential is never in scope.
            log.warning(
                "resource_read_refused",
                extra={
                    "resource": "reliastra://observatory/{provider}",
                    "category": failure.category,
                    "reason": failure.message,
                    "provider": provider[:128],
                },
            )
            raise
        body, freshness = await deps.client.get_public(
            f"/v1/vendors/{slug}", request_id="resource-read"
        )
        return _json(
            {
                "source": f"GET {deps.config.reliastra_api_url}/v1/vendors/{slug}",
                "freshness": freshness,
                "provider": body,
                "note": UNTRUSTED_CONTENT_NOTICE,
            }
        )

    return provider_record


def register(server: Any, deps: Any) -> None:
    """Register every resource on the server."""

    def capabilities_document() -> str:
        return capabilities_resource()

    def methodology_document() -> str:
        return methodology_resource()

    def limitations_document() -> str:
        return limitations_resource()

    def integration_guide_document() -> str:
        return integration_guide_resource()

    server.resource(
        "reliastra://capabilities",
        name="capabilities",
        title="Reliastra verified capability catalog",
        description=(
            "Every operation Reliastra exposes, with the scope each requires, plus "
            "methodology, integrations, pricing and limitations. Use the "
            "reliastra_get_capabilities tool for the view filtered to your credential."
        ),
        mime_type="application/json",
    )(capabilities_document)

    server.resource(
        "reliastra://methodology",
        name="methodology",
        title="Observation, detection, attribution and evidence methodology",
        description=(
            "How a probe becomes an observation, an incident, an attribution and a "
            "frozen artifact - including the distinctions an agent must preserve "
            "(observed vs reported vs caller-side failure; correlation vs causation)."
        ),
        mime_type="application/json",
    )(methodology_document)

    server.resource(
        "reliastra://limitations",
        name="limitations",
        title="What Reliastra does not do",
        description=(
            "Explicit limitations, features that do not exist, and how to read a "
            "null or degraded value honestly. Read this before quoting a number."
        ),
        mime_type="application/json",
    )(limitations_document)

    server.resource(
        "reliastra://integration-guide",
        name="integration-guide",
        title="REST, CLI and MCP integration reference",
        description=(
            "Verified endpoints, scopes, CLI commands and flags, environment "
            "variables, rate limits, exit codes and MCP client configuration."
        ),
        mime_type="text/markdown",
    )(integration_guide_document)

    server.resource(
        "reliastra://observatory/{provider}",
        name="provider-record",
        title="One public provider record",
        description=(
            "Live public observatory record for one provider slug, e.g. "
            "reliastra://observatory/stripe. Public data only; accepts no credential."
        ),
        mime_type="application/json",
    )(make_provider_resource(deps))
