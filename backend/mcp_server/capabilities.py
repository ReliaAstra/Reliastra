"""Verified capability registry.

Every claim here is transcribed from the deployed product — backend config,
frontend product contract, and CLI help — not from marketing copy. Values are
literals (with a comment pointing at the source) so drift is reviewable, and
``test_mcp_capabilities.py`` pins the load-bearing ones.

The registry is permission-aware: unauthenticated callers see public
capabilities only; callers with an API key additionally see workspace and
mutation operations. It never lists anything the caller cannot actually do.
"""

from __future__ import annotations

from typing import Any

# Sources (verify before changing any literal below):
# - topology/interval/detection: backend/app/config.py (OBSERVATION_TOPOLOGY,
#   CHECK_SCHEDULE_SECONDS, SINGLE_TOPOLOGY_FAILURE_CHECKS), frontend
#   src/lib/product-contract.ts + methodology.ts
# - attribution: backend/app/modules/attribution/service.py, METHODOLOGY v1.1
# - evidence: backend/app/config.py (REPORT_TOKEN_TTL_DAYS,
#   PUBLIC_INCIDENT_WINDOW_DAYS), EVIDENCE_SCHEMA_VERSION 2.0
# - pricing/plans: frontend/src/lib/dashboard/plans.ts (pro == "Developer")
# - rate limits: backend/app/platform/web/rate_limit.py
# - endpoints/CLI: backend/app/bootstrap/routers.py, cli/cmd/reliastra/*.go

PRODUCT_ONE_LINE = (
    "Reliastra observes the world's external infrastructure and turns "
    "distributed observations into evidence."
)

METHODOLOGY = {
    "observation_points": 1,
    "observation_label": "us-east",
    "default_check_interval_s": 300,
    "detection": {
        "rule_id": "single.consecutive_failures",
        "recovery_rule_id": "single.consecutive_successes",
        "failure_checks": 2,
        "recovery_checks": 2,
        "note": (
            "2 consecutive failed checks open an incident, 2 consecutive "
            "successes resolve it. Quorum rules are not deployed."
        ),
    },
    "attribution": {
        "methodology_version": "v1.1",
        "signals": {
            "temporal_overlap": 0.20,
            "endpoint_overlap": 0.25,
            "latency_correlation": 0.25,
            "error_pattern": 0.15,
            "infrastructure_baseline": 0.15,
        },
        "thresholds": {"vendor_failure": 75, "multi_cause": 50},
        "unknown_is_valid_result": True,
        "correlation_is_not_causation": True,
    },
    "evidence": {
        "hash": "SHA-256",
        "signature": "Ed25519",
        "schema_version": "2.0",
        "public_window_days": 365,
        "report_download_token_ttl_days": 7,
    },
}

PRICING = {
    "plan": "Developer",
    "price_usd_per_month": 9,
    "billing": "monthly only, 14-day trial, no payment method to start",
    "limits": {
        "dependencies": 25,
        "team_members": 1,
        "min_check_interval_s": 30,
        "retention_days": 90,
        "alerts": ["email", "slack"],
    },
    "includes": [
        "api_access",
        "deterministic_attribution",
        "evidence_generation",
        "historical_analysis",
    ],
}

PUBLIC_OPERATIONS = [
    {
        "name": "search_vendors",
        "method": "GET /v1/vendors",
        "auth": False,
        "what": "paginated public vendor catalog",
    },
    {
        "name": "get_vendor",
        "method": "GET /v1/vendors/{vendor}",
        "auth": False,
        "what": "vendor detail, endpoints, recent status",
    },
    {
        "name": "get_vendor_metrics",
        "method": "GET /v1/vendors/{vendor}/metrics",
        "auth": False,
        "what": "per-window availability and latency aggregates",
    },
    {
        "name": "get_vendor_timeline",
        "method": "GET /v1/vendors/{vendor}/timeline",
        "auth": False,
        "what": "observation time series for a window",
    },
    {
        "name": "search_public_incidents",
        "method": "GET /v1/public/incidents",
        "auth": False,
        "what": "observed vendor incidents, filterable",
    },
    {
        "name": "get_public_incident",
        "method": "GET /v1/public/incidents/{id}",
        "auth": False,
        "what": "incident detail incl. evidence descriptor",
    },
    {
        "name": "verify_evidence",
        "method": "GET /v1/verify/{verification_id}",
        "auth": False,
        "what": "independent verification verdict for a record",
    },
]

AUTHENTICATED_OPERATIONS = [
    {
        "name": "list_dependencies",
        "method": "GET /v1/dependencies",
        "auth": True,
        "what": "caller's own monitored dependencies",
    },
    {
        "name": "get_dependency",
        "method": "GET /v1/dependencies/{id}",
        "auth": True,
        "what": "one dependency incl. recent results/history",
    },
    {
        "name": "list_incidents",
        "method": "GET /v1/incidents",
        "auth": True,
        "what": "caller's incidents",
    },
    {
        "name": "get_incident",
        "method": "GET /v1/incidents/{id}",
        "auth": True,
        "what": "incident detail incl. evidence link",
    },
    {
        "name": "list_evidence",
        "method": "GET /v1/evidence",
        "auth": True,
        "what": "caller's evidence reports",
    },
    {
        "name": "get_evidence",
        "method": "GET /v1/evidence/{id}",
        "auth": True,
        "what": "one evidence report",
    },
    {
        "name": "register_dependency",
        "method": "POST /v1/dependencies (writes; never retried)",
        "auth": True,
        "what": "monitor a new HTTP endpoint",
    },
    {
        "name": "trigger_check_run",
        "method": "POST /v1/checks/run (writes; never retried)",
        "auth": True,
        "what": "run an immediate check for a dependency",
    },
]

INTEGRATIONS = {
    "rest_api": {
        "base_url": "https://api.reliastra.com",
        "auth": "X-API-Key: rel_... (organization is pinned to the key)",
        "docs": "https://reliastra.com/docs/api",
    },
    "cli": {
        "install": "pip install reliastra / npm i -g reliastra (thin wrappers)",
        "verified_commands": [
            "reliastra login",
            "reliastra doctor",
            "reliastra whoami",
            "reliastra deps list|show|add|rm",
            "reliastra checks recent",
            "reliastra incidents list|show|correlate",
            "reliastra evidence list|show|get",
            "reliastra verify",
            "reliastra keys list|create|rm",
            "reliastra obs list|show",
        ],
        "docs": "https://reliastra.com/docs/cli",
    },
    "note": (
        "There is no Reliastra GitHub Action. CI integration means "
        "calling the REST API or CLI from the caller's own workflow."
    ),
}

LIMITATIONS = [
    "1 observation point today (us-east). No regional quorum is claimed.",
    "Region labels are scheduling labels, not independent vantage points.",
    "Default check cadence is 300s; faster cadences depend on plan.",
    "Attribution below 50 is 'unknown' — a valid result, not an error.",
    "Vendor-level evidence never proves a specific application request failed.",
    "Public endpoints are rate-limited; back off on 429.",
]

CREDENTIALS = {
    "api_key": {
        "format": "rel_... (X-API-Key header or Authorization: Bearer)",
        "created_by": "reliastra keys create / console /settings/developer",
        "scopes": "least-privilege scopes; writes need write scope",
        "tenant": "organization is pinned to the key — cross-org access is impossible",
    }
}


def build_capabilities(authenticated: bool) -> dict[str, Any]:
    """Permission-aware capability document. JSON-serializable."""
    operations = list(PUBLIC_OPERATIONS)
    if authenticated:
        operations += AUTHENTICATED_OPERATIONS
    return {
        "product": PRODUCT_ONE_LINE,
        "methodology": METHODOLOGY,
        "pricing": PRICING,
        "authenticated_caller": authenticated,
        "operations": operations,
        "integrations": INTEGRATIONS,
        "credentials": CREDENTIALS
        if authenticated
        else {
            "note": (
                "No credential supplied: workspace and mutation operations "
                "are hidden. Provide a Reliastra API key to unlock them."
            )
        },
        "limitations": LIMITATIONS,
        "docs": {
            "methodology": "https://reliastra.com/docs/methodology",
            "verification": "https://reliastra.com/docs/verification",
            "quickstart": "https://reliastra.com/docs/quickstart",
        },
    }
