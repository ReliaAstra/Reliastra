"""Shared tool plumbing: context, registration wrapper, output envelopes.

Every tool goes through :func:`register_tool`:
- builds a per-call :class:`ToolContext` (credential from the request-scoped
  ContextVar, env fallback for stdio — never a shared/global credential),
- enforces the instance-local rate limit,
- records metrics + structured logs (no secrets, no user payloads),
- translates :class:`ToolFailure` to an MCP wire error preserving code and
  machine-readable ``data``; unexpected exceptions become a generic internal
  error so tracebacks and upstream bodies never reach the client.

Successful results use one envelope agents can rely on::

    {"ok": True, "data": {...}, "meta": {"tool": ..., "request_id": ...,
     "source": "GET /v1/vendors", "fetched_at": ..., "cached": False}}
"""

from __future__ import annotations

import datetime
import inspect
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from mcp.shared.exceptions import MCPError

from ..auth import RateLimiter, get_caller_key
from ..config import McpServerConfig
from ..errors import ToolFailure, internal
from ..observability import METRICS, get_logger, new_request_id
from ..upstream import ReliastraClient

log = get_logger("tools")


@dataclass
class ToolContext:
    config: McpServerConfig
    client: ReliastraClient
    api_key: str | None
    request_id: str
    authenticated: bool


@dataclass
class ServerDeps:
    config: McpServerConfig
    client: ReliastraClient
    limiter: RateLimiter


def envelope(
    tool: str,
    data: Any,
    ctx: ToolContext,
    source: str,
    cached: bool = False,
    fetched_at: str | None = None,
) -> dict[str, Any]:
    return {
        "ok": True,
        "data": data,
        "meta": {
            "tool": tool,
            "request_id": ctx.request_id,
            "source": source,
            "fetched_at": fetched_at or _now(),
            "cached": cached,
            "authenticated_caller": ctx.authenticated,
        },
    }


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def register_tool(
    server,
    deps: ServerDeps,
    func: Callable[..., Awaitable[Any]],
    *,
    name: str,
    description: str,
    read_only: bool,
    idempotent: bool = True,
) -> None:
    """Register ``func(ctx, **args)`` as an MCP tool with full plumbing."""
    from mcp.types import ToolAnnotations

    annotations = ToolAnnotations(
        readOnlyHint=read_only,
        destructiveHint=False,
        idempotentHint=idempotent,
        openWorldHint=True,  # operational tools call the Reliastra API
    )

    async def wrapper(**kwargs: Any) -> Any:
        request_id = new_request_id()
        started = time.monotonic()
        api_key = get_caller_key(deps.config.reliastra_api_key)
        ctx = ToolContext(
            config=deps.config,
            client=deps.client,
            api_key=api_key,
            request_id=request_id,
            authenticated=api_key is not None,
        )
        identity = f"tool:{api_key[-8:] if api_key else 'anon'}:{name}"
        retry_after = deps.limiter.allow(identity)
        if retry_after is not None:
            METRICS.rate_limited()
            METRICS.tool_error("rate_limited")
            log.warning("rate_limited", extra={"tool": name, "request_id": request_id})
            from ..errors import rate_limited

            failure = rate_limited(retry_after)
            raise MCPError(failure.code, failure.message, failure.wire_data(request_id))
        METRICS.tool_called(name)
        log.info(
            "tool_call",
            extra={"tool": name, "request_id": request_id, "authenticated": ctx.authenticated},
        )
        try:
            result = await func(ctx, **kwargs)
        except ToolFailure as failure:
            METRICS.tool_error(failure.category)
            log.warning(
                "tool_error",
                extra={"tool": name, "request_id": request_id, "category": failure.category},
            )
            raise MCPError(failure.code, failure.message, failure.wire_data(request_id)) from None
        except Exception:  # never leak tracebacks/payloads to the client
            METRICS.tool_error("internal")
            log.exception("tool_internal", extra={"tool": name, "request_id": request_id})
            failure = internal()
            raise MCPError(failure.code, failure.message, failure.wire_data(request_id)) from None
        log.info(
            "tool_ok",
            extra={
                "tool": name,
                "request_id": request_id,
                "latency_ms": round((time.monotonic() - started) * 1000, 1),
            },
        )
        return result

    # Project the inner signature minus our private ``ctx`` so the SDK builds
    # the input schema from the real parameters. (functools.wraps is avoided:
    # it would expose __wrapped__ and confuse schema generation.)
    # NOTE: tool modules must use runtime annotations (no
    # ``from __future__ import annotations``) so the annotation objects are
    # real.
    inner_sig = inspect.signature(func)
    wrapper.__signature__ = inner_sig.replace(  # type: ignore[attr-defined]
        parameters=[p for pname, p in inner_sig.parameters.items() if pname != "ctx"]
    )
    wrapper.__name__ = name
    wrapper.__doc__ = description
    wrapper.__module__ = func.__module__

    server.tool(name=name, description=description, annotations=annotations)(wrapper)
