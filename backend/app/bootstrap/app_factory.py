"""Application factory: assemble the FastAPI app from bootstrap parts.

``create_app()`` is the only way to build the API. It wires, in order:

1. logging + exception handlers (JSON error envelope everywhere),
2. CORS,
3. middleware (CORS → RequestId → Tenant → Idempotency → router),
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
from app.bootstrap.middleware import IdempotencyMiddleware, RequestIdMiddleware
from app.bootstrap.routers import mount_routers
from app.config import settings
from app.platform.observability.logging import configure_logging
from app.platform.tenancy.middleware import TenantContextMiddleware
from app.platform.web.errors import setup_exception_handlers


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(
        title="Reliastra MVP API",
        version="0.1.0",
        description="External dependency intelligence platform API",
        # Interactive API consoles live off `/docs*` on purpose: the apex
        # `/docs/*` namespace belongs to the public product documentation
        # (Next.js, indexed by search engines). The machine-readable spec
        # stays at the conventional `/openapi.json`.
        docs_url="/api-docs",
        redoc_url="/api-redoc",
        openapi_url="/openapi.json",
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

    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(TenantContextMiddleware)
    app.add_middleware(IdempotencyMiddleware)

    mount_routers(app)
    app.include_router(health_router)

    return app
