"""Application factory: assemble the FastAPI app from bootstrap parts.

``create_app()`` is the only way to build the API. It wires, in order:

1. logging + exception handlers (JSON error envelope everywhere),
2. CORS,
3. middleware (CORS → Observability → RequestId → Tenant → Idempotency → router),
4. domain routers (see :mod:`app.bootstrap.routers` for the mount table),
5. health/observability endpoints (see :mod:`app.bootstrap.health`).

Process entrypoints (``uvicorn app.main:app``, tests) use the singleton in
:mod:`app.main`; call ``create_app()`` directly when you need an isolated
instance (e.g. middleware unit tests).
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.bootstrap.health import health_router
from app.bootstrap.lifespan import lifespan
from app.bootstrap.middleware import (
    IdempotencyMiddleware,
    ObservabilityMiddleware,
    RequestIdMiddleware,
)
from app.bootstrap.routers import mount_routers
from app.config import settings
from app.platform.observability.logging import configure_logging
from app.platform.tenancy.middleware import TenantContextMiddleware
from app.platform.web.errors import setup_exception_handlers


def create_app() -> FastAPI:
    configure_logging()
    expose_schema = settings.EXPOSE_API_SCHEMA

    # The OpenAPI schema and the interactive consoles are OFF unless explicitly
    # enabled. /openapi.json enumerates every registered route — including the
    # authenticated ones (/v1/billing/*, /v1/api-keys/*, admin control plane,
    # /v1/evidence/{report_token}/download). Serving it unauthenticated turns one
    # GET into a complete attack-surface map, which for a security product is a
    # disclosure that undercuts the product's own claim.
    #
    # Two independent layers guard this: this flag, and the Caddyfile, which does
    # not proxy these paths at all. Either alone is sufficient; both are kept so
    # a misconfigured proxy cannot re-expose the schema.
    #
    # The apex `/docs/*` namespace is unrelated and unaffected: it belongs to the
    # public product documentation served by Next.js.
    app = FastAPI(
        title="Reliastra API",
        version="0.1.0",
        description="External dependency intelligence platform API",
        docs_url="/api-docs" if expose_schema else None,
        redoc_url="/api-redoc" if expose_schema else None,
        openapi_url="/openapi.json" if expose_schema else None,
        lifespan=lifespan,
    )

    setup_exception_handlers(app)

    # NOTE: Per the CORS spec, browsers reject allow_credentials=True when
    # allow_origins is "*". Use a specific origin list or set credentials=False.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "X-API-Key",
            "X-Organization-ID",
            "Reliastra-Organization",
            "Content-Type",
            "Accept",
            "Accept-Language",
            "Idempotency-Key",
            "X-Request-ID",
            "x-paystack-signature",
            "svix-id",
            "svix-timestamp",
            "svix-signature",
        ],
    )

    app.add_middleware(ObservabilityMiddleware)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(TenantContextMiddleware)
    app.add_middleware(IdempotencyMiddleware)

    mount_routers(app)
    app.include_router(health_router)

    return app
