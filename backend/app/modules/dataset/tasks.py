"""Dataset publisher tasks: the scheduled reconciliation path.

The outbox event enqueued with each evidence freeze is the fast path; this
daily task is the guaranteed one. Both call the same idempotent service, so
the schedule only ever fills genuine gaps and can never produce duplicate
commits for an unchanged dataset.
"""

import logging

from app.infrastructure.async_tasks import async_task_body
from app.infrastructure.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.modules.dataset.tasks.publish_public_dataset",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
)
def publish_public_dataset(trigger: str = "scheduled") -> str:
    """Publish the public intelligence dataset when its content changed.

    Disabled deployments (no GitHub token/repo configured) are a no-op
    reported as ``disabled`` - a state, not an error. GitHub failures raise
    for the autoretry backoff; nothing outside this task waits on them.
    """

    async def _run(session) -> str:
        from app.modules.dataset.service import dataset_publication_service

        outcome = await dataset_publication_service.publish(session, trigger)
        if outcome.outcome == "published":
            logger.info(
                "Dataset published: commit=%s files=%s",
                outcome.commit_sha,
                outcome.file_count,
            )
        return outcome.outcome

    return async_task_body(_run)
