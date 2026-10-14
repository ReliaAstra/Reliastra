"""Structured logging, Prometheus metrics and W3C trace propagation.

Deliberately built on the primitives the Reliastra backend already runs, so one
scrape and one log pipeline cover both processes:

* **Metrics** use ``prometheus-client`` (already a backend dependency, exposed
  at ``/metrics`` there). Label values are tool names, error categories and
  outcome kinds — never user input, URLs, provider slugs or credentials, so
  cardinality stays bounded by construction.
* **Tracing** emits the same W3C ``traceparent`` the backend's
  ``app.platform.observability.tracing`` parses and joins on, and propagates it
  into every upstream call. ``tests/unit/mcp/test_observability.py`` asserts the
  backend accepts what this module emits — the integration is verified, not
  assumed.
* **Logging** is single-line JSON with a hard deny-list, so a secret cannot
  reach a log file by being passed as an ``extra`` field.

The MCP SDK additionally ships an OpenTelemetry middleware (see
``server.py``); spans from it and the ``traceparent`` here describe the same
request, from the protocol edge to the API.
"""

from __future__ import annotations

import json
import logging
import secrets
import threading
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any, ClassVar

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram

# ── Prometheus instruments ──────────────────────────────────────────────────
# Named ``reliastra_mcp_*`` so they sit beside ``reliastra_*`` in one scrape and
# cannot be confused with the API's own instruments.

tool_calls_total = Counter(
    "reliastra_mcp_tool_calls_total",
    "MCP tool invocations by tool and outcome",
    ["tool", "outcome"],
)
tool_duration_seconds = Histogram(
    "reliastra_mcp_tool_duration_seconds",
    "MCP tool call latency",
    ["tool"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0),
)
upstream_requests_total = Counter(
    "reliastra_mcp_upstream_requests_total",
    "Upstream Reliastra API requests by outcome",
    ["outcome"],
)
upstream_duration_seconds = Histogram(
    "reliastra_mcp_upstream_duration_seconds",
    "Upstream Reliastra API latency",
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0),
)
auth_failures_total = Counter(
    "reliastra_mcp_auth_failures_total",
    "Requests rejected at the transport gate, by reason",
    ["reason"],
)
rate_limited_total = Counter(
    "reliastra_mcp_rate_limited_total",
    "Calls refused by a rate limit (this server's or the upstream's)",
    ["source"],
)
cache_events_total = Counter(
    "reliastra_mcp_cache_events_total",
    "Public-data cache outcomes",
    ["result"],
)
mutations_total = Counter(
    "reliastra_mcp_mutations_total",
    "State-changing tool calls that reached the upstream API",
    ["tool", "outcome"],
)
inflight_requests = Gauge(
    "reliastra_mcp_inflight_requests",
    "Upstream requests currently in flight on this instance",
)
circuit_state = Gauge(
    "reliastra_mcp_circuit_open",
    "1 while the upstream circuit breaker is open, else 0",
)

#: Substrings, not an exact list: a key named ``report_token``, ``api_key_v2`` or
#: ``x-reliastra-secret`` must be withheld too. An exact-match deny-list silently
#: leaks every name nobody thought to enumerate, which is the failure mode that
#: matters for a log pipeline.
_SECRET_KEY_SUBSTRINGS: ClassVar[tuple[str, ...]] = (
    "api_key",
    "apikey",
    "authorization",
    "token",
    "secret",
    "password",
    "passwd",
    "credential",
    "private_key",
    "signature",
    "session",
    "cookie",
)

#: LogRecord attributes that are plumbing, not context.
_LOGRECORD_ATTRS: ClassVar[frozenset[str]] = frozenset(
    {
        "args",
        "msg",
        "message",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "lineno",
        "funcName",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "processName",
        "process",
        "name",
        "taskName",
    }
)


def redact_secret_key(key: str) -> bool:
    """True when ``key`` names something that must never be logged.

    Separators are normalised first, so ``X-API-Key``, ``x_api_key`` and
    ``apiKey`` are all withheld by one entry. Matching each spelling separately is
    how a hyphenated header name slips through an underscore-keyed deny-list.
    """
    lowered = key.lower().replace("-", "_")
    return any(marker in lowered for marker in _SECRET_KEY_SUBSTRINGS)


class JsonFormatter(logging.Formatter):
    """Single-line JSON logs with a hard secret deny-list."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in vars(record).items():
            if key.startswith("_") or key in _LOGRECORD_ATTRS:
                continue
            if redact_secret_key(key):
                # Record that something was withheld. The name is not secret,
                # the value is, and silently dropping it hides a caller bug.
                payload[key] = "[redacted]"
                continue
            payload[key] = value
        if record.exc_info and record.exc_info[0] is not None:
            # Last line only: a traceback can carry argument values.
            payload["exc"] = self.formatException(record.exc_info).splitlines()[-1]
        return json.dumps(payload, default=str)


_PLAIN_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"

#: Loggers handed out by :func:`get_logger`, by short name. Kept so
#: :func:`configure_logging` can re-apply a format decided *after* they existed.
_known_loggers: set[str] = set()

#: The log format and level are **process state**, not per-call arguments. Every
#: module does ``log = get_logger("server")`` at import time, long before any
#: configuration is read, so a per-call ``json_logs`` flag was decided by whichever
#: call happened to arrive first: ``MCP_LOG_JSON=false`` changed only the entry
#: point's own logger and every interesting line stayed JSON. A documented setting
#: that quietly does nothing is worse than no setting at all.
_json_logs: bool = True
_level: str = "INFO"


def _apply_format(logger: logging.Logger) -> None:
    """Install this server's handler and the current process-wide format."""
    logger.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(
        JsonFormatter() if _json_logs else logging.Formatter(_PLAIN_FORMAT)
    )
    logger.addHandler(handler)
    logger.setLevel(getattr(logging, _level.upper(), logging.INFO))
    logger.propagate = False


def configure_logging(level: str | None = None, *, json_logs: bool | None = None) -> bool:
    """Set the process-wide log format and level; return True if either changed.

    Re-applies to every logger already handed out, which is the whole point: the
    interesting loggers are created at import time and would otherwise keep the
    format they were born with. Idempotent, so both the entry point and
    :func:`mcp_server.server.create_server` can call it without fighting.

    Handlers are only rebuilt when something actually changed, so a handler
    attached later — a test capturing the audit log, say — survives subsequent
    ``get_logger`` calls for a logger that already exists.
    """
    global _json_logs, _level
    changed = False
    if json_logs is not None and json_logs != _json_logs:
        _json_logs = json_logs
        changed = True
    if level is not None and level.strip().upper() != _level.upper():
        _level = level.strip().upper()
        changed = True
    if changed:
        for name in list(_known_loggers):
            logger = logging.getLogger(f"reliastra.mcp.{name}")
            logger.disabled = False
            _apply_format(logger)
    return changed


def current_logging_settings() -> tuple[str, bool]:
    """The process-wide ``(level, json_logs)`` currently in force.

    Exposed so a caller that changes them — a test, an embedding application —
    can restore exactly what it found instead of guessing at a default.
    """
    return _level, _json_logs


def get_logger(
    name: str, level: str | None = None, *, json_logs: bool | None = None
) -> logging.Logger:
    """Return this server's named logger.

    Passing ``level`` or ``json_logs`` configures the **process**, not just this
    logger (see :func:`configure_logging`); omitting them — the module-level
    ``log = get_logger("x")`` case — leaves the current settings alone.

    ``disabled`` is cleared explicitly on every call. ``logging.config.fileConfig``
    and ``dictConfig`` default to ``disable_existing_loggers=True``, which silently
    mutes any logger created before they run — and this repository runs alembic,
    which calls ``fileConfig`` (``app/db/migrations/env.py``). An MCP server that
    is ever imported into such a process would otherwise stop logging entirely,
    including its audit trail, with no error anywhere. Muting is never intended
    here, so it is undone rather than relied upon.
    """
    logger = logging.getLogger(f"reliastra.mcp.{name}")
    logger.disabled = False
    if name not in _known_loggers:
        _known_loggers.add(name)
        configure_logging(level, json_logs=json_logs)
        _apply_format(logger)
    else:
        configure_logging(level, json_logs=json_logs)
    logger.setLevel(getattr(logging, _level.upper(), logging.INFO))
    logger.propagate = False
    return logger


log = get_logger("observability")


def new_request_id() -> str:
    return f"mcp_{uuid.uuid4().hex[:12]}"


# ── W3C Trace Context ───────────────────────────────────────────────────────
# Same wire format as app/platform/observability/tracing.py. Kept local so the
# MCP server has no import dependency on the backend package tree; the contract
# test proves the two agree.

TRACEPARENT_HEADER = "traceparent"
REQUEST_ID_HEADER = "X-Request-ID"


def new_trace_id() -> str:
    return secrets.token_hex(16)


def new_span_id() -> str:
    return secrets.token_hex(8)


def format_traceparent(trace_id: str, span_id: str, *, sampled: bool = True) -> str:
    return f"00-{trace_id}-{span_id}-{'01' if sampled else '00'}"


def parse_traceparent(value: str | None) -> tuple[str, bool] | None:
    """Return ``(trace_id, sampled)`` for a valid traceparent, else None."""
    if not value:
        return None
    parts = value.strip().split("-")
    if len(parts) != 4 or parts[0] != "00":
        return None
    trace_id, span_id, flags = parts[1], parts[2], parts[3]
    if len(trace_id) != 32 or len(span_id) != 16 or len(flags) != 2:
        return None
    if not all(c in "0123456789abcdef" for c in trace_id + span_id + flags):
        return None
    if set(trace_id) == {"0"} or set(span_id) == {"0"}:
        return None
    return trace_id, bool(int(flags, 16) & 0x01)


class _TraceState(threading.local):
    trace_id: str | None = None
    request_id: str | None = None


_state = _TraceState()


@contextmanager
def trace_scope(
    request_id: str, incoming_traceparent: str | None = None
) -> Iterator[dict[str, str]]:
    """Bind one tool call to a trace and yield the headers to send upstream.

    Joins the caller's trace when a valid ``traceparent`` arrives (an agent or
    gateway that is already tracing), otherwise starts one. The yielded headers
    carry a *child* span id, so the upstream hop nests under this call.
    """
    parsed = parse_traceparent(incoming_traceparent)
    trace_id = parsed[0] if parsed else new_trace_id()
    previous = (_state.trace_id, _state.request_id)
    _state.trace_id, _state.request_id = trace_id, request_id
    try:
        yield {
            TRACEPARENT_HEADER: format_traceparent(trace_id, new_span_id()),
            REQUEST_ID_HEADER: request_id,
        }
    finally:
        _state.trace_id, _state.request_id = previous


def current_trace_headers() -> dict[str, str]:
    """Headers for an outbound call, or empty outside a trace scope."""
    if _state.trace_id is None:
        return {}
    headers = {TRACEPARENT_HEADER: format_traceparent(_state.trace_id, new_span_id())}
    if _state.request_id:
        headers[REQUEST_ID_HEADER] = _state.request_id
    return headers


# ── Metrics façade ──────────────────────────────────────────────────────────


class Metrics:
    """Thin, bounded-cardinality façade over the Prometheus instruments.

    Tool handlers call these; nothing here takes user-controlled label values.
    One call records exactly one ``tool_outcome``, so counts and latency agree.
    ``outcome`` is ``ok`` or an error category from :mod:`mcp_server.errors`.
    """

    def tool_outcome(self, tool: str, outcome: str, duration_s: float) -> None:
        tool_calls_total.labels(tool=tool, outcome=outcome).inc()
        tool_duration_seconds.labels(tool=tool).observe(duration_s)

    def upstream_observed(self, duration_s: float, outcome: str) -> None:
        upstream_requests_total.labels(outcome=outcome).inc()
        upstream_duration_seconds.observe(duration_s)

    def upstream_inflight(self, delta: int) -> None:
        inflight_requests.inc(delta)

    def auth_failure(self, reason: str) -> None:
        auth_failures_total.labels(reason=reason).inc()

    def rate_limited(self, source: str = "server") -> None:
        rate_limited_total.labels(source=source).inc()

    def cache_event(self, result: str) -> None:
        cache_events_total.labels(result=result).inc()

    def mutation(self, tool: str, outcome: str) -> None:
        mutations_total.labels(tool=tool, outcome=outcome).inc()

    def circuit(self, is_open: bool) -> None:
        circuit_state.set(1 if is_open else 0)


METRICS = Metrics()


def render_metrics() -> tuple[bytes, str]:
    """Prometheus exposition text and its content type."""
    from prometheus_client import generate_latest

    return generate_latest(), CONTENT_TYPE_LATEST


def start_time() -> float:
    return time.monotonic()
