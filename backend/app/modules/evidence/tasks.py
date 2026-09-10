"""Celery tasks for SLA evidence generation.

Two rules shape this file.

**A plan limitation is not an error.** An organization on a plan without
evidence generation would otherwise have its task re-raised into
``autoretry_for=(Exception,)``, retried three times with backoff, and then
reported as a task failure - three lines of ERROR logs and a dead-letter
entry describing something that was never going to happen. The entitlement
case is caught, the incident is left carrying ``not_entitled`` (which the
console can render as an upgrade prompt), and the task returns normally.

**A real failure is retryable and never silent.** ``EvidenceGenerationError``
and anything unexpected propagate so Celery retries them. The service persists
``evidence_status = failed`` and the reason *before* the exception reaches this
frame, so the state survives the rollback that ``async_task_body`` performs on
the way out. :func:`retry_failed_evidence_generation` then picks those up on a
schedule, which also covers the case where the publish itself never happened.
"""

import logging
import uuid
from typing import Any

from app.infrastructure.async_tasks import async_task_body
from app.infrastructure.celery_app import celery_app

logger = logging.getLogger(__name__)

#: How long an incident may sit in ``generating`` before the sweep treats it as
#: abandoned. Generously above the task's own ``time_limit`` (240s) so a slow
#: but healthy attempt is never retried underneath itself.
STUCK_GENERATING_MINUTES = 30

#: Bounded so a backlog after an outage drains steadily instead of publishing
#: hundreds of PDF renders at once.
RETRY_SWEEP_BATCH_SIZE = 25


@celery_app.task(
    name="app.modules.evidence.tasks.generate_evidence_report",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
    soft_time_limit=180,
    time_limit=240,
)
def generate_evidence_report(
    incident_id: str, request_id: str | None = None
) -> dict[str, Any] | None:
    """Generate (or return the existing) evidence artifact for an incident."""

    async def _run(session) -> dict[str, Any] | None:
        from app.modules.evidence.service import (
            EvidenceNotEntitledError,
            evidence_service,
        )

        try:
            report = await evidence_service.generate_for_incident(
                session, uuid.UUID(incident_id)
            )
        except EvidenceNotEntitledError as exc:
            # Deliberate, final, and not a defect: the plan does not include
            # this capability. The service has already recorded
            # ``not_entitled`` on the incident, so return a normal result
            # rather than burning three retries on a decision that will not
            # change.
            logger.info(
                "Evidence generation skipped for incident %s (request_id=%s): %s",
                incident_id,
                request_id,
                getattr(exc, "message", None) or exc,
            )
            return {"status": "not_entitled", "incident_id": incident_id}
        except Exception:
            logger.exception(
                "Error in generate_evidence_report task for incident %s "
                "(request_id=%s)",
                incident_id,
                request_id,
            )
            raise

        # ``report.checksum`` is the SHA-256 of the PDF bytes
        # (``report_checksum``). It is not the evidence ``data_hash``; the two
        # describe different things and are labelled accordingly. The response
        # model deliberately carries no storage key, so none is echoed here.
        logger.info(
            "Evidence report %s available for incident %s (request_id=%s)",
            report.id,
            incident_id,
            request_id,
        )
        return {
            "status": "available",
            "incident_id": incident_id,
            "report_id": str(report.id),
            "report_checksum": report.checksum,
            "file_size_bytes": report.file_size_bytes,
        }

    return async_task_body(_run)


@celery_app.task(
    name="app.modules.evidence.tasks.retry_failed_evidence_generation",
    soft_time_limit=300,
    time_limit=330,
)
def retry_failed_evidence_generation(
    limit: int = RETRY_SWEEP_BATCH_SIZE,
) -> dict[str, Any]:
    """Re-attempt evidence generation for incidents that never got an artifact.

    Runs on a schedule rather than only on demand because the normal trigger is
    an ``after_commit`` publish: if the broker was down at that instant the
    task was never enqueued, and no amount of retry logic inside a task can fix
    a task that was never published. This sweep is what makes that
    self-healing.

    Generation is idempotent, so re-running it against an incident that turned
    out to be fine costs a hash comparison and returns the existing artifact.
    """

    async def _run(session) -> dict[str, Any]:
        from datetime import datetime, timedelta, timezone

        from app.modules.evidence.service import (
            EvidenceNotEntitledError,
            evidence_service,
        )
        from app.modules.incidents.constants import EvidenceStatus
        from app.modules.incidents.repository import IncidentRepository

        repository = IncidentRepository()
        cutoff = datetime.now(timezone.utc) - timedelta(
            minutes=STUCK_GENERATING_MINUTES
        )
        incidents = await repository.list_evidence_retryable(
            session,
            statuses=[
                EvidenceStatus.FAILED.value,
                EvidenceStatus.PENDING.value,
                EvidenceStatus.GENERATING.value,
            ],
            limit=limit,
            generating_stuck_before=cutoff,
        )

        results = {"attempted": 0, "available": 0, "not_entitled": 0, "failed": 0}
        for incident in incidents:
            results["attempted"] += 1
            try:
                await evidence_service.generate_for_incident(session, incident.id)
                results["available"] += 1
            except EvidenceNotEntitledError:
                # Terminal for this org's plan; counted, not logged as an error.
                results["not_entitled"] += 1
            except Exception:
                results["failed"] += 1
                logger.warning(
                    "Evidence retry failed for incident %s",
                    incident.id,
                    exc_info=True,
                )

        if results["attempted"]:
            logger.info("Evidence retry sweep: %s", results)
        return results

    return async_task_body(_run)
