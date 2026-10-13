"""Workspace tools — the caller's own monitored dependencies, incidents, evidence.

All read-only. All require a Reliastra API key.

**No organization parameter exists on any of these tools, by design.** The
organization is pinned to the API key by the Reliastra API
(``app/api/deps.py::get_current_org`` resolves ``current_org`` to
``api_key.org_id`` and rejects a mismatched ``X-Organization-ID`` with 403).
Accepting an org id here would create an insecure-direct-object-reference surface
for this server to police; not accepting one means cross-tenant access is not
expressible through MCP at all. A record belonging to another organization comes
back as a 404, which this server reports as ``not_found``.

Scope requirements are the backend's, inferred from the path by
``_infer_scope`` — see the capability registry for the mapping. A key lacking the
scope, or an organization whose plan does not include ``api_access``, produces a
``forbidden`` failure carrying the API's own error code.
"""

from typing import Any, Literal

from .. import errors as err
from ..sanitization import as_uuid, cap_items
from . import _base as base

IncidentStatus = Literal["open", "resolved", "false_positive"]
IncidentSeverity = Literal["critical", "major", "minor"]

_TENANT_NOTE = (
    "Results are limited to the organization pinned to your API key. This tool "
    "accepts no organization parameter: cross-tenant access is not expressible, "
    "and another tenant's id is reported as not_found."
)


async def list_dependencies(
    ctx: base.ToolContext,
    dependency_id: str | None = None,
    limit: int = 10,
    cursor: str | None = None,
) -> dict[str, Any]:
    """The caller's own monitored dependencies, or one of them in detail."""
    if dependency_id:
        record_id = as_uuid(dependency_id, field_name="dependency_id")
        body = await ctx.client.get_authed(
            f"/v1/dependencies/{record_id}", None, ctx.api_key, ctx.request_id
        )
        source = f"GET /v1/dependencies/{record_id}"
        data: dict[str, Any] = {"dependency": body, "count": 1 if body else 0}
        notes = [
            _TENANT_NOTE,
            "A dependency record describes what YOU asked Reliastra to monitor and "
            "what it observed. It is not a public provider record; for that use "
            "reliastra_get_provider.",
        ]
        return base.envelope(
            "reliastra_list_dependencies", data, ctx, source=source, notes=notes
        )

    body = await ctx.client.get_authed(
        "/v1/dependencies",
        {"limit": ctx.client.clamp_limit(limit), "cursor": cursor},
        ctx.api_key,
        ctx.request_id,
    )
    source = "GET /v1/dependencies"
    items, next_cursor, has_more = _page(body, ctx.config.max_result_items)
    return base.envelope(
        "reliastra_list_dependencies",
        {
            "dependencies": items,
            "count": len(items),
            "next_cursor": next_cursor,
            "has_more": has_more,
        },
        ctx,
        source=source,
        notes=[
            _TENANT_NOTE,
            "This is your monitored inventory. Compare it against the external "
            "dependencies your application actually calls to find gaps: "
            "reliastra_analyze_dependencies does that comparison.",
            "An empty list means nothing is monitored yet - it is not evidence "
            "that your dependencies are healthy.",
        ],
    )


async def get_dependency_observations(
    ctx: base.ToolContext,
    dependency_id: str | None = None,
    limit: int = 20,
    cursor: str | None = None,
) -> dict[str, Any]:
    """Individual check results (observations) for one dependency, or all of them."""
    page_limit = ctx.client.clamp_limit(limit)
    if dependency_id:
        record_id = as_uuid(dependency_id, field_name="dependency_id")
        body = await ctx.client.get_authed(
            f"/v1/dependencies/{record_id}/results",
            {"limit": page_limit, "cursor": cursor},
            ctx.api_key,
            ctx.request_id,
        )
        source = f"GET /v1/dependencies/{record_id}/results"
    else:
        body = await ctx.client.get_authed(
            "/v1/checks/recent", {"limit": page_limit}, ctx.api_key, ctx.request_id
        )
        source = "GET /v1/checks/recent"

    items, next_cursor, has_more = _page(body, ctx.config.max_result_items)
    return base.envelope(
        "reliastra_get_dependency_observations",
        {
            "observations": items,
            "count": len(items),
            "next_cursor": next_cursor,
            "has_more": has_more,
            "scope": "one dependency" if dependency_id else "all dependencies in the organization",
        },
        ctx,
        source=source,
        notes=[
            _TENANT_NOTE,
            "Each observation is one probe Reliastra performed. `is_up` and "
            "`status_code` are what that probe recorded; an observation is not a "
            "request your application made.",
            "These are YOUR dependency's observations, from Reliastra's single "
            "observation point - a different measurement than your own logs, and "
            "complementary to them.",
            "An empty list is ambiguous on its own: the dependency may be quiet, or "
            "checks may not be running. Use reliastra_get_pipeline_health to tell "
            "those apart.",
        ],
    )


async def list_workspace_incidents(
    ctx: base.ToolContext,
    incident_id: str | None = None,
    status: IncidentStatus | None = None,
    severity: IncidentSeverity | None = None,
    dependency_id: str | None = None,
    include_evidence: bool = False,
    limit: int = 10,
    cursor: str | None = None,
) -> dict[str, Any]:
    """The caller's own incidents, optionally one in detail with its evidence."""
    if incident_id:
        record_id = as_uuid(incident_id, field_name="incident_id")
        body = await ctx.client.get_authed(
            f"/v1/incidents/{record_id}", None, ctx.api_key, ctx.request_id
        )
        source = f"GET /v1/incidents/{record_id}"
        data: dict[str, Any] = {"incident": body, "count": 1 if body else 0}
        if include_evidence:
            data["evidence"] = await ctx.client.get_authed(
                f"/v1/incidents/{record_id}/evidence", None, ctx.api_key, ctx.request_id
            )
            source += " + GET /v1/incidents/{id}/evidence"
        data["interpretation"] = _incident_interpretation()
        return base.envelope(
            "reliastra_list_workspace_incidents",
            data,
            ctx,
            source=source,
            notes=[
                _TENANT_NOTE,
                "This incident is on a dependency YOU monitor: it is Reliastra's "
                "observation of your target, which is stronger evidence about your "
                "integration than a public provider record, but it is still "
                "Reliastra's probe, not your application's request.",
            ],
        )

    dep_filter = as_uuid(dependency_id, field_name="dependency_id") if dependency_id else None
    body = await ctx.client.get_authed(
        "/v1/incidents",
        {
            "status": status,
            "severity": severity,
            "dependency_id": dep_filter,
            "limit": ctx.client.clamp_limit(limit),
            "cursor": cursor,
        },
        ctx.api_key,
        ctx.request_id,
    )
    items, next_cursor, has_more = _page(body, ctx.config.max_result_items)
    return base.envelope(
        "reliastra_list_workspace_incidents",
        {
            "incidents": items,
            "count": len(items),
            "next_cursor": next_cursor,
            "has_more": has_more,
            "interpretation": _incident_interpretation(),
        },
        ctx,
        source="GET /v1/incidents",
        notes=[
            _TENANT_NOTE,
            "Incidents on your own monitored dependencies. Opened by the "
            "deterministic 2-consecutive-failures rule, so the fastest possible "
            "detection is two check intervals.",
            "Where an incident carries an attribution result, that result is a "
            "deterministic weighted-signal correlation. 'unknown' below 50 is a "
            "valid outcome, not missing data.",
        ],
    )


async def get_evidence_report(
    ctx: base.ToolContext,
    report_id: str | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """The caller's evidence reports, or one report's metadata and download link."""
    if report_id:
        record_id = as_uuid(report_id, field_name="report_id")
        body = await ctx.client.get_authed(
            f"/v1/evidence/{record_id}", None, ctx.api_key, ctx.request_id
        )
        source = f"GET /v1/evidence/{record_id}"
        notes = [
            _TENANT_NOTE,
            "This returns metadata plus a short-lived presigned download URL for "
            "the rendered PDF. The URL is a third party's host and expires; the "
            "checksum is what identifies the bytes.",
            "The presigned URL's signing query is REDACTED here. A signed URL is a "
            "bearer credential, and anything returned to an agent can land in a "
            "transcript or a log. The base location and the checksum are kept; get "
            "a working link from the console or `reliastra evidence show <id> --web`.",
            "The machine-readable facts (hash, signature, window, methodology) are "
            "in the verification record: use reliastra_verify_evidence with the "
            "report's verification id. PDF bytes are not returned over MCP.",
            "report_token lifetimes are bounded (7 days by default), so a link in "
            "an old message may have expired. That is not evidence the report is "
            "gone.",
        ]
        return base.envelope(
            "reliastra_get_evidence_report", {"report": body}, ctx, source=source, notes=notes
        )

    body = await ctx.client.get_authed(
        "/v1/evidence", {"limit": ctx.client.clamp_limit(limit)}, ctx.api_key, ctx.request_id
    )
    items, _next, _more = _page(body, ctx.config.max_result_items)
    return base.envelope(
        "reliastra_get_evidence_report",
        {"reports": items, "count": len(items)},
        ctx,
        source="GET /v1/evidence",
        notes=[
            _TENANT_NOTE,
            "Evidence reports are generated for your own incidents. This route "
            "returns a plain list bounded by limit, not a cursor page.",
        ],
    )


def _page(body: Any, max_items: int) -> tuple[list[Any], str | None, bool]:
    """Normalise the two page shapes the API uses into (items, cursor, has_more).

    ``PaginatedResponse`` carries ``items``/``next_cursor``/``has_more``; several
    routes return a bare list. Both are reported honestly — a bare list has no
    cursor, and inventing one would send an agent paging through nothing.
    """
    if isinstance(body, list):
        items, truncated = cap_items(body, max_items)
        return items, None, truncated
    if isinstance(body, dict):
        items, truncated = cap_items(body.get("items"), max_items)
        has_more = bool(body.get("has_more"))
        return items, body.get("next_cursor"), has_more or truncated
    raise err.upstream("upstream_invalid", "Reliastra returned an unexpected page shape.")


def _incident_interpretation() -> dict[str, Any]:
    return {
        "establishes": (
            "Reliastra's own checks observed YOUR monitored target failing, and a "
            "deterministic rule confirmed it over a window."
        ),
        "does_not_establish": [
            "That a specific request from your application failed - Reliastra "
            "probes the target independently of your traffic.",
            "A root cause. Any attribution present is weighted-signal correlation "
            "(methodology v1.1), not a validated causal model.",
            "Impact on your users. Pair this window with your own logs and metrics.",
        ],
        "attribution_scores": (
            "confidence >= 75 -> vendor_failure; >= 50 -> multi_cause; else "
            "infrastructure_issue if the observer itself was unhealthy, else "
            "'unknown'. With one observation point and no corroborating incident "
            "the maximum reachable score is 55.0, so 'unknown' is the expected "
            "honest answer in that configuration."
        ),
    }


_DESCRIPTIONS = {
    "deps": """List the dependencies YOUR organization monitors, or inspect one.

Requires a Reliastra API key with read:dependencies (or write:dependencies, which
implies read). Read-only. Returns your own monitored inventory: name, endpoint
URL, method, expected status codes, check interval, region labels, active state
and latest results.

Pass `dependency_id` for one record in detail; omit it for the paginated list.

WHAT THE OUTPUT PROVES: what you have asked Reliastra to watch, and what it
observed. This is the ground truth for "is this dependency already monitored?" -
the question that decides whether Reliastra adds anything to a given architecture.

An EMPTY list means nothing is monitored. It is not evidence that your
dependencies are healthy, and it must not be reported as such.

Tenant isolation: results are limited to the organization pinned to your key.
There is deliberately no organization parameter, so cross-tenant access is not
expressible; another tenant's id is reported as not_found.

WHEN NOT TO USE: for public provider records you do not monitor - use
reliastra_search_observatory / reliastra_get_provider. For the individual probes -
use reliastra_get_dependency_observations.

NEXT: reliastra_analyze_dependencies to compare this inventory against the
external calls your application actually makes and find the gaps.""",
    "observations": """Get individual check results (observations) for your dependencies.

Requires a Reliastra API key with read:checks or read:dependencies. Read-only.
Each observation is one probe Reliastra performed: timestamp, status code, latency,
error type, region label, and the recorded up/down evaluation.

Pass `dependency_id` for one dependency's paginated results; omit it for recent
observations across the organization.

WHAT THE OUTPUT PROVES: what Reliastra's probe recorded at specific times about
your monitored target. This is independent evidence - it was measured from
Reliastra's observation point, not inferred from your logs, which is exactly why
it is worth comparing against them.

WHAT IT DOES NOT PROVE: that a request YOUR application made failed. A probe
observation and an application request are different measurements of the same
target. Never present one as the other.

An empty list is ambiguous: the target may have been quiet, or checks may not have
run. Call reliastra_get_pipeline_health to distinguish those - reporting "no
observations" as "no problems" is the specific error this avoids.

NEXT: reliastra_list_workspace_incidents for confirmed failures, or
reliastra_search_incidents for independent public evidence about the same
provider.""",
    "incidents": """List or inspect YOUR organization's incidents, with attribution if present.

Requires a Reliastra API key with read:incidents. Read-only. These are incidents on
dependencies you monitor, detected by the deterministic 2-consecutive-failures rule.

Pass `incident_id` for one record (add include_evidence=true for its evidence
report in the same call), or filter the list by status (open|resolved|
false_positive), severity (critical|major|minor) and dependency_id.

SCOPE NOTE: include_evidence=true additionally requires read:evidence. The API
infers scope from the path, and `/v1/incidents/{id}/evidence` matches the evidence
resource first - so a key scoped only to incidents can read incidents but not their
evidence reports. That refusal is reported as forbidden, not hidden.

WHAT THE OUTPUT PROVES: that Reliastra observed your monitored target failing over
a confirmed window, and - where attribution ran - the deterministic signal scores
behind a classification.

WHAT IT DOES NOT PROVE: that your application or your users were affected, or a
root cause. Attribution is weighted-signal correlation (v1.1), not a validated
causal model, and a confidence below 50 is classified 'unknown' - a valid, honest
result, not missing data. With one deployed observation point and no corroborating
incident the maximum reachable score is 55.0, below the 75 needed for
'vendor_failure', so expect 'unknown' or 'multi_cause' in that configuration.

Every response carries an `interpretation` block stating this. Keep it attached
when you summarize for a user: the failure mode this guards against is reporting a
correlation as a cause.

NEXT: reliastra_get_evidence_report for the frozen artifact, then
reliastra_verify_evidence to have its verdict re-derived independently.""",
    "evidence": """List your evidence reports, or get one report's metadata and download link.

Requires a Reliastra API key with read:evidence. Read-only. Evidence reports are the
SLA-grade artifacts Reliastra generates for your incidents: hashed, optionally
Ed25519-signed, with a canonical JSON payload and a rendered PDF.

Pass `report_id` for one report (metadata plus a short-lived presigned URL and its
checksum); omit it for your list of reports.

WHAT THE OUTPUT PROVES: that a report exists, what window it covers, its hashes and
signature details, and its retention/expiry.

WHAT IT DOES NOT RETURN: PDF bytes. A binary artifact is not usable by an agent, and
the machine-readable facts live in the verification record - use
reliastra_verify_evidence with the report's verification id for the payload hash,
signature, individual checks and the procedure to verify the bytes yourself.

Note that presigned URLs expire (report tokens default to 7 days) and point at
object storage, not at Reliastra. An expired link is not evidence the report is
gone.

NEXT: reliastra_verify_evidence for independent verification of a report's
authenticity.""",
}


def register(server: Any, deps: base.ServerDeps) -> None:
    base.register_tool(
        server, deps, list_dependencies,
        name="reliastra_list_dependencies",
        title="Your monitored dependencies",
        description=_DESCRIPTIONS["deps"],
        read_only=True, requires_auth=True,
    )
    base.register_tool(
        server, deps, get_dependency_observations,
        name="reliastra_get_dependency_observations",
        title="Your dependency observations",
        description=_DESCRIPTIONS["observations"],
        read_only=True, requires_auth=True,
    )
    base.register_tool(
        server, deps, list_workspace_incidents,
        name="reliastra_list_workspace_incidents",
        title="Your incidents",
        description=_DESCRIPTIONS["incidents"],
        read_only=True, requires_auth=True,
    )
    base.register_tool(
        server, deps, get_evidence_report,
        name="reliastra_get_evidence_report",
        title="Your evidence reports",
        description=_DESCRIPTIONS["evidence"],
        read_only=True, requires_auth=True,
    )
