from __future__ import annotations

import logging
import uuid
from datetime import UTC

from app.infrastructure.async_tasks import async_task_body
from app.infrastructure.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.modules.email_events.tasks.process_resend_event",
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
)
def process_resend_event(event_db_id: str):
    async def _run(session):
        from sqlalchemy import select

        from app.modules.email_events.models import ResendWebhookEvent
        from app.modules.email_events.service import resend_webhook_service

        res = await session.execute(
            select(ResendWebhookEvent).where(ResendWebhookEvent.id == uuid.UUID(event_db_id))
        )
        evt = res.scalar_one_or_none()
        if not evt:
            return
        # Re-apply state (idempotent) and handle heavy work like bounce spike alerts
        await resend_webhook_service._apply_state(session, evt)
        # Spike detection: if >10 bounces in 5 min, warn
        # (simple query, not blocking)
        try:
            from datetime import datetime, timedelta

            from sqlalchemy import func

            from app.modules.email_events.models import ResendWebhookEvent as E

            since = datetime.now(UTC) - timedelta(minutes=5)
            q = await session.execute(
                select(func.count(E.id)).where(
                    E.event_type == "email.bounced", E.created_at >= since
                )
            )
            cnt = int(q.scalar() or 0)
            if cnt > 10:
                logger.warning("bounce spike %s in 5m", cnt)
        except Exception:
            pass

    return async_task_body(_run)
