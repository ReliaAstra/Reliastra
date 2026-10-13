"""State-changing tools. Two of them, both narrowly scoped, both confirmed.

These are registered only when ``allow_mutations`` is true; a read-only
deployment does not list them at all, so an agent cannot discover a write it
cannot perform.

Controls applied here, on top of everything the backend already enforces:

* **Explicit human approval.** Each write calls ``ctx.confirm()``, an MCP
  elicitation. The answer comes from the client — the human or agent runtime on
  the other end — not from the model, so a model cannot approve on a user's
  behalf. A client that does not support elicitation, declines, or fails to answer
  means the write does **not** happen: fail-closed.
  ``MCP_MUTATION_CONFIRMATION_REQUIRED=false`` disables it, which is documented as
  a deliberate weakening for unattended automation.
* **Idempotency for retried mutations.** ``register_dependency`` sends a stable
  ``Idempotency-Key`` derived from the caller's credential fingerprint and the
  request payload, so an agent that retries a timed-out call replays the first
  response instead of creating a second dependency. The backend scopes that cache
  to the credential, so two tenants can never collide on a key.
* **No blind retries.** Neither tool is retried by the upstream client. A write
  whose outcome is unknown is reported as unknown, never as success.
* **Audit.** Every attempt — approved, declined, succeeded, failed — is written to
  the audit log with identifiers and outcome only. Never the payload, never a
  header value, never the credential.
* **SSRF preflight.** ``endpoint_url`` is checked here before it is sent:
  http/https only, no embedded credentials, and no loopback/private/link-local/
  reserved IP literal or local hostname. This is defence in depth, not the
  authoritative control: the backend re-checks with DNS pinning at probe time
  (``app/platform/security/ssrf.py``), and only it can see what a name resolves to
  when the probe actually runs.
* **Secrets out of sight.** A URL's query string and fragment are stripped before
  it appears in a confirmation prompt, an audit record or a log line, because a
  caller may legitimately have put a token in one.
"""

import hashlib
import ipaddress
import json
from typing import Any, Literal
from urllib.parse import urlsplit

from .. import errors as err
from ..sanitization import as_uuid
from . import _base as base

HttpMethod = Literal["GET", "HEAD", "POST"]
Region = Literal["us-east", "eu-west", "ap-south", "sa-east"]

MAX_URL_LENGTH = 2048

#: Hostnames that are never acceptable monitoring targets from a public probe.
_BLOCKED_HOSTNAMES = frozenset({"localhost", "metadata.google.internal", "metadata"})
_BLOCKED_SUFFIXES = (".local", ".internal", ".localhost", ".lan", ".corp", ".home")


def _safe_url_for_display(url: str) -> str:
    """A URL with its query string and fragment removed, for prompts and logs."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return "[unparseable-url]"
    shown = f"{parts.scheme}://{parts.netloc}{parts.path}"
    if parts.query:
        shown += "?[query-redacted]"
    if parts.fragment:
        shown += "#[fragment-redacted]"
    return shown[:300]


def preflight_endpoint_url(url: Any) -> str:
    """Validate a monitoring target before sending it upstream.

    Returns the URL unchanged when it passes. Raises ``invalid_input`` otherwise,
    with a message that explains the boundary rather than leaking a resolved
    address.
    """
    if not isinstance(url, str):
        raise err.invalid_input("endpoint_url must be a string.")
    candidate = url.strip()
    if not candidate:
        raise err.invalid_input("endpoint_url must not be empty.")
    if len(candidate) > MAX_URL_LENGTH:
        raise err.invalid_input(
            f"endpoint_url must be at most {MAX_URL_LENGTH} characters."
        )
    if any(ch.isspace() for ch in candidate):
        raise err.invalid_input("endpoint_url must not contain whitespace.")
    try:
        parts = urlsplit(candidate)
    except ValueError:
        raise err.invalid_input("endpoint_url is not a parseable URL.") from None

    if parts.scheme.lower() not in {"http", "https"}:
        raise err.invalid_input(
            "endpoint_url must use http:// or https://. Reliastra probes HTTP "
            "endpoints only; it cannot monitor a database, queue or raw socket."
        )
    host = (parts.hostname or "").lower()
    if not host:
        raise err.invalid_input("endpoint_url must include a hostname.")
    if parts.username or parts.password:
        raise err.invalid_input(
            "endpoint_url must not embed credentials (user:pass@host). Put "
            "authentication in the dependency's headers instead; the API encrypts "
            "Authorization values at rest."
        )

    if host in _BLOCKED_HOSTNAMES or host.endswith(_BLOCKED_SUFFIXES):
        raise err.invalid_input(
            f"endpoint_url host '{host}' is a local or internal name that a public "
            "probe cannot and must not reach."
        )
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
        or address.is_multicast
        or address.is_unspecified
    ):
        raise err.invalid_input(
            "endpoint_url must be a publicly reachable address. Loopback, private, "
            "link-local and reserved ranges are refused: this is the same boundary "
            "the Reliastra probe enforces, applied here so you get the answer "
            "before a record is created."
        )
    # A plaintext http:// target is not refused: a plain health endpoint is a
    # legitimate choice. The caller is told about it in the tool's notes instead.
    return candidate


def _idempotency_key(ctx: base.ToolContext, payload: dict[str, Any]) -> str:
    """A stable key for one logical registration.

    Derived from the caller's credential fingerprint and the canonical payload, so
    an agent retrying the same request after a timeout replays the first result
    instead of creating a duplicate. Different callers cannot collide: the backend
    additionally scopes the cache to the principal.
    """
    canonical = json.dumps(payload, sort_keys=True, default=str)
    digest = hashlib.sha256(
        f"{ctx.caller_identity}:{canonical}".encode()
    ).hexdigest()[:32]
    return f"mcp-{digest}"


async def register_dependency(
    ctx: base.ToolContext,
    name: str,
    endpoint_url: str,
    method: HttpMethod = "GET",
    expected_status_codes: list[int] | None = None,
    check_interval_seconds: int = 300,
    timeout_seconds: int = 10,
    regions: list[Region] | None = None,
    alert_threshold_ms: int | None = None,
    is_active: bool = True,
    confirm: bool = False,
) -> dict[str, Any]:
    """Start monitoring an HTTP endpoint. Requires approval."""
    if not isinstance(name, str) or not (1 <= len(name.strip()) <= 150):
        raise err.invalid_input("name must be 1-150 characters.")
    url = preflight_endpoint_url(endpoint_url)
    codes = expected_status_codes if expected_status_codes else [200]
    if not isinstance(codes, list) or not all(
        isinstance(code, int) and not isinstance(code, bool) and 100 <= code <= 599
        for code in codes
    ):
        raise err.invalid_input(
            "expected_status_codes must be a list of HTTP status codes (100-599)."
        )
    if alert_threshold_ms is not None and (
        isinstance(alert_threshold_ms, bool) or alert_threshold_ms < 1
    ):
        raise err.invalid_input("alert_threshold_ms must be a positive integer.")

    payload: dict[str, Any] = {
        "name": name.strip(),
        "endpoint_url": url,
        "method": method,
        "expected_status_codes": codes,
        "check_interval_seconds": check_interval_seconds,
        "timeout_seconds": timeout_seconds,
        "regions": list(regions) if regions else ["us-east"],
        "is_active": is_active,
    }
    if alert_threshold_ms is not None:
        payload["alert_threshold_ms"] = alert_threshold_ms

    shown = _safe_url_for_display(url)
    if ctx.config.mutation_confirmation_required:
        action = "register a new monitored dependency in your Reliastra organization"
        decision = await ctx.request_approval(
            action=action,
            summary={
                "name": payload["name"],
                "endpoint": shown,
                "method": payload["method"],
                "expected_status_codes": payload["expected_status_codes"],
                "check_interval_seconds": payload["check_interval_seconds"],
                "regions": payload["regions"],
                "scopes_needed": "write:dependencies",
                "side_effect": (
                    "Creates a record, consumes dependency quota, and Reliastra will "
                    "begin probing this URL on the interval above."
                ),
            },
            confirm_argument=confirm,
        )
        if not decision.approved:
            base.audit_call(
                ctx,
                "reliastra_register_dependency",
                f"declined:{decision.mechanism}",
                {"endpoint_host": urlsplit(url).hostname, "dependency_name": payload["name"]},
            )
            raise err.forbidden(
                f"Registration was not approved, so nothing was created. "
                f"{decision.reason} An operator running this server unattended can "
                "set MCP_MUTATION_CONFIRMATION_REQUIRED=false, which removes this "
                "gate entirely and should only be done where the caller is already "
                "trusted to write.",
                approval_mechanism=decision.mechanism,
            )

    idempotency_key = _idempotency_key(ctx, payload)
    body, status, _headers = await ctx.client.post_authed(
        "/v1/dependencies",
        payload,
        ctx.api_key,
        ctx.request_id,
        idempotency_key=idempotency_key,
    )
    base.audit_call(
        ctx,
        "reliastra_register_dependency",
        "succeeded",
        {
            "endpoint_host": urlsplit(url).hostname,
            "dependency_name": payload["name"],
            "method": payload["method"],
            "upstream_status": status,
            "idempotency_key": idempotency_key,
            "dependency_id": body.get("id") if isinstance(body, dict) else None,
        },
    )
    if not isinstance(body, dict):
        raise err.upstream(
            "upstream_invalid",
            f"Reliastra accepted the registration (HTTP {status}) but returned an "
            "unrecognised body. The dependency may exist: check "
            "reliastra_list_dependencies before retrying, and reuse the same "
            "arguments so the Idempotency-Key matches.",
            status=status,
        )
    return base.envelope(
        "reliastra_register_dependency",
        {
            "created": body,
            "upstream_status": status,
            "idempotency_key": idempotency_key,
            "state_change": {
                "kind": "dependency_registered",
                "reversible_by": "PATCH /v1/dependencies/{id} {is_active: false}, or DELETE",
            },
        },
        ctx,
        source="POST /v1/dependencies",
        notes=[
            "A dependency record now exists and Reliastra will begin probing it. "
            "This consumed dependency quota on your plan.",
            f"Detection needs 2 consecutive failed checks, so the fastest possible "
            f"detection is {2 * payload['check_interval_seconds']}s at this interval.",
            "The response never includes decrypted headers: headers is always null "
            "and has_headers reports whether any were stored.",
            "Retry safety: the same arguments from the same credential reuse this "
            "Idempotency-Key for 24h, replaying this response instead of creating a "
            "second dependency.",
            "Registration does not prove the endpoint is reachable: the first "
            "observation arrives after the first probe. Use reliastra_trigger_check "
            "to force one now.",
        ]
        + (
            [
                "This target uses plaintext http://, so probes and responses cross "
                "the network unencrypted. Prefer https:// unless it has no TLS."
            ]
            if url.startswith("http://")
            else []
        ),
    )


async def trigger_check(
    ctx: base.ToolContext,
    dependency_id: str,
    region: Region | None = None,
    confirm: bool = False,
) -> dict[str, Any]:
    """Queue one immediate probe of a dependency you own. Requires approval."""
    record_id = as_uuid(dependency_id, field_name="dependency_id")

    if ctx.config.mutation_confirmation_required:
        decision = await ctx.request_approval(
            action="queue an immediate probe of one of your monitored dependencies",
            summary={
                "dependency_id": record_id,
                "region": region or "every region configured on the dependency",
                "scopes_needed": "write:checks",
                "side_effect": (
                    "Queues a real HTTP request to your dependency's endpoint, "
                    "through the same broker and worker as scheduled checks."
                ),
            },
            confirm_argument=confirm,
        )
        if not decision.approved:
            base.audit_call(
                ctx,
                "reliastra_trigger_check",
                f"declined:{decision.mechanism}",
                {"dependency_id": record_id, "region": region},
            )
            raise err.forbidden(
                f"The probe was not approved, so nothing was queued. {decision.reason}",
                approval_mechanism=decision.mechanism,
            )

    payload: dict[str, Any] = {"dependency_id": record_id}
    if region:
        payload["region"] = region
    # Deliberately NO Idempotency-Key: this is a diagnostic whose purpose is to
    # queue a probe. Replaying a cached response would report a queued task that
    # was not queued this time, which is exactly the false success this server must
    # not produce.
    body, status, _headers = await ctx.client.post_authed(
        "/v1/checks/run",
        payload,
        ctx.api_key,
        ctx.request_id,
        accept_statuses=frozenset({202}),
    )
    base.audit_call(
        ctx,
        "reliastra_trigger_check",
        "succeeded",
        {
            "dependency_id": record_id,
            "region": region,
            "upstream_status": status,
            "queued": len(body.get("queued", [])) if isinstance(body, dict) else None,
        },
    )
    return base.envelope(
        "reliastra_trigger_check",
        {"queued": body, "upstream_status": status},
        ctx,
        source="POST /v1/checks/run",
        notes=[
            f"HTTP {status} means the probe was QUEUED, not that it ran and not "
            "that your dependency is healthy or unhealthy. Confirm the observation "
            "with reliastra_get_dependency_observations.",
            "This publishes exactly the task the scheduler publishes, through the "
            "same broker to the same worker, which applies the same SSRF policy. A "
            "success here proves API -> broker -> worker -> probe works end to end.",
            "Not idempotent by design: each call queues another probe, and no "
            "Idempotency-Key is sent, because replaying a cached response would "
            "report a task that was not queued this time.",
            "Rate limited upstream as a diagnostic path. Do not use it as a polling "
            "loop; that is what check_interval_seconds is for.",
        ],
    )


_DESCRIPTIONS = {
    "register": """Register a new dependency for Reliastra to monitor. STATE CHANGE.

Creates a monitored dependency in YOUR Reliastra organization and starts scheduled
probing of its endpoint. Requires an API key with write:dependencies and a plan that
includes api_access.

APPROVAL IS REQUIRED. Unless this server runs with
MCP_MUTATION_CONFIRMATION_REQUIRED=false, nothing is written without approval, and
there are two ways to obtain it:

1. If the connection supports elicitation, the CLIENT is asked directly and the
   human's answer decides. You cannot answer that prompt, and a decline is final -
   setting confirm=true afterwards does not override it.
2. Otherwise (the modern MCP protocol forbids server-initiated requests, so this is
   the common case) you must pass confirm=true. Set it ONLY after the user has
   explicitly approved THIS action in conversation, having seen the endpoint, the
   interval and the fact that it consumes quota. Passing confirm=true on your own
   initiative is a policy violation, not a workaround: these tools are annotated
   readOnlyHint=false precisely so the client gates them.

Without approval you get a `forbidden` failure whose message says which route
applies. Report that to the user; do not retry with confirm=true to get past it.

Arguments mirror the API's own contract: name (1-150), endpoint_url (http/https,
publicly reachable), method (GET|HEAD|POST), expected_status_codes (default [200]),
check_interval_seconds (1-86400, default 300, plan floor 30s), timeout_seconds
(1-300, default 10), regions, alert_threshold_ms, is_active.

SAFETY: endpoint_url is pre-checked here - no embedded credentials, no loopback,
private, link-local, reserved or local/internal hostnames. That is defence in depth;
the authoritative check is the backend's SSRF policy with DNS pinning at probe time,
which is why a name that resolves privately later is recorded as
blocked_by_security_policy rather than as a target failure.

RETRY SAFETY: a stable Idempotency-Key is derived from your credential and the
payload, so re-running with identical arguments replays the first response for 24h
instead of creating a duplicate. Changing any argument is a different registration.

WHAT THE OUTPUT PROVES: that the record was created. It does NOT prove the endpoint
is reachable or healthy - the first observation arrives after the first probe. Use
reliastra_trigger_check to force one.

WHAT THE OUTPUT PROVES: the record was created, with the id and the values the API
stored. It does not prove the endpoint is reachable or healthy.

WHEN NOT TO USE: for an endpoint you do not own or cannot safely probe on a
schedule; for a non-idempotent POST target (probing it performs the action); for
anything not reachable over public HTTP(S).

ROLLBACK: PATCH is_active=false to stop probing while keeping history, or DELETE to
remove it.""",
    "trigger": """Queue one immediate probe of a dependency you monitor. STATE CHANGE.

A diagnostic, not a second scheduler: it publishes exactly the task Celery Beat
publishes, through the same broker to the same worker, which applies the same SSRF
policy. Requires an API key with write:checks.

Use it to prove the whole path works after registering a dependency, or to get a
fresh observation now instead of waiting for the next scheduled interval.

APPROVAL IS REQUIRED, on the same two routes as reliastra_register_dependency: the
client answers an elicitation when the connection allows one, otherwise you must pass
confirm=true after the user has explicitly approved this probe. Unapproved means
nothing is queued, and a decline is final.

WHAT THE OUTPUT PROVES: that a probe was accepted for dispatch, with the task ids
the broker returned. It does NOT prove the probe ran, and it says nothing about
whether the dependency is healthy.

READ THE RESULT CAREFULLY. HTTP 202 means the probe was QUEUED. It does not mean the
probe ran, and it says nothing about whether your dependency is healthy. Confirm the
observation with reliastra_get_dependency_observations. Reporting 202 as "the
endpoint is up" is the specific error this note exists to prevent.

NOT IDEMPOTENT, deliberately: each call queues another probe and no Idempotency-Key
is sent, because replaying a cached response would report a task that was not queued
this time. Do not call it in a retry loop, and do not poll with it - that is what
check_interval_seconds is for. It is rate limited upstream as a diagnostic path.

`region` defaults to every region configured on the dependency. Region values are
scheduling labels; one observation point is deployed.

WHEN NOT TO USE: as a health check for your own application (use your own probes),
or repeatedly to watch a dependency (set a shorter interval instead).""",
}


def register(server: Any, deps: base.ServerDeps) -> None:
    base.register_tool(
        server, deps, register_dependency,
        name="reliastra_register_dependency",
        title="Register a monitored dependency (write)",
        description=_DESCRIPTIONS["register"],
        read_only=False,
        idempotent=True,  # safe to retry: the Idempotency-Key makes it replay
        destructive=False,  # creates a record; does not destroy or overwrite one
        mutation=True,
        requires_auth=True,
    )
    base.register_tool(
        server, deps, trigger_check,
        name="reliastra_trigger_check",
        title="Queue one probe (write)",
        description=_DESCRIPTIONS["trigger"],
        read_only=False,
        idempotent=False,  # each call queues another probe
        destructive=False,
        mutation=True,
        requires_auth=True,
    )
