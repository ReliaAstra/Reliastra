"""Repository + processing logic for the observation outbox (FIX 9).

The outbox guarantees at-least-once delivery of observations to the immutable
evidence stream: events are committed atomically with the check result that
produced them, and this module drains them into ``observations`` afterwards.

Draining is a dispatch over event types, not an if-chain: each producer
registers a handler that does its work and lets the caller delete the event
on success. ``observation_created`` records into the observations stream;
``public_incident_evidence_requested`` freezes a public incident evidence
artifact. A handler that raises leaves its event pending for the next cycle.
New producers join by adding one entry to ``HANDLERS`` - the transactional
semantics (same-transaction enqueue, delete-on-success, retry-on-failure)
are the dispatcher's, not theirs.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.observations.models import OutboxEvent
from app.modules.observations.schemas import ObservationCreateDTO
from app.modules.observations.service import observation_service

logger = logging.getLogger(__name__)

PROCESS_BATCH_SIZE = 100

#: ``event_type`` -> handler(session, payload_json). Return value is ignored;
#: reaching the end without raising means the event is done.
Handler = Callable[[AsyncSession, str], Awaitable[None]]


class OutboxRepository:
    @staticmethod
    async def list_pending(
        session: AsyncSession, limit: int = PROCESS_BATCH_SIZE
    ) -> list[OutboxEvent]:
        """Return the oldest pending events, locking them against concurrent
        processors (SKIP LOCKED keeps multiple workers from re-processing)."""
        query = (
            select(OutboxEvent)
            .order_by(OutboxEvent.created_at.asc(), OutboxEvent.id.asc())
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def delete(session: AsyncSession, event: OutboxEvent) -> None:
        await session.execute(delete(OutboxEvent).where(OutboxEvent.id == event.id))


async def _handle_observation_created(
    session: AsyncSession, payload: str
) -> None:
    dto = ObservationCreateDTO.model_validate_json(payload)
    await observation_service.record_observation(session, dto)


async def _handle_public_incident_evidence(
    session: AsyncSession, payload: str
) -> None:
    from app.modules.incidents.public_evidence import handle_evidence_requested

    await handle_evidence_requested(session, payload)


async def _handle_public_dataset_refresh(
    session: AsyncSession, payload: str
) -> None:
    from app.modules.dataset.service import handle_dataset_refresh

    await handle_dataset_refresh(session, payload)


HANDLERS: dict[str, Handler] = {
    "observation_created": _handle_observation_created,
    "public_incident_evidence_requested": _handle_public_incident_evidence,
    "public_dataset_refresh_requested": _handle_public_dataset_refresh,
}


async def process_outbox_batch(
    session: AsyncSession, limit: int = PROCESS_BATCH_SIZE
) -> int:
    """Drain up to *limit* pending outbox events.

    Each event is deleted in the same transaction that handles it, so a
    crash can never lose the work (the event row stays pending) or duplicate
    it (delete + work commit together). Handlers must therefore be
    idempotent: at-least-once delivery is the contract.
    """
    events = await OutboxRepository.list_pending(session, limit=limit)
    processed = 0
    for event in events:
        handler = HANDLERS.get(event.event_type)
        if handler is None:
            logger.warning(
                "Skipping unknown outbox event type %s (id=%s)",
                event.event_type,
                event.id,
            )
            await OutboxRepository.delete(session, event)
            continue
        try:
            async with session.begin_nested():
                await handler(session, event.payload)
                await OutboxRepository.delete(session, event)
            processed += 1
        except Exception:
            logger.exception("Failed to process outbox event %s", event.id)
            # Leave the event pending for the next cycle; do not lose data.
    if processed:
        logger.info("Outbox processor recorded %s observations", processed)
    return processed
