"""Public incident tools — read-only, no credential required.

These expose the incidents **Reliastra itself detected** on the public catalog
(``/v1/public/incidents``). The distinction that matters most here is enforced in
the returned data, not only in the description, because an agent reasoning over
this is one paraphrase away from telling a user "Stripe caused your outage":

``interpretation.establishes``     what the record actually proves
``interpretation.does_not_establish`` what it cannot prove

The categories an agent must keep apart, and where each lives:

===========================================  ===================================
A provider independently observed failing     these tools (public incidents)
An incident reported by an external source     **does not exist in Reliastra** -
                                               there is no external incident
                                               ingestion; every public incident
                                               was detected by Reliastra's own
                                               checks. Stated in the notes.
A failure observed by the caller's app         ``reliastra_list_workspace_incidents``
                                               (only if the caller monitors it)
A suspected relationship                       attribution: ``multi_cause`` or
                                               ``unknown`` with a confidence score
A causally established relationship            **does not exist**. Attribution is a
                                               deterministic weighted-signal
                                               correlation (v1.1); it is not a
                                               validated causal model, and the
                                               backend says so in its own docs.
===========================================  ===================================

Verified filter values come from ``app/modules/incidents/public_service.py``
(``FAILURE_KINDS``, status validation) and are encoded as ``Literal`` types so the
wire schema rejects an invalid filter before any request is made.
"""

from typing import Any, Literal

from .. import errors as err
from ..sanitization import as_slug, as_uuid, cap_items
from . import _base as base

IncidentStatus = Literal["open", "resolved"]
FailureKind = Literal["http_5xx", "http_4xx", "transport", "timeout", "mixed", "unknown"]
Region = Literal["us-east", "eu-west", "ap-south", "sa-east"]

#: What every public incident record does and does not establish. Returned with
#: each record so the distinction travels with the data instead of depending on
#: the agent having read a tool description.
INTERPRETATION: dict[str, Any] = {
    "establishes": (
        "Reliastra's own scheduled checks observed this provider's monitored "
        "endpoint failing, and a deterministic rule (2 consecutive failed checks) "
        "confirmed it. The window, observation count and failure count are the "
        "measurements behind that claim."
    ),
    "does_not_establish": [
        "That any request made by your application failed.",
        "That this provider caused an outage you observed. Overlap in time is a "
        "hypothesis to investigate, not a conclusion.",
        "That the provider was down for all its customers or in all regions: one "
        "observation point (us-east) was deployed.",
        "A causal mechanism. Attribution is deterministic weighted-signal "
        "correlation (methodology v1.1), not a validated causal model.",
    ],
    "external_incident_feeds": (
        "Reliastra does not ingest incidents reported by third parties or provider "
        "status pages. Every record here was detected by Reliastra's own checks, so "
        "'Reliastra observed a failure' and 'the provider reported an incident' are "
        "different claims and only the first is made."
    ),
    "if_you_need_causation": (
        "Correlate this window against your own application logs and your own "
        "monitored dependency's observations (reliastra_get_dependency_observations). "
        "Reliastra can supply independent evidence about the provider; establishing "
        "that YOUR request failed because of it requires your side of the record."
    ),
}


async def search_incidents(
    ctx: base.ToolContext,
    provider: str | None = None,
    category: str | None = None,
    region: Region | None = None,
    status: IncidentStatus | None = None,
    failure_kind: FailureKind | None = None,
    since: str | None = None,
    until: str | None = None,
    limit: int = 10,
    cursor: str | None = None,
) -> dict[str, Any]:
    """Search incidents Reliastra detected on the public provider catalog."""
    vendor_slug = as_slug(provider, field_name="provider") if provider else None
    category_slug = as_slug(category, field_name="category") if category else None
    page_limit = ctx.client.clamp_limit(limit)

    params: dict[str, Any] = {
        "vendor": vendor_slug,
        "category": category_slug,
        "region": region,
        "status": status,
        "failure_kind": failure_kind,
        "since": _validate_timestamp(since, "since"),
        "until": _validate_timestamp(until, "until"),
        "cursor": _validate_cursor(cursor),
        "limit": page_limit,
    }
    body, freshness = await ctx.client.get_public(
        "/v1/public/incidents", params=params, request_id=ctx.request_id
    )
    if not isinstance(body, dict):
        raise err.upstream("upstream_invalid", "Reliastra returned an unexpected incident list.")

    items, truncated = cap_items(body.get("items"), ctx.config.max_result_items)
    notes = [
        "Every item is an incident RELIASTRA DETECTED with its own checks. "
        "Reliastra does not ingest provider-reported or third-party incidents.",
        "A record proves the provider's monitored endpoint was observed failing in "
        "a window. It does not prove any request from your application failed.",
        "detection_rule and observation_count are on the detail record: use "
        "reliastra_get_public_incident before quoting a cause.",
    ]
    if truncated:
        notes.append(
            f"Truncated to {ctx.config.max_result_items} items by this server's "
            "result-size limit; use cursor to page."
        )
    return base.envelope(
        "reliastra_search_incidents",
        {
            "incidents": items,
            "count": len(items),
            "next_cursor": body.get("next_cursor"),
            "has_more": body.get("has_more"),
            "filters_applied": {
                key: value for key, value in params.items() if value not in (None, "")
            },
            "interpretation": INTERPRETATION,
        },
        ctx,
        source="GET /v1/public/incidents",
        freshness=freshness,
        notes=notes,
    )


async def get_public_incident(
    ctx: base.ToolContext,
    incident_id: str,
) -> dict[str, Any]:
    """One public incident in full, with its detection provenance."""
    record_id = as_uuid(incident_id, field_name="incident_id")
    body, freshness = await ctx.client.get_public(
        f"/v1/public/incidents/{record_id}", request_id=ctx.request_id
    )
    if not isinstance(body, dict):
        raise err.upstream("upstream_invalid", "Reliastra returned an unexpected incident record.")

    evidence = body.get("evidence")
    notes = [
        "detection_rule names the rule that fired and detection_metadata carries its "
        "inputs, so the claim can be checked rather than trusted.",
        "started_at is the first failure of the confirmed run, not the check that "
        "crossed the threshold: the window covers the whole observed outage.",
    ]
    if evidence is None:
        notes.append(
            "evidence is null. That means the frozen artifact has NOT BEEN "
            "GENERATED YET (the freeze processor runs shortly after a transition) "
            "or this incident has none. It does not mean the record is "
            "unverifiable by design, and it does not weaken the detection claim."
        )
    else:
        notes.append(
            "evidence is a descriptor (version, data_hash, byte_size, "
            "methodology_version), not the artifact. Fetch the frozen document "
            "with reliastra_get_incident_evidence."
        )
    return base.envelope(
        "reliastra_get_public_incident",
        {**body, "interpretation": INTERPRETATION},
        ctx,
        source=f"GET /v1/public/incidents/{record_id}",
        freshness=freshness,
        notes=notes,
    )


def _validate_timestamp(value: str | None, field_name: str) -> str | None:
    """Accept an ISO-8601 timestamp; refuse anything else before it is sent."""
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise err.invalid_input(f"{field_name} must be an ISO-8601 timestamp string.")
    from datetime import datetime

    candidate = value.strip()
    try:
        # Python 3.11+ accepts a trailing "Z" directly; this project's floor is
        # 3.11 (backend/pyproject.toml), so no manual offset rewrite is needed.
        datetime.fromisoformat(candidate)
    except ValueError:
        raise err.invalid_input(
            f"{field_name} must be an ISO-8601 timestamp, e.g. "
            "'2026-01-15T00:00:00Z'.",
            field=field_name,
        ) from None
    return candidate


def _validate_cursor(value: str | None) -> str | None:
    """The public incident cursor is '<iso-timestamp>|<uuid>'."""
    if value is None or value == "":
        return None
    if not isinstance(value, str) or "|" not in value:
        raise err.invalid_input(
            "cursor must be the next_cursor value returned by a previous "
            "reliastra_search_incidents call.",
            field="cursor",
        )
    return value.strip()


_DESCRIPTIONS = {
    "search": """Search incidents RELIASTRA DETECTED on public providers.

Use this to answer "was this provider observed failing, when, for how long, and
what kind of failure" from independent evidence rather than from a status page or
an assumption. Read-only, no credential needed.

Filters (all optional, all validated against the API's own allowed values):
provider slug, category, region, status (open|resolved), failure_kind
(http_5xx|http_4xx|transport|timeout|mixed|unknown), since/until (ISO-8601),
plus cursor paging.

WHAT THE OUTPUT PROVES: that Reliastra's own scheduled checks observed the
provider's monitored endpoint failing, confirmed by a deterministic 2-consecutive-
failures rule. Every record carries an `interpretation` block stating exactly what
it does and does not establish.

WHAT IT DOES NOT PROVE: that YOUR application's request failed; that the provider
caused an outage you saw; that it was down for all customers or regions (one
observation point is deployed); or any causal mechanism. Time overlap with your
errors is a hypothesis to investigate, not a finding.

Reliastra does NOT ingest provider-reported or third-party incidents, so "Reliastra
observed a failure" and "the provider reported an incident" are different claims -
only the first is ever made here.

WHEN NOT TO USE: for incidents on YOUR OWN monitored dependencies, which are
private - use reliastra_list_workspace_incidents with an API key.

NEXT: reliastra_get_public_incident for detection provenance, then
reliastra_get_incident_evidence for the frozen artifact.""",
    "detail": """Get one public incident record in full, with its detection provenance.

Returns the observed target, window, severity, failure class, observation and
failure counts, the detection rule that fired with its inputs, and the evidence
descriptor if a frozen artifact exists. Read-only, no credential needed.

`incident_id` is the UUID from reliastra_search_incidents.

WHAT THE OUTPUT PROVES: the measurements behind this one detection - which rule
fired, on how many observations, over what window. `started_at` is the first
failure of the confirmed run, so the window covers the whole observed outage
rather than starting at the check that crossed the threshold.

WHAT IT DOES NOT PROVE: that your application was affected, or why. The record
includes an `interpretation` block that says this explicitly; carry it into
anything you write for a user.

If `evidence` is null, the frozen artifact has not been generated yet - that is a
timing fact, not a statement that the record is unverifiable.

WHEN NOT TO USE: for the artifact bytes and hash themselves - use
reliastra_get_incident_evidence. For verifying a document someone sent you - use
reliastra_verify_evidence.

NEXT: reliastra_get_incident_evidence to retrieve and hash-check the frozen
artifact for this incident.""",
}


def register(server: Any, deps: base.ServerDeps) -> None:
    base.register_tool(
        server, deps, search_incidents,
        name="reliastra_search_incidents",
        title="Search publicly detected incidents",
        description=_DESCRIPTIONS["search"],
        read_only=True,
    )
    base.register_tool(
        server, deps, get_public_incident,
        name="reliastra_get_public_incident",
        title="Get one public incident record",
        description=_DESCRIPTIONS["detail"],
        read_only=True,
    )
