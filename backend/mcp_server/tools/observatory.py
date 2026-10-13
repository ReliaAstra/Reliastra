"""Public observatory tools — read-only, no credential required.

These cover the public catalog of providers Reliastra observes:
``/v1/vendors`` and its detail/metrics/timeline routes. Everything returned is
what the API returned; nothing is interpolated, smoothed, extrapolated or
inferred. In particular:

* an ``uptime_percentage`` of ``None`` with ``measurements_24h`` naming the state
  means *nothing was measured in that window*, which is not the same as 100% and
  is not the same as an outage. It is passed through untouched.
* ``region`` on a timeline is a scheduling label. One observation point is
  deployed, so a region label is not an independent vantage point.
* a gap in a timeline is a gap. Buckets are not synthesised to fill it.

Window and resolution parameters are ``Literal`` types, so the wire schema itself
rejects a value the backend would refuse (``app/modules/vendors/service.py``:
``_WINDOW_HOURS`` and ``_RESOLUTION_SECONDS``). An agent gets a validation error
at the schema layer instead of a round trip that fails.
"""

from typing import Any, Literal

from .. import errors as err
from ..sanitization import as_slug, cap_items
from . import _base as base

Window = Literal["1h", "6h", "24h", "7d", "30d", "90d"]
Resolution = Literal["auto", "1m", "5m", "15m", "1h", "6h"]
Region = Literal["us-east", "eu-west", "ap-south", "sa-east"]

_UNMEASURED_NOTE = (
    "A null availability or latency figure means nothing was measured in that "
    "window - it is not 100% and it is not an outage. Check measurements_* "
    "fields and the observation counts before drawing a conclusion."
)
_SINGLE_POINT_NOTE = (
    "One observation point is deployed (us-east). Region values are scheduling "
    "labels, not independent vantage points; no regional quorum is claimed."
)


async def search_observatory(
    ctx: base.ToolContext,
    category: str | None = None,
    limit: int = 10,
    cursor: str | None = None,
    name_contains: str | None = None,
) -> dict[str, Any]:
    """Search the public provider catalog, optionally narrowed to one category."""
    page_limit = ctx.client.clamp_limit(limit)

    if category:
        slug = as_slug(category, field_name="category")
        body, freshness = await ctx.client.get_public(
            f"/v1/vendors/categories/{slug}", request_id=ctx.request_id
        )
        source = f"GET /v1/vendors/categories/{slug}"
        items = _extract_items(body)
    else:
        body, freshness = await ctx.client.get_public(
            "/v1/vendors",
            params={"limit": page_limit, "cursor": cursor, "public": True},
            request_id=ctx.request_id,
        )
        source = "GET /v1/vendors"
        items = _extract_items(body)

    matched_filter = None
    if name_contains:
        needle = name_contains.strip().lower()
        if not needle:
            raise err.invalid_input("name_contains must not be blank.")
        before = len(items)
        items = [item for item in items if _name_matches(item, needle)]
        matched_filter = {
            "name_contains": name_contains,
            "matched": len(items),
            "examined": before,
            "applied_by": "this MCP server, over the page it fetched",
            "warning": (
                "The Reliastra API has no text search on this endpoint. This "
                "filter only sees the items in the fetched page, so an empty "
                "result does not mean the provider is absent from the catalog - "
                "page further with cursor, or list categories first."
            ),
        }

    items, truncated = cap_items(items, ctx.config.max_result_items)
    notes = [
        "Items are provider records as published in the public catalog.",
        _UNMEASURED_NOTE,
    ]
    if truncated:
        notes.append(
            f"Truncated to {ctx.config.max_result_items} items by this server's "
            "result-size limit; use cursor to page."
        )
    data = {
        "providers": items,
        "count": len(items),
        "next_cursor": body.get("next_cursor") if isinstance(body, dict) else None,
        "has_more": body.get("has_more") if isinstance(body, dict) else None,
    }
    if matched_filter:
        data["local_filter"] = matched_filter
    if category:
        data["category"] = {
            k: v for k, v in body.items() if k != "vendors"
        } if isinstance(body, dict) else None
    return base.envelope(
        "reliastra_search_observatory", data, ctx, source=source, freshness=freshness, notes=notes
    )


async def get_provider(
    ctx: base.ToolContext,
    provider: str,
) -> dict[str, Any]:
    """One provider's public record: identity, endpoints, recent observed state."""
    slug = as_slug(provider, field_name="provider")
    body, freshness = await ctx.client.get_public(
        f"/v1/vendors/{slug}", request_id=ctx.request_id
    )
    if not isinstance(body, dict):
        raise err.upstream(
            "upstream_invalid", "Reliastra returned an unexpected provider record shape."
        )
    return base.envelope(
        "reliastra_get_provider",
        body,
        ctx,
        source=f"GET /v1/vendors/{slug}",
        freshness=freshness,
        notes=[
            "recent_status reflects the most recent observation Reliastra made of "
            "this provider's monitored endpoints, not a live probe performed for "
            "this request.",
            _UNMEASURED_NOTE,
            _SINGLE_POINT_NOTE,
        ],
    )


async def get_provider_metrics(
    ctx: base.ToolContext,
    provider: str,
    window: Window | None = None,
) -> dict[str, Any]:
    """Availability and latency aggregates for a provider over a window."""
    slug = as_slug(provider, field_name="provider")
    path = f"/v1/vendors/{slug}/metrics"
    body, freshness = await ctx.client.get_public(
        path, params={"window": window}, request_id=ctx.request_id
    )
    windows = window or "all (1h, 6h, 24h, 7d, 30d, 90d)"
    return base.envelope(
        "reliastra_get_provider_metrics",
        body,
        ctx,
        source=f"GET {path}?window={windows}",
        freshness=freshness,
        notes=[
            "Aggregates over observations Reliastra recorded. Omitting window "
            "returns every window the API computes.",
            _UNMEASURED_NOTE,
            _SINGLE_POINT_NOTE,
        ],
    )


async def get_provider_timeline(
    ctx: base.ToolContext,
    provider: str,
    window: Window = "24h",
    resolution: Resolution = "auto",
    region: Region | None = None,
) -> dict[str, Any]:
    """The observation time series for a provider, bucketed by resolution."""
    slug = as_slug(provider, field_name="provider")
    path = f"/v1/vendors/{slug}/timeline"
    body, freshness = await ctx.client.get_public(
        path,
        params={"window": window, "resolution": resolution, "region": region},
        request_id=ctx.request_id,
    )
    truncated = False
    if isinstance(body, dict) and isinstance(body.get("buckets"), list):
        buckets, truncated = cap_items(body["buckets"], ctx.config.max_result_items)
        body = dict(body)
        body["buckets"] = buckets
        body["buckets_truncated"] = truncated
    notes = [
        "Buckets are the API's own aggregation. A bucket with no observations is "
        "reported as such; buckets are never synthesised to fill a gap.",
        f"resolution={resolution} (auto resolves per window: 1h/6h->1m, 24h->5m, "
        "7d->15m, 30d->1h, 90d->6h).",
        _SINGLE_POINT_NOTE,
    ]
    if truncated:
        notes.append(
            f"Bucket list truncated to {ctx.config.max_result_items} by this "
            "server; narrow the window for full resolution."
        )
    return base.envelope(
        "reliastra_get_provider_timeline",
        body,
        ctx,
        source=f"GET {path}?window={window}&resolution={resolution}"
        + (f"&region={region}" if region else ""),
        freshness=freshness,
        notes=notes,
    )


async def get_pipeline_health(ctx: base.ToolContext) -> dict[str, Any]:
    """Is Reliastra's check pipeline actually running right now?"""
    # 503 is the answer, not a failure: the endpoint reports pipeline liveness and
    # deliberately answers 503 when Beat, the worker or the broker is not proven
    # alive. Treating that as an upstream error would hide the one fact asked for,
    # and an empty check history looks identical to a quiet provider without it.
    body, freshness = await ctx.client.get_public(
        "/v1/checks/health",
        request_id=ctx.request_id,
        cacheable=False,
        accept_statuses=frozenset({503}),
    )
    status = body.get("status") if isinstance(body, dict) else None
    upstream_status = freshness.get("upstream_status", 200)
    return base.envelope(
        "reliastra_get_pipeline_health",
        body,
        ctx,
        source="GET /v1/checks/health",
        freshness=freshness,
        notes=[
            f"HTTP {upstream_status} from the API; status={status!r}.",
            "This is Reliastra's own pipeline, not a monitored provider. A "
            "non-healthy status means observations may be missing because checks "
            "did not run - which is a Reliastra problem, and it changes how an "
            "empty history should be read.",
            "Not cached: liveness must be current.",
        ],
    )


# ── helpers ─────────────────────────────────────────────────────────────────


def _extract_items(body: Any) -> list[Any]:
    if isinstance(body, dict):
        for key in ("items", "vendors"):
            value = body.get(key)
            if isinstance(value, list):
                return value
        return []
    if isinstance(body, list):
        return body
    raise err.upstream(
        "upstream_invalid", "Reliastra returned an unexpected list shape."
    )


def _name_matches(item: Any, needle: str) -> bool:
    if not isinstance(item, dict):
        return False
    for key in ("vendor_name", "display_name", "official_name", "name"):
        value = item.get(key)
        if isinstance(value, str) and needle in value.lower():
            return True
    return False


_DESCRIPTIONS = {
    "search": """Search Reliastra's public observatory catalog of external providers.

Use this to find out whether Reliastra already observes a provider your
application depends on (Stripe, OpenAI, Twilio, AWS, ...), and to get its
category and last observed state. Read-only, no credential needed.

Filtering: `category` is applied by the API (one category's public providers).
`name_contains` is applied BY THIS SERVER over the page it fetched, because the
API has no text search - so an empty result does not prove absence; page with
`cursor` or list categories first. The response says which filter was applied
and warns about this.

WHAT THE OUTPUT PROVES: that a provider exists in Reliastra's public catalog and
what was last observed of it. It does NOT prove your own dependency is monitored
(for that use reliastra_list_dependencies with an API key), and a null
availability figure means nothing was measured, not that the provider is healthy
or down.

WHEN NOT TO USE: for incidents (reliastra_search_incidents), for time series
(reliastra_get_provider_timeline), or for your own workspace
(reliastra_list_dependencies).

NEXT: reliastra_get_provider for one provider's full record, or
reliastra_search_incidents for what went wrong and when.""",
    "provider": """Get one provider's public observatory record.

Returns identity (official name, website, docs, status page, country, tags), its
monitored endpoints, and the most recent observed status and latency. Read-only,
no credential needed. `provider` is the catalog slug, e.g. "stripe" - find it
with reliastra_search_observatory.

WHAT THE OUTPUT PROVES: what Reliastra last observed about this provider's
monitored endpoints. `recent_status` is the most recent recorded observation, NOT
a live probe run for your request - check `last_check_at` for its age.

It does NOT prove that a request YOUR application made to this provider failed.
Provider-level evidence is about the provider, not your traffic. For that
distinction use reliastra_analyze_dependencies, and for a specific failure use
reliastra_search_incidents.

WHEN NOT TO USE: for time series or aggregates - use
reliastra_get_provider_timeline or reliastra_get_provider_metrics.

NEXT: reliastra_get_provider_metrics for availability over a window, or
reliastra_search_incidents filtered to this provider.""",
    "metrics": """Get availability and latency aggregates for one public provider.

Returns the API's own per-window figures (availability percentage, average and
p95 latency, measurement counts). Read-only, no credential needed.

`window` accepts 1h, 6h, 24h, 7d, 30d or 90d; omit it to get every window the
API computes. Values are aggregates over observations Reliastra recorded from its
single deployed observation point.

WHAT THE OUTPUT PROVES: how this provider measured over the window. A null
availability figure means NOTHING WAS MEASURED in that window - it is not 100%,
and it is not an outage. Read the measurement count before quoting a number.

It does NOT prove anything about your own integration, your region, or your
traffic pattern. These are Reliastra's observations of the provider, from one
vantage point.

WHEN NOT TO USE: for the underlying time series (reliastra_get_provider_timeline)
or for incident detail (reliastra_search_incidents).

NEXT: reliastra_get_provider_timeline to see the shape behind an aggregate.""",
    "timeline": """Get the observation time series for one public provider.

Returns the API's bucketed series: per-bucket availability, latency and any
incident overlapping that bucket. Read-only, no credential needed.

`window`: 1h, 6h, 24h, 7d, 30d, 90d. `resolution`: auto (1h/6h->1m, 24h->5m,
7d->15m, 30d->1h, 90d->6h) or an explicit 1m, 5m, 15m, 1h, 6h. `region` is a
scheduling label; only us-east is deployed.

WHAT THE OUTPUT PROVES: when this provider was observed failing, at the
resolution asked for. A bucket with no observations is reported as such - buckets
are never synthesised to fill a gap, so a sparse series means sparse measurement,
not stability.

It does NOT prove causation for your own outage, and a region label is not an
independent vantage point. Correlation between this timeline and your errors is
a hypothesis to investigate, not a conclusion.

WHEN NOT TO USE: for a single headline number (reliastra_get_provider_metrics) or
for incident records with evidence (reliastra_get_public_incident).

NEXT: reliastra_search_incidents for the incident that a bucket points at, then
reliastra_get_incident_evidence for the frozen artifact.""",
    "health": """Check whether Reliastra's own check-execution pipeline is alive.

Returns the liveness of Celery Beat, a worker, and the broker - the components
that actually perform observations. Read-only, no credential needed, never cached.

CALL THIS when an observation history is empty or suspiciously stale and you need
to know why. This is the difference between "the provider has been quiet" and
"Reliastra stopped measuring", and those two states look identical in the data
without it. The API answers HTTP 503 with the component detail when the pipeline
is not fully healthy; this tool reports that as data, not as an error.

WHAT THE OUTPUT PROVES: whether Reliastra was able to run checks. It says nothing
about any monitored provider, and nothing about your own application.

WHEN NOT TO USE: as a provider status check - use reliastra_get_provider.

NEXT: if unhealthy, treat missing observations as unavailable rather than as
evidence of stability, and say so explicitly in your analysis.""",
}


def register(server: Any, deps: base.ServerDeps) -> None:
    base.register_tool(
        server, deps, search_observatory,
        name="reliastra_search_observatory",
        title="Search the public observatory",
        description=_DESCRIPTIONS["search"],
        read_only=True,
    )
    base.register_tool(
        server, deps, get_provider,
        name="reliastra_get_provider",
        title="Get a public provider record",
        description=_DESCRIPTIONS["provider"],
        read_only=True,
    )
    base.register_tool(
        server, deps, get_provider_metrics,
        name="reliastra_get_provider_metrics",
        title="Provider availability and latency aggregates",
        description=_DESCRIPTIONS["metrics"],
        read_only=True,
    )
    base.register_tool(
        server, deps, get_provider_timeline,
        name="reliastra_get_provider_timeline",
        title="Provider observation time series",
        description=_DESCRIPTIONS["timeline"],
        read_only=True,
    )
    base.register_tool(
        server, deps, get_pipeline_health,
        name="reliastra_get_pipeline_health",
        title="Reliastra check-pipeline liveness",
        description=_DESCRIPTIONS["health"],
        read_only=True,
    )
