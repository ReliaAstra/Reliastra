"""Server assembly and transport entry points.

One composition root. ``create_server`` builds the MCPServer and its dependencies;
``build_http_app`` wraps it for the remote transport; ``run_stdio``/``run_http`` are
the two process entry points. Tool, resource and prompt modules know nothing about
transports, and transports know nothing about individual tools.

Transport choice
----------------
``stdio`` for a local agent that spawns this process: the credential comes from
``RELIASTRA_API_KEY`` in the environment, which is the protocol's environment-based
credential guidance.

``streamable-http`` for a remote caller: **always authenticated**. There is no
configuration that serves the MCP protocol without a bearer credential. HTTP/2 SSE is
the legacy transport and is not used.

Process topology
----------------
The HTTP transport runs as **its own process**, not mounted inside the FastAPI API.
That is a measured constraint, not a preference: the MCP SDK builds its Streamable
HTTP app with ``lifespan=lambda app: session_manager.run()``, and Starlette does not
run a mounted sub-application's lifespan, so mounting it into
``app/bootstrap/app_factory.py`` fails at the first request with
``RuntimeError: Task group is not initialized``. Starting the session manager from the
API's lifespan would work but would couple an optional agent surface to the startup of
a security product's core API on a 1.6 GB host. A separate supervised process keeps
the two failure domains apart and can be switched off entirely.

Observability
-------------
Built on what the stack already runs rather than a parallel system: Prometheus metrics
(``prometheus-client``, as ``app/platform/observability/metrics.py`` does), W3C
``traceparent`` propagation in the format ``app/platform/observability/tracing.py``
parses, and single-line JSON logs. The MCP SDK's own OpenTelemetry middleware is
registered when ``otel_enabled`` is true; it is a no-op until an OTel SDK is
configured, and it joins the caller's trace when one exists.
"""

from __future__ import annotations

import contextlib
import time
from collections.abc import AsyncIterator
from typing import Any

from mcp.server.mcpserver import MCPServer
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse

from . import __version__ as SERVER_VERSION
from .auth import McpAuthMiddleware, RateLimiter, TokenVerifier
from .cache import PublicCache
from .config import McpServerConfig, load_config
from .observability import get_logger, render_metrics
from .prompts import register as register_prompts
from .resources import register as register_resources
from .tools import register_all as register_tools
from .tools._base import ServerDeps
from .upstream import ReliastraClient

log = get_logger("server")

INSTRUCTIONS = """Reliastra observes the world's external infrastructure and turns distributed
observations into evidence.

START WITH reliastra_get_capabilities. It returns the verified product contract -
what Reliastra can do, what YOUR credential permits, the observation and detection
methodology, the attribution model and its score ceiling, and what Reliastra
explicitly does not do. Every other answer here should be consistent with it.

THREE THINGS TO KEEP STRAIGHT

1. Reliastra probes HTTP(S) endpoints. It cannot monitor a database, queue, cache,
   internal service, DNS or gRPC target, and no configuration changes that.
2. An observation is Reliastra's probe of a target, not a request your application
   made. Provider-level evidence never proves that your request failed.
3. Attribution is deterministic weighted-signal correlation (v1.1), not causation.
   With one deployed observation point the maximum reachable score is 55.0, below
   the 75 needed for 'vendor_failure', so 'unknown' is a common and correct answer.

READ A NULL AS A NULL. uptime=null means nothing was measured, not 100%.
verified=null means the check could not run, not that it passed. An empty
observation list is ambiguous: call reliastra_get_pipeline_health to tell "the
provider was quiet" from "Reliastra stopped measuring".

TYPICAL ORDER: reliastra_get_capabilities, then reliastra_analyze_dependencies to
establish whether a gap is real, then reliastra_search_observatory /
reliastra_search_incidents for independent evidence, then
reliastra_plan_integration for steps. reliastra_workflow_* prompts encode these
sequences.

WRITES ARE CONFIRMED BY THE USER. reliastra_register_dependency and
reliastra_trigger_check ask the client for approval. You cannot approve on the
user's behalf, and a decline is final - report it rather than retrying around it.

NEVER CLAIM MORE THAN THE EVIDENCE SUPPORTS. If the analysis says Reliastra adds no
value here, say that. A well-supported "no" is a complete answer."""


def create_server(
    config: McpServerConfig | None = None,
    *,
    transport_override: Any | None = None,
    token_verifier: TokenVerifier | None = None,
) -> tuple[MCPServer, ServerDeps]:
    """Build the server and its dependencies. Returns ``(server, deps)``.

    ``transport_override`` is for tests: an httpx ASGI transport pointed at a fake
    upstream, so no test needs a live Reliastra API.
    """
    cfg = config or load_config()
    get_logger("config", cfg.log_level, json_logs=cfg.log_json)

    cache = PublicCache(cfg.public_cache_ttl_s, cfg.public_cache_max_entries)
    client = ReliastraClient(cfg, transport=transport_override, cache=cache)
    limiter = RateLimiter(cfg.rate_limit_per_minute)
    deps = ServerDeps(config=cfg, client=client, limiter=limiter)

    middleware = _build_middleware(cfg)
    server = MCPServer(
        name="reliastra",
        title="Reliastra — external dependency observability and evidence",
        description=(
            "Independent, hash-verifiable evidence about external HTTP dependencies: "
            "a public observatory of provider failures, monitoring of your own "
            "dependencies, deterministic attribution, and frozen evidence artifacts a "
            "third party can verify without an account."
        ),
        instructions=INSTRUCTIONS,
        version=SERVER_VERSION,
        middleware=middleware or None,
        lifespan=_make_lifespan(deps),
    )

    register_tools(server, deps)
    register_resources(server, deps)
    register_prompts(server)
    _register_http_routes(server, deps)

    log.info(
        "server_built",
        extra={
            "version": SERVER_VERSION,
            "tools": len(deps.registered_tools),
            "mutations_enabled": cfg.allow_mutations,
            "environment": cfg.environment,
            "upstream": cfg.reliastra_api_url,
        },
    )
    return server, deps


def _build_middleware(config: McpServerConfig) -> list[Any]:
    """Context-tier middleware. The SDK's OTel middleware is opt-out, not opt-in."""
    if not config.otel_enabled:
        return []
    try:
        from mcp.server._otel import OpenTelemetryMiddleware
    except ImportError:  # pragma: no cover - SDK ships it; guard against removal
        log.warning("otel_middleware_unavailable")
        return []
    return [OpenTelemetryMiddleware()]


def _make_lifespan(deps: ServerDeps) -> Any:
    """Own the upstream client's lifetime so shutdown is graceful."""

    @contextlib.asynccontextmanager
    async def lifespan(_server: MCPServer) -> AsyncIterator[dict[str, Any]]:
        started = time.monotonic()
        log.info("mcp_startup", extra={"tools": len(deps.registered_tools)})
        try:
            yield {}
        finally:
            # Cancel nothing in flight: requests are bounded by tool_timeout_s and
            # the upstream client's own timeouts. Closing the pool is enough, and it
            # is what makes a restart leak no sockets.
            with contextlib.suppress(Exception):
                await deps.client.aclose()
            log.info(
                "mcp_shutdown",
                extra={"uptime_s": round(time.monotonic() - started, 1)},
            )

    return lifespan


def _register_http_routes(server: MCPServer, deps: ServerDeps) -> None:
    """Health and metrics routes.

    Registered through the SDK's ``custom_route``, which places them outside the MCP
    protocol route and outside any authorization wrapper. That is deliberate: a load
    balancer must be able to probe liveness and Prometheus must be able to scrape
    without a Reliastra API key, and neither endpoint returns tenant data.
    """

    @server.custom_route(deps.config.health_path, methods=["GET"], name="healthz")
    async def healthz(request: Request) -> JSONResponse:
        """Liveness. Says nothing about upstream health, by design."""
        return JSONResponse(
            {
                "status": "ok",
                "server": "reliastra-mcp",
                "version": SERVER_VERSION,
                "tools": len(deps.registered_tools),
                "mutations_enabled": deps.config.allow_mutations,
                "transport": "streamable-http",
                "meaning": (
                    "This process can accept MCP requests. It does NOT assert that "
                    "the Reliastra API is reachable - see /readyz for the upstream "
                    "circuit state, and reliastra_get_pipeline_health for whether "
                    "Reliastra's check pipeline is running."
                ),
            }
        )

    @server.custom_route("/readyz", methods=["GET"], name="readyz")
    async def readyz(request: Request) -> JSONResponse:
        """Readiness, with the upstream circuit reported but not fatal.

        An open circuit means upstream calls will fail fast with an honest error,
        which is a serviceable state: the server can still answer, still report the
        outage correctly, and still serve local tools. Failing readiness here would
        pull the instance out of rotation exactly when it is most useful for
        explaining the outage. The state is reported so an operator can alert on it.
        """
        circuit_open = deps.client.breaker_open
        ready = True
        return JSONResponse(
            {
                "status": "ready" if ready else "not_ready",
                "upstream": {
                    "url": deps.config.reliastra_api_url,
                    "circuit_open": circuit_open,
                },
                "cache": deps.client.cache.stats(),
                "rate_limiter": deps.limiter.snapshot(),
                "admission": deps.admission.snapshot(),
                "meaning": (
                    "circuit_open=true means upstream calls fail fast with an "
                    "explicit error rather than hanging. It is reported, not treated "
                    "as unready: a server that can honestly report an outage is still "
                    "serving."
                ),
            },
            status_code=200 if ready else 503,
        )

    if deps.config.metrics_path:

        @server.custom_route(
            deps.config.metrics_path, methods=["GET"], name="metrics"
        )
        async def metrics(request: Request) -> Any:
            from starlette.responses import Response

            payload, content_type = render_metrics()
            return Response(content=payload, media_type=content_type)


def build_http_app(
    server: MCPServer,
    deps: ServerDeps,
    *,
    token_verifier: TokenVerifier | None = None,
) -> Starlette:
    """The Streamable HTTP ASGI app, with the authentication gate wrapped around it.

    Stateless by default, so no per-connection server state is kept and a fleet can
    be load-balanced without session stickiness. The caller's identity arrives on
    every request as a bearer credential and is read from that request, never from
    connection state.
    """
    config = deps.config
    from mcp.server.transport_security import TransportSecuritySettings

    app = server.streamable_http_app(
        streamable_http_path=config.mcp_http_path,
        stateless_http=config.mcp_http_stateless,
        max_request_body_size=config.mcp_http_max_body_bytes,
        max_sessions=config.mcp_http_max_sessions,
        session_idle_timeout=config.mcp_http_session_idle_timeout_s,
        host=config.mcp_http_host,
        # Explicit rather than left to the SDK's localhost-only default: behind a
        # reverse proxy the Host header is the public hostname, and an allow-list
        # that does not contain it turns every request into a 421.
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=config.allowed_hosts,
            allowed_origins=config.allowed_origins,
        ),
    )
    app.add_middleware(
        McpAuthMiddleware,
        config,
        deps.limiter,
        exempt_paths=frozenset(
            path
            for path in (config.health_path, "/readyz", config.metrics_path)
            if path
        ),
        token_verifier=token_verifier,
    )
    return app


async def run_stdio(config: McpServerConfig | None = None, **kwargs: Any) -> None:
    """Serve over stdio. Logs go to stderr; stdout is the protocol channel."""
    cfg = config or load_config()
    server, _deps = create_server(cfg, **kwargs)
    log.info("transport_start", extra={"transport": "stdio", "version": SERVER_VERSION})
    # The SDK's stdio runner reads stdin and writes JSON-RPC to stdout. Any log line
    # on stdout would corrupt the stream, so logging is bound to stderr explicitly.
    await server.run_stdio_async()


async def run_http(
    config: McpServerConfig | None = None,
    *,
    token_verifier: TokenVerifier | None = None,
    **kwargs: Any,
) -> None:
    """Serve the authenticated Streamable HTTP transport with uvicorn."""
    import uvicorn

    cfg = config or load_config()
    if not cfg.mcp_http_enabled:
        raise SystemExit(
            "MCP_HTTP_ENABLED is false. Set it to true to serve the remote "
            "transport, or use --transport stdio."
        )
    server, deps = create_server(cfg, **kwargs)
    app = build_http_app(server, deps, token_verifier=token_verifier)
    log.info(
        "transport_start",
        extra={
            "transport": "streamable-http",
            "host": cfg.mcp_http_host,
            "port": cfg.mcp_http_port,
            "path": cfg.mcp_http_path,
            "stateless": cfg.mcp_http_stateless,
            "loopback": cfg.is_loopback_bind,
            "environment": cfg.environment,
            "version": SERVER_VERSION,
        },
    )
    uvi_config = uvicorn.Config(
        app,
        host=cfg.mcp_http_host,
        port=cfg.mcp_http_port,
        log_level=cfg.log_level.lower(),
        # stdout is free on this transport, but keep access logs out of the JSON
        # stream so one log pipeline can parse everything.
        access_log=False,
    )
    server_uvicorn = uvicorn.Server(uvi_config)
    await server_uvicorn.serve()
