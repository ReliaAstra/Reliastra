"""Digest generation tasks: the weekly scheduled path.

One task, one idempotent service call: draft the previous ISO week's
newsletter and any per-incident social drafts that are missing or stale.
Every run converges - unchanged content finds its existing draft row and
does nothing, so the schedule can never produce duplicates. Failure raises
for the autoretry backoff; nothing outside this task waits on it.
"""

import logging
from datetime import datetime, timedelta, timezone

from app.infrastructure.async_tasks import async_task_body
from app.infrastructure.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.modules.digest.tasks.generate_digest_drafts",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
)
def generate_digest_drafts(weeks_ago: int = 1) -> str:
    """Draft digest content for a past week (default: the previous one).

    Drafts only - the pipeline stops at rows with status ``draft``. A human
    reviews and publishes; nothing here talks to a social platform or a
    mail provider.
    """

    async def _run(session) -> str:
        from app.config import settings
        from app.modules.digest.service import (
            digest_draft_service,
            week_window,
        )

        day = datetime.now(timezone.utc).date() - timedelta(weeks=weeks_ago)
        period_start, period_end = week_window(day)
        counts = await digest_draft_service.generate_pending(
            session,
            period_start,
            period_end,
            site_url=settings.SITE_URL,
        )
        drafted = sum(counts.values())
        logger.info(
            "Digest drafts generated for %s..%s: %s",
            period_start.isoformat(),
            period_end.isoformat(),
            counts,
        )
        return f"drafted={drafted}"

    return async_task_body(_run)
