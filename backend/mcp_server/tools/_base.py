"""Shared tool plumbing: context, registration, envelopes, failures, audit.

Every tool goes through :func:`register_tool`, which owns the concerns a tool
author should not have to repeat:

* builds a per-call :class:`ToolContext`, resolving the credential **from the
  request's own headers** (``ctx.headers``) with the environment as the stdio
  fallback — never from a module-level variable, so the stateless HTTP transport
  cannot carry one caller's key into another's call;
* enforces the instance-local rate limit;
* opens a W3C trace scope so the upstream call joins the caller's trace;
* applies a hard per-call execution timeout;
* records Prometheus metrics and structured logs (no secrets, no user payloads);
* translates :class:`ToolFailure` into an MCP ``isError`` result carrying a
  machine-readable category, and turns any unexpected exception into a generic
  internal error so tracebacks and upstream bodies never reach the client;
* writes an audit record for state-changing calls.

Result shape
------------
Success::

    {"ok": true,
     "data": {...},
     "meta": {"tool", "request_id", "source", "fetched_at", "cached",
              "authenticated_caller", "untrusted_content", "notes"}}

Failure (``isError`` result, not a protocol error, so an agent can branch)::

    {"ok": false,
     "error": {"category", "message", "retryable", "request_id", ...},
     "meta": {"tool", "request_id"}}

``meta.source`` names the upstream operation that produced ``data``. Nothing is
returned without it: an agent must be able to tell which endpoint a fact came
from, and whether it was cached.
"""

from __future__ import annotations

import asyncio
import datetime
import inspect
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

import mcp_types as t
from mcp.server.mcpserver.context import Context
from pydantic import BaseModel, Field

from ..auth import Credential, RateLimiter, resolve_credential
from ..config import McpServerConfig
from ..errors import ToolFailure, concurrency_limited, internal, rate_limited, tool_timeout
from ..observability import METRICS, get_logger, new_request_id, trace_scope
from ..sanitization import UNTRUSTED_CONTENT_NOTICE, redact_secrets
from ..upstream import ReliastraClient

log = get_logger("tools")
audit_log = get_logger("audit")


@dataclass(frozen=True)
class ApprovalDecision:
    """The outcome of asking whether a state change may proceed."""

    approved: bool
    #: "elicitation" (the client answered), "explicit_argument" (the caller set
    #: confirm=true), or "none" (nothing was obtained).
    mechanism: str
    action: str
    reason: str = ""


@dataclass(frozen=True)
class ToolContext:
    """Everything one tool call may use. Built per call, never shared."""

    config: McpServerConfig
    client: ReliastraClient
    credential: Credential
    request_id: str
    mcp_ctx: Context | None = None
    deps: ServerDeps | None = None

    @property
    def authenticated(self) -> bool:
        return self.credential.authenticated

    @property
    def registered_tools(self) -> tuple[str, ...]:
        """The tools actually registered on this server, in registration order."""
        return tuple(self.deps.registered_tools) if self.deps else ()

    @property
    def api_key(self) -> str | None:
        return self.credential.key

    @property
    def caller_identity(self) -> str:
        """Non-reversible caller label, safe for logs and metrics."""
        return self.credential.identity

    def elicitation_available(self) -> bool:
        """Can this connection answer a server-initiated question right now?

        Two conditions, and both are needed. The client must declare the
        elicitation capability, and the transport must have a back-channel for
        server-initiated requests. The second is the one that surprises people:
        the modern protocol era (2026-07-28) forbids server-initiated JSON-RPC
        requests, so ``_streamable_http_modern`` and the stateless HTTP manager
        both build their context with ``can_send_request=False``. Declaring the
        capability is not the same as being able to receive the question.
        """
        if self.mcp_ctx is None:
            return False
        capabilities = self.mcp_ctx.client_capabilities
        if capabilities is None or getattr(capabilities, "elicitation", None) is None:
            return False
        session = getattr(self.mcp_ctx, "session", None)
        return bool(getattr(session, "can_send_request", False))

    async def request_approval(
        self, *, action: str, summary: dict[str, Any], confirm_argument: bool
    ) -> ApprovalDecision:
        """Decide whether a state change may proceed. Fail-closed.

        Precedence is deliberate:

        1. If the connection can answer an elicitation, ask. An explicit *decline*
           or *cancel* is final and overrides ``confirm_argument`` — a human "no"
           beats an agent's "yes".
        2. Otherwise, accept only an explicit ``confirm=true`` from the caller.
           This is the path that works on every transport and protocol version,
           and it is the one MCP clients gate with their own tool-approval UI
           (these tools are annotated ``readOnlyHint=false``).
        3. Anything else is a refusal, with a message that says how to proceed.

        Asking is not the same as being asked: a model cannot answer an
        elicitation, so route 1 is a real human gate. Route 2 is weaker — an agent
        could set the flag itself — which is why the tool descriptions make the
        flag's meaning explicit and why route 1 is preferred whenever it exists.
        """
        if self.elicitation_available():
            try:
                result = await self.mcp_ctx.elicit(  # type: ignore[union-attr]
                    message=(
                        f"Reliastra is about to {action}. This changes state in "
                        f"your Reliastra organization.\n\n{format_summary(summary)}"
                        "\n\nApprove?"
                    ),
                    schema=_Confirmation,
                )
            except Exception:
                # The client advertised support and then could not answer. Fall
                # through to the explicit-argument route rather than failing a
                # write the user may already have approved.
                log.warning(
                    "confirmation_failed",
                    extra={"action": action, "request_id": self.request_id},
                )
            else:
                decision = getattr(result, "action", None)
                if decision == "accept":
                    return ApprovalDecision(True, "elicitation", action)
                return ApprovalDecision(
                    False,
                    "elicitation",
                    action,
                    reason=(
                        f"The user was asked and answered {decision!r}. That answer "
                        "is final: an explicit decline is not retried, and setting "
                        "confirm=true does not override it."
                    ),
                )
        if confirm_argument:
            return ApprovalDecision(True, "explicit_argument", action)
        return ApprovalDecision(
            False,
            "none",
            action,
            reason=(
                "No approval was obtained. This connection cannot answer an "
                "elicitation (the modern MCP protocol forbids server-initiated "
                "requests), so approval must arrive as confirm=true in the tool "
                "arguments - and you may set that only after the user has "
                "explicitly approved this specific action in conversation."
            ),
        )


class _Confirmation(BaseModel):
    """Elicitation schema: primitives only, per the MCP specification."""

    approve: bool = Field(description="True to perform this state change, false to cancel.")


def format_summary(summary: dict[str, Any]) -> str:
    return "\n".join(f"  {key}: {value}" for key, value in summary.items())


class AdmissionControl:
    """Bounds concurrent tool execution with a bounded waiting queue.

    Refusing immediately when every slot is busy would turn an ordinary burst of
    parallel agent calls into user-visible errors, so callers queue. The queue is
    itself bounded: past ``max_waiting`` a call is refused with an explicit
    ``concurrency`` failure rather than queued behind work that may never finish.
    Total wait is additionally bounded by the per-call tool timeout, so a saturated
    instance degrades into honest, retryable failures instead of a pile-up.
    """

    def __init__(self, limit: int, max_waiting: int) -> None:
        self._semaphore = asyncio.Semaphore(limit)
        self._limit = limit
        self._max_waiting = max_waiting
        self._waiting = 0
        self._held = 0

    @property
    def limit(self) -> int:
        return self._limit

    def snapshot(self) -> dict[str, int]:
        return {
            "limit": self._limit,
            "in_flight": self._held,
            "waiting": self._waiting,
            "max_waiting": self._max_waiting,
        }

    async def acquire(self) -> bool:
        """Take a slot, queueing if necessary. False means the queue is full."""
        if self._waiting >= self._max_waiting:
            return False
        self._waiting += 1
        try:
            await self._semaphore.acquire()
        finally:
            self._waiting -= 1
        self._held += 1
        return True

    def release(self) -> None:
        self._held -= 1
        self._semaphore.release()


@dataclass
class ServerDeps:
    """Composition root handed to every tool module at registration time."""

    config: McpServerConfig
    client: ReliastraClient
    limiter: RateLimiter
    #: Bounds concurrent execution across parallel tool calls.
    admission: AdmissionControl = field(init=False)
    registered_tools: list[str] = field(default_factory=list, init=False)

    def __post_init__(self) -> None:
        self.admission = AdmissionControl(
            self.config.max_inflight_requests,
            # Four times the slot count: enough to absorb a burst, short enough
            # that a saturated instance starts saying so.
            max_waiting=self.config.max_inflight_requests * 4,
        )


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def envelope(
    tool: str,
    data: Any,
    ctx: ToolContext,
    *,
    source: str,
    freshness: dict[str, Any] | None = None,
    notes: list[str] | None = None,
    untrusted_content: bool = True,
) -> dict[str, Any]:
    """The one success shape every tool returns."""
    meta: dict[str, Any] = {
        "tool": tool,
        "request_id": ctx.request_id,
        "source": source,
        "fetched_at": _now(),
        "authenticated_caller": ctx.authenticated,
    }
    if freshness:
        meta.update(freshness)
    else:
        meta["cached"] = False
    if untrusted_content:
        meta["untrusted_content"] = UNTRUSTED_CONTENT_NOTICE
    if notes:
        meta["notes"] = notes
    return {"ok": True, "data": redact_secrets(data), "meta": meta}


def failure_result(failure: ToolFailure, tool: str, request_id: str) -> t.CallToolResult:
    """A structured ``isError`` result. Never a traceback, never an upstream body."""
    payload = {
        "ok": False,
        "error": {
            "category": failure.category,
            "message": failure.message,
            "retryable": failure.retryable,
            **failure.data,
        },
        "meta": {"tool": tool, "request_id": request_id},
    }
    return t.CallToolResult(
        content=[t.TextContent(type="text", text=failure.message)],
        structured_content=payload,
        is_error=True,
    )


#: ``logging`` refuses to overwrite these via ``extra``, and it reports the refusal
#: on stderr rather than raising - so an audit record using one of these names would
#: vanish silently. An audit trail that can disappear is not an audit trail, so the
#: collision is filtered here and the dropped names are recorded instead.
_RESERVED_LOG_FIELDS: frozenset[str] = frozenset(
    logging.LogRecord("", 0, "", 0, "", (), None).__dict__
) - {"message", "asctime"}


def audit_call(ctx: ToolContext, tool: str, outcome: str, detail: dict[str, Any]) -> None:
    """Audit a state change attempt. Identifiers and outcome only — never a payload.

    Records declines and failures as well as successes: an attempt that did not
    happen is part of the accountability story, and a log that only shows writes
    that landed cannot answer "did anything try?".

    This function must not raise. It runs on the path of every write, including
    writes that are about to fail, and an auditing defect must not turn a declined
    mutation into an unhandled error.
    """
    fields: dict[str, Any] = {
        "tool": tool,
        "request_id": ctx.request_id,
        "caller": ctx.caller_identity,
        "credential_source": ctx.credential.source,
        "outcome": outcome,
    }
    dropped: list[str] = []
    for key, value in redact_secrets(detail).items():
        if key in _RESERVED_LOG_FIELDS or key in fields:
            dropped.append(key)
            continue
        fields[key] = value
    if dropped:
        # Named, not swallowed: a caller passing a colliding key has a bug worth
        # seeing, and the audit line still records everything else.
        fields["dropped_fields"] = ",".join(sorted(dropped))
    try:
        audit_log.info("mcp_mutation", extra=fields)
    except Exception:  # pragma: no cover - the audit path must never raise
        log.exception("audit_write_failed", extra={"tool": tool, "outcome": outcome})


def _required_scope(tool_name: str) -> str | None:
    """Scope hint for an auth failure, from the capability registry."""
    from ..capabilities import scopes_for_tool

    scopes = scopes_for_tool(tool_name)
    return scopes[0] if scopes else None


ToolFn = Callable[..., Awaitable[Any]]


def register_tool(
    server: Any,
    deps: ServerDeps,
    fn: ToolFn,
    *,
    name: str,
    description: str,
    title: str,
    read_only: bool,
    idempotent: bool = True,
    destructive: bool = False,
    mutation: bool = False,
    requires_auth: bool = False,
) -> None:
    """Register ``fn(ctx, **args)`` as an MCP tool with full plumbing.

    ``fn`` must take :class:`ToolContext` first and be annotated
    ``-> dict[str, Any]``; the remaining parameters are projected onto the wire
    schema, so they must carry real (non-string) annotations. Tool modules must
    therefore not use ``from __future__ import annotations``.
    """
    annotations = t.ToolAnnotations(
        title=title,
        readOnlyHint=read_only,
        destructiveHint=destructive,
        idempotentHint=idempotent,
        # True for anything that calls the Reliastra API: the result depends on
        # the outside world, not only on the arguments.
        openWorldHint=True,
    )

    async def wrapper(ctx: Context, **kwargs: Any) -> Any:
        request_id = new_request_id()
        started = time.monotonic()
        credential = resolve_credential(
            ctx.headers if ctx is not None else None, deps.config.reliastra_api_key
        )
        tool_ctx = ToolContext(
            config=deps.config,
            client=deps.client,
            credential=credential,
            request_id=request_id,
            mcp_ctx=ctx,
            deps=deps,
        )
        bucket = f"tool:{credential.identity}:{name}"
        retry_after = deps.limiter.allow(bucket)
        if retry_after is not None:
            METRICS.rate_limited("server")
            return _finish(
                name, request_id, started, rate_limited(retry_after), tool_ctx, mutation
            )

        if requires_auth and not tool_ctx.authenticated:
            # Fail before doing any work: a caller with no credential gets one
            # clear answer rather than a rate-limit token spent and an upstream
            # round trip that was always going to be refused.
            from ..errors import unauthenticated

            return _finish(
                name,
                request_id,
                started,
                unauthenticated(
                    f"{name} needs a Reliastra API key. Provide one as "
                    "RELIASTRA_API_KEY (stdio) or Authorization: Bearer rel_... "
                    "(remote). API access also requires an organization on a plan "
                    "that includes api_access.",
                    required_scope=_required_scope(name),
                ),
                tool_ctx,
                mutation,
            )

        incoming_trace = None
        if ctx is not None and ctx.headers:
            incoming_trace = ctx.headers.get("traceparent") or ctx.headers.get("Traceparent")

        try:
            async with asyncio.timeout(deps.config.tool_timeout_s):
                if not await deps.admission.acquire():
                    METRICS.tool_outcome(
                        name, "concurrency", time.monotonic() - started
                    )
                    return _finish(
                        name,
                        request_id,
                        started,
                        concurrency_limited(deps.config.max_inflight_requests),
                        tool_ctx,
                        mutation,
                    )
                try:
                    with trace_scope(request_id, incoming_trace):
                        result = await fn(tool_ctx, **kwargs)
                finally:
                    deps.admission.release()
        except ToolFailure as failure:
            return _finish(name, request_id, started, failure, tool_ctx, mutation)
        except TimeoutError:
            return _finish(
                name, request_id, started, tool_timeout(deps.config.tool_timeout_s), tool_ctx, mutation
            )
        except Exception:
            # Logged in full here; the client gets a generic internal error.
            log.exception(
                "tool_internal", extra={"tool": name, "request_id": request_id}
            )
            return _finish(name, request_id, started, internal(), tool_ctx, mutation)

        duration = time.monotonic() - started
        METRICS.tool_outcome(name, "ok", duration)
        log.info(
            "tool_ok",
            extra={
                "tool": name,
                "request_id": request_id,
                "caller": tool_ctx.caller_identity,
                "authenticated": tool_ctx.authenticated,
                "latency_ms": round(duration * 1000, 1),
            },
        )
        # Success is audited by the tool itself, which has the detail worth
        # recording (target identifiers, upstream status). Auditing it here too
        # would write a second, less informative line for one action. Failures are
        # audited here, in _finish, because a tool that raised never got the chance.
        return result

    def _finish(
        tool: str,
        rid: str,
        started_at: float,
        failure: ToolFailure,
        tool_ctx: ToolContext,
        is_mutation: bool,
    ) -> t.CallToolResult:
        duration = time.monotonic() - started_at
        METRICS.tool_outcome(tool, failure.category, duration)
        log.warning(
            "tool_error",
            extra={
                "tool": tool,
                "request_id": rid,
                "caller": tool_ctx.caller_identity,
                "category": failure.category,
                "retryable": failure.retryable,
                "latency_ms": round(duration * 1000, 1),
            },
        )
        if is_mutation:
            audit_call(
                tool_ctx,
                tool,
                f"failed:{failure.category}",
                {"retryable": failure.retryable},
            )
        return failure_result(failure, tool, rid)

    # Project the implementation's signature onto the wire: keep ``ctx`` for the
    # SDK's context injection, expose the tool's own parameters as the schema.
    inner_sig = inspect.signature(fn)
    params = [
        inspect.Parameter("ctx", inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=Context)
    ]
    params.extend(
        param
        for pname, param in inner_sig.parameters.items()
        # A VAR_KEYWORD/VAR_POSITIONAL parameter is plumbing, not an argument: it
        # would surface in the wire schema as a required field nobody can supply.
        if pname != "ctx"
        and param.kind
        in (
            inspect.Parameter.POSITIONAL_OR_KEYWORD,
            inspect.Parameter.KEYWORD_ONLY,
        )
    )
    wrapper.__signature__ = inspect.Signature(  # type: ignore[attr-defined]
        params, return_annotation=dict[str, Any]
    )
    # find_context_parameter() reads __annotations__, not __signature__.
    wrapper.__annotations__ = {"ctx": Context, "return": dict[str, Any]}
    for pname, param in inner_sig.parameters.items():
        if (
            pname != "ctx"
            and param.kind
            in (
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                inspect.Parameter.KEYWORD_ONLY,
            )
            and param.annotation is not inspect.Parameter.empty
        ):
            wrapper.__annotations__[pname] = param.annotation
    wrapper.__name__ = name
    wrapper.__doc__ = description
    wrapper.__module__ = fn.__module__

    server.tool(name=name, title=title, description=description, annotations=annotations)(wrapper)
    deps.registered_tools.append(name)
