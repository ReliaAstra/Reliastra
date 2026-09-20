"""Lightweight distributed tracing (W3C ``traceparent``, stdlib only).

Every inbound request gets a trace id; every background task and outbound
call propagates it. No OpenTelemetry SDK is required: this module implements
just enough of the W3C Trace Context spec to correlate logs, metrics and
Celery tasks across process boundaries:

* :func:`parse_traceparent` / :func:`format_traceparent` — the wire format.
* :func:`get_trace_context` / :func:`set_trace_context` — the ambient span.
* :func:`traced_headers` — inject into any outbound HTTP call.
* :func:`task_context_kwargs` / :func:`restore_task_context` — inject into
  and restore from Celery task kwargs (see the checks pipeline for the
  exemplar wiring).
* :func:`span` — a timed log-span for service-layer operations.

If the OpenTelemetry SDK is installed, :func:`get_otel_tracer` returns a real
tracer bridged to the same ambient context; otherwise it returns a no-op
tracer. Nothing in this module requires the SDK.
"""

from __future__ import annotations

import logging
import secrets
import time
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Iterator

logger = logging.getLogger(__name__)

TRACEPARENT_HEADER = "traceparent"
REQUEST_ID_HEADER = "X-Request-ID"

_VERSION = "00"


@dataclass(frozen=True)
class TraceContext:
    """One span in a distributed trace (W3C Trace Context)."""

    trace_id: str  # 32 lowercase hex chars
    span_id: str  # 16 lowercase hex chars
    sampled: bool = True

    def child(self) -> TraceContext:
        """A new span id under the same trace (one hop downstream)."""
        return TraceContext(
            trace_id=self.trace_id,
            span_id=secrets.token_hex(8),
            sampled=self.sampled,
        )


_trace_ctx: ContextVar[TraceContext | None] = ContextVar("trace_ctx", default=None)


def new_trace() -> TraceContext:
    """Start a brand-new trace (inbound request with no ``traceparent``)."""
    return TraceContext(trace_id=secrets.token_hex(16), span_id=secrets.token_hex(8))


def get_trace_context() -> TraceContext | None:
    """Return the ambient span, or ``None`` outside a traced scope."""
    return _trace_ctx.get()


def set_trace_context(ctx: TraceContext | None):  # type: ignore[no-untyped-def]
    """Set the ambient span; returns the token for later reset."""
    return _trace_ctx.set(ctx)


def reset_trace_context(token: Any) -> None:
    """Restore the ambient span captured by :func:`set_trace_context`."""
    _trace_ctx.reset(token)


def parse_traceparent(value: str | None) -> TraceContext | None:
    """Parse a W3C ``traceparent`` header value. ``None`` when absent/invalid.

    An invalid header is never an error: the caller starts a fresh trace.
    A trace id or span id of all zeros is invalid per the spec.
    """
    if not value:
        return None
    parts = value.strip().split("-")
    if len(parts) != 4:
        return None
    version, trace_id, span_id, flags = parts
    if version == "ff" or len(trace_id) != 32 or len(span_id) != 16:
        return None
    try:
        int(trace_id, 16)
        int(span_id, 16)
        sampled = bool(int(flags, 16) & 1)
    except ValueError:
        return None
    if trace_id == "0" * 32 or span_id == "0" * 16:
        return None
    # Continue the trace under a fresh span id: the inbound span belonged to
    # the caller; this process is a new hop.
    return TraceContext(trace_id=trace_id, span_id=secrets.token_hex(8), sampled=sampled)


def format_traceparent(ctx: TraceContext) -> str:
    """Render a ``traceparent`` header value for *ctx*."""
    return f"{_VERSION}-{ctx.trace_id}-{ctx.span_id}-{'01' if ctx.sampled else '00'}"


def traced_headers() -> dict[str, str]:
    """Headers to attach to an outbound call from the ambient span.

    Includes the caller's ``X-Request-ID`` when one is active so downstream
    logs join on both ids. Empty when outside a traced scope.
    """
    from app.platform.observability.context import get_request_id

    ctx = get_trace_context()
    headers: dict[str, str] = {}
    if ctx is not None:
        headers[TRACEPARENT_HEADER] = format_traceparent(ctx.child())
    request_id = get_request_id()
    if request_id:
        headers[REQUEST_ID_HEADER] = request_id
    return headers


# ── Celery propagation ─────────────────────────────────────────────────────
# Signatures stay backward compatible: every propagated key is optional, so a
# message enqueued before this deploy (or by Beat, which passes nothing)
# still runs with a fresh trace.

TRACE_KWARG = "_traceparent"


def task_context_kwargs() -> dict[str, str]:
    """Kwargs a dispatcher adds so the worker joins the current trace.

    Usage: ``my_task.delay(*args, **task_context_kwargs())``. The task must
    declare ``_traceparent: str | None = None`` and call
    :func:`restore_task_context` first. Empty when outside a traced scope.
    """
    ctx = get_trace_context()
    if ctx is None:
        return {}
    return {TRACE_KWARG: format_traceparent(ctx.child())}


def restore_task_context(
    traceparent: str | None = None, request_id: str | None = None
) -> Any:
    """Join the dispatcher's trace inside a Celery task.

    Returns the context token; tasks that run to completion in one scope can
    ignore it (the worker's context is discarded after the task). Also
    restores the request id so worker logs correlate with API logs.
    """
    from app.platform.observability.context import set_request_id

    if request_id:
        set_request_id(request_id)
    ctx = parse_traceparent(traceparent) if traceparent else new_trace()
    return set_trace_context(ctx)


@contextmanager
def span(name: str, **fields: Any) -> Iterator[TraceContext]:
    """A timed log-span for one service-layer operation.

    Logs ``start``/``end`` (or ``error``) with duration and the active trace
    ids so slow operations are attributable without an APM agent::

        with span("evidence.render", incident_id=str(incident.id)):
            ...
    """
    ctx = get_trace_context() or new_trace()
    token = set_trace_context(ctx)
    start = time.monotonic()
    logger.debug("span start: %s trace_id=%s span_id=%s %s", name, ctx.trace_id, ctx.span_id, fields)
    try:
        yield ctx
    except Exception:
        elapsed_ms = (time.monotonic() - start) * 1000
        logger.warning(
            "span error: %s trace_id=%s span_id=%s elapsed_ms=%.1f",
            name, ctx.trace_id, ctx.span_id, elapsed_ms,
            exc_info=True,
        )
        raise
    else:
        elapsed_ms = (time.monotonic() - start) * 1000
        logger.debug(
            "span end: %s trace_id=%s span_id=%s elapsed_ms=%.1f",
            name, ctx.trace_id, ctx.span_id, elapsed_ms,
        )
    finally:
        reset_trace_context(token)


def get_otel_tracer(name: str) -> Any:
    """Best-effort OpenTelemetry tracer bridged to the ambient context.

    Returns a real SDK tracer when ``opentelemetry`` is installed, else a
    no-op tracer with the same ``start_as_current_span`` interface. Callers
    must work identically either way.
    """
    try:
        from opentelemetry import trace as otel_trace  # type: ignore[import]

        return otel_trace.get_tracer(name)
    except ImportError:
        return _NoOpTracer()


class _NoOpSpan:
    def __enter__(self) -> _NoOpSpan:
        return self

    def __exit__(self, *exc: Any) -> None:
        return None

    def set_attribute(self, *args: Any, **kwargs: Any) -> None:
        return None

    def record_exception(self, *args: Any, **kwargs: Any) -> None:
        return None


class _NoOpTracer:
    def start_as_current_span(self, *args: Any, **kwargs: Any) -> _NoOpSpan:
        return _NoOpSpan()
