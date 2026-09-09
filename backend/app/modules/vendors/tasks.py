"""Public observations are scheduled and persisted independently of customer data."""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from app.config import settings
from app.infrastructure.async_tasks import async_task_body
from app.infrastructure.celery_app import celery_app
from app.modules.vendors.models import VendorEndpoint, VendorTracking

logger = logging.getLogger(__name__)


@celery_app.task(name='app.modules.vendors.tasks.seed_vendors')
def seed_vendors_task():
    async def run(session):
        from app.modules.vendors.service import vendor_service
        return await vendor_service.seed_vendors(session)
    return async_task_body(run)


@celery_app.task(name='app.modules.vendors.tasks.schedule_vendor_checks', autoretry_for=(Exception,), retry_backoff=True, max_retries=3)
def schedule_vendor_checks():
    async def run(session):
        now = datetime.now(timezone.utc)
        endpoints = (await session.scalars(select(VendorEndpoint).join(VendorTracking).where(
            VendorEndpoint.is_active.is_(True), VendorTracking.is_public.is_(True),
            (VendorEndpoint.next_check_at.is_(None)) | (VendorEndpoint.next_check_at <= now),
        ).order_by(VendorEndpoint.next_check_at.asc().nullsfirst()).limit(100).with_for_update(of=VendorEndpoint, skip_locked=True))).all()
        for endpoint in endpoints:
            # A region label must identify the worker's real deployment, not a loop
            # that repeats requests from one machine under several region names.
            execute_vendor_check.apply_async(args=[str(endpoint.id), now.isoformat(), settings.CHECK_WORKER_REGION], expires=max(120, endpoint.check_interval_seconds))
            endpoint.next_check_at = now + timedelta(seconds=endpoint.check_interval_seconds)
        await session.flush()
        return len(endpoints)
    return async_task_body(run)


@celery_app.task(name='app.modules.vendors.tasks.execute_vendor_check', autoretry_for=(Exception,), retry_backoff=True, max_retries=3, soft_time_limit=45, time_limit=60)
def execute_vendor_check(endpoint_id: str, scheduled_at: str, region: str):
    async def run(session):
        from app.modules.checks.http_probe import observe_http
        from app.modules.observations.schemas import ObservationCreateDTO
        from app.modules.observations.service import observation_service
        endpoint = await session.scalar(select(VendorEndpoint).where(VendorEndpoint.id == uuid.UUID(endpoint_id)).with_for_update())
        if not endpoint or not endpoint.is_active:
            return None
        vendor = await session.get(VendorTracking, endpoint.vendor_id)
        if not vendor or not vendor.is_public:
            return None
        # Duplicate/redelivered jobs and older jobs behind a newer result are no-ops.
        # NOTE: no region-affinity guard (see checks.tasks.execute_check):
        # the single-host worker executes every region's probes.
        if endpoint.last_check_at and endpoint.last_check_at >= datetime.fromisoformat(scheduled_at):
            return None
        result = await observe_http(endpoint.endpoint_url, timeout=15.0, probe_id=endpoint_id)
        observed_at = datetime.now(timezone.utc)
        await observation_service.record_observation(session, ObservationCreateDTO(
            timestamp=observed_at, source_type='vendor_probe', source_id=endpoint.id,
            region=region, endpoint_url=endpoint.endpoint_url, latency_ms=result.latency_ms,
            status_code=result.status_code, error_type=None if result.is_up else 'probe_failed',
            error_message=result.error_message, metadata={'is_up': result.is_up},
        ))
        endpoint.regions = [region]
        endpoint.last_check_at = observed_at
        endpoint.health_status = 'operational' if result.is_up else 'down'
        vendor.last_check_at = observed_at
        await session.flush()
        logger.info('Public probe completed endpoint=%s region=%s status=%s latency_ms=%.2f', endpoint_id, region, result.status_code, result.latency_ms)
        return {'endpoint_id': endpoint_id, 'is_up': result.is_up, 'observed_at': observed_at.isoformat()}
    return async_task_body(run)
