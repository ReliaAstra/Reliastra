"""Public incident intelligence: detection application and read models.

Two responsibilities, one module:

1. ``apply_vendor_observation`` - called from the public probe task inside
   the same transaction as the observation write. It feeds the recorded
   observation, plus the endpoint's trailing history, into the shared
   deterministic detection policy (``evaluate_detection``) and applies the
   decision to the ``public_incidents`` table. Nothing here invents its own
   rule set; the customer and public planes run the same policy object so
   "confirmed" means the same thing on both.

2. Read models for the public API (vendor incidents, global search,
   incident detail).

Publication discipline: a row exists only when the detector confirmed the
failure run. A single failed probe transitions nothing. Every row states
exactly what was observed, where, when, and by which rule; it never claims
a vendor-wide outage.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import ResourceNotFoundException, ValidationException
from app.modules.checks.detection import (
    CheckOutcome,
    evaluate_detection,
    policy_from_settings,
)
from app.modules.incidents.public_evidence import (
    enqueue_evidence_freeze,
    public_incident_evidence_service,
)
from app.modules.incidents.public_evidence_models import PublicIncidentEvidence
from app.modules.incidents.public_models import (
    ATTRIBUTION_OBSERVED,
    PublicIncident,
)
from app.modules.incidents.public_repository import PublicIncidentRepository
from app.modules.incidents.public_schemas import (
    PublicIncidentDetailResponse,
    PublicIncidentEvidenceDescriptor,
    PublicIncidentListResponse,
    PublicIncidentSummary,
)
from app.modules.observations.repository import ObservationRepository
from app.modules.vendors.models import VendorEndpoint, VendorTracking


class ObservationLike(Protocol):
    """The fields detection and provenance need from one observation row.

    Satisfied by both the ORM ``Observation`` and the
    ``ObservationResponse`` DTO the probe task already holds, so detection
    runs without re-reading the row it just wrote."""

    id: uuid.UUID
    timestamp: datetime
    region: str
    status_code: int | None
    error_type: str | None
    error_message: str | None

METHODOLOGY_VERSION = "v1.0"

#__safe_failure kinds, mirrored in the public schema text.
FAILURE_KINDS = (
    "http_5xx",
    "http_4xx",
    "transport",
    "timeout",
    "mixed",
    "unknown",
)


def _observation_is_up(row: ObservationLike) -> bool:
    """The same success predicate the public catalog and the probe task use:
    no transport error and a status code was received. Anything else -
    timeout, DNS failure, unexpected status for the target's methodology -
    counts as a failed observation."""
    return row.error_type is None and row.status_code is not None


def _classify_failure_kind(failing: list[ObservationLike]) -> str:
    """Classify the failing run from its raw rows. ``failing`` contains only
    failed observations (newest first order irrelevant)."""
    kinds: set[str] = set()
    for row in failing:
        message = (row.error_message or "").lower()
        if row.status_code is None:
            kinds.add("timeout" if "timeout" in message else "transport")
        elif 500 <= row.status_code <= 599:
            kinds.add("http_5xx")
        elif 400 <= row.status_code <= 499:
            kinds.add("http_4xx")
        else:
            kinds.add("unknown")
    if not kinds:
        return "unknown"
    if len(kinds) == 1:
        return next(iter(kinds))
    return "mixed"


def _build_description(
    *,
    vendor_display: str,
    endpoint_url: str,
    region: str,
    started_at: datetime,
    detected_at: datetime,
    failure_count: int,
    failure_kind: str,
    status_codes: list[int],
) -> str:
    """The incident claim, written to be a statement of measurement.

    Endpoint scoped, observation point named, run length and failure class
    explicit. Deliberately not "X is down"."""
    codes_text = ", ".join(str(code) for code in status_codes) if status_codes else "no HTTP response"
    return (
        f"Between {started_at.isoformat()} and {detected_at.isoformat()}, RELIASTRA probes in "
        f"{region} recorded {failure_count} consecutive failed observations against "
        f"{endpoint_url} (the observed {vendor_display} target). Failure class: {failure_kind}; "
        f"observed status: {codes_text}. This record describes the observed endpoint only "
        f"and is not a statement about the vendor's services as a whole."
    )


class PublicIncidentService:
    def __init__(self, repository: PublicIncidentRepository | None = None) -> None:
        self.repository = repository or PublicIncidentRepository()

    # ------------------------------------------------------------------
    # Detection
    # ------------------------------------------------------------------

    async def apply_vendor_observation(
        self,
        session: AsyncSession,
        *,
        endpoint: VendorEndpoint,
        vendor: VendorTracking,
        observation: ObservationLike,
        region: str,
    ) -> PublicIncident | None:
        """Feed one recorded observation into the detector.

        Called with the endpoint row locked FOR UPDATE by the probe task, so
        concurrent tasks for the same target serialize here exactly like the
        customer probe path. Returns the incident row it opened or resolved,
        or None when the observation transitions no state.

        History is the endpoint's trailing observations (excluding the one
        just recorded, passed separately as ``current``), oldest first, which
        is the contract ``evaluate_detection`` documents.
        """
        policy = policy_from_settings(settings)

        stored = await ObservationRepository.list_for_endpoints(
            session, [endpoint.endpoint_url], limit=policy.history_limit()
        )
        history = [
            CheckOutcome(
                is_up=_observation_is_up(row),
                observation_point=row.region,
                executed_at=row.timestamp,
            )
            for row in reversed(stored)
            if row.id != observation.id
        ]

        open_incident = await self.repository.get_open_for_endpoint(
            session, endpoint.id
        )
        decision = evaluate_detection(
            policy=policy,
            current=CheckOutcome(
                is_up=_observation_is_up(observation),
                observation_point=region,
                executed_at=observation.timestamp,
            ),
            history=history,
            window=history,
            has_open_incident=open_incident is not None,
            now=observation.timestamp,
        )

        if decision.open_incident:
            # The failing run backing the claim, newest first, inclusive of
            # the current observation. Needed for status codes and ids.
            run: list[ObservationLike] = [observation]
            for row in stored:
                if row.id == observation.id:
                    continue
                if _observation_is_up(row):
                    break
                run.append(row)
            start = decision.run_started_at or observation.timestamp
            codes: list[int] = []
            for row in reversed(run):
                if row.status_code is not None and row.status_code not in codes:
                    codes.append(row.status_code)
            kind = _classify_failure_kind(run)
            opened = await self.repository.create(
                session,
                PublicIncident(
                    vendor_id=vendor.id,
                    endpoint_id=endpoint.id,
                    region=region,
                    endpoint_url=endpoint.endpoint_url,
                    target_name=endpoint.name,
                    status="open",
                    severity="major",
                    failure_kind=kind,
                    started_at=start,
                    detected_at=observation.timestamp,
                    observation_count=len(run),
                    failure_count=decision.consecutive_failures,
                    status_codes=codes,
                    first_observation_id=str(run[-1].id),
                    last_observation_id=str(observation.id),
                    detection_rule=decision.rule.value,
                    detection_metadata=decision.as_metadata(),
                    methodology_version=METHODOLOGY_VERSION,
                    attribution_status=ATTRIBUTION_OBSERVED,
                    description=_build_description(
                        vendor_display=vendor.display_name,
                        endpoint_url=endpoint.endpoint_url,
                        region=region,
                        started_at=start,
                        detected_at=observation.timestamp,
                        failure_count=decision.consecutive_failures,
                        failure_kind=kind,
                        status_codes=codes,
                    ),
                ),
            )
            # Evidence fan-out rides the same transaction (outbox): the
            # freeze job can never lose a transition that committed, and a
            # failed generation can never lose a measurement.
            enqueue_evidence_freeze(session, opened.id)
            return opened

        if decision.resolve_incident and open_incident is not None:
            # Resolution is idempotent (the post-remove path checks the row
            # is still open above, and the status flip is in-row). Stamp the
            # window symmetric to the opening stamp: begun at the first
            # failure of the failing run, ended at the first success of the
            # recovery run - not at the check that happened to prove either.
            # The shared detector does not carry ``run_started_at`` on
            # recovery decisions, so the run start is derived here from the
            # same frame the decision was made on (oldest first + current).
            frame = list(history) + [
                CheckOutcome(
                    is_up=_observation_is_up(observation),
                    observation_point=region,
                    executed_at=observation.timestamp,
                )
            ]
            run_length = decision.consecutive_successes
            if run_length > 0 and run_length <= len(frame):
                recovery_started_at = frame[len(frame) - run_length].executed_at
            else:
                recovery_started_at = observation.timestamp
            open_incident.resolved_at = recovery_started_at
            open_incident.status = "resolved"
            # The confirming probe, stamped as the evidence window's upper
            # bound: a fact of the record, so a freeze regenerated at any
            # later time selects exactly the rows this decision saw.
            open_incident.resolution_observation_id = str(observation.id)
            enqueue_evidence_freeze(session, open_incident.id)
            return open_incident

        return None

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    async def list_vendor_incidents(
        self, session: AsyncSession, vendor: VendorTracking, limit: int = 50
    ) -> list[PublicIncident]:
        """Incidents RELIASTRA detected on a public vendor, newest first.

        The published window applies to all of them: detection is the
        publication gate, so no flag filtering is needed here."""
        return await self.repository.list_for_vendor(session, vendor.id, limit)

    async def search(
        self,
        session: AsyncSession,
        *,
        vendor_name: str | None = None,
        category: str | None = None,
        region: str | None = None,
        status: str | None = None,
        failure_kind: str | None = None,
        started_after: datetime | None = None,
        started_before: datetime | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> PublicIncidentListResponse:
        if status is not None and status not in ("open", "resolved"):
            raise ValidationException(f"unknown incident status: {status}")
        if failure_kind is not None and failure_kind not in FAILURE_KINDS:
            raise ValidationException(f"unknown failure kind: {failure_kind}")
        limit = max(1, min(limit, 50))

        cursor_started_at: datetime | None = None
        cursor_id: uuid.UUID | None = None
        if cursor:
            try:
                ts_part, id_part = cursor.split("|", 1)
                cursor_started_at = datetime.fromisoformat(ts_part)
                cursor_id = uuid.UUID(id_part)
            except (ValueError, TypeError) as exc:
                raise ValidationException("malformed incidents cursor") from exc

        rows = await self.repository.search(
            session,
            vendor_name=vendor_name,
            category=category,
            region=region,
            status=status,
            failure_kind=failure_kind,
            started_after=started_after,
            started_before=started_before,
            cursor_started_at=cursor_started_at,
            cursor_id=cursor_id,
            limit=limit + 1,
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
        items = [self._to_summary(incident, vendor) for incident, vendor in rows]
        next_cursor = None
        if has_more and rows:
            last_incident, _ = rows[-1]
            next_cursor = f"{last_incident.started_at.isoformat()}|{last_incident.id}"
        return PublicIncidentListResponse(
            items=items, next_cursor=next_cursor, has_more=has_more
        )

    async def get_detail(
        self, session: AsyncSession, incident_id: uuid.UUID
    ) -> PublicIncidentDetailResponse:
        incident = await self.repository.get_by_id(session, incident_id)
        if incident is None:
            raise ResourceNotFoundException("Public incident not found")
        vendor = await session.get(VendorTracking, incident.vendor_id)
        if vendor is None or not vendor.is_public:
            raise ResourceNotFoundException("Public incident not found")
        evidence = await public_incident_evidence_service.get_latest(
            session, incident_id
        )
        return self._to_detail(incident, vendor, evidence=evidence)

    # ------------------------------------------------------------------
    # Mapping
    # ------------------------------------------------------------------

    @staticmethod
    def _duration(incident: PublicIncident) -> float | None:
        if incident.resolved_at is None:
            return None
        return (incident.resolved_at - incident.started_at).total_seconds()

    def _to_summary(
        self, incident: PublicIncident, vendor: VendorTracking
    ) -> PublicIncidentSummary:
        return PublicIncidentSummary(
            incident_id=incident.id,
            vendor_name=vendor.vendor_name,
            vendor_display_name=vendor.display_name,
            category=vendor.category,
            target_name=incident.target_name,
            endpoint_url=incident.endpoint_url,
            region=incident.region,
            status=incident.status,
            severity=incident.severity,
            failure_kind=incident.failure_kind,
            started_at=incident.started_at,
            detected_at=incident.detected_at,
            resolved_at=incident.resolved_at,
            duration_seconds=self._duration(incident),
            observation_count=incident.observation_count,
            failure_count=incident.failure_count,
            methodology_version=incident.methodology_version,
            attribution_status=incident.attribution_status,
        )

    def _to_detail(
        self,
        incident: PublicIncident,
        vendor: VendorTracking,
        *,
        evidence: PublicIncidentEvidence | None = None,
    ) -> PublicIncidentDetailResponse:
        summary = self._to_summary(incident, vendor)
        return PublicIncidentDetailResponse(
            **summary.model_dump(),
            status_codes=incident.status_codes,
            first_observation_id=incident.first_observation_id,
            last_observation_id=incident.last_observation_id,
            detection_rule=incident.detection_rule,
            detection_metadata=incident.detection_metadata,
            description=incident.description,
            evidence=(
                PublicIncidentEvidenceDescriptor(
                    version=evidence.version,
                    incident_status=evidence.incident_status,
                    artifact_schema_version=evidence.artifact_schema_version,
                    methodology_version=evidence.methodology_version,
                    data_hash=evidence.data_hash,
                    byte_size=evidence.byte_size,
                    observation_count=evidence.observation_count,
                    observations_truncated=evidence.observations_truncated,
                    generated_at=evidence.created_at,
                )
                if evidence is not None
                else None
            ),
        )


public_incident_service = PublicIncidentService()
