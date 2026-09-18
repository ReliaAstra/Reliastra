"""Celery tasks for webhook delivery.

Two tasks, and they are the two halves of the same promise: an event that has
been recorded is delivered, and an event whose first delivery failed is
delivered again until it succeeds or the retry budget is spent.

Neither is allowed to raise into the product. The incident is the fact; the
delivery is a courtesy to a downstream system, and a customer's endpoint being
down is not a reason for ours to be.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from app.infrastructure.async_tasks import async_task_body
from app.infrastructure.celery_app import celery_app

logger = logging.getLogger(__name__)

@celery_app.task(
    name="app.modules.webhooks.tasks.deliver_event",
    soft_time_limit=120,
    time_limit=150,
)
def deliver_event(
    org_id: str, event_type: str, payload: dict[str, Any]
) -> dict[str, Any]:
    """Deliver one event to every webhook subscribed to it.

    Retries are handled by the delivery engine itself: a failed attempt is
    recorded with ``next_retry_at`` and picked up by the sweep, so this task
    does not re-raise on a non-2xx response.
    """

    async def _run(session) -> dict[str, Any]:
        from app.modules.webhooks.service import webhook_service

        await webhook_service.deliver_webhook(
            session, uuid.UUID(org_id), event_type, payload
        )
        return {"org_id": org_id, "event": event_type}

    return async_task_body(_run)


@celery_app.task(
    name="app.modules.webhooks.tasks.retry_pending_deliveries",
    soft_time_limit=300,
    time_limit=330,
)
def retry_pending_deliveries() -> dict[str, Any]:
    """Retry deliveries whose backoff window has elapsed.

    Scheduled rather than chained from the first failure for the same reason the
    evidence sweep is: a task that fails before it is ever published cannot be
    fixed by retrying it. This sweep also covers the case where the broker was
    unreachable at dispatch time, because a delivery row is only created when
    the task actually ran.
    """

    async def _run(session) -> dict[str, Any]:
        from app.modules.webhooks.service import webhook_service

        attempted = await webhook_service.retry_pending_deliveries(session)
        if attempted:
            logger.info("Webhook retry sweep attempted %d delivery(ies)", attempted)
        return {"attempted": attempted}

    return async_task_body(_run)
