"""Validated environment-based configuration with safe defaults.

Every setting comes from the environment. The server fails fast on invalid
configuration and refuses to start in an insecure *production* shape:

* The Streamable HTTP transport **always** requires a per-request
  ``Authorization: Bearer <rel_...>`` credential. There is no flag to turn
  authentication off, at any level.
* Binding a non-loopback HTTP listener while ``ENVIRONMENT=production``
  additionally requires ``MCP_ALLOW_INSECURE_BIND=true``. Without it the
  process exits at startup, because bearer API keys on a plaintext hop are a
  credential leak, and a reverse proxy is the supported way to terminate TLS
  (see ``deploy/production/Caddyfile``).
* ``MCP_HTTP_ENABLED`` defaults to false so a deployment that never asked for
  the remote transport never gets one.

Setting names
-------------
Every field is read from an environment variable matching its own name
(case-insensitively), so the file reads naturally next to
``backend/.env.example``: ``RELIASTRA_API_URL``, ``MCP_HTTP_PORT``,
``ALLOW_MUTATIONS``. In addition, **every** setting also accepts an
``MCP_``-prefixed spelling, and the prefixed one wins — see
:meth:`McpServerConfig.settings_customise_sources`. That exists because a
handful of names (``LOG_LEVEL``, ``ALLOW_MUTATIONS``, ``RATE_LIMIT_PER_MINUTE``)
are generic enough that a container platform or a shared supervisord
``environment=`` line could set them for unrelated reasons and silently
reconfigure this server. ``MCP_LOG_LEVEL`` is always unambiguous.

Priority, highest first: call-site overrides, ``MCP_<FIELD>``, ``<FIELD>``,
dotenv file, secrets directory.
"""

from __future__ import annotations

import os
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import (
    BaseSettings,
    InitSettingsSource,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)

Environment = Literal["development", "staging", "production"]

#: Loopback hosts a plaintext HTTP bind is acceptable on.
_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


class ConfigurationError(RuntimeError):
    """Raised for configuration that must stop the process at startup."""


class McpServerConfig(BaseSettings):
    """MCP server configuration. Documented in ``backend/.env.example``."""

    model_config = SettingsConfigDict(
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
        # ``MCP_HTTP_HOST`` / ``MCP_TRANSPORT`` etc. are read as written.
        populate_by_name=True,
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        """Accept ``MCP_<FIELD>`` as a higher-priority spelling of every setting.

        Fields whose names already start with ``mcp_`` are skipped: their plain
        spelling *is* the prefixed one, and ``MCP_MCP_HTTP_PORT`` would be
        absurd. Values arrive as strings and go through the same field
        validators as any other environment value, so ``MCP_ALLOW_MUTATIONS=no``
        and ``MCP_TOOL_TIMEOUT_S=12`` are coerced and bounds-checked exactly
        like their unprefixed twins.
        """
        return (
            init_settings,
            InitSettingsSource(settings_cls, _prefixed_environment(settings_cls)),
            env_settings,
            dotenv_settings,
            file_secret_settings,
        )

    # ── Upstream Reliastra API (canonical source of truth for every tool) ──
    reliastra_api_url: str = Field(
        default="https://api.reliastra.com",
        description="Base URL of the Reliastra API. Only http/https allowed.",
    )
    reliastra_api_key: str | None = Field(
        default=None,
        description=(
            "API key (rel_...) used by the stdio transport and as a fallback. "
            "Never logged and never returned in tool output."
        ),
    )

    # ── Deployment shape ──
    environment: Environment = Field(default="development")
    allow_insecure_bind: bool = Field(
        default=False,
        description=(
            "Permit a non-loopback HTTP bind in production. Off by default: "
            "TLS must be terminated by the reverse proxy."
        ),
    )

    # ── Transports ──
    mcp_http_enabled: bool = Field(
        default=False,
        description="Serve the Streamable HTTP transport. Off unless asked for.",
    )
    mcp_http_host: str = Field(default="127.0.0.1")
    mcp_http_port: int = Field(default=8765, ge=1, le=65535)
    mcp_http_path: str = Field(default="/mcp")
    #: Stateless HTTP keeps no per-connection server state, so one instance can
    #: serve many callers and a fleet can be load-balanced without stickiness.
    #: A caller's identity comes from the per-request Authorization header, never
    #: from the connection.
    mcp_http_stateless: bool = Field(default=True)
    #: Hard caps on the remote transport. Bodies above this are refused by the
    #: SDK before any handler runs; sessions above the cap are refused too.
    mcp_http_max_body_bytes: int = Field(default=1_048_576, ge=1024, le=16_777_216)
    mcp_http_max_sessions: int = Field(default=1000, ge=1, le=100_000)
    mcp_http_session_idle_timeout_s: float = Field(default=900.0, gt=0, le=86_400)
    #: DNS-rebinding protection. The MCP SDK validates the Host header against an
    #: allow-list and answers **421 Misdirected Request** for anything else. Behind
    #: a reverse proxy the Host header is the *public* hostname, not the bind
    #: address, so a loopback-only allow-list rejects every proxied request.
    #: Comma-separated; ``host:*`` allows any port. Empty means "derive from the
    #: bind address", which is correct only for a directly-reached loopback server.
    mcp_http_allowed_hosts: str = Field(
        default="",
        description=(
            "Comma-separated Host header values to accept, e.g. "
            "'api.reliastra.com,127.0.0.1:*'. Required behind a reverse proxy."
        ),
    )
    #: Comma-separated Origin values. An absent Origin is always accepted, so
    #: non-browser MCP clients need nothing here; a browser-based client must be
    #: listed explicitly.
    mcp_http_allowed_origins: str = Field(default="")

    # ── Upstream resilience ──
    upstream_connect_timeout_s: float = Field(default=5.0, gt=0, le=30)
    upstream_read_timeout_s: float = Field(default=15.0, gt=0, le=120)
    upstream_max_retries: int = Field(default=2, ge=0, le=5)
    upstream_retry_base_s: float = Field(default=0.3, gt=0, le=5)
    circuit_breaker_threshold: int = Field(default=5, ge=2, le=20)
    circuit_breaker_cooldown_s: float = Field(default=30.0, gt=0, le=300)
    #: Ceiling on bytes read from one upstream response. A response above it is a
    #: protocol violation, not data: it is refused rather than buffered.
    upstream_max_response_bytes: int = Field(default=4_194_304, ge=4096, le=67_108_864)

    # ── Per-call execution budget ──
    #: One tool call, including its retries, may not run longer than this. A hung
    #: upstream must cost one failed tool call, never a wedged server.
    tool_timeout_s: float = Field(default=30.0, gt=0, le=300)
    #: Concurrent upstream requests this instance will have in flight. Bounds
    #: memory and protects the API from a fan-out of parallel agent calls.
    max_inflight_requests: int = Field(default=32, ge=1, le=512)

    # ── Server-side limits (instance-local; a fleet needs gateway limiting) ──
    rate_limit_per_minute: int = Field(default=120, ge=1, le=10000)
    default_page_size: int = Field(default=10, ge=1, le=50)
    max_page_size: int = Field(default=50, ge=1, le=100)
    #: Ceiling on entries in any list a tool returns, after upstream paging.
    #: Keeps one tool call from putting megabytes into an agent's context.
    max_result_items: int = Field(default=50, ge=1, le=200)

    # ── Mutations ──
    #: Operator kill-switch. With this false the server registers no
    #: state-changing tool at all: an agent cannot even discover one.
    allow_mutations: bool = Field(default=True)
    #: Ask the human on the other end of the agent to confirm before a write.
    #: Uses MCP elicitation; a client that declines or cannot answer means the
    #: write does not happen (fail-closed).
    mutation_confirmation_required: bool = Field(default=True)

    # ── Caching (public, cacheable data only; never authed/tenant data) ──
    public_cache_ttl_s: float = Field(default=60.0, ge=0, le=3600)
    public_cache_max_entries: int = Field(default=512, ge=16, le=10_000)

    # ── Observability ──
    log_level: str = Field(default="INFO")
    log_json: bool = Field(default=True)
    #: Register the MCP SDK's OpenTelemetry middleware. Spans are no-ops until an
    #: OTel SDK is configured, so this is safe to leave on and joins the caller's
    #: trace when one exists.
    otel_enabled: bool = Field(default=True)
    #: Expose Prometheus text at this path on the HTTP transport. Empty disables.
    metrics_path: str = Field(default="/metrics")
    health_path: str = Field(default="/healthz")

    # ── Validation ──

    @field_validator("reliastra_api_url")
    @classmethod
    def _http_url(cls, value: str) -> str:
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
        if not value:
            return None
        if not value.startswith("rel_") or len(value) < 12:
            raise ValueError("reliastra_api_key must look like rel_... (min 12 chars)")
        return value

    @field_validator("mcp_http_path", "metrics_path", "health_path")
    @classmethod
    def _leading_slash(cls, value: str) -> str:
        if not value:
            return value
        return value if value.startswith("/") else f"/{value}"

    @field_validator("log_level")
    @classmethod
    def _known_level(cls, value: str) -> str:
        level = value.strip().upper()
        if level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("log_level must be DEBUG/INFO/WARNING/ERROR/CRITICAL")
        return level

    @model_validator(mode="after")
    def _check_production_bind(self) -> McpServerConfig:
        """Refuse the insecure or unreachable production shape instead of warning.

        Two distinct misconfigurations are caught here, because both fail in a way
        that looks like a mystery rather than a configuration error:

        * a non-loopback bind in production without acknowledgement would carry
          bearer API keys over a plaintext hop;
        * a *loopback* bind behind a reverse proxy without
          ``MCP_HTTP_ALLOWED_HOSTS`` answers **421 Misdirected Request** to every
          proxied call, because the Host header is the public hostname and the
          SDK's DNS-rebinding allow-list defaults to loopback only.
        """
        if not self.mcp_http_enabled:
            return self
        if self.environment != "production":
            return self
        if self.mcp_http_host in _LOOPBACK_HOSTS:
            if not self._split_csv(self.mcp_http_allowed_hosts):
                raise ConfigurationError(
                    "MCP_HTTP_ENABLED=true in production with a loopback bind but no "
                    "MCP_HTTP_ALLOWED_HOSTS. If this server sits behind a reverse "
                    "proxy (the supported deployment), the Host header it forwards "
                    "is the public hostname and every request will be rejected with "
                    "421 Misdirected Request. Set MCP_HTTP_ALLOWED_HOSTS to that "
                    "hostname, e.g. 'api.reliastra.com'. If it is genuinely reached "
                    "only from this host, set MCP_HTTP_ALLOWED_HOSTS='127.0.0.1:*,localhost:*' "
                    "to say so explicitly."
                )
            return self
        if self.allow_insecure_bind:
            return self
        raise ConfigurationError(
            f"Refusing to bind the MCP HTTP transport to {self.mcp_http_host!r} in "
            "production: API keys would travel in plaintext. Terminate TLS at the "
            "reverse proxy and keep MCP_HTTP_HOST loopback (127.0.0.1), or set "
            "MCP_ALLOW_INSECURE_BIND=true only if the network path is already "
            "private and encrypted."
        )

    @property
    def is_loopback_bind(self) -> bool:
        return self.mcp_http_host in _LOOPBACK_HOSTS

    @staticmethod
    def _split_csv(value: str) -> list[str]:
        return [item.strip() for item in value.split(",") if item.strip()]

    @property
    def allowed_hosts(self) -> list[str]:
        """Host values to accept, derived from the bind address when unset."""
        explicit = self._split_csv(self.mcp_http_allowed_hosts)
        if explicit:
            return explicit
        hosts = ["127.0.0.1:*", "localhost:*", "[::1]:*"]
        if self.mcp_http_host not in _LOOPBACK_HOSTS:
            hosts.extend([f"{self.mcp_http_host}:*", self.mcp_http_host])
        return hosts

    @property
    def allowed_origins(self) -> list[str]:
        explicit = self._split_csv(self.mcp_http_allowed_origins)
        if explicit:
            return explicit
        return ["http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*"]

    @property
    def redacted(self) -> dict[str, Any]:
        """Config safe to log: the API key is never included."""
        data = self.model_dump()
        data["reliastra_api_key"] = "set" if self.reliastra_api_key else None
        return data


def _prefixed_environment(settings_cls: type[BaseSettings]) -> dict[str, Any]:
    """``MCP_<FIELD>`` values present in the environment, keyed by field name."""
    found: dict[str, Any] = {}
    for name in settings_cls.model_fields:
        if name.startswith("mcp_"):
            continue
        value = os.environ.get(f"MCP_{name.upper()}")
        if value is not None and value != "":
            found[name] = value
    return found


def load_config(**overrides: Any) -> McpServerConfig:
    """Load and validate configuration, or fail fast with a readable error.

    ``overrides`` are for tests and embedding code. They take **highest**
    priority — pydantic-settings ranks call-site arguments above every
    environment source — which is what makes the test suite deterministic on a
    machine whose environment happens to set ``LOG_LEVEL`` or ``ENVIRONMENT``.
    """
    try:
        return McpServerConfig(**overrides)
    except ConfigurationError:
        raise
    except Exception as exc:  # pydantic ValidationError and friends
        raise ConfigurationError(f"Invalid MCP server configuration: {exc}") from exc
