"""Structured error taxonomy.

Every tool failure raises :class:`ToolFailure`, which the server translates to
an MCP wire error (``MCPError``) preserving code, a safe message and machine
``data``. Upstream response bodies are never echoed: only the backend's public
``{error: {code, message}}`` envelope fields pass through, everything else is
replaced by a category. An upstream failure is never converted into a
successful-looking empty result.

Categories an agent can branch on (``data.category``):

========================  ==================================================
``invalid_input``         Arguments failed validation. Fix and retry.
``unauthenticated``       No usable credential. Supply one and retry.
``forbidden``             Credential valid but not permitted (scope/plan/org).
``not_found``             The record does not exist, or is not yours to see.
``unsupported``           The capability is not available on this server.
``rate_limited``          This server's own limiter. ``retryable``.
``upstream_rate_limited`` The Reliastra API's limiter. ``retryable``.
``upstream_timeout``      The API did not answer in time. ``retryable``.
``upstream_unavailable``  The API is unreachable / circuit open. ``retryable``.
``upstream_error``        The API answered with an error we can pass through.
``upstream_invalid``      The API answered with something unparseable.
``timeout``               This tool call exceeded its own budget.
``concurrency``           Too many calls in flight on this instance.
``internal``              A defect here. Never carries a traceback or payload.
========================  ==================================================
"""

from __future__ import annotations

from typing import Any

# JSON-RPC: -32602/-32603 are spec codes; -32000..-32099 are
# implementation-defined server errors.
CODE_INVALID_INPUT = -32602
CODE_INTERNAL = -32603
CODE_UNAUTHENTICATED = -32001
CODE_FORBIDDEN = -32003
CODE_NOT_FOUND = -32004
CODE_UNSUPPORTED = -32005
CODE_TIMEOUT = -32006
CODE_CONCURRENCY = -32007
CODE_RATE_LIMITED = -32000
CODE_UPSTREAM = -32050

#: Categories that mean "try again later", not "you asked something wrong".
RETRYABLE_CATEGORIES = frozenset(
    {
        "rate_limited",
        "upstream_rate_limited",
        "upstream_timeout",
        "upstream_unavailable",
        "timeout",
        "concurrency",
    }
)


class ToolFailure(Exception):
    """A failed tool call with a stable category agents can branch on.

    Deliberately **not** a dataclass. A ``@dataclass(frozen=True)`` exception
    installs a ``__setattr__`` that rejects every assignment, and the interpreter
    assigns ``__traceback__`` as an exception propagates — so raising one dies with
    ``FrozenInstanceError: cannot assign to field '__traceback__'`` before it ever
    reaches a handler. The symptom is that *every* structured failure surfaces as a
    generic internal error, which is the worst possible failure mode for an error
    taxonomy: the categories exist and are then never delivered. Instances are still
    treated as immutable by convention; nothing mutates them after construction.
    """

    __slots__ = ("category", "code", "data", "message", "retryable")

    def __init__(
        self,
        category: str,
        message: str,
        code: int = CODE_INTERNAL,
        retryable: bool = False,
        data: dict[str, Any] | None = None,
    ) -> None:
        # Exception.args is set to the safe message only: a traceback or repr of
        # this object must never carry a payload or a credential.
        super().__init__(message)
        self.category = category
        self.message = message
        self.code = code
        self.retryable = retryable
        self.data: dict[str, Any] = dict(data) if data else {}

    def __str__(self) -> str:
        return self.message

    def __repr__(self) -> str:
        return (
            f"ToolFailure(category={self.category!r}, code={self.code}, "
            f"retryable={self.retryable})"
        )

    def wire_data(self, request_id: str) -> dict[str, Any]:
        payload = {
            "category": self.category,
            "retryable": self.retryable,
            "request_id": request_id,
        }
        payload.update(self.data)
        return payload


def invalid_input(message: str, **data: Any) -> ToolFailure:
    return ToolFailure("invalid_input", message, CODE_INVALID_INPUT, False, dict(data))


def unauthenticated(message: str = "Authentication required.", **data: Any) -> ToolFailure:
    return ToolFailure("unauthenticated", message, CODE_UNAUTHENTICATED, False, dict(data))


def forbidden(message: str = "Not permitted for this caller.", **data: Any) -> ToolFailure:
    return ToolFailure("forbidden", message, CODE_FORBIDDEN, False, dict(data))


def not_found(message: str, **data: Any) -> ToolFailure:
    return ToolFailure("not_found", message, CODE_NOT_FOUND, False, dict(data))


def unsupported(message: str, **data: Any) -> ToolFailure:
    """A capability this server deliberately does not offer."""
    return ToolFailure("unsupported", message, CODE_UNSUPPORTED, False, dict(data))


def rate_limited(retry_after_s: float = 60.0) -> ToolFailure:
    return ToolFailure(
        "rate_limited",
        "MCP server rate limit exceeded. Back off and retry.",
        CODE_RATE_LIMITED,
        True,
        {"retry_after_s": round(retry_after_s, 1)},
    )


def concurrency_limited(inflight: int) -> ToolFailure:
    return ToolFailure(
        "concurrency",
        "This MCP instance has too many requests in flight. Back off and retry.",
        CODE_CONCURRENCY,
        True,
        {"inflight": inflight},
    )


def tool_timeout(budget_s: float) -> ToolFailure:
    return ToolFailure(
        "timeout",
        f"The tool call exceeded its {budget_s:g}s budget and was cancelled.",
        CODE_TIMEOUT,
        True,
        {"budget_s": budget_s},
    )


def upstream(
    category: str,
    message: str,
    retryable: bool = False,
    **data: Any,
) -> ToolFailure:
    assert category.startswith("upstream_"), category
    return ToolFailure(category, message, CODE_UPSTREAM, retryable, dict(data))


def internal(message: str = "Internal server error.", **data: Any) -> ToolFailure:
    return ToolFailure("internal", message, CODE_INTERNAL, False, dict(data))
