"""Verified capability registry — the authoritative catalog of what Reliastra does.

Every literal here is transcribed from the deployed product and pinned by
``tests/unit/mcp/test_capability_contract.py``, which imports the backend modules
and asserts the two agree. If the backend changes, that test fails; the registry
cannot drift into claiming something the product does not do. This mirrors the
existing convention in ``frontend/src/lib/product-contract.ts`` and its test.

Sources (verify before changing any literal):

==========================================  ==========================================
Observation topology / detection rule        ``app/config.py`` (OBSERVATION_TOPOLOGY,
                                             SINGLE_TOPOLOGY_FAILURE_CHECKS,
                                             CHECK_SCHEDULE_SECONDS, CHECK_WORKER_REGION),
                                             ``app/modules/checks/detection.py``
Attribution weights, thresholds, version     ``app/modules/attribution/service.py``
Evidence hashing / signing / schema          ``app/modules/evidence/generation.py``,
                                             ``app/modules/evidence/signing.py``
Plan limits and API-access entitlement       ``app/platform/commercial/entitlements.py``
Operation paths, params, scopes              ``app/bootstrap/routers.py`` and each
                                             module's ``router.py``; scopes from
                                             ``app/api/deps.py::_infer_scope``
Rate limits                                  ``app/platform/web/rate_limit.py``
CLI commands and flags                       ``cli/cmd/reliastra/help.go``
==========================================  ==========================================

Values that describe *live* state rather than the product contract — pricing, and
whether the check pipeline is currently healthy — are **not** hardcoded as facts.
``build_capabilities`` accepts them as arguments so the tool can fetch them from
``GET /v1/pricing`` and ``GET /v1/checks/health``; the static block below is an
explicitly-labelled fallback, and the envelope says which one was used.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

PRODUCT_ONE_LINE = (
    "Reliastra observes the world's external infrastructure and turns "
    "distributed observations into evidence."
)

PRODUCT_LONG = (
    "Reliastra probes external HTTP dependencies (APIs you call) on a schedule, "
    "records every observation, opens an incident when a deterministic rule "
    "confirms a failure, attributes the incident with a weighted signal model, "
    "and freezes the result into a hashed, optionally Ed25519-signed evidence "
    "artifact that a third party can verify without trusting Reliastra. A public "
    "observatory publishes the same data for a catalog of well-known providers."
)

# ── Methodology ─────────────────────────────────────────────────────────────
# These are the load-bearing claims. Do not edit without reading the sources
# listed in the module docstring; the contract test will fail if you drift.

METHODOLOGY: dict[str, Any] = {
    "observation_topology": "single",
    "observation_points": 1,
    "deployed_observation_region": "us-east",
    "allowed_region_labels": ["us-east", "eu-west", "ap-south", "sa-east"],
    "region_labels_are_not_vantage_points": (
        "The four region labels are scheduling labels accepted by the API. Only "
        "one observation point is deployed (OBSERVATION_TOPOLOGY=single, one "
        "worker host), so a label does not prove an independent vantage point "
        "and no regional quorum is claimed."
    ),
    "detection": {
        "failure_rule_id": "single.consecutive_failures",
        "recovery_rule_id": "single.consecutive_successes",
        "consecutive_failures_to_open": 2,
        "deterministic": True,
        "quorum_rules_deployed": False,
        "quorum_rules_defined_but_unused": {
            "ids": ["multi.observation_quorum", "multi.recovery_quorum"],
            "min_regions": 2,
            "window_seconds": 60,
            "why_unused": "Requires OBSERVATION_TOPOLOGY=multi, i.e. genuinely independent points.",
        },
        "note": (
            "2 consecutive failed checks open an incident. The rule is "
            "deterministic: no timing heuristics, no randomness, no model."
        ),
    },
    "cadence": {
        "scheduler_interval_s": 30.0,
        "per_dependency_default_interval_s": 300,
        "per_dependency_configurable_range_s": [1, 86400],
        "plan_minimum_interval_s": {"free": 60, "pro": 30, "enterprise": None},
        "note": (
            "Three different numbers, often confused. Celery Beat dispatches due "
            "checks every CHECK_SCHEDULE_SECONDS (30s). Each dependency has its "
            "own interval, defaulting to 300s. A plan sets the floor: 30s on the "
            "paid plan. The effective observation rate for one dependency is its "
            "own interval."
        ),
    },
    "attribution": {
        "methodology_version": "v1.1",
        "deterministic": True,
        "uses_llm": False,
        "signal_weights": {
            "temporal": 0.20,
            "endpoint_overlap": 0.25,
            "latency_correlation": 0.25,
            "error_pattern": 0.15,
            "infrastructure_baseline": 0.15,
        },
        "classification_thresholds": {"vendor_failure": 75, "multi_cause": 50},
        "classifications": [
            "vendor_failure",
            "multi_cause",
            "infrastructure_issue",
            "unknown",
        ],
        "corroboration_signals": ["temporal", "endpoint_overlap"],
        "max_score_without_corroboration": 55.0,
        "unknown_is_a_valid_result": True,
        "correlation_is_not_causation": True,
        "note": (
            "temporal and endpoint_overlap need a second independent source. With "
            "one observation point watching one dependency both are 0.0, so the "
            "highest reachable score is latency + error_pattern + "
            "infrastructure_baseline = 55.0, below the 75 needed for "
            "vendor_failure. That is deliberate: one probe failing twice is weak "
            "evidence about whose fault an outage is."
        ),
    },
    "evidence": {
        "payload_hash": "SHA-256",
        "signature_algorithm": "Ed25519",
        "schema_version": "2.0",
        "signing_is_optional": True,
        "whole_keyring_published": True,
        "public_incident_window_days": 365,
        "report_download_token_ttl_days": 7,
        "verdict_is_re_derived": (
            "GET /v1/verify/{id} recomputes the verdict from the stored payload on "
            "every request. A check that could not run is reported as null, never "
            "as a pass."
        ),
    },
}

# ── Static pricing fallback ─────────────────────────────────────────────────
# Transcribed from app/platform/commercial/entitlements.py, the single source of
# truth the public /v1/pricing endpoint itself derives from. Prefer fetching the
# live endpoint; use this only when the API is unreachable, and say so.

STATIC_PRICING: dict[str, Any] = {
    "source": "static fallback transcribed from app/platform/commercial/entitlements.py",
    "live": False,
    "plans": {
        "pro": {
            "display_name": "Developer",
            "price_usd_per_month": 9,
            "annual_billing": None,
            "dependency_limit": 25,
            "team_member_limit": 1,
            "min_check_interval_s": 30,
            "retention_days": 90,
            "features": {
                "custom_endpoint_urls": True,
                "email_alerts": True,
                "basic_incident_detection": True,
                "slack_alerts": True,
                "api_access": True,
                "attribution": "deterministic",
                "evidence_generation": True,
                "historical_analysis": True,
            },
        },
        "free": {
            "display_name": "Free",
            "price_usd_per_month": 0,
            "dependency_limit": 3,
            "team_member_limit": 1,
            "min_check_interval_s": 60,
            "retention_days": 1,
            "features": {"api_access": False},
            "note": (
                "Not a marketed tier: the state an account falls back to after its "
                "trial ends without payment. API access is off, so an MCP agent "
                "cannot use authenticated tools on it."
            ),
        },
    },
    "billing": "monthly only, 14-day trial, no payment method required to start",
    "currency_note": "USD list price; the API exposes a currency/FX reference.",
}


@dataclass(frozen=True)
class Operation:
    """One verified Reliastra API operation and how an agent reaches it."""

    name: str
    method: str
    path: str
    auth: bool
    scope: str | None
    mcp_tool: str | None
    what: str
    params: list[str] = field(default_factory=list)
    returns: str = ""
    notes: str = ""

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "name": self.name,
            "method": self.method,
            "path": self.path,
            "auth_required": self.auth,
            "what": self.what,
        }
        if self.scope:
            out["required_scope"] = self.scope
        if self.mcp_tool:
            out["mcp_tool"] = self.mcp_tool
        if self.params:
            out["parameters"] = self.params
        if self.returns:
            out["returns"] = self.returns
        if self.notes:
            out["notes"] = self.notes
        return out


# ── Public operations (no credential) ───────────────────────────────────────

PUBLIC_OPERATIONS: tuple[Operation, ...] = (
    Operation(
        "search_public_vendors", "GET", "/v1/vendors", False, None,
        "reliastra_search_observatory",
        "Cursor-paginated public provider catalog.",
        params=["cursor", "limit (1-100, default 50)", "public"],
        returns="{items: [vendor], next_cursor, has_more}",
        notes="Redis-cached 60s upstream. No text search: filter by category or page.",
    ),
    Operation(
        "list_vendor_categories", "GET", "/v1/vendors/categories", False, None,
        "reliastra_search_observatory",
        "Category taxonomy with per-category public provider counts.",
        returns="{categories: [...]}",
    ),
    Operation(
        "get_vendor_category", "GET", "/v1/vendors/categories/{slug}", False, None,
        "reliastra_search_observatory",
        "One category with its public providers and observed states.",
    ),
    Operation(
        "get_public_vendor", "GET", "/v1/vendors/{vendor_name}", False, None,
        "reliastra_get_provider",
        "Provider detail: identity, endpoints, recent observed status.",
        returns="VendorDetailResponse",
    ),
    Operation(
        "get_public_vendor_history", "GET", "/v1/vendors/{vendor_name}/history", False, None,
        None,
        "Provider availability history.",
        notes="Not exposed as its own MCP tool; reliastra_get_provider_timeline covers the series.",
    ),
    Operation(
        "get_vendor_metrics", "GET", "/v1/vendors/{vendor_name}/metrics", False, None,
        "reliastra_get_provider_metrics",
        "Per-window availability and latency aggregates.",
        params=["window"],
    ),
    Operation(
        "get_vendor_timeline", "GET", "/v1/vendors/{vendor_name}/timeline", False, None,
        "reliastra_get_provider_timeline",
        "Observation time series for a window.",
        params=["window (default 24h)", "resolution (default auto)", "region"],
    ),
    Operation(
        "get_vendor_incidents", "GET", "/v1/vendors/{vendor_name}/incidents", False, None,
        "reliastra_search_incidents",
        "Incidents observed for one provider.",
        params=["limit (1-100, default 50)"],
    ),
    Operation(
        "get_vendor_public_incidents", "GET", "/v1/vendors/{vendor_name}/incidents/public",
        False, None, None,
        "The published-URL incident list for one provider (365-day window).",
        notes="Not exposed separately; use reliastra_search_incidents with vendor=.",
    ),
    Operation(
        "search_public_incidents", "GET", "/v1/public/incidents", False, None,
        "reliastra_search_incidents",
        "Searchable history of incidents Reliastra detected on the public catalog.",
        params=[
            "vendor", "category", "region", "status (open|resolved)", "failure_kind",
            "since", "until", "cursor", "limit (1-50, default 20)",
        ],
        returns="{items: [PublicIncidentSummary], next_cursor, has_more}",
        notes="Redis-cached 60s upstream.",
    ),
    Operation(
        "get_public_incident", "GET", "/v1/public/incidents/{incident_id}", False, None,
        "reliastra_get_public_incident",
        "One public incident with detection provenance and evidence descriptor.",
        returns="PublicIncidentDetailResponse",
        notes=(
            "evidence is null until the freeze processor runs: that means "
            "'artifact not generated yet', not 'unverifiable by design'."
        ),
    ),
    Operation(
        "get_public_incident_evidence", "GET", "/v1/public/incidents/{incident_id}/evidence",
        False, None, "reliastra_get_incident_evidence",
        "The incident's newest frozen evidence document, byte-for-byte.",
        returns="application/json artifact + ETag + version headers",
        notes="404 when no artifact exists yet. A pinned version is also available.",
    ),
    Operation(
        "get_public_incident_evidence_version",
        "GET", "/v1/public/incidents/{incident_id}/evidence/versions/{version}",
        False, None, "reliastra_get_incident_evidence",
        "One pinned evidence version; frozen artifacts never change.",
    ),
    Operation(
        "verify_evidence", "GET", "/v1/verify/{verification_id}", False, None,
        "reliastra_verify_evidence",
        "Independent verification verdict for one evidence artifact.",
        returns="{found, verified, data_hash, authenticity, verification_checks, retention}",
        notes=(
            "Capability is carried by the unguessable id; no account needed. A "
            "degraded database returns 503 with service_degraded=true, never an "
            "empty success. The payload itself is deliberately not returned."
        ),
    ),
    Operation(
        "list_verification_keys", "GET", "/v1/verify/keys", False, None, None,
        "The public Ed25519 signing keyring in JWK form.",
        notes=(
            "The whole keyring, not just the newest key, so a rotation cannot make "
            "previously issued records unverifiable. Not exposed as an MCP tool."
        ),
    ),
    Operation(
        "check_pipeline_health", "GET", "/v1/checks/health", False, None,
        "reliastra_get_pipeline_health",
        "Liveness of the check-execution pipeline (Beat + worker + broker).",
        returns="CheckPipelineHealth; HTTP 503 unless status == 'healthy'",
        notes=(
            "No organization context required: it describes infrastructure, not "
            "tenant data. A 503 body is the answer, not a failure — an empty "
            "check history otherwise looks identical to a quiet provider."
        ),
    ),
    Operation(
        "get_pricing", "GET", "/v1/pricing", False, None, None,
        "The live public plan catalog.",
        notes="Consumed by reliastra_get_capabilities to report pricing as live data.",
    ),
    Operation(
        "get_billing_terms", "GET", "/v1/billing/terms", False, None, None,
        "Canonical cancellation, trial and refund copy.",
    ),
)

# ── Authenticated operations (API key, organization pinned to the key) ──────
# Scopes come from app/api/deps.py::_infer_scope, which is deny-by-default: a
# path not mapped there is unreachable with an API key at all. Every path below
# is mapped. Note that API access itself is a paid-plan entitlement enforced in
# get_current_org, so a key on a Free organization is refused regardless of route.

AUTHENTICATED_OPERATIONS: tuple[Operation, ...] = (
    Operation(
        "list_dependencies", "GET", "/v1/dependencies", True, "read:dependencies",
        "reliastra_list_dependencies",
        "The caller's own monitored dependencies.",
        params=["limit", "cursor"],
        returns="PaginatedResponse[DependencyResponse]",
    ),
    Operation(
        "get_dependency", "GET", "/v1/dependencies/{dep_id}", True, "read:dependencies",
        "reliastra_list_dependencies",
        "One dependency, including recent results and history.",
        notes="Own-organization records only; another tenant's id is a 404.",
    ),
    Operation(
        "get_dependency_results", "GET", "/v1/dependencies/{dep_id}/results", True,
        "read:dependencies", "reliastra_get_dependency_observations",
        "Paginated check results (observations) for one dependency.",
        params=["limit", "cursor"],
    ),
    Operation(
        "get_dependency_history", "GET", "/v1/dependencies/{dep_id}/history", True,
        "read:dependencies", None,
        "Availability history for one dependency.",
    ),
    Operation(
        "list_recent_checks", "GET", "/v1/checks/recent", True, "read:checks",
        "reliastra_get_dependency_observations",
        "Recent observations across the caller's dependencies.",
        params=["limit (1-100, default 50)"],
        returns="[CheckResultResponse]",
    ),
    Operation(
        "get_dependency_check_state", "GET", "/v1/checks/state/{dependency_id}", True,
        "read:checks", None,
        "Where one dependency is in the check pipeline.",
        notes=(
            "Distinguishes successful/target_failed (the provider's problem) from "
            "blocked_by_security_policy/dispatch_failed/scheduler_unavailable "
            "(Reliastra's problem). Not exposed as its own MCP tool."
        ),
    ),
    Operation(
        "list_incidents", "GET", "/v1/incidents", True, "read:incidents",
        "reliastra_list_workspace_incidents",
        "The caller's incidents.",
        params=["status", "severity", "dependency_id", "limit", "cursor"],
        returns="PaginatedResponse[IncidentResponse]",
    ),
    Operation(
        "get_incident", "GET", "/v1/incidents/{inc_id}", True, "read:incidents",
        "reliastra_list_workspace_incidents",
        "One incident in detail.",
    ),
    Operation(
        "get_incident_evidence", "GET", "/v1/incidents/{inc_id}/evidence", True,
        "read:evidence", "reliastra_list_workspace_incidents",
        "The evidence report generated for one incident.",
        notes=(
            "Requires read:evidence, NOT read:incidents: _infer_scope matches the "
            "'/evidence' marker before '/incidents', so the resource is evidence. A "
            "key scoped only to incidents cannot read this route."
        ),
    ),
    Operation(
        "list_evidence", "GET", "/v1/evidence", True, "read:evidence",
        "reliastra_get_evidence_report",
        "The caller's evidence reports.",
        params=["limit (1-100, default 50)"],
        returns="[EvidenceReportResponse]",
    ),
    Operation(
        "get_evidence", "GET", "/v1/evidence/{report_id}", True, "read:evidence",
        "reliastra_get_evidence_report",
        "Evidence report metadata plus a presigned download URL.",
        returns="EvidenceReportDownloadResponse",
        notes=(
            "Metadata and a third-party presigned URL — the right shape for a "
            "browser, the wrong one for an agent. Use the artifact route for bytes."
        ),
    ),
    Operation(
        "download_evidence_artifact", "GET", "/v1/evidence/{report_id}/artifact", True,
        "read:evidence", None,
        "The rendered PDF bytes, streamed to their owner.",
        notes=(
            "Binary. Not exposed as an MCP tool: an agent cannot use PDF bytes, and "
            "the verification record carries the machine-readable facts."
        ),
    ),
    Operation(
        "create_dependency", "POST", "/v1/dependencies", True, "write:dependencies",
        "reliastra_register_dependency",
        "Start monitoring a new HTTP endpoint.",
        params=[
            "name (1-150)", "endpoint_url (http/https)", "method (GET|HEAD|POST)",
            "headers", "expected_status_codes (default [200])",
            "timeout_seconds (1-300, default 10)",
            "check_interval_seconds (1-86400, default 300)",
            "regions (default [us-east])", "alert_threshold_ms", "is_active",
        ],
        notes=(
            "MUTATION. The endpoint URL is SSRF-checked by the backend at probe "
            "time (app/platform/security/ssrf.py): private, loopback and metadata "
            "addresses are refused. Forbidden header names are rejected."
        ),
    ),
    Operation(
        "trigger_check_run", "POST", "/v1/checks/run", True, "write:checks",
        "reliastra_trigger_check",
        "Queue one immediate probe of a dependency.",
        params=["dependency_id (uuid)", "region (optional)"],
        returns="202 {dependency_id, queued: [{region, task_id, state}]}",
        notes=(
            "MUTATION (queues work). Publishes exactly the task Beat publishes, "
            "through the same broker to the same worker with the same SSRF policy. "
            "202 means queued, NOT that the probe ran or succeeded."
        ),
    ),
    Operation(
        "correlate_incident", "POST", "/v1/incidents/{inc_id}/correlate", True,
        "write:incidents", None,
        "Run deterministic attribution for one incident.",
        notes=(
            "MUTATION, and requires the admin role. Not exposed as an MCP tool in "
            "this release: it writes an attribution record, and the read paths "
            "already return attribution results."
        ),
    ),
)

#: Operations that change state. Kept separate so a read-only deployment can drop
#: them entirely and so the registry can state the mutation surface precisely.
MUTATION_OPERATIONS: frozenset[str] = frozenset(
    {"create_dependency", "trigger_check_run", "correlate_incident"}
)

INTEGRATIONS: dict[str, Any] = {
    "rest_api": {
        "base_url_default": "https://api.reliastra.com",
        "auth_headers_accepted": [
            "X-API-Key: rel_...",
            "Authorization: Bearer rel_...",
            "Authorization: ApiKey rel_...",
            "Authorization: rel_...",
        ],
        "organization_header": (
            "X-Organization-ID / Reliastra-Organization is optional for API keys: "
            "the organization is pinned to the key, and sending a different one is "
            "a 403. It is required for interactive JWT sessions."
        ),
        "idempotency": (
            "POST/PATCH accept Idempotency-Key. The response is cached 24h scoped "
            "to the credential, and a concurrent duplicate is answered 409 rather "
            "than executed twice."
        ),
        "correlation": "X-Request-ID and W3C traceparent are accepted and echoed.",
        "error_envelope": '{"error": {"code": ..., "message": ...}}',
        "openapi_schema": (
            "Not published. /openapi.json, /api-docs and /api-redoc are disabled by "
            "EXPOSE_API_SCHEMA=false and refused at the proxy, because enumerating "
            "every authenticated route is an attack-surface map."
        ),
    },
    "cli": {
        "distribution": "Go binary via GoReleaser; thin pip/npm wrappers named 'reliastra'.",
        "install": "pip install reliastra   |   npm install -g reliastra",
        "environment": [
            "RELIASTRA_TOKEN", "RELIASTRA_API_URL", "RELIASTRA_SITE_URL",
            "RELIASTRA_CONFIG", "RELIASTRA_EMAIL", "RELIASTRA_PASSWORD",
        ],
        "global_flags": ["--json", "--quiet", "--api-url", "--site-url", "--token", "--no-persist"],
        "verified_commands": [
            "reliastra login [--email <email>] [--token <api-key>]",
            "reliastra logout",
            "reliastra whoami [--json]",
            "reliastra doctor [--json]",
            "reliastra deps list [--limit 100] [--web]",
            "reliastra deps show <dependency-id> [--observations 20] [--web]",
            "reliastra deps add <name> <url> [--interval 300] [--expect 200] [--method GET] [--timeout 10]",
            "reliastra deps rm <dependency-id> [--yes]",
            "reliastra checks recent [--limit 50] [--dependency <id>]",
            "reliastra incidents list [--status open|resolved] [--limit 25] [--dependency <id>] [--web]",
            "reliastra incidents show <incident-id> [--web] [--json]",
            "reliastra incidents correlate <incident-id> [--json]",
            "reliastra evidence list [--limit 50] [--web]",
            "reliastra evidence show <report-id> [--web] [--json]",
            "reliastra evidence get <report-id> [--out <path>]",
            "reliastra verify <verification-id> [--file <document.pdf>] [--expect-hash <sha256>] [--json]",
            "reliastra keys list [--json]",
            "reliastra keys create <name> [--scopes <list>]",
            "reliastra keys rm <key-id> [--yes]",
            "reliastra obs list [--limit 100] [--json]",
            "reliastra obs show <vendor> [--web] [--json]",
            "reliastra open <incident|evidence|verify|dependency|observatory|docs> [id]",
        ],
        "exit_codes": {
            "0": "Success.",
            "1": "Usage error, or invalid or contradictory configuration.",
            "2": "The API returned an error (validation, not found, upstream failure).",
            "3": "Authentication required, rejected, or expired.",
            "4": "A verification claim did not hold.",
            "5": "Authenticated, but not permitted to do this.",
            "6": "The API could not be reached at all.",
        },
        "default_key_scopes": "read:checks, read:incidents, read:evidence, read:dependencies",
    },
    "github_action": {
        "exists": True,
        "name": "Reliastra Dependency Check",
        "repository": "https://github.com/ReliaAstra/reliastra-action",
        "ref": "v1",
        "published_tags": ("v1", "v1.0.0"),
        "runs": {"using": "node20", "main": "dist/index.js"},
        # The `uses:` value must be owner/repo@ref. Deriving it from the two last
        # path segments of the repository URL is what makes "ReliaAstra/" survive:
        # taking only the final segment produces `uses: reliastra-action@v1`, which
        # GitHub cannot resolve.
        "uses": "ReliaAstra/reliastra-action@v1",
        # Provenance matters: the action lives in a SEPARATE repository, so it is
        # invisible to any grep of this repo's workflows. Transcribed from its own
        # action.yml; re-verify against the tag if this is ever edited.
        "verified_against": (
            "action.yml at tag v1 of ReliaAstra/reliastra-action, fetched 2026-10-13"
        ),
        "inputs": {
            "dependency": {
                "required": True,
                "default": None,
                "summary": (
                    "Dependency UUID when `token` is supplied (authenticated mode), or a "
                    "vendor slug such as `stripe`, `openai` or `cloudflare` when it is not "
                    "(public incident feed mode)."
                ),
            },
            "token": {
                "required": False,
                "default": None,
                "summary": (
                    "Reliastra API key sent as X-API-Key; keys begin with `rel_`. Store as a "
                    "repository secret. Omit it to read the public incident feed instead, "
                    "which needs no credentials but cannot observe private dependencies."
                ),
            },
            "fail-on": {
                "required": False,
                "default": "down",
                "summary": (
                    "Which observations fail the job. Comma-separated, or `any` (everything "
                    "except `up`), or `never`. One of: up, degraded, down, blocked, "
                    "unverified, pipeline-error, stale. A `degraded` observation caused by a "
                    "latency threshold is derived by the action, not a Reliastra status."
                ),
            },
            "base-url": {
                "required": False,
                "default": "https://reliastra.com/api",
                "summary": "Reliastra API root. Change only when self-hosting.",
            },
            "wait-seconds": {
                "required": False,
                "default": "0",
                "summary": (
                    "Seconds to wait for a settled observation before reporting the last "
                    "known state. `0` reports immediately. Reliastra probes on its own "
                    "cadence (typically 300s), so waiting rarely yields a fresher reading."
                ),
            },
            "timeout-seconds": {
                "required": False,
                "default": "30",
                "summary": "Per-request HTTP timeout. Network failures exit 6.",
            },
            "retries": {
                "required": False,
                "default": "2",
                "summary": "Extra attempts for transient failures: network errors, 429 and 5xx.",
            },
            "history-limit": {
                "required": False,
                "default": "40",
                "summary": "Number of past observations fetched for the time-series display.",
            },
            "latency-threshold-ms": {
                "required": False,
                "default": None,
                "summary": (
                    "Latency in ms at or above which a successful observation is reported as "
                    "`degraded`. Overrides the dependency's own alert threshold. Leave empty "
                    "to use `alert_threshold_ms` from the dependency, and to disable "
                    "`degraded` entirely when neither is set."
                ),
            },
            "incident-status": {
                "required": False,
                "default": "all",
                "summary": "Public mode only. Filter the incident feed: all, open or resolved.",
            },
            "result-format": {
                "required": False,
                "default": "text",
                "summary": "`text` for the human report, `json` to also print a machine-readable record.",
            },
            "output-file": {
                "required": False,
                "default": None,
                "summary": (
                    "Write the machine-readable record to this workspace path, e.g. "
                    "`reliastra.json`, so a later step can upload or diff it. Implies the JSON "
                    "payload. A write failure is a warning, never a failed check."
                ),
            },
            "annotate": {
                "required": False,
                "default": "true",
                "summary": "Add a GitHub workflow annotation to the job.",
            },
        },
        "fail_on_values": ("up", "degraded", "down", "blocked", "unverified", "pipeline-error", "stale"),
        "outputs": (
            "verdict", "status", "exit-code", "degraded", "stale", "latency-ms",
            "http-status", "observed-at", "observation-point", "observation-points",
            "pipeline-state", "methodology-version", "evidence-url", "incident-id",
            "attribution-status", "evidence-hash", "matched", "mode", "series-count",
            "series-failures", "series-latencies", "series-outcomes", "summary", "error",
        ),
        "exit_codes": {
            "0": "Success.",
            "1": "Usage error.",
            "2": "The API returned an error.",
            "3": "Authentication required, rejected, or expired.",
            "4": "A verification claim did not hold.",
            "5": "Authenticated, but not permitted to do this.",
            "6": "Network: the API could not be reached.",
            "130": "Cancelled.",
        },
        "modes": ("authenticated", "public"),
        "example": (
            "- uses: ReliaAstra/reliastra-action@v1\n"  # == INTEGRATIONS["github_action"]["uses"]
            "  with:\n"
            "    dependency: <your-dependency-uuid>\n"
            "    token: ${{ secrets.RELIASTRA_TOKEN }}\n"
            "    fail-on: degraded\n"
        ),
        "notes": (
            "Two details an agent must not smooth over. (1) The action's `base-url` default "
            "is https://reliastra.com/api, while the CLI's default API root is "
            "https://api.reliastra.com; both are real and they are not the same string. "
            "(2) `observation_points` is always 1 and `degraded` is derived by the action "
            "from a latency threshold, not returned by Reliastra as a status \u2014 the action "
            "says so in its own metadata, and a plan must not present either as a Reliastra "
            "verdict."
        ),
    },
    "mcp": {
        "exists": True,
        "package": "backend/mcp_server (this server)",
        "transports": ["stdio", "streamable-http"],
        "note": "See resources reliastra://integration-guide for client configuration.",
    },
    "webhooks": {
        "exists": True,
        "note": (
            "Outbound webhook subscriptions exist at /v1/webhooks but are NOT "
            "reachable with an API key: app/api/deps.py::_infer_scope is "
            "deny-by-default and does not map that path. Manage them with an "
            "interactive session. Not exposed over MCP."
        ),
    },
}

CREDENTIALS: dict[str, Any] = {
    "type": "scoped API key",
    "format": "rel_... (min 12 chars)",
    "how_to_create": [
        "reliastra keys create <name> [--scopes <list>]",
        "POST /v1/api-keys (interactive session)",
        "Console: /settings/developer",
    ],
    "scopes_model": (
        "action:resource pairs. A write grant implies read on the same resource. "
        "'*' grants everything. Scopes are checked in app/api/deps.py, which is "
        "deny-by-default: a path with no scope mapping is unreachable by API key."
    ),
    "known_scopes": [
        "read:dependencies", "write:dependencies",
        "read:checks", "write:checks",
        "read:incidents", "write:incidents",
        "read:evidence",
        "read:billing", "write:billing",
        "read:notifications", "write:notifications",
        "read:api_keys", "write:api_keys",
        "read:organizations", "write:organizations",
    ],
    "tenant_isolation": (
        "The organization is pinned to the key. Every request resolves "
        "current_org to api_key.org_id, and a mismatched X-Organization-ID is a "
        "403. Cross-tenant reads are therefore not expressible, and a record "
        "belonging to another organization is a 404 rather than a 403."
    ),
    "plan_entitlement": (
        "API access is a paid-plan entitlement, enforced once in get_current_org "
        "for every programmatic request. A key on an organization without "
        "api_access is refused regardless of route or scope."
    ),
    "rate_limits": {
        "api_key": "1000 requests/min per key (rl_apikey)",
        "public_reads": "300 requests/min per client IP (rl_vendor)",
        "internal_reader": "3000 requests/min for the web app's own reader identity",
        "manual_check_trigger": "limited separately; it is a diagnostic, not a data path",
        "behaviour": (
            "Sliding window in Redis, fail-open when Redis is unreachable. A 429 "
            "carries the API's error envelope."
        ),
    },
    "mcp_server_authorization": {
        "model": "bearer pass-through of the Reliastra API key",
        "oauth_resource_server": False,
        "why": (
            "Reliastra operates no MCP OAuth authorization server, so this server "
            "does not publish /.well-known/oauth-protected-resource or dynamic "
            "client registration: advertising them would send clients to endpoints "
            "that do not exist. Credentials are validated authoritatively by the "
            "Reliastra API on every call."
        ),
        "edge_checks": (
            "Credential shape only, before the protocol layer. A missing or "
            "malformed credential is HTTP 401 with WWW-Authenticate: Bearer."
        ),
        "stdio": (
            "RELIASTRA_API_KEY in the process environment. Possession of an MCP "
            "connection or a process id is never treated as authorization."
        ),
        "extension_point": (
            "mcp_server.auth.TokenVerifier: an async (key) -> bool validator an "
            "operator can supply to check credentials authoritatively at the edge."
        ),
    },
}

LIMITATIONS: tuple[str, ...] = (
    "One observation point is deployed (us-east). No regional quorum is claimed, and region labels are scheduling labels.",
    "Detection needs 2 consecutive failed checks, so the fastest possible detection is 2x the dependency's own interval.",
    "Attribution below 50 is 'unknown' — a valid result, not an error or a gap in the data.",
    "With one observation point and no corroborating incident, the maximum attribution score is 55.0, below the 75 required for 'vendor_failure'.",
    "Provider-level evidence never proves that a specific application request failed. It proves the provider was observed failing in a window.",
    "Attribution is a deterministic weighted-signal correlation. It is not a validated causal model.",
    "AI-generated explanations, where enabled, restate pre-computed facts. Attribution itself never uses an LLM.",
    "Public endpoints are rate limited (300/min per IP). Back off on 429.",
    "Authenticated tools require an organization on a paid plan; API access is an entitlement, not a default.",
    "The OpenAPI schema is not published, so an agent cannot enumerate routes from the API; this registry is the machine-readable substitute.",
    "The GitHub Action lives in a separate repository (ReliaAstra/reliastra-action), "
    "so its interface cannot be verified from this codebase; the registry transcribes "
    "its action.yml at tag v1 and records that provenance.",
    "Evidence artifacts are PDF plus a canonical JSON payload; MCP exposes metadata, hashes and the verification verdict, not PDF bytes.",
    "Historical depth is bounded by plan retention (90 days on the paid plan) and by the 365-day public incident window.",
    "This MCP server's own rate limit is instance-local. A fleet needs gateway-level limiting in front of it.",
)

DOCS: dict[str, str] = {
    "docs_root": "https://reliastra.com/docs",
    "api_base": "https://api.reliastra.com",
    "repository": "https://github.com/ReliaAstra/Reliastra",
    "mcp_package": "backend/mcp_server",
    "mcp_docs": "docs/mcp/README.md (in-repository)",
    "backend_architecture": "docs/architecture/OVERVIEW.md",
    "checks_operating_model": "docs/checks-operating-model.md",
    "public_evidence": "docs/intelligence/public-evidence.md",
    "note": (
        "Public documentation URLs are served by the Next.js site under /docs. The "
        "in-repository paths are the authoritative engineering references."
    ),
}


def build_capabilities(
    *,
    authenticated: bool,
    allow_mutations: bool,
    pricing: dict[str, Any] | None = None,
    pipeline_health: dict[str, Any] | None = None,
    server_version: str = "0.1.0",
    protocol_version: str | None = None,
    registered_tools: tuple[str, ...] = (),
) -> dict[str, Any]:
    """Permission-aware capability document. JSON-serialisable.

    Only operations the caller can actually reach are listed: an unauthenticated
    caller sees the public surface; a caller with a credential additionally sees
    the workspace surface; a server started with ``allow_mutations=False`` never
    lists a state-changing operation, because it cannot perform one.
    """
    operations = [op.as_dict() for op in PUBLIC_OPERATIONS]
    if authenticated:
        operations.extend(
            op.as_dict()
            for op in AUTHENTICATED_OPERATIONS
            if allow_mutations or op.name not in MUTATION_OPERATIONS
        )

    document: dict[str, Any] = {
        "server": {
            "name": "reliastra",
            "version": server_version,
            "protocol_version": protocol_version,
            "transports": ["stdio", "streamable-http"],
            "registered_tools": list(registered_tools),
        },
        "product": {
            "one_line": PRODUCT_ONE_LINE,
            "summary": PRODUCT_LONG,
        },
        "authenticated_caller": authenticated,
        "mutations_available": bool(authenticated and allow_mutations),
        "methodology": METHODOLOGY,
        "operations": operations,
        "integrations": INTEGRATIONS,
        "credentials": CREDENTIALS if authenticated else _public_credential_view(),
        "limitations": list(LIMITATIONS),
        "docs": DOCS,
    }
    if pricing is not None:
        document["pricing"] = pricing
    else:
        document["pricing"] = STATIC_PRICING
    if pipeline_health is not None:
        document["pipeline_health"] = pipeline_health
    return document


def scopes_for_tool(tool_name: str) -> tuple[str, ...]:
    """The API-key scopes a tool's operations need, from the same registry.

    Derived rather than restated, so an error message, the capability document
    and the operations table cannot disagree about what a tool requires.
    """
    scopes: list[str] = []
    for operation in (*PUBLIC_OPERATIONS, *AUTHENTICATED_OPERATIONS):
        if operation.mcp_tool == tool_name and operation.scope and operation.scope not in scopes:
            scopes.append(operation.scope)
    return tuple(scopes)


def _public_credential_view() -> dict[str, Any]:
    """What an unauthenticated caller is told about credentials."""
    return {
        "type": CREDENTIALS["type"],
        "format": CREDENTIALS["format"],
        "how_to_create": CREDENTIALS["how_to_create"],
        "mcp_server_authorization": CREDENTIALS["mcp_server_authorization"],
        "note": (
            "No credential was supplied for this call, so workspace and mutation "
            "operations are hidden rather than listed as forbidden. Supply a "
            "Reliastra API key to see them. Scope and plan requirements are "
            "reported once you do."
        ),
    }
