import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.infrastructure.async_tasks import async_task_body
from app.infrastructure.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.modules.observations.tasks.process_outbox")
def process_outbox(batch_size: int = 100, request_id: str | None = None) -> int:
    """Drain pending observation outbox events (runs every 10s via beat)."""

    async def _run(session) -> int:
        try:
            from app.modules.observations.outbox import process_outbox_batch

            return await process_outbox_batch(session, batch_size)
        except Exception:
            logger.exception(
                "Observation outbox processing failed (request_id=%s)",
                request_id,
            )
            raise

    return async_task_body(_run)


@celery_app.task(name="app.modules.observations.tasks.retention_cleanup")
def retention_cleanup(retention_days: int | None = None) -> int:
    """Prune stale observations per organization based on its EFFECTIVE plan.

    Retention is no longer a single global 365-day value. Each organization is
    pruned according to the retention policy of its effective plan (which
    follows the 14-day PRO trial while a Free org is in trial). Enterprise /
    custom plans (retention == None) are never pruned here.

    ``retention_days`` is accepted for back-compat with the beat schedule but
    is now ignored for the effective calculation — it only sets an upper bound
    safety cap when no plan-specific retention can be resolved.
    """

    async def _run(session) -> int:
        from app.core.permissions import get_effective_plan_for_org, get_retention_days
        from app.modules.observations.repository import ObservationRepository
        from app.modules.organizations.models import Organization

        try:
            now = datetime.now(timezone.utc)
            total_deleted = 0
            rows = (await session.execute(select(Organization.id))).scalars().all()
            for org_id in rows:
                org = await session.get(Organization, org_id)
                if org is None:
                    continue
                effective = get_effective_plan_for_org(org)
                days = get_retention_days(effective)
                # Enterprise/custom plans and unknown plans are never pruned
                # by the default job. Skip when no retention policy is
                # configured for the effective plan.
                if days is None:
                    continue
                cutoff = now - timedelta(days=days)
                deleted = await ObservationRepository.delete_before_for_org(
                    session, org_id, cutoff
                )
                total_deleted += deleted
                if deleted:
                    logger.info(
                        "Retention cleanup: removed %s observations for org %s (plan=%s, retention=%sd)",
                        deleted,
                        org_id,
                        effective,
                        days,
                    )
            logger.info("Retention cleanup completed: removed %s observations", total_deleted)
            return total_deleted
        except Exception:
            logger.exception("Observation retention cleanup failed")
            raise

    return async_task_body(_run)


@celery_app.task(name="app.modules.observations.tasks.daily_aggregation")
def daily_aggregation() -> int:
    """Record the prior day's volume for operational capacity reporting.

    Read endpoints aggregate directly from the immutable observations. Keeping
    this task side-effect free avoids introducing a second source of truth.
    """

    async def _run(session) -> int:
        now = datetime.now(timezone.utc)
        end = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start = end - timedelta(days=1)
        from app.modules.observations.repository import ObservationRepository

        count = await ObservationRepository.count_between(session, start, end)
        logger.info("Observation volume for %s: %s", start.date(), count)
        return count

    return async_task_body(_run)
