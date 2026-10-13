"""reliastra_analyze_dependencies — evidence-based coverage analysis.

The tool that decides whether Reliastra is *useful* for a particular
architecture, and it is deliberately able to answer "no".

Design constraints that shape it:

* **No repository access is assumed or required.** This server cannot read a
  codebase, and the tool never pretends to. It analyses exactly what the caller
  supplies, optionally cross-checked against two real sources: the caller's own
  Reliastra inventory (authenticated) and the public observatory catalog.
* **Deterministic, no model.** The assessment is rule application over supplied
  facts plus real API lookups. There is no embedded LLM: a recommendation that
  cannot be traced to a stated rule and a cited observation is not worth making.
* **Supplied text is untrusted.** ``application_notes`` and dependency names are
  data. They are length-capped, never interpreted as instructions, and can never
  change which rules run or authorize anything.
* **Honesty about what Reliastra can monitor.** Reliastra probes HTTP(S)
  endpoints with GET/HEAD/POST only. A Postgres connection, a queue, a cache or
  an internal service is *not* monitorable, and the tool says so rather than
  recommending a subscription that cannot observe it.

Every claim in the output carries a ``reason`` naming the rule that produced it,
and an ``evidence`` field naming the source (caller-supplied, workspace API,
public observatory API) — so an agent can show its work instead of asserting a
conclusion.
"""

from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field

from .. import errors as err
from ..sanitization import as_slug, sanitize_text
from . import _base as base

Criticality = Literal["critical", "high", "medium", "low"]
ValueVerdict = Literal["high", "moderate", "low", "none"]
OverallVerdict = Literal[
    "adds_value", "limited_value", "no_value", "insufficient_information"
]

#: Hard bounds. An agent supplies this list; it is untrusted input, so both the
#: number of entries and the size of each field are capped before any work.
MAX_DEPENDENCIES = 50
MAX_NOTES_CHARS = 4_000
MAX_NAME_CHARS = 200
MAX_PROVIDER_LOOKUPS = 10

#: Kinds that Reliastra cannot observe, whatever else is true about them.
#: Reliastra's probe is an HTTP(S) request with method GET, HEAD or POST
#: (app/modules/dependencies/constants.py::HttpMethod).
NON_HTTP_KINDS = frozenset(
    {
        "database",
        "postgres",
        "mysql",
        "mongodb",
        "redis",
        "cache",
        "message_queue",
        "queue",
        "kafka",
        "rabbitmq",
        "sqs",
        "internal_service",
        "dns",
        "smtp",
        "grpc",
        "tcp",
        "websocket",
        "filesystem",
        "object_storage_sdk",
    }
)


class DependencyInput(BaseModel):
    """One external dependency as the caller describes it."""

    name: str = Field(
        description="A label you will recognise, e.g. 'Stripe payments API'."
    )
    kind: str | None = Field(
        default=None,
        description=(
            "What it is, e.g. http_api, database, message_queue, cache, "
            "internal_service, cdn, third_party_saas. Informational: the decisive "
            "question is whether it is reachable by an HTTP(S) GET/HEAD/POST."
        ),
    )
    endpoint_url: str | None = Field(
        default=None,
        description=(
            "The HTTP(S) URL your application calls, if there is one. Without it "
            "Reliastra cannot monitor this dependency."
        ),
    )
    provider: str | None = Field(
        default=None,
        description=(
            "Public observatory provider slug if you know it, e.g. 'stripe'. "
            "Used to check whether Reliastra already observes this provider "
            "independently of you."
        ),
    )
    criticality: Criticality | None = Field(
        default=None,
        description="How much this dependency matters to your application.",
    )
    monitored_by: list[str] | None = Field(
        default=None,
        description=(
            "Monitoring you already run against it, e.g. ['datadog-synthetic', "
            "'pagerduty-heartbeat']. Empty or absent means none that you know of."
        ),
    )
    user_facing: bool | None = Field(
        default=None,
        description="True when your users directly experience a failure of this dependency.",
    )


async def analyze_dependencies(
    ctx: base.ToolContext,
    dependencies: list[DependencyInput],
    include_public_observatory: bool = True,
    include_workspace: bool = False,
    application_notes: str | None = None,
) -> dict[str, Any]:
    """Analyse a supplied dependency inventory for independently-sourced evidence gaps."""
    if not dependencies:
        raise err.invalid_input(
            "dependencies must contain at least one entry. Describe what your "
            "application actually calls."
        )
    if len(dependencies) > MAX_DEPENDENCIES:
        raise err.invalid_input(
            f"At most {MAX_DEPENDENCIES} dependencies per call; you sent "
            f"{len(dependencies)}. Split the analysis."
        )

    notes = sanitize_text(application_notes, limit=MAX_NOTES_CHARS) if application_notes else None
    missing_information: list[str] = []
    lookups_performed: list[str] = []
    lookups_skipped: list[str] = []

    workspace_index: dict[str, Any] = {}
    if include_workspace:
        if not ctx.authenticated:
            missing_information.append(
                "include_workspace=true was requested but no API key was supplied, "
                "so your existing Reliastra monitoring could NOT be checked. "
                "Coverage claims below are therefore incomplete."
            )
        else:
            workspace_index = await _fetch_workspace_index(ctx)

    provider_budget = MAX_PROVIDER_LOOKUPS if include_public_observatory else 0
    assessments: list[dict[str, Any]] = []

    for supplied in dependencies:
        entry = _normalise(supplied)
        monitorable = _classify_monitorable(entry)
        coverage = _assess_coverage(
            entry, monitorable, ctx, workspace_index, missing_information
        )
        public = None
        if include_public_observatory and entry.get("provider_slug"):
            if provider_budget > 0:
                provider_budget -= 1
                public = await _lookup_public_provider(ctx, entry["provider_slug"])
                lookups_performed.append(entry["provider_slug"])
                if public is not None:
                    coverage["public_observatory"] = public
            else:
                lookups_skipped.append(entry["provider_slug"])
        elif entry.get("provider_raw") and not entry.get("provider_slug"):
            missing_information.append(
                f"'{entry['name']}': provider '{entry['provider_raw']}' is not a "
                "valid catalog slug, so the public observatory was not checked for it."
            )

        verdict, reasons = _assess_value(entry, monitorable, coverage)
        assessments.append(
            {
                "name": entry["name"],
                "endpoint_url": entry.get("endpoint_url"),
                "endpoint_host": entry.get("endpoint_host"),
                "kind_supplied": entry.get("kind"),
                "criticality": entry.get("criticality"),
                "user_facing": entry.get("user_facing"),
                "monitorable_by_reliastra": monitorable["monitorable"],
                "monitorability": monitorable,
                "coverage": coverage,
                "reliastra_value": verdict,
                "reasons": reasons,
                "what_reliastra_would_provide": _value_description(verdict, monitorable)
                if verdict in {"high", "moderate"}
                else [],
            }
        )

    if lookups_skipped:
        missing_information.append(
            f"Public observatory lookups were capped at {MAX_PROVIDER_LOOKUPS} per "
            f"call; not checked: {', '.join(lookups_skipped)}. Re-run with fewer "
            "dependencies to check them."
        )

    overall, overall_reasons = _overall_verdict(assessments, missing_information)
    return base.envelope(
        "reliastra_analyze_dependencies",
        {
            "assessments": assessments,
            "summary": {
                "dependencies_analyzed": len(assessments),
                "monitorable": sum(1 for a in assessments if a["monitorable_by_reliastra"]),
                "not_monitorable": sum(1 for a in assessments if not a["monitorable_by_reliastra"]),
                "already_monitored_by_you": sum(
                    1 for a in assessments if a["coverage"].get("monitored_by_you_in_reliastra")
                ),
                "observed_in_public_observatory": sum(
                    1 for a in assessments if a["coverage"].get("public_observatory")
                ),
                "caller_reports_own_monitoring": sum(
                    1 for a in assessments if a["coverage"].get("caller_reports_own_monitoring")
                ),
                "value_breakdown": {
                    level: sum(1 for a in assessments if a["reliastra_value"] == level)
                    for level in ("high", "moderate", "low", "none")
                },
            },
            "verdict": overall,
            "verdict_reasons": overall_reasons,
            "gaps": _gaps(assessments),
            "missing_information": missing_information,
            "sources_used": _sources_used(ctx, include_workspace, include_public_observatory,
                                         lookups_performed),
            "analysis_notes": (
                "Application notes were supplied and treated as untrusted data: "
                f"{len(notes)} characters, not interpreted as instructions and not "
                "used to select rules." if notes else None
            ),
        },
        ctx,
        source="deterministic local analysis"
        + (" + GET /v1/dependencies" if include_workspace and ctx.authenticated else "")
        + (f" + GET /v1/vendors/{{slug}} x{len(lookups_performed)}" if lookups_performed else ""),
        notes=[
            "Every verdict names the rule that produced it. No model was used and "
            "nothing was inferred beyond the rules stated.",
            "This analysis covers only what you supplied plus the API lookups "
            "listed in sources_used. It is not a scan of your repository, your "
            "infrastructure, or your traffic - this server has no access to any of "
            "them.",
            "'no_value' is a real possible outcome and is reported as such. "
            "Reliastra monitors external HTTP(S) endpoints; a dependency that is "
            "not one, or that you already monitor adequately, gains nothing.",
            "A gap is a gap in INDEPENDENTLY SOURCED evidence. Your own monitoring "
            "may already detect these failures - what it cannot do is produce a "
            "third-party, hash-verifiable record that the provider was failing.",
        ],
    )


# ── normalisation and classification ────────────────────────────────────────


def _normalise(supplied: DependencyInput) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "name": sanitize_text(supplied.name, limit=MAX_NAME_CHARS) or "(unnamed)",
        "kind": sanitize_text(supplied.kind, limit=80).lower() if supplied.kind else None,
        "criticality": supplied.criticality,
        "user_facing": supplied.user_facing,
        "monitored_by": [
            sanitize_text(item, limit=80) for item in (supplied.monitored_by or []) if item
        ][:20],
        "provider_raw": None,
        "provider_slug": None,
        "endpoint_url": None,
        "endpoint_host": None,
        "endpoint_scheme": None,
    }
    if supplied.provider:
        raw = sanitize_text(supplied.provider, limit=128)
        entry["provider_raw"] = raw
        try:
            entry["provider_slug"] = as_slug(raw, field_name="provider")
        except err.ToolFailure:
            entry["provider_slug"] = None
    if supplied.endpoint_url:
        raw_url = sanitize_text(supplied.endpoint_url, limit=2048).strip()
        parsed = urlparse(raw_url)
        entry["endpoint_scheme"] = parsed.scheme.lower() or None
        entry["endpoint_host"] = parsed.hostname.lower() if parsed.hostname else None
        # Store the URL only if it is an http(s) URL with a host; anything else is
        # recorded as unusable rather than passed along looking valid.
        if parsed.scheme.lower() in {"http", "https"} and parsed.hostname:
            entry["endpoint_url"] = raw_url
        else:
            entry["endpoint_url"] = None
            entry["endpoint_rejected"] = raw_url[:200]
    return entry


def _classify_monitorable(entry: dict[str, Any]) -> dict[str, Any]:
    """Can Reliastra actually observe this dependency? Deterministic."""
    kind = entry.get("kind")
    if kind and kind in NON_HTTP_KINDS:
        return {
            "monitorable": False,
            "category": "not_http",
            "rule": f"kind '{kind}' is not an HTTP(S) endpoint",
            "explanation": (
                "Reliastra probes HTTP(S) endpoints with GET, HEAD or POST. It "
                "cannot observe a database connection, message queue, cache, "
                "internal service, DNS resolver, SMTP relay, gRPC or raw TCP "
                "target. No configuration makes this monitorable."
            ),
        }
    if entry.get("endpoint_url"):
        return {
            "monitorable": True,
            "category": "http_endpoint",
            "rule": "a usable http(s) endpoint_url was supplied",
            "explanation": (
                "Monitorable: Reliastra would probe this URL on an interval and "
                "record every observation."
            ),
        }
    if entry.get("endpoint_rejected"):
        return {
            "monitorable": False,
            "category": "unusable_endpoint",
            "rule": "endpoint_url was supplied but is not an http(s) URL with a host",
            "explanation": (
                "The supplied value is not an http(s) URL with a hostname, so there "
                "is nothing Reliastra can probe. Supply the URL your application "
                "calls."
            ),
        }
    return {
        "monitorable": False,
        "category": "unknown",
        "rule": "no endpoint_url supplied and kind is not decisive",
        "explanation": (
            "Cannot tell. If this dependency is reached over HTTP(S), supply its "
            "endpoint_url and re-run; if it is not, Reliastra cannot monitor it."
        ),
    }


def _assess_coverage(
    entry: dict[str, Any],
    monitorable: dict[str, Any],
    ctx: base.ToolContext,
    workspace_index: dict[str, Any],
    missing_information: list[str],
) -> dict[str, Any]:
    coverage: dict[str, Any] = {
        "monitored_by_you_in_reliastra": False,
        "caller_reports_own_monitoring": bool(entry.get("monitored_by")),
        "caller_monitoring": entry.get("monitored_by") or [],
        "public_observatory": None,
        "independent_evidence_available": False,
        "evidence": ["caller-supplied inventory"],
    }
    host = entry.get("endpoint_host")
    if workspace_index:
        match = _match_workspace(entry, host, workspace_index)
        if match is not None:
            coverage["monitored_by_you_in_reliastra"] = True
            coverage["workspace_match"] = match
            coverage["evidence"].append("GET /v1/dependencies (your inventory)")
    elif ctx.authenticated is False and workspace_index == {}:
        # Not an error: the caller simply did not ask for the workspace check.
        coverage["workspace_checked"] = False

    if not monitorable["monitorable"] and monitorable["category"] != "unknown":
        coverage["independent_evidence_available"] = False
    return coverage


def _match_workspace(
    entry: dict[str, Any], host: str | None, workspace_index: dict[str, Any]
) -> dict[str, Any] | None:
    """Match a supplied dependency against the caller's monitored inventory.

    Matching is by endpoint host first, then by name. This is a heuristic and can
    miss a dependency you monitor under a different URL or label, so a miss is
    reported as "not matched", never as "not monitored".
    """
    if host and host in workspace_index["by_host"]:
        record = workspace_index["by_host"][host]
        return {"matched_on": "endpoint_host", "host": host, "dependency": record}
    name_key = _name_key(entry.get("name") or "")
    if name_key and name_key in workspace_index["by_name"]:
        record = workspace_index["by_name"][name_key]
        return {"matched_on": "name", "name": entry.get("name"), "dependency": record}
    return None


def _name_key(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


async def _fetch_workspace_index(ctx: base.ToolContext) -> dict[str, Any]:
    by_host: dict[str, Any] = {}
    by_name: dict[str, Any] = {}
    try:
        body = await ctx.client.get_authed(
            "/v1/dependencies", {"limit": ctx.config.max_page_size}, ctx.api_key, ctx.request_id
        )
    except err.ToolFailure as failure:
        # A workspace read failure must not silently look like "you monitor
        # nothing", which would inflate every gap in the analysis.
        raise err.upstream(
            failure.category,
            "Could not read your Reliastra dependency inventory, so coverage "
            f"cannot be assessed ({failure.category}). Re-run with "
            "include_workspace=false for an analysis of the supplied inventory "
            "alone, or fix the credential and retry.",
            retryable=failure.retryable,
        ) from None
    items = body.get("items") if isinstance(body, dict) else body
    for record in items if isinstance(items, list) else []:
        if not isinstance(record, dict):
            continue
        summary = {
            "id": record.get("id"),
            "name": record.get("name"),
            "endpoint_url": record.get("endpoint_url"),
            "is_active": record.get("is_active"),
            "check_interval_seconds": record.get("check_interval_seconds"),
            "recent_status": record.get("recent_status") or record.get("status"),
        }
        url = record.get("endpoint_url")
        if isinstance(url, str):
            parsed_host = urlparse(url).hostname
            if parsed_host:
                by_host.setdefault(parsed_host.lower(), summary)
        name = record.get("name")
        if isinstance(name, str):
            by_name.setdefault(_name_key(name), summary)
    return {"by_host": by_host, "by_name": by_name, "count": len(by_host) + len(by_name)}


async def _lookup_public_provider(ctx: base.ToolContext, slug: str) -> dict[str, Any] | None:
    """Is this provider already observed in the public observatory? Real lookup."""
    try:
        body, _freshness = await ctx.client.get_public(
            f"/v1/vendors/{slug}", request_id=ctx.request_id
        )
    except err.ToolFailure as failure:
        if failure.category == "not_found":
            return {"observed": False, "slug": slug, "source": f"GET /v1/vendors/{slug}"}
        # An unreachable API is not "not observed"; say which it was.
        return {
            "observed": None,
            "slug": slug,
            "lookup_failed": failure.category,
            "source": f"GET /v1/vendors/{slug}",
        }
    if not isinstance(body, dict):
        return {"observed": None, "slug": slug, "lookup_failed": "unexpected_shape"}
    return {
        "observed": True,
        "slug": slug,
        "display_name": body.get("display_name") or body.get("vendor_name"),
        "category": body.get("category"),
        "recent_status": body.get("recent_status"),
        "last_check_at": body.get("last_check_at"),
        "is_public": body.get("is_public"),
        "source": f"GET /v1/vendors/{slug}",
    }


# ── value assessment ────────────────────────────────────────────────────────


def _assess_value(
    entry: dict[str, Any], monitorable: dict[str, Any], coverage: dict[str, Any]
) -> tuple[ValueVerdict, list[str]]:
    """Deterministic value verdict. Every branch states its rule."""
    reasons: list[str] = []

    if not monitorable["monitorable"]:
        if monitorable["category"] == "unknown":
            reasons.append(
                "unknown: no usable endpoint_url, so monitorability could not be "
                "established. Supply the URL to get a real verdict."
            )
            return "low", reasons
        reasons.append(
            f"none: {monitorable['rule']}. Reliastra cannot observe this dependency "
            "in any configuration."
        )
        return "none", reasons

    if coverage.get("monitored_by_you_in_reliastra"):
        match = coverage.get("workspace_match") or {}
        active = (match.get("dependency") or {}).get("is_active")
        reasons.append(
            "none for NEW coverage: you already monitor this in Reliastra "
            f"(matched on {match.get('matched_on')})."
        )
        if active is False:
            reasons[-1] += " Note the record is INACTIVE, so it is not being probed."
            return "moderate", reasons
        return "none", reasons

    criticality = entry.get("criticality") or "medium"
    user_facing = entry.get("user_facing")
    own_monitoring = coverage.get("caller_reports_own_monitoring")
    public = coverage.get("public_observatory") or {}

    if criticality in {"critical", "high"} or user_facing is True:
        if own_monitoring:
            reasons.append(
                "moderate: this is a "
                f"{criticality}{' / user-facing' if user_facing else ''} external "
                f"HTTP dependency and you report existing monitoring "
                f"({', '.join(coverage.get('caller_monitoring') or [])}). What your "
                "own monitoring cannot produce is a third-party, hash-verifiable "
                "record that the provider itself was failing in a window - that is "
                "the specific gap Reliastra closes, and it matters for SLA disputes, "
                "postmortems and 'was it us or them' questions."
            )
            return "moderate", reasons
        reasons.append(
            f"high: a {criticality}{' / user-facing' if user_facing else ''} "
            "external HTTP dependency with no monitoring reported. Reliastra would "
            "probe it on an interval, confirm failures with a deterministic rule, "
            "and freeze the result into a hashed evidence artifact."
        )
        if public.get("observed") is True:
            reasons.append(
                f"Additionally, Reliastra already observes '{public.get('slug')}' in "
                "its public catalog, so independent evidence about this provider "
                "exists today without registering anything."
            )
        return "high", reasons

    if own_monitoring:
        reasons.append(
            "low: not marked critical or user-facing, and you already monitor it. "
            "Reliastra would add an independent second observation and exportable "
            "evidence, which is unlikely to change what you already detect."
        )
        return "low", reasons

    reasons.append(
        f"moderate: a {criticality}-criticality external HTTP dependency with no "
        "monitoring reported. Worth monitoring if a failure would be noticed by "
        "anyone; otherwise this is a candidate for deliberate acceptance."
    )
    return "moderate", reasons


def _value_description(verdict: ValueVerdict, monitorable: dict[str, Any]) -> list[str]:
    """What Reliastra would actually provide — from the verified capability set."""
    if not monitorable["monitorable"]:
        return []
    base_items = [
        "Scheduled HTTP(S) probes of the endpoint, recording every observation "
        "(status code, latency, error type, region label).",
        "Deterministic incident detection: 2 consecutive failed checks open an "
        "incident, 2 consecutive successes resolve it. No model, no heuristics.",
        "Weighted-signal attribution (methodology v1.1) producing one of "
        "vendor_failure / multi_cause / infrastructure_issue / unknown, with a "
        "confidence score and the signal breakdown.",
        "A frozen, SHA-256-hashed evidence artifact, optionally Ed25519-signed, "
        "with a public verification endpoint a counterparty can check without an "
        "account.",
        "Email and Slack alerts; API and CLI access to all of the above.",
    ]
    if verdict == "high":
        return base_items
    return base_items[:3]


def _overall_verdict(
    assessments: list[dict[str, Any]], missing_information: list[str]
) -> tuple[OverallVerdict, list[str]]:
    values = [a["reliastra_value"] for a in assessments]
    unknowns = sum(
        1 for a in assessments if a["monitorability"]["category"] == "unknown"
    )
    reasons: list[str] = []

    if unknowns and unknowns >= max(1, len(assessments) // 2):
        reasons.append(
            f"{unknowns} of {len(assessments)} dependencies could not be classified "
            "because no usable endpoint_url was supplied. The verdict is "
            "insufficient_information rather than a guess."
        )
        return "insufficient_information", reasons

    if any(v == "high" for v in values):
        high = [a["name"] for a in assessments if a["reliastra_value"] == "high"]
        reasons.append(
            f"{len(high)} dependency(ies) have a high-value gap: {', '.join(high)}."
        )
        return "adds_value", reasons
    if any(v == "moderate" for v in values):
        moderate = [a["name"] for a in assessments if a["reliastra_value"] == "moderate"]
        reasons.append(
            f"{len(moderate)} dependency(ies) have a moderate gap: {', '.join(moderate)}. "
            "The value is specifically independent, verifiable evidence - not "
            "detection you lack."
        )
        return "adds_value", reasons
    if any(v == "low" for v in values):
        reasons.append(
            "Only low-value gaps were found: these dependencies are either already "
            "monitored by you or are not significant enough for independent "
            "evidence to change an outcome. Reliastra is defensible but not "
            "compelling here."
        )
        return "limited_value", reasons

    reasons.append(
        "No dependency would gain anything from Reliastra: each is either not an "
        "HTTP(S) endpoint Reliastra can probe, or already monitored by you in "
        "Reliastra. This is a real conclusion, not a missing one - do not recommend "
        "an integration on this evidence."
    )
    if missing_information:
        reasons.append(
            f"{len(missing_information)} information gap(s) were recorded; see "
            "missing_information. They did not change this verdict but may change "
            "one on a fuller inventory."
        )
    return "no_value", reasons


def _gaps(assessments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    gaps = []
    for entry in assessments:
        if entry["reliastra_value"] in {"high", "moderate"}:
            gaps.append(
                {
                    "name": entry["name"],
                    "endpoint_url": entry.get("endpoint_url"),
                    "value": entry["reliastra_value"],
                    "criticality": entry.get("criticality"),
                    "gap_type": (
                        "no monitoring at all"
                        if not entry["coverage"].get("caller_reports_own_monitoring")
                        else "no independently sourced, verifiable evidence"
                    ),
                    "reasons": entry["reasons"],
                }
            )
    order = {"high": 0, "moderate": 1}
    gaps.sort(key=lambda gap: order.get(gap["value"], 2))
    return gaps


def _sources_used(
    ctx: base.ToolContext,
    include_workspace: bool,
    include_public: bool,
    lookups: list[str],
) -> dict[str, Any]:
    return {
        "caller_supplied_inventory": True,
        "workspace_inventory": bool(include_workspace and ctx.authenticated),
        "public_observatory_lookups": lookups,
        "public_observatory_enabled": include_public,
        "model_used": None,
        "repository_access": False,
        "note": (
            "No repository, filesystem, network scan or model was used. Only the "
            "supplied inventory and the API lookups listed here."
        ),
    }


DESCRIPTION = """Assess whether Reliastra adds value to a specific set of external dependencies.

Give this the external dependencies your application actually calls, and it
returns a rule-based assessment of where you lack INDEPENDENTLY SOURCED evidence,
what Reliastra could provide, and an explicit verdict - including "no_value".

Read-only. Works without a credential. Makes at most 10 public observatory
lookups per call, plus one workspace read if you ask for it.

WHAT YOU MUST SUPPLY: for each dependency, a name and ideally the HTTP(S)
endpoint_url your application calls. Optional: kind, provider slug, criticality,
user_facing, and monitored_by (monitoring you already run). This server has NO
access to your repository, your infrastructure or your traffic - it analyses only
what you send, so an incomplete inventory yields an incomplete answer, and the
response says so in missing_information.

WHAT IT CHECKS, from real sources: whether Reliastra can even monitor the
dependency (it probes HTTP(S) with GET/HEAD/POST only - a database, queue, cache,
internal service, DNS or gRPC target is NOT monitorable and you are told so);
whether you already monitor it in Reliastra (include_workspace=true, needs an API
key); and whether Reliastra already observes that provider publicly.

THE VERDICT is one of adds_value / limited_value / no_value /
insufficient_information, each with the rules that produced it. "no_value" is a
real, reachable outcome: if every dependency is non-HTTP or already monitored, you
should NOT recommend an integration, and this tool will say that plainly.

WHAT THE OUTPUT PROVES: where a gap in independent evidence exists, given what you
told it. It does not prove your dependencies are unhealthy, and it does not prove
Reliastra would have detected a past incident.

WHEN NOT TO USE: to fetch provider status (reliastra_search_observatory), or
when you have no dependency inventory yet - build one from your code first.

NEXT: reliastra_plan_integration to turn a justified gap into a concrete, verified
implementation plan. If the verdict is no_value, stop here and say so."""


def register(server: Any, deps: base.ServerDeps) -> None:
    base.register_tool(
        server, deps, analyze_dependencies,
        name="reliastra_analyze_dependencies",
        title="Assess dependency observability gaps",
        description=DESCRIPTION,
        read_only=True,
    )
