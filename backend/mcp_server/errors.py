"""Structured error taxonomy.

Every tool failure raises :class:`ToolFailure`, which the server translates to
an MCP wire error (``MCPError``) preserving code, safe message and machine
``data``. Upstream response bodies are never echoed: only the backend's public
``{error: {code, message}}`` envelope fields pass through, everything else is
replaced by a category. An upstream failure is never converted into a
successful-looking empty result.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# JSON-RPC: -32602/-32603 are spec codes; -32000..-32099 are
# implementation-defined server errors.
CODE_INVALID_INPUT = -32602
CODE_INTERNAL = -32603
CODE_UNAUTHENTICATED = -32001
CODE_FORBIDDEN = -32003
CODE_NOT_FOUND = -32004
CODE_RATE_LIMITED = -32000
CODE_UPSTREAM = -32050


@dataclass(frozen=True)
class ToolFailure(Exception):
    """A failed tool call with a stable category agents can branch on."""

    category: str
    message: str
    code: int = CODE_INTERNAL
    retryable: bool = False
    data: dict[str, Any] = field(default_factory=dict)

    def __str__(self) -> str:  # safe message only; never secrets/payloads
        return self.message

    def wire_data(self, request_id: str) -> dict[str, Any]:
        payload = {"category": self.category, "retryable": self.retryable, "request_id": request_id}
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


def rate_limited(retry_after_s: float = 60.0) -> ToolFailure:
    return ToolFailure(
        "rate_limited",
        "MCP server rate limit exceeded. Back off and retry.",
        CODE_RATE_LIMITED,
        True,
        {"retry_after_s": retry_after_s},
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
