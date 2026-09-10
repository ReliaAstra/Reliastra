import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.incidents.constants import (
    EvidenceStatus,
    IncidentSeverity,
    IncidentStatus,
)
from app.modules.incidents.models import Incident, IncidentCorrelation


class IncidentRepository:
    @staticmethod
    async def create(
        session: AsyncSession,
        org_id: uuid.UUID,
        dependency_id: uuid.UUID,
        severity: str = "major",
        description: str | None = None,
        started_at: datetime | None = None,
    ) -> Incident:
        """Create an incident.

        ``started_at`` defaults to now, but a caller that knows when the
        outage actually began should pass it. The detector opens an incident
        on the check that crosses its threshold, which is *after* the first
        failure of the run; stamping that first failure keeps the incident
        window - and therefore the evidence artifact - covering the whole
        outage instead of starting part-way through it.
        """
        inc = Incident(
            org_id=org_id,
            dependency_id=dependency_id,
            started_at=started_at or datetime.now(timezone.utc),
            severity=severity,
            status=IncidentStatus.OPEN.value,
            root_cause="unknown",
            description=description,
        )
        session.add(inc)
        await session.flush()
        return inc

    @staticmethod
    async def get_by_id(
        session: AsyncSession, incident_id: uuid.UUID
    ) -> Incident | None:
        query = select(Incident).where(Incident.id == incident_id)
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_open_for_dependency(
        session: AsyncSession, dependency_id: uuid.UUID
    ) -> Incident | None:
        query = select(Incident).where(
            Incident.dependency_id == dependency_id,
            Incident.status == IncidentStatus.OPEN.value,
        )
        result = await session.execute(query)
        # `.first()` instead of `.scalar_one_or_none()`: legacy duplicate open
        # incidents (pre-0014) would raise MultipleResultsFound and crash the
        # quorum path.  The partial unique index now prevents new duplicates.
        return result.scalars().first()

    @staticmethod
    async def list_for_org(
        session: AsyncSession,
        org_id: uuid.UUID,
        limit: int = 50,
        status_filter: str | None = None,
        severity_filter: str | None = None,
    ) -> list[Incident]:
        query = (
            select(Incident)
            .where(Incident.org_id == org_id)
            .order_by(Incident.started_at.desc())
            .limit(limit)
        )
        if status_filter:
            query = query.where(Incident.status == status_filter)
        if severity_filter:
            query = query.where(Incident.severity == severity_filter)
        result = await session.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def list_open_in_window(
        session: AsyncSession,
        org_id: uuid.UUID,
        center_time: datetime,
        window_seconds: int = 300,
        exclude_incident_id: uuid.UUID | None = None,
    ) -> list[Incident]:
        start = center_time - timedelta(seconds=window_seconds)
        end = center_time + timedelta(seconds=window_seconds)
        query = select(Incident).where(
            Incident.org_id == org_id,
            Incident.started_at >= start,
            Incident.started_at <= end,
            Incident.status == IncidentStatus.OPEN.value,
        )
        if exclude_incident_id:
            query = query.where(Incident.id != exclude_incident_id)
        result = await session.execute(query)
        return list(result.scalars().all())

    # Allowed update fields for Incident - any key not in this set is silently
    # ignored so callers (even internal ones) cannot overwrite protected columns
    # like `org_id`, `dependency_id`, `created_at` via setattr.
    _UPDATABLE_FIELDS = {
        "status", "severity", "description", "root_cause",
        "resolved_at", "evidence_report_id",
        "detection_rule", "detection_metadata",
    }

    @staticmethod
    async def update(
        session: AsyncSession, incident: Incident, **kwargs: Any
    ) -> Incident:
        for key, value in kwargs.items():
            if key in IncidentRepository._UPDATABLE_FIELDS and value is not None:
                setattr(incident, key, value)
        session.add(incident)
        await session.flush()
        return incident

    @staticmethod
    async def set_evidence_state(
        session: AsyncSession,
        incident: Incident,
        *,
        status: str,
        error: str | None = None,
        report_id: uuid.UUID | None = None,
        attempted_at: datetime | None = None,
    ) -> Incident:
        """Record the outcome of an evidence-generation attempt.

        Separate from :meth:`update` because that helper ignores ``None``
        values by design, and a successful retry has to be able to *clear*
        ``evidence_error``. Every call stamps ``evidence_attempted_at`` unless
        the caller says otherwise, so "when did we last try" is never a guess.
        """
        incident.evidence_status = status
        incident.evidence_error = error
        incident.evidence_attempted_at = attempted_at or datetime.now(timezone.utc)
        if report_id is not None:
            incident.evidence_report_id = report_id
        session.add(incident)
        await session.flush()
        return incident

    @staticmethod
    async def list_evidence_retryable(
        session: AsyncSession,
        *,
        statuses: Sequence[str],
        limit: int = 25,
        generating_stuck_before: datetime | None = None,
    ) -> list[Incident]:
        """Incidents whose evidence generation did not reach a terminal state.

        Two shapes need a second look, and both belong to one sweep because
        both mean "the incident exists and its report does not":

        * an explicit ``failed`` attempt - the task exhausted its retries, and
          the reason is on the row;
        * a ``pending``/``generating`` incident that has been sitting there past
          ``generating_stuck_before``. This is not a paranoid extra: the
          generation task is published from an ``after_commit`` hook, so if the
          broker was unavailable at that moment the publish never happened and
          nothing was ever written to say so. Without this arm those incidents
          stay stuck at ``generating`` forever.

        Oldest attempt first, so a backlog drains in the order it was created
        and one long-running sweep cannot starve the oldest incidents.
        """
        stmt = (
            select(Incident)
            .where(Incident.evidence_status.in_(statuses))
            .order_by(Incident.evidence_attempted_at.asc().nullsfirst(), Incident.id.asc())
            .limit(limit)
        )
        result = await session.execute(stmt)
        rows = list(result.scalars().all())
        if generating_stuck_before is None:
            return rows
        return [
            incident
            for incident in rows
            if incident.evidence_status != EvidenceStatus.GENERATING.value
            or incident.evidence_attempted_at is None
            or incident.evidence_attempted_at < generating_stuck_before
        ]

    @staticmethod
    async def create_correlation(
        session: AsyncSession,
        incident_id: uuid.UUID,
        correlated_dependency_id: uuid.UUID,
        confidence: float = 0.85,
        time_window_seconds: int = 300,
        method: str = "temporal",
    ) -> IncidentCorrelation:
        corr = IncidentCorrelation(
            incident_id=incident_id,
            correlated_dependency_id=correlated_dependency_id,
            correlation_confidence=confidence,
            time_window_seconds=time_window_seconds,
            correlation_method=method,
        )
        session.add(corr)
        await session.flush()
        return corr

    @staticmethod
    async def get_correlations(
        session: AsyncSession, incident_id: uuid.UUID
    ) -> list[IncidentCorrelation]:
        query = (
            select(IncidentCorrelation)
            .where(IncidentCorrelation.incident_id == incident_id)
            .order_by(IncidentCorrelation.correlation_confidence.desc())
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def list_with_correlations_for_org(
        session: AsyncSession,
        org_id: uuid.UUID,
        limit: int = 20,
        cursor: uuid.UUID | None = None,
    ) -> list[dict[str, Any]]:
        """Fetch incidents for an org with their correlations in a batched manner.

        Returns a list of dicts with 'incident' and 'correlations' keys
        to avoid N+1 queries in the dashboard timeline. Supports cursor
        pagination (FIX 17): *cursor* is the incident id of the last item of
        the previous page.
        """
        incidents_query = (
            select(Incident)
            .where(Incident.org_id == org_id)
            .order_by(Incident.started_at.desc(), Incident.id.desc())
            .limit(limit)
        )
        if cursor:
            cursor_incident = await session.get(Incident, cursor)
            if cursor_incident is not None:
                incidents_query = incidents_query.where(
                    (Incident.started_at < cursor_incident.started_at)
                    | (
                        (Incident.started_at == cursor_incident.started_at)
                        & (Incident.id < cursor_incident.id)
                    )
                )
        inc_result = await session.execute(incidents_query)
        incidents = list(inc_result.scalars().all())

        if not incidents:
            return []

        incident_ids = [inc.id for inc in incidents]
        corr_query = (
            select(IncidentCorrelation)
            .where(IncidentCorrelation.incident_id.in_(incident_ids))
            .order_by(IncidentCorrelation.correlation_confidence.desc())
        )
        corr_result = await session.execute(corr_query)
        all_correlations = list(corr_result.scalars().all())

        corr_by_incident: dict[uuid.UUID, list[IncidentCorrelation]] = {}
        for c in all_correlations:
            corr_by_incident.setdefault(c.incident_id, []).append(c)

        return [
            {
                "incident": inc,
                "correlations": corr_by_incident.get(inc.id, []),
            }
            for inc in incidents
        ]
