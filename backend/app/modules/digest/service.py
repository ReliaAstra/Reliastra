"""Digest draft generation: canonical records in, immutable draft rows out.

The generator is a pure derivation over public incident records plus one
side effect (inserting draft rows). Idempotent like the dataset publisher:
regenerating a window whose content is unchanged finds the existing row by
(kind, period_key, content_hash) and does nothing; changed content becomes
a NEW row - never an update - because the previous draft may already be
under human review.

Nothing here sends, posts, or advances state: ``status`` stays ``draft``.
Delivery is a human decision on the admin surface, by design.

Race semantics mirror the dataset publisher: if a concurrent generator
inserts the identical (kind, period_key, content_hash) first, this one's
INSERT violates the unique constraint and the IntegrityError propagates -
the retry converges (the next run finds the winner's row and reports
``current``). No rollback-and-continue: a half-batched generation is
exactly what the retry avoids.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.digest.builder import (
    DIGEST_GENERATOR,
    build_incident_social,
    build_weekly_newsletter,
    digest_content_hash,
)
from app.modules.digest.models import (
    KIND_INCIDENT_SOCIAL,
    KIND_WEEKLY_DIGEST,
    STATUS_DRAFT,
    DigestDraft,
)
from app.modules.incidents.public_service import public_incident_service

logger = logging.getLogger(__name__)

#: Upper bound for one digest window. At 50 vendors with a handful of
#: confirmed incidents a week this is far beyond need; the cap exists so a
#: pathological window degrades to a truncated digest, not an unbounded job.
MAX_INCIDENTS_PER_WINDOW = 500

OUTCOME_DRAFTED = "drafted"
OUTCOME_CURRENT = "current"

#: Outbox event enqueued with each public evidence freeze: the incident's
#: public record just changed, so its social draft may need a new version.
EVENT_TYPE = "digest_social_draft_requested"


def week_window(day: date) -> tuple[date, date]:
    """The Mon..Sun window containing ``day`` (UTC semantics)."""
    monday = day - timedelta(days=day.weekday())
    return monday, monday + timedelta(days=6)


def period_key_for(period_start: date) -> str:
    iso = period_start.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def window_bounds(period_start: date, period_end: date) -> tuple[datetime, datetime]:
    """UTC [start, end) instants covering the inclusive date window."""
    start = datetime.combine(period_start, time.min, tzinfo=timezone.utc)
    end = datetime.combine(period_end + timedelta(days=1), time.min, tzinfo=timezone.utc)
    return start, end


class DigestDraftRepository:
    """Reads and creates draft rows. No update, no delete."""

    async def find_content(
        self, session: AsyncSession, kind: str, period_key: str, content_hash: str
    ) -> DigestDraft | None:
        result = await session.execute(
            select(DigestDraft).where(
                DigestDraft.kind == kind,
                DigestDraft.period_key == period_key,
                DigestDraft.content_hash == content_hash,
            )
        )
        return result.scalars().first()

    async def list_recent(
        self,
        session: AsyncSession,
        *,
        kind: str | None = None,
        limit: int = 50,
    ) -> list[DigestDraft]:
        query = select(DigestDraft).order_by(DigestDraft.created_at.desc())
        if kind is not None:
            query = query.where(DigestDraft.kind == kind)
        result = await session.execute(query.limit(limit))
        return list(result.scalars().all())

    async def get_by_id(
        self, session: AsyncSession, draft_id: UUID
    ) -> DigestDraft | None:
        result = await session.execute(
            select(DigestDraft).where(DigestDraft.id == draft_id)
        )
        return result.scalars().first()

    async def create(
        self,
        session: AsyncSession,
        *,
        kind: str,
        period_key: str,
        subject: str | None,
        text_body: str,
        html_body: str | None,
        content_hash: str,
        period_start: date,
        period_end: date,
        incident_ids: list[str],
        vendor_slugs: list[str],
        methodology_version: str,
        status: str = STATUS_DRAFT,
    ) -> DigestDraft:
        draft = DigestDraft(
            kind=kind,
            period_key=period_key,
            status=status,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            content_hash=content_hash,
            period_start=period_start,
            period_end=period_end,
            incident_ids=incident_ids,
            vendor_slugs=vendor_slugs,
            generator=DIGEST_GENERATOR,
            methodology_version=methodology_version,
        )
        session.add(draft)
        await session.flush()
        return draft


class DigestDraftService:
    """Generation entry points. One canonical generation path, many triggers."""

    def __init__(self, repository: DigestDraftRepository | None = None) -> None:
        self.repository = repository or DigestDraftRepository()

    async def generate_weekly_digest(
        self,
        session: AsyncSession,
        period_start: date,
        period_end: date,
        *,
        site_url: str,
    ) -> tuple[DigestDraft, str]:
        """Draft the weekly newsletter for one window.

        Collects public incidents STARTED in the window (any current
        lifecycle status - the draft states each status), renders, hashes,
        and inserts unless identical content already exists. Returns the
        draft and the outcome: ``drafted`` or ``current``.
        """
        details, methodology = await self._collect_details(
            session, period_start, period_end
        )
        return await self._upsert_weekly(
            session,
            details=details,
            methodology=methodology,
            period_start=period_start,
            period_end=period_end,
            site_url=site_url,
        )

    async def generate_incident_social(
        self,
        session: AsyncSession,
        incident_id: UUID,
        *,
        site_url: str,
    ) -> tuple[DigestDraft, str]:
        """Draft the social post for one incident (period key = the id)."""
        detail = await public_incident_service.get_detail(session, incident_id)
        return await self._upsert_social(session, details=[detail], site_url=site_url)

    async def generate_pending(
        self,
        session: AsyncSession,
        period_start: date,
        period_end: date,
        *,
        site_url: str,
    ) -> dict[str, int]:
        """Everything the beat owes for one window: the newsletter draft and
        one social draft per incident in the window whose current content
        has no draft row yet (content changed -> a NEW draft row, append
        only). The beat and the manual admin trigger share this method.

        Returns outcome counts by kind.
        """
        counts = {
            f"{KIND_WEEKLY_DIGEST}_{OUTCOME_DRAFTED}": 0,
            f"{KIND_INCIDENT_SOCIAL}_{OUTCOME_DRAFTED}": 0,
        }

        details, methodology = await self._collect_details(
            session, period_start, period_end
        )

        _, weekly_outcome = await self._upsert_weekly(
            session,
            details=details,
            methodology=methodology,
            period_start=period_start,
            period_end=period_end,
            site_url=site_url,
        )
        if weekly_outcome == OUTCOME_DRAFTED:
            counts[f"{KIND_WEEKLY_DIGEST}_{OUTCOME_DRAFTED}"] += 1

        # Social drafts group by incident id; each incident's newest content
        # version gets a draft row if that exact content is not drafted yet.
        by_incident: dict[UUID, list] = {}
        for detail in details:
            by_incident.setdefault(detail.incident_id, []).append(detail)
        for group in by_incident.values():
            _, social_outcome = await self._upsert_social(
                session, details=group, site_url=site_url
            )
            if social_outcome == OUTCOME_DRAFTED:
                counts[f"{KIND_INCIDENT_SOCIAL}_{OUTCOME_DRAFTED}"] += 1
        return counts

    async def _upsert_weekly(
        self,
        session: AsyncSession,
        *,
        details: list,
        methodology: str,
        period_start: date,
        period_end: date,
        site_url: str,
    ) -> tuple[DigestDraft, str]:
        parts = build_weekly_newsletter(
            details, period_start, period_end, site_url=site_url
        )
        content_hash = digest_content_hash(parts)
        period_key = period_key_for(period_start)
        existing = await self.repository.find_content(
            session, KIND_WEEKLY_DIGEST, period_key, content_hash
        )
        if existing is not None:
            return existing, OUTCOME_CURRENT
        draft = await self.repository.create(
            session,
            kind=KIND_WEEKLY_DIGEST,
            period_key=period_key,
            status=STATUS_DRAFT,
            subject=parts.get("subject"),
            text_body=parts["text_body"] or "",
            html_body=parts.get("html_body"),
            content_hash=content_hash,
            period_start=period_start,
            period_end=period_end,
            incident_ids=[str(d.incident_id) for d in details],
            vendor_slugs=sorted({d.vendor_name for d in details}),
            methodology_version=methodology,
        )
        return draft, OUTCOME_DRAFTED

    async def _upsert_social(
        self, session: AsyncSession, *, details: list, site_url: str
    ) -> tuple[DigestDraft, str]:
        detail = details[0]
        parts = build_incident_social(detail, site_url=site_url)
        content_hash = digest_content_hash(parts)
        period_key = str(detail.incident_id)
        existing = await self.repository.find_content(
            session, KIND_INCIDENT_SOCIAL, period_key, content_hash
        )
        if existing is not None:
            return existing, OUTCOME_CURRENT
        draft = await self.repository.create(
            session,
            kind=KIND_INCIDENT_SOCIAL,
            period_key=period_key,
            status=STATUS_DRAFT,
            subject=None,
            text_body=parts["text_body"] or "",
            html_body=None,
            content_hash=content_hash,
            period_start=detail.started_at.date(),
            period_end=detail.started_at.date(),
            incident_ids=[str(detail.incident_id)],
            vendor_slugs=[detail.vendor_name],
            methodology_version=detail.methodology_version,
        )
        return draft, OUTCOME_DRAFTED

    async def _collect_details(
        self, session: AsyncSession, period_start: date, period_end: date
    ) -> tuple[list, str]:
        """Canonical detail objects for incidents started in the window.

        Reads through the public incident service - the same reader the
        public API and the dataset publisher use - so the digest can never
        describe an incident the public record does not. Oldest first, so
        the newsletter reads chronologically.
        """
        start, end = window_bounds(period_start, period_end)
        rows = await public_incident_service.repository.search(
            session,
            started_after=start,
            started_before=end,
            limit=MAX_INCIDENTS_PER_WINDOW,
        )
        details = [
            public_incident_service._to_detail(incident, vendor)
            for incident, vendor in rows
        ]
        details.sort(key=lambda d: (d.started_at, d.incident_id))
        methodologies = {d.methodology_version for d in details}
        methodology = "/".join(sorted(methodologies)) if methodologies else "v1.0"
        return details, methodology


def enqueue_social_draft(session: AsyncSession, incident_id: UUID) -> None:
    """Request the per-incident social draft in the caller's transaction.

    Enqueued with each evidence freeze (the incident's public record just
    changed). Content-hash idempotency makes redelivery a no-op; a changed
    lifecycle state becomes a NEW draft row, never an update.
    """
    from app.modules.observations.models import OutboxEvent

    session.add(
        OutboxEvent(
            event_type=EVENT_TYPE,
            payload=json.dumps({"incident_id": str(incident_id)}),
        )
    )


async def handle_social_draft_requested(session: AsyncSession, payload: str) -> None:
    """Outbox handler: draft (or re-draft) one incident's social post.

    Digest generation is always on (it writes local rows only - no external
    publisher exists on this path), so there is no disabled state to
    consume: the handler either drafts, reports current, or raises (the
    event stays pending for the next cycle).
    """
    from app.config import settings

    incident_id = UUID(json.loads(payload)["incident_id"])
    _, outcome = await digest_draft_service.generate_incident_social(
        session, incident_id, site_url=settings.SITE_URL
    )
    logger.info("Social draft %s for incident %s", outcome, incident_id)


digest_draft_service = DigestDraftService()
