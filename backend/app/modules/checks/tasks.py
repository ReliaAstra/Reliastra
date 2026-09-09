import logging
import uuid
from typing import Any

from app.infrastructure.async_tasks import async_task_body
from app.infrastructure.celery_app import celery_app

logger = logging.getLogger(__name__)

# Transient failures (DB blips, broker hiccups, unexpected probe errors)
# should retry. Soft/hard time limits keep a stuck HTTP probe from blocking
# a worker forever. HTTP-level check failures are recorded by CheckService
# and do not raise, so they are not retried.
_EXECUTE_CHECK_AUTORETRY = (Exception,)


@celery_app.task(
    name="app.modules.checks.tasks.execute_check",
    autoretry_for=_EXECUTE_CHECK_AUTORETRY,
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    max_retries=3,
    expires=360,
    soft_time_limit=330,
    time_limit=360,
)
def execute_check(
    dependency_id: str, region: str, request_id: str | None = None
) -> dict[str, Any] | None:
    # Capture Celery request context before the async adapter changes threads.
    task_id = execute_check.request.id
    async def _run(session) -> dict[str, Any] | None:
        from app.modules.checks.service import check_service
        from app.modules.checks.models import CheckResult
        from sqlalchemy import select, text
        # NOTE: no region-affinity guard. The single-host deployment runs one
        # worker that must execute every region's probes; region stays a
        # result label. (A per-region-worker fleet may reintroduce affinity
        # together with queue routing + consumption.)
        result = None
        if task_id:
            # A transaction-scoped advisory lock serializes broker redelivery.
            lock_id = int.from_bytes(uuid.UUID(task_id).bytes[:8], 'big', signed=True)
            await session.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': lock_id})
            result = await session.scalar(select(CheckResult).where(CheckResult.id == uuid.UUID(task_id)).limit(1))
        if result is None:
            result = await check_service.execute_check(session, uuid.UUID(dependency_id), region, result_id=uuid.UUID(task_id) if task_id else None)
        if not result:
            return None
        return {
            "id": str(result.id),
            "dependency_id": str(result.dependency_id),
            "org_id": str(result.org_id),
            "region": result.region,
            "is_up": result.is_up,
            "latency_ms": result.latency_ms,
            "quorum_confirmed": result.quorum_confirmed,
        }

    return async_task_body(_run)


@celery_app.task(
    name="app.modules.checks.tasks.schedule_checks",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=2,
    soft_time_limit=45,
    time_limit=60,
)
def schedule_checks(request_id: str | None = None) -> int:
    """Celery Beat task: scan and dispatch due dependency checks.

    Runs on ``CHECK_SCHEDULE_SECONDS`` (configured in ``celery_app``).
    Delegates to ``CheckService.schedule_due_checks`` which reads at most
    500 due dependencies and fires one ``execute_check`` Celery task per
    dep/region pair.

    This is the ONLY thing that schedules checks. It also owns the scheduler
    heartbeat: a completed cycle proves Beat is alive and reaching the
    database, and the absence of a fresh heartbeat is how an operator learns
    that checks have silently stopped.
    """
    from app.modules.checks.scheduler_health import (
        record_scheduler_cycle,
        record_scheduler_heartbeat,
    )

    async def _run(session) -> int:
        from app.modules.checks.service import check_service

        dispatched = await check_service.schedule_due_checks(session)
        # Heartbeat only after a cycle that actually completed. Recording it
        # before the work would report a healthy scheduler for a cycle that
        # then failed.
        if await record_scheduler_heartbeat():
            record_scheduler_cycle("ok")
        else:
            record_scheduler_cycle("redis_unavailable")
        return dispatched

    return async_task_body(_run)


@celery_app.task(name="app.modules.checks.tasks.worker_heartbeat")
def worker_heartbeat(request_id: str | None = None) -> bool:
    """Beat-scheduled proof that a worker is consuming from the broker.

    Beat being alive only proves tasks are being *published*. This task is
    published on the same interval and does nothing but record that some worker
    picked it up, which closes the gap where Beat is healthy, the broker is
    healthy, and no worker is running at all - the failure mode that looks
    exactly like "every monitored vendor is quietly fine".
    """
    from app.modules.checks.scheduler_health import record_worker_heartbeat

    async def _run(session) -> bool:
        return await record_worker_heartbeat()

    return async_task_body(_run)


@celery_app.task(name="app.modules.checks.tasks.ensure_check_result_partitions")
def ensure_check_result_partitions(months_ahead: int = 12) -> int:
    """Create monthly partitions for the next *months_ahead* months.

    Scheduled monthly by Celery beat; also runs once in migration
    ``0015_production_hardening``.

    Now also creates observation partitions to fix the gap where
    ``observations`` had no partition management (P0-3 finding).
    """

    async def _run(session) -> int:
        from app.modules.checks.partition_manager import (
            ensure_partitions,
            ensure_observation_partitions,
        )

        created = 0
        names = await ensure_partitions(session, months_ahead)
        created += len(names)
        obs_names = await ensure_observation_partitions(session, months_ahead)
        created += len(obs_names)
        return created

    return async_task_body(_run)
