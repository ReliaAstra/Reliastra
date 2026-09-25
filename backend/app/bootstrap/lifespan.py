"""Application lifespan: startup checks and shutdown cleanup.

Moved verbatim from ``app.main`` during the bootstrap extraction. Behavior is
unchanged; only the import paths moved to canonical locations.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.modules.admin.seed import ensure_admin_service_account
from app.platform.integrations.redis import close_redis
from app.platform.persistence.session import get_engine

logger = logging.getLogger(__name__)


async def _report_check_pipeline_requirements() -> None:
    """State the check pipeline's runtime requirements at startup, and probe them.

    Check scheduling is provided by Celery Beat, and only by Celery Beat: there
    is no in-process fallback and the API never executes a probe itself. An API
    running on its own therefore serves every other request normally while
    executing exactly zero checks - which is why the requirement is logged
    loudly and the broker is probed, rather than left to be discovered from an
    empty dashboard hours later.
    """
    import asyncio

    from app.modules.checks.scheduler_health import sanitize_broker_url
    from app.platform.messaging.celery_app import beat_task_names, probe_broker

    logger.info(
        "Check scheduling is provided by Celery Beat. A healthy deployment "
        "requires Redis, Celery Beat, and at least one Celery worker "
        "(broker=%s, interval=%ss, beat tasks=%s). The API does not schedule "
        "or execute checks itself.",
        sanitize_broker_url(settings.REDIS_URL),
        settings.CHECK_SCHEDULE_SECONDS,
        ",".join(beat_task_names()),
    )

    # Bounded and threaded: kombu is synchronous, and a dead broker must cost
    # seconds of startup, not minutes.
    try:
        broker_ok, broker_detail = await asyncio.wait_for(
            asyncio.to_thread(probe_broker, 3.0), timeout=6.0
        )
    except Exception as exc:  # pragma: no cover - a probe must never block boot
        broker_ok, broker_detail = False, f"{type(exc).__name__}"

    if broker_ok:
        logger.info("Celery broker reachable - check dispatch is possible")
    else:
        logger.error(
            "Celery broker UNREACHABLE (%s): checks will NOT execute until "
            "Redis and a Celery worker are running. GET /health/checks and "
            "GET /v1/checks/health report this state; dependencies stay due "
            "and are retried once the broker returns.",
            broker_detail,
        )


async def _sync_vendor_registry() -> None:
    """Reconcile the vendor registry at boot so onboarding is deploy complete.

    The daily beat sync keeps the registry converged afterwards; doing it
    once at startup means a newly deployed registry takes effect on first
    boot rather than at the next 04:50 tick. The sync is an idempotent
    identity upsert (no probes, no broker, no deletions), so parallel
    replicas racing it converge on the same rows. A failure is loud but
    never blocks boot: the last successful registry keeps serving.
    """
    try:
        from app.db.session import get_session_maker
        from app.modules.vendors.service import vendor_service

        session_maker = get_session_maker()
        async with session_maker() as session:
            created = await vendor_service.seed_vendors(session)
            await session.commit()
        logger.info("Vendor registry sync at startup complete (created=%s)", created)
    except Exception:  # pragma: no cover - startup must never raise
        logger.error(
            "Vendor registry sync at startup FAILED; the catalog serves the "
            "last synced registry until the daily beat reconciliation.",
            exc_info=True,
        )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("Reliastra backend starting up...")
    get_engine()
    await _report_check_pipeline_requirements()
    await ensure_admin_service_account()
    await _sync_vendor_registry()
    yield
    logger.info("Reliastra backend shutting down...")
    try:
        from app.platform.security.ssrf import close_pinned_transports
        await close_pinned_transports()
    except Exception:  # pragma: no cover - shutdown must never raise
        logger.debug("Error closing pinned transports", exc_info=True)
    try:
        from app.modules.notifications.service import close_notification_http_client
        await close_notification_http_client()
    except Exception:  # pragma: no cover - shutdown must never raise
        logger.debug("Error closing notification HTTP client", exc_info=True)
    try:
        from app.modules.billing.service import close_paystack_http_client
        await close_paystack_http_client()
    except Exception:  # pragma: no cover - shutdown must never raise
        logger.debug("Error closing Paystack HTTP client", exc_info=True)
    try:
        from app.platform.integrations.email_resend import close_resend_client
        await close_resend_client()
    except Exception:  # pragma: no cover
        logger.debug("Error closing Resend client", exc_info=True)
    await close_redis()
