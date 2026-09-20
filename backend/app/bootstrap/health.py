"""Health and observability endpoints: /health*, /metrics.

Moved verbatim from ``app.main.create_app`` closures during the bootstrap
extraction. Paths, tags, operation ids (function names), payloads, status
codes and the 5s readiness cache are unchanged.

Probe contract (for orchestrators and alerts):

* ``GET /health/live`` — cheap liveness, no I/O. Restart the API if this fails.
* ``GET /health`` + ``GET /health/ready`` — readiness (DB + Redis), cached 5s.
  Failing here means "don't send traffic", not "restart".
* ``GET /health/checks`` — check-pipeline probe (Beat + worker + broker).
  Failing here means "revive Beat/worker", never "restart the API".
* ``GET /metrics`` — Prometheus exposition for the whole fleet (multiprocess
  aware; see :mod:`app.platform.observability.metrics`).
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from fastapi import APIRouter, Response
from fastapi.responses import PlainTextResponse

from app.platform.integrations.redis import safe_redis_ping
from app.platform.persistence.session import get_engine

logger = logging.getLogger(__name__)

health_router = APIRouter()

# FIX 13: /health/ready results are cached for 5 seconds so K8s probe storms
# during an outage do not multiply DB/Redis load.
_READY_CACHE_TTL_SECONDS = 5.0
_ready_cache: dict[str, Any] = {"ts": 0.0, "payload": None}


async def _run_health_checks() -> tuple[dict[str, Any], int]:
    checks: dict[str, Any] = {}
    overall_status = "ok"

    # Database connectivity check
    try:
        engine = get_engine()
        from sqlalchemy import text
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        msg = str(exc)
        # Truncate long connection error messages for cleanliness
        if "Connect call failed" in msg:
            msg = "connection refused"
        checks["database"] = f"unavailable: {msg}"
        overall_status = "degraded"

    # Redis connectivity check
    if await safe_redis_ping():
        checks["redis"] = "ok"
    else:
        checks["redis"] = "unavailable: connection refused"
        overall_status = "degraded"

    # Check-pipeline health is reported here for visibility but does NOT
    # drive this endpoint's status code. /health answers "can this API
    # serve requests"; a dead Celery Beat is not fixed by restarting the
    # API, and failing this probe would make orchestrators restart the API
    # in a loop for an unrelated outage. The pipeline has its own probe
    # that does fail: GET /health/checks (alias of /v1/checks/health).
    try:
        from app.modules.checks.scheduler_health import read_pipeline_health

        pipeline = await read_pipeline_health()
        checks["check_pipeline"] = pipeline["status"]
        checks["check_scheduler"] = pipeline["scheduler"]["status"]
        checks["check_worker"] = pipeline["worker"]["status"]
    except Exception as exc:  # pragma: no cover - never break /health
        logger.debug("check pipeline health unavailable: %s", exc)
        checks["check_pipeline"] = "unknown"

    status_code = 200 if overall_status == "ok" else 503
    payload = {
        "status": overall_status,
        "service": "reliastra-backend",
        "version": "0.1.0",
        "checks": checks,
    }
    return payload, status_code


async def _ready_response() -> Response:
    now = time.monotonic()
    if (
        _ready_cache["payload"] is None
        or now - _ready_cache["ts"] > _READY_CACHE_TTL_SECONDS
    ):
        payload, status_code = await _run_health_checks()
        _ready_cache["payload"] = (payload, status_code)
        _ready_cache["ts"] = now
    payload, status_code = _ready_cache["payload"]
    return Response(
        content=json.dumps(payload),
        status_code=status_code,
        media_type="application/json",
    )


@health_router.get("/health", tags=["Health"])
async def health_check() -> Response:
    """Full health check (DB + Redis), cached for 5s (FIX 13)."""
    return await _ready_response()


@health_router.get("/health/live", tags=["Health"])
async def liveness_check() -> dict[str, Any]:
    """FIX 13: cheap liveness probe - no DB/Redis access."""
    return {
        "status": "ok",
        "service": "reliastra-backend",
        "version": "0.1.0",
    }


@health_router.get("/health/ready", tags=["Health"])
async def readiness_check() -> Response:
    """FIX 13: readiness probe - DB + Redis, cached for 5s."""
    return await _ready_response()


@health_router.get("/health/checks", tags=["Health"])
async def check_pipeline_probe() -> Response:
    """Check-pipeline probe - 503 unless Beat, a worker and the broker are alive.

    This is the endpoint to alert on for "checks have silently stopped".
    It is deliberately separate from ``/health/ready``: restarting the API
    does not revive a dead Beat, so the two failures must not share a
    status code. Alias of ``/v1/checks/health``.
    """
    from app.modules.checks.router import check_pipeline_health

    return await check_pipeline_health()


@health_router.get("/metrics", tags=["Observability"])
async def metrics() -> PlainTextResponse:
    """FIX 12: Prometheus exposition endpoint."""
    from app.platform.observability.metrics import (
        metrics_content_type,
        render_metrics,
    )

    return PlainTextResponse(
        content=render_metrics(), media_type=metrics_content_type()
    )
