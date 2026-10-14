"""Reliastra MCP server — agent-native access to verified dependency evidence.

A separate process from the FastAPI backend that communicates with it only over the
canonical HTTP API. It has no database access, never reads an internal table, and
never reimplements a Reliastra rule: the API is the sole authority on data,
authorization, tenant scope and plan entitlement.

Layout::

    config.py         validated environment configuration, fail-fast
    errors.py         structured error taxonomy (category, retryable, safe message)
    observability.py  Prometheus metrics, JSON logs, W3C trace propagation
    sanitization.py   URL-segment validation, secret redaction, untrusted content
    cache.py          bounded TTL cache for PUBLIC data only
    upstream.py       the single Reliastra API client boundary
    auth.py           credentials, transport gate, instance-local rate limiting
    capabilities.py   the verified capability registry (pinned to backend source)
    resources.py      MCP resources: stable reference documents
    prompts.py        MCP prompts: the four primary workflows
    server.py         composition root and transport entry points
    tools/            one module per tool surface; tools/__init__.py is the registry

Run it::

    python -m mcp_server --transport stdio
    python -m mcp_server --transport streamable-http
    python -m mcp_server --print-capabilities

Add a tool: write ``tools/<surface>.py`` exposing ``register(server, deps)`` and add
the module to ``tools/__init__.py:ALL_MODULES``. Nothing else changes.
"""

from __future__ import annotations

__version__ = "0.1.0"

__all__ = ["__version__"]
