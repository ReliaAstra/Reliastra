"""Recording and reading check results.

One probe produces exactly one row: either a normal result or a blocked
result, each paired with an observation-outbox event in the SAME database
transaction (FIX 9). The pairing lives here so no caller can persist a
result and forget the evidence fan-out — ``probe.py`` records through these
functions, and ``service.py`` serves reads through them.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.checks.constants import BLOCKED_BY_SECURITY_POLICY_PREFIX
from app.modules.checks.models import CheckResult
from app.modules.checks.repository import CheckRepository
from app.modules.checks.schemas import CheckResultResponse

logger = logging.getLogger(__name__)


async def enqueue_observation_outbox(
    session: AsyncSession,
    result: CheckResult,
    endpoint_url: str,
    method: str,
) -> None:
    """FIX 9: transactional outbox for the observation dual-write.

    The observation is written to ``observation_outbox`` in the SAME
    transaction as the check result. A separate Celery task
    (``app.modules.observations.tasks.process_outbox``) drains the outbox
    every 10s - the evidence stream can never silently lose events, and a
    failing observation write can never roll back the check result.
    """
    from app.modules.observations.models import OutboxEvent
    from app.modules.observations.schemas import ObservationCreateDTO

    error_type = None
    if result.error_message:
        error_type = (
            result.error_message.split(":", 1)[0]
            .strip()
            .lower()
            .replace(" ", "_")[:50]
        )
    dto = ObservationCreateDTO(
        timestamp=result.executed_at,
        source_type="customer_check",
        source_id=result.dependency_id,
        org_id=result.org_id,
        region=result.region,
        endpoint_url=endpoint_url,
        latency_ms=result.latency_ms,
        response_time_ms=result.latency_ms,
        status_code=result.status_code,
        error_type=error_type,
        error_message=result.error_message,
        metadata={
            "method": method,
            "is_up": result.is_up,
            "quorum_confirmed": result.quorum_confirmed,
            "check_result_id": str(result.id),
        },
    )
    event = OutboxEvent(
        event_type="observation_created",
        payload=dto.model_dump_json(),
        created_at=datetime.now(timezone.utc),
    )
    session.add(event)
    await session.flush()


async def record_blocked_result(
    session: AsyncSession,
    repository: CheckRepository,
    dep_id: uuid.UUID,
    org_id: uuid.UUID,
    region: str,
    url: str,
    method: str,
    reason: str,
    result_id: uuid.UUID | None = None,
) -> CheckResult:
    """Persist a probe the SSRF policy refused, plus its outbox event."""
    result = await repository.create(
        session=session,
        dependency_id=dep_id,
        org_id=org_id,
        region=region,
        latency_ms=0.0,
        is_up=False,
        status_code=None,
        error_message=f"{BLOCKED_BY_SECURITY_POLICY_PREFIX}: {reason}",
        quorum_confirmed=False,
        result_id=result_id,
    )
    await enqueue_observation_outbox(session, result, url, method)
    return result


async def list_results_for_dependency(
    session: AsyncSession,
    repository: CheckRepository,
    dependency_id: uuid.UUID,
    limit: int = 50,
) -> list[CheckResultResponse]:
    results = await repository.list_for_dependency(
        session, dependency_id, limit=limit
    )
    return [CheckResultResponse.model_validate(r) for r in results]


async def list_results_for_org(
    session: AsyncSession,
    repository: CheckRepository,
    org_id: uuid.UUID,
    limit: int = 50,
) -> list[CheckResultResponse]:
    results = await repository.list_for_org(session, org_id, limit=limit)
    return [CheckResultResponse.model_validate(r) for r in results]
