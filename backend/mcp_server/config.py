"""Validated environment-based configuration with safe defaults.

Every setting comes from the environment (``RELIASTRA_`` / ``MCP_`` prefixes).
The server fails fast on invalid configuration and can never start a remote
listener that silently skips authentication: the HTTP transport *always*
requires a per-request ``Authorization: Bearer <reliastra-api-key>`` — there
is no flag to disable it.
"""

from __future__ import annotations

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class McpServerConfig(BaseSettings):
    """MCP server configuration. See ``.env.example`` for documentation."""

    model_config = SettingsConfigDict(env_prefix="", case_sensitive=False)

    # — Upstream Reliastra API (canonical source of truth for every tool) —
    reliastra_api_url: str = Field(
        default="https://api.reliastra.com",
        description="Base URL of the Reliastra API. Only http/https allowed.",
    )
    reliastra_api_key: str | None = Field(
        default=None,
        description=(
            "API key (rel_...) used by the stdio transport and as a fallback. "
            "Never logged or returned in tool output."
        ),
    )

    # — Transports —
    mcp_http_host: str = Field(default="127.0.0.1")
    mcp_http_port: int = Field(default=8765, ge=1, le=65535)
    mcp_http_path: str = Field(default="/mcp")

    # — Upstream resilience —
    upstream_connect_timeout_s: float = Field(default=5.0, gt=0, le=30)
    upstream_read_timeout_s: float = Field(default=15.0, gt=0, le=120)
    upstream_max_retries: int = Field(default=2, ge=0, le=5)
    upstream_retry_base_s: float = Field(default=0.3, gt=0, le=5)
    circuit_breaker_threshold: int = Field(default=5, ge=2, le=20)
    circuit_breaker_cooldown_s: float = Field(default=30.0, gt=0, le=300)

    # — Server-side limits (instance-local; a fleet needs gateway limiting) —
    rate_limit_per_minute: int = Field(default=120, ge=1, le=10000)
    default_page_size: int = Field(default=10, ge=1, le=50)
    max_page_size: int = Field(default=50, ge=1, le=100)

    # — Caching (public, cacheable data only; never authed/tenant data) —
    public_cache_ttl_s: float = Field(default=60.0, ge=0, le=3600)

    log_level: str = Field(default="INFO")

    @field_validator("reliastra_api_url")
    @classmethod
    def _http_url(cls, value: str) -> str:
        from urllib.parse import urlparse

        parsed = urlparse(value.strip())
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ValueError("reliastra_api_url must be an http(s) URL with a host")
        if "@" in parsed.netloc:
            raise ValueError("reliastra_api_url must not embed credentials")
        return value.strip().rstrip("/")

    @field_validator("reliastra_api_key")
    @classmethod
    def _key_format(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value.startswith("rel_") or len(value) < 12:
            raise ValueError("reliastra_api_key must look like rel_... (min 12 chars)")
        return value

    @field_validator("mcp_http_path")
    @classmethod
    def _leading_slash(cls, value: str) -> str:
        return value if value.startswith("/") else f"/{value}"

    @property
    def redacted(self) -> dict:
        """Config safe to log: the API key is never included."""
        data = self.model_dump()
        data["reliastra_api_key"] = "set" if self.reliastra_api_key else None
        return data
