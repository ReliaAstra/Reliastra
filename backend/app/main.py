"""Process entrypoint: ``uvicorn app.main:app``.

Thin by design — all assembly lives in :mod:`app.bootstrap`:

* :mod:`app.bootstrap.app_factory` — ``create_app()``
* :mod:`app.bootstrap.middleware` — request id + idempotency
* :mod:`app.bootstrap.lifespan` — startup/shutdown
* :mod:`app.bootstrap.routers` — router registry (the mount table)
* :mod:`app.bootstrap.health` — ``/health*`` + ``/metrics``

The middleware re-exports below are the backward-compatible surface for
``from app.main import RequestIdMiddleware`` / ``IdempotencyMiddleware``.
"""

from app.bootstrap.app_factory import create_app
from app.bootstrap.lifespan import lifespan
from app.bootstrap.middleware import IdempotencyMiddleware, RequestIdMiddleware

__all__ = [
    "app",
    "create_app",
    "lifespan",
    "IdempotencyMiddleware",
    "RequestIdMiddleware",
]

app = create_app()
