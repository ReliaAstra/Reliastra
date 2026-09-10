import abc
import logging
import uuid
from typing import Any
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.audit_log import AuditLogService
from app.core.exceptions import ResourceNotFoundException
from app.modules.evidence.schemas import EvidenceReportResponse
from app.modules.incidents.constants import (
    DEFAULT_CORRELATION_CONFIDENCE,
    TEMPORAL_WINDOW_SECONDS,
    CorrelationMethod,
    EvidenceStatus,
    IncidentSeverity,
    IncidentStatus,
)
from app.modules.incidents.models import Incident, IncidentCorrelation
from app.modules.incidents.repository import IncidentRepository
from app.modules.incidents.schemas import (
    IncidentCorrelateRequest,
    IncidentCorrelationResponse,
    IncidentDetailResponse,
    IncidentResponse,
    IncidentUpdateRequest,
)

logger = logging.getLogger(__name__)


class BaseCorrelationStrategy(abc.ABC):
    @abc.abstractmethod
    async def correlate(
        self, session: AsyncSession, incident: Incident
    ) -> list[IncidentCorrelation]:
        pass


class TemporalCorrelationStrategy(BaseCorrelationStrategy):
    def __init__(
        self,
        window_seconds: int = TEMPORAL_WINDOW_SECONDS,
        repository: IncidentRepository = IncidentRepository(),
    ) -> None:
        self.window_seconds = window_seconds
        self.repository = repository

    async def correlate(
        self, session: AsyncSession, incident: Incident
    ) -> list[IncidentCorrelation]:
        other_incidents = await self.repository.list_open_in_window(
            session=session,
            org_id=incident.org_id,
            center_time=incident.started_at,
            window_seconds=self.window_seconds,
            exclude_incident_id=incident.id,
        )
        correlations: list[IncidentCorrelation] = []
        for other in other_incidents:
            if other.dependency_id != incident.dependency_id:
                corr = await self.repository.create_correlation(
                    session=session,
                    incident_id=incident.id,
                    correlated_dependency_id=other.dependency_id,
                    confidence=DEFAULT_CORRELATION_CONFIDENCE,
                    time_window_seconds=self.window_seconds,
                    method=CorrelationMethod.TEMPORAL.value,
                )
                correlations.append(corr)
                # Also create reverse correlation on the existing incident
                await self.repository.create_correlation(
                    session=session,
                    incident_id=other.id,
                    correlated_dependency_id=incident.dependency_id,
                    confidence=DEFAULT_CORRELATION_CONFIDENCE,
                    time_window_seconds=self.window_seconds,
                    method=CorrelationMethod.TEMPORAL.value,
                )
                logger.info(
                    "Temporal correlation created between incident %s and dependency %s",
                    incident.id,
                    other.dependency_id,
                )
        return correlations


class IncidentService:
    def __init__(
        self,
        repository: IncidentRepository = IncidentRepository(),
        correlation_strategy: BaseCorrelationStrategy = TemporalCorrelationStrategy(),
    ) -> None:
        self.repository = repository
        self.correlation_strategy = correlation_strategy

    async def check_and_create_incident(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        dependency_id: uuid.UUID,
        error_message: str = "Detector confirmed failure",
        detection: dict[str, Any] | None = None,
        started_at: datetime | None = None,
    ) -> Incident:
        """Open an incident for a dependency, at most once while one is open.

        Idempotent at three levels, because two workers can legitimately reach
        this at the same moment for the same dependency:

        1. an already-open incident is returned unchanged;
        2. the INSERT races under the partial unique index
           ``uq_incidents_one_open_per_dependency`` (migration 0014) and the
           loser of that race re-reads the winner's row;
        3. ``detection`` metadata is written on the create path only, so a
           repeat call cannot overwrite the provenance of the original
           decision.
        """
        existing = await self.repository.get_open_for_dependency(
            session, dependency_id
        )
        if existing:
            return existing

        # Atomic create guarded by the partial unique index
        # uq_incidents_one_open_per_dependency (0014).  Concurrent region
        # checks that both read "no open incident" race here; the second
        # writer hits IntegrityError, rolls back its savepoint and returns
        # the winner's incident instead of creating a duplicate.
        from sqlalchemy.exc import IntegrityError

        try:
            async with session.begin_nested():
                incident = await self.repository.create(
                    session=session,
                    org_id=org_id,
                    dependency_id=dependency_id,
                    severity=IncidentSeverity.MAJOR.value,
                    description=error_message,
                    started_at=started_at,
                )
                # Provenance is written with the incident, not after it: the
                # evidence artifact is rendered asynchronously and must be able
                # to state which rule fired and on what figures.
                if detection:
                    incident.detection_rule = str(detection.get("rule") or "") or None
                    incident.detection_metadata = detection
                await session.flush()
        except IntegrityError:
            incident = await self.repository.get_open_for_dependency(
                session, dependency_id
            )
            if incident:
                logger.info(
                    "Lost incident creation race for dep %s - reusing existing incident %s",
                    dependency_id, incident.id,
                )
                return incident
            raise

        await self.correlation_strategy.correlate(session, incident)

        await AuditLogService.log_event(
            session=session,
            event_type="INCIDENT_OPENED",
            org_id=org_id,
            resource_type="incident",
            resource_id=str(incident.id),
            payload={
                "dependency_id": str(dependency_id),
                "severity": incident.severity,
                "started_at": incident.started_at.isoformat(),
                "detection": detection or {},
            },
        )

        try:
            from app.modules.notifications.service import notification_service
            from app.modules.notifications.schemas import AlertPayload

            alert = AlertPayload(
                org_id=org_id,
                incident_id=incident.id,
                severity=incident.severity,
                title="Service Degradation Detected",
                body=f"Dependency {dependency_id} is reporting failure: {error_message}",
                metadata={"dependency_id": str(dependency_id)},
            )
            await notification_service.dispatch_alert(session, alert)
        except Exception as exc:
            logger.warning("Failed to dispatch alert for incident %s: %s", incident.id, exc)

        try:
            from app.core.metrics import incidents_total

            incidents_total.labels(action="opened").inc()
        except Exception:  # pragma: no cover - metrics must never break flow
            pass

        return incident

    async def resolve_incident(
        self,
        session: AsyncSession,
        incident_id: uuid.UUID,
        org_id: uuid.UUID | None = None,
        detection: dict[str, Any] | None = None,
    ) -> Incident:
        incident = await self.repository.get_by_id(session, incident_id)
        if not incident or (org_id and incident.org_id != org_id):
            raise ResourceNotFoundException("Incident not found")

        # Resolution is idempotent. This prevents duplicate attribution and
        # evidence tasks when recovery checks arrive concurrently.
        if (
            incident.status == IncidentStatus.RESOLVED.value
            and incident.resolved_at is not None
        ):
            return incident

        updated = await self.repository.update(
            session=session,
            incident=incident,
            status=IncidentStatus.RESOLVED.value,
            resolved_at=datetime.now(timezone.utc),
        )

        # Attribution is deterministic and is persisted before immutable
        # evidence generation is dispatched.
        try:
            from app.modules.attribution.repository import AttributionRepository
            from app.modules.attribution.service import attribution_engine
            from app.modules.observations.repository import ObservationRepository

            existing = await AttributionRepository.get_by_incident(
                session, incident.id
            )
            if not existing:
                observations = await ObservationRepository.list_for_source(
                    session,
                    incident.dependency_id,
                    source_type="customer_check",
                    limit=100,
                    since=incident.started_at,
                    until=updated.resolved_at,
                )
                async with session.begin_nested():
                    result = await attribution_engine.compute_attribution(
                        session, updated, observations
                    )
                    await AttributionRepository.create(session, result)
        except Exception as exc:
            logger.warning(
                "Attribution engine failed for incident %s: %s",
                incident.id,
                exc,
            )

        await AuditLogService.log_event(
            session=session,
            event_type="INCIDENT_RESOLVED",
            org_id=updated.org_id,
            resource_type="incident",
            resource_id=str(updated.id),
            payload={
                "dependency_id": str(updated.dependency_id),
                "started_at": updated.started_at.isoformat(),
                "resolved_at": (
                    updated.resolved_at.isoformat()
                    if updated.resolved_at
                    else None
                ),
                "detection": detection or {},
            },
        )

        from app.modules.notifications.schemas import AlertPayload
        from app.modules.notifications.service import notification_service
        await notification_service.dispatch_alert(session, AlertPayload(
            org_id=updated.org_id, incident_id=updated.id, severity='info',
            event='incident.resolved', title='Incident resolved',
            body='The dependency has recovered.', metadata={'dependency_id': str(updated.dependency_id)},
        ))

        await self.request_evidence_generation(session, updated)

        try:
            from app.core.metrics import incidents_total

            incidents_total.labels(action="resolved").inc()
        except Exception:  # pragma: no cover - metrics must never break flow
            pass

        return updated

    async def request_evidence_generation(
        self,
        session: AsyncSession,
        incident: Incident,
        *,
        reason: str = "incident_resolved",
    ) -> str:
        """Queue evidence generation for a resolved incident, or record why not.

        Returns the resulting ``evidence_status``. Three properties matter:

        *Deliberate about entitlement.* A plan without evidence generation gets
        ``not_entitled`` and **no task is queued**. The previous behaviour
        queued a job that the permission gate rejected, retried three times and
        died - a background failure that looked like a broken product for a
        workspace that was never supposed to have the feature.

        *Idempotent.* An incident that already has a linked artifact is left
        alone, so a repeated resolve, a task retry or a manual re-request
        cannot pile up artifacts.

        *Race-free.* Publication happens on ``after_commit`` (see
        :mod:`app.infrastructure.after_commit`), not after a fixed sleep: the
        worker must be able to see the resolved incident, its final check
        results and its outbox rows. A dispatch that cannot even reach the
        broker is recorded as ``failed`` rather than left as a lie.
        """
        if (
            incident.evidence_status == EvidenceStatus.AVAILABLE.value
            and incident.evidence_report_id is not None
        ):
            return incident.evidence_status

        from app.core.permissions import plan_allows_feature
        from app.modules.organizations.repository import OrganizationRepository

        try:
            org = await OrganizationRepository.get_by_id(session, incident.org_id)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning(
                "Could not resolve org %s for evidence entitlement: %s",
                incident.org_id,
                exc,
            )
            org = None

        if not plan_allows_feature(org, "evidence_generation"):
            await self.repository.set_evidence_state(
                session,
                incident,
                status=EvidenceStatus.NOT_ENTITLED.value,
                error=None,
            )
            await AuditLogService.log_event(
                session=session,
                event_type="EVIDENCE_SKIPPED_NOT_ENTITLED",
                org_id=incident.org_id,
                resource_type="incident",
                resource_id=str(incident.id),
                payload={
                    "reason": reason,
                    "effective_plan": (
                        getattr(org, "plan", None) if org is not None else None
                    ),
                },
            )
            logger.info(
                "Evidence generation not entitled for incident %s; nothing queued",
                incident.id,
            )
            return EvidenceStatus.NOT_ENTITLED.value

        await self.repository.set_evidence_state(
            session,
            incident,
            status=EvidenceStatus.GENERATING.value,
            error=None,
        )

        from app.core.request_context import get_request_id
        from app.infrastructure.after_commit import dispatch_after_commit

        request_id = get_request_id()
        incident_id = str(incident.id)

        def _publish() -> None:
            from celery import chain

            from app.modules.evidence.tasks import generate_evidence_report
            from app.modules.observations.tasks import process_outbox

            # Drain the observation outbox first so attribution sees the
            # observations belonging to this incident, then generate. The
            # immutable signature (``si``) keeps the drain's return value out
            # of the generation task's arguments.
            chain(
                process_outbox.s(),
                generate_evidence_report.si(incident_id, request_id=request_id),
            ).apply_async()
            logger.info(
                "Dispatched evidence generation for incident %s (reason=%s)",
                incident_id,
                reason,
            )

        try:
            dispatch_after_commit(session, _publish)
        except Exception as exc:
            logger.exception(
                "Could not schedule evidence generation for incident %s",
                incident.id,
            )
            await self.repository.set_evidence_state(
                session,
                incident,
                status=EvidenceStatus.FAILED.value,
                error=f"dispatch failed: {exc}"[:2000],
            )
            return EvidenceStatus.FAILED.value

        return EvidenceStatus.GENERATING.value

    async def list_incidents(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        limit: int = 50,
        status: str | None = None,
        severity: str | None = None,
    ) -> list[IncidentResponse]:
        incidents = await self.repository.list_for_org(
            session, org_id, limit=limit, status_filter=status, severity_filter=severity
        )
        return [IncidentResponse.model_validate(inc) for inc in incidents]

    async def get_incident_detail(
        self, session: AsyncSession, org_id: uuid.UUID, inc_id: uuid.UUID
    ) -> IncidentDetailResponse:
        incident = await self.repository.get_by_id(session, inc_id)
        if not incident or incident.org_id != org_id:
            raise ResourceNotFoundException("Incident not found")

        correlations = await self.repository.get_correlations(session, inc_id)
        correlations_resp = [
            IncidentCorrelationResponse.model_validate(c) for c in correlations
        ]

        data = IncidentResponse.model_validate(incident).model_dump()
        data["correlations"] = correlations_resp
        return IncidentDetailResponse.model_validate(data)

    async def update_incident(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        inc_id: uuid.UUID,
        request: IncidentUpdateRequest,
    ) -> IncidentResponse:
        incident = await self.repository.get_by_id(session, inc_id)
        if not incident or incident.org_id != org_id:
            raise ResourceNotFoundException("Incident not found")

        update_kwargs = {}
        resolving = request.status == IncidentStatus.RESOLVED
        if request.status is not None and not resolving:
            update_kwargs["status"] = request.status.value
        if request.severity is not None:
            update_kwargs["severity"] = request.severity.value
        if request.root_cause is not None:
            update_kwargs["root_cause"] = request.root_cause.value
        if request.description is not None:
            update_kwargs["description"] = request.description

        updated = (
            await self.repository.update(session, incident, **update_kwargs)
            if update_kwargs
            else incident
        )
        if resolving:
            updated = await self.resolve_incident(
                session, incident.id, org_id=org_id
            )
        return IncidentResponse.model_validate(updated)

    async def manually_correlate(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        inc_id: uuid.UUID,
        request: IncidentCorrelateRequest,
    ) -> IncidentCorrelationResponse:
        incident = await self.repository.get_by_id(session, inc_id)
        if not incident or incident.org_id != org_id:
            raise ResourceNotFoundException("Incident not found")

        corr = await self.repository.create_correlation(
            session=session,
            incident_id=inc_id,
            correlated_dependency_id=request.correlated_dependency_id,
            confidence=request.correlation_confidence,
            time_window_seconds=request.time_window_seconds,
            method=request.correlation_method.value,
        )
        return IncidentCorrelationResponse.model_validate(corr)

    async def get_or_trigger_evidence(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        inc_id: uuid.UUID,
    ) -> EvidenceReportResponse:
        incident = await self.repository.get_by_id(session, inc_id)
        if not incident or incident.org_id != org_id:
            raise ResourceNotFoundException("Incident not found")

        from app.modules.evidence.repository import EvidenceRepository
        from app.modules.evidence.schemas import EvidenceReportResponse as Err

        report = await EvidenceRepository.get_by_incident(session, inc_id)
        if report:
            return Err.model_validate(report)

        from app.modules.evidence.service import evidence_service

        report = await evidence_service.generate_for_incident(session, inc_id)
        return Err.model_validate(report)


incident_service = IncidentService()
