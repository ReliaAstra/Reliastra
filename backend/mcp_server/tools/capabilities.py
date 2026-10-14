"""reliastra_get_capabilities — permission-aware capability discovery.

The first tool an agent should call. It answers "what can Reliastra actually do,
what can *I* do with the credential I have, and what does it refuse to claim".

By default the document is built locally from the verified registry
(:mod:`mcp_server.capabilities`), so it is fast, has no failure mode, and works
with no credential. Every literal in it is pinned to the backend source by
``tests/unit/mcp/test_capability_contract.py``.

``include_live=True`` additionally fetches the two things that are genuinely
live state rather than product contract — the current public price list
(``GET /v1/pricing``) and whether the check pipeline is healthy right now
(``GET /v1/checks/health``). Those can fail; when they do the static value is
kept and the envelope says so, rather than the whole discovery call failing.
"""

from typing import Any

from .. import errors as err
from ..capabilities import STATIC_PRICING, build_capabilities
from . import _base as base

TOOL_NAME = "reliastra_get_capabilities"

DESCRIPTION = """Discover what Reliastra can actually do, scoped to your credential.

CALL THIS FIRST, before any other Reliastra tool. It returns the verified
product contract: the observation topology (one deployed observation point),
the deterministic detection rule (2 consecutive failures), the attribution model
(weights, the 75/50 thresholds, and why 55.0 is the ceiling without
corroboration), the evidence hashing and signing scheme, every API operation
that exists with its required scope, the plan limits and the paid-plan
requirement for API access, the verified CLI command list, the published GitHub
Action and its real inputs, and the things Reliastra explicitly does not do (no
published OpenAPI schema, no regional quorum, no causal proof).

The operations list is filtered to what THIS caller can reach: with no credential
you see the public observatory surface only; with a valid Reliastra API key you
also see workspace reads and, if this server permits writes, the two mutations.
A server started read-only does not list mutations at all.

Read-only. Safe with no credential. Makes no upstream call unless
include_live=true.

WHAT THE OUTPUT PROVES: which capabilities exist and which you may call, and the
methodology behind any evidence you later retrieve. It does NOT prove that
Reliastra is useful for your project — use reliastra_analyze_dependencies for
that — and it does not contain live provider status.

WHEN NOT TO USE: to fetch provider or incident data. Use
reliastra_search_observatory, reliastra_search_incidents, or
reliastra_list_dependencies instead.

NEXT: reliastra_search_observatory for public provider evidence, or
reliastra_analyze_dependencies to assess a specific architecture."""


async def get_capabilities(
    ctx: base.ToolContext,
    include_live: bool = False,
) -> dict[str, Any]:
    """Implementation; registered by :func:`register`."""
    pricing: dict[str, Any] | None = None
    pipeline_health: dict[str, Any] | None = None
    degraded: list[str] = []

    if include_live:
        try:
            body, _fresh = await ctx.client.get_public(
                "/v1/pricing", request_id=ctx.request_id, cacheable=True
            )
            if isinstance(body, dict):
                pricing = {"live": True, "source": "GET /v1/pricing", "plans": body}
        except err.ToolFailure:
            # Pricing is not worth failing discovery over: keep the verified
            # static value and say that it is static.
            degraded.append("pricing: live fetch failed, static fallback used")
        try:
            body, fresh = await ctx.client.get_public(
                "/v1/checks/health",
                request_id=ctx.request_id,
                cacheable=False,
                # 503 is the answer here: it means the pipeline is not healthy,
                # and the body says which component is missing. Reporting that as
                # an upstream error would hide the one fact asked for.
                accept_statuses=frozenset({503}),
            )
            if isinstance(body, dict):
                pipeline_health = {
                    "live": True,
                    "source": "GET /v1/checks/health",
                    "status": body.get("status"),
                    "detail": body,
                    "upstream_status": fresh.get("upstream_status", 200),
                }
        except err.ToolFailure as failure:
            degraded.append(f"pipeline_health: unavailable ({failure.category})")

    document = build_capabilities(
        authenticated=ctx.authenticated,
        allow_mutations=ctx.config.allow_mutations,
        pricing=pricing,
        pipeline_health=pipeline_health,
        server_version=_server_version(),
        protocol_version=(
            ctx.mcp_ctx.protocol_version if ctx.mcp_ctx is not None else None
        ),
        registered_tools=ctx.registered_tools,
    )

    notes = [
        "Operations marked auth_required=true need a Reliastra API key and an "
        "organization on a plan that includes api_access.",
        "Methodology, limits and operation paths are the verified product "
        "contract, pinned to backend source by test; pricing and pipeline_health "
        "are live only when include_live=true succeeded.",
    ]
    if degraded:
        notes.extend(degraded)
    if pricing is None:
        notes.append(
            f"Pricing shown is the static fallback ({STATIC_PRICING['source']}). "
            "Pass include_live=true for the current published prices."
        )
    if not ctx.authenticated:
        notes.append(
            "No credential was supplied, so workspace and mutation operations are "
            "omitted rather than listed as forbidden."
        )

    return base.envelope(
        TOOL_NAME, document, ctx, source="local verified capability registry", notes=notes
    )


def _server_version() -> str:
    from .. import __version__

    return __version__


def register(server: Any, deps: base.ServerDeps) -> None:
    base.register_tool(
        server,
        deps,
        get_capabilities,
        name=TOOL_NAME,
        title="Reliastra capability discovery",
        description=DESCRIPTION,
        read_only=True,
    )
