"""Public incident evidence: deterministic artifacts for observed incidents.

Phase 5 of the intelligence rollout. Every detector-confirmed public incident
gains a machine-verifiable evidence document: the incident's stored claim and
detection provenance plus the raw ``vendor_probe`` observations of its
window, serialised to canonical JSON bytes, hashed, and frozen.

Three properties, all testable and all load-bearing:

- **Deterministic.** ``build_evidence_document`` is a pure function of stored
  facts. No wall-clock value enters the document, so rebuilding it from the
  same incident and observations reproduces the same bytes - and therefore
  the same SHA-256. Verification is recomputation, not trust.
- **Reproducible.** The window is bounded by facts of the incident
  (``started_at``, the stamped resolution observation), never by "now": a
  generation job that runs late cannot widen what it captures.
- **Immutable.** Each freeze is a row in ``public_incident_evidence``; update
  and delete are blocked at the model level. A resolved incident gets a new
  version that supersedes the open freeze; nothing is edited in place.

Generation is a publishing job: it never runs in the probe task or the API
process. The probe transaction enqueues an
``public_incident_evidence_requested`` outbox event in the same transaction
as the incident transition (so the event can never be lost after a
transition commits, and a lost event only delays a freeze - it cannot
desynchronize one), and the outbox processor freezes asynchronously. A daily
reconciliation task re-freezes anything an outage skipped, which makes the
pipeline idempotent end to end: every freeze is create-if-changed, and
redelivery is a no-op.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.evidence.canonical import canonical_json_bytes
from app.modules.incidents.public_evidence_models import PublicIncidentEvidence
from app.modules.incidents.public_models import PublicIncident
from app.modules.observations.models import Observation
from app.modules.observations.repository import ObservationRepository
from app.modules.vendors.models import VendorTracking

logger = logging.getLogger(__name__)

#: Document shape version. Bumped when the canonical document changes
#: meaningfully, so a verifier knows which contract a hash was made under.
EVIDENCE_SCHEMA_VERSION = "1.0"

EVIDENCE_GENERATOR = "reliastra-public-evidence"
EVIDENCE_GENERATOR_VERSION = "1.0"

#: Fixed context margin BEFORE the incident window, in seconds. A constant of
#: the methodology, not a per-call input: a frozen document must not depend on
#: when or where it was generated. The margin shows the observation that was
#: last successful before the failing run, grounding "the endpoint was up
#: right before this" in a stored row instead of an assertion.
EVIDENCE_CONTEXT_SECONDS = 900

#: Hard cap on observations carried in one document. The window of a very
#: long incident is narrowed by dropping the OLDEST rows; the document
#: discloses the truncation instead of silently shortening history.
EVIDENCE_MAX_OBSERVATIONS = 1000

#: Outbox event type enqueued in the probe transaction when an incident
#: opens or resolves. The payload is ``{"incident_id": "<uuid>"}``.
EVENT_TYPE = "public_incident_evidence_requested"

VERIFICATION_ALGORITHM = "sha256"

#: Verification recipe published inside every artifact: the hash covers the
#: canonical bytes of the document minus the ``verification`` key.
VERIFY_NOTE = (
    "sha256 of the canonical JSON bytes of this document with the "
    "'verification' key removed (sorted keys, compact separators, "
    "ensure_ascii=False, utf-8)"
)


# ---------------------------------------------------------------------------
# Document construction (pure functions - no I/O, no clocks)
# ---------------------------------------------------------------------------


def evidence_window_bounds(
    incident: PublicIncident,
    *,
    resolution_observed_at: datetime | None,
) -> tuple[datetime, datetime]:
    """The half-open observation window a freeze covers: ``[since, until]``.

    Lower bound: the fixed context margin before ``started_at``. Upper bound:
    the stamped resolution observation's timestamp when the incident is
    resolved and the stamp is still readable (a fact of the record), the
    resolution stamp itself (``resolved_at``, the first recovery success)
    when the stamped probe has aged out, and the detection timestamp for an
    open incident. All three bounds are stored values, so a freeze
    regenerated at any later time selects the same rows.
    """
    since = incident.started_at - timedelta(seconds=EVIDENCE_CONTEXT_SECONDS)
    if incident.status == "resolved":
        if resolution_observed_at is not None:
            return since, resolution_observed_at
        if incident.resolved_at is not None:
            return since, incident.resolved_at
    return since, incident.detected_at


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def observation_entry(row: Observation) -> dict[str, Any]:
    """One observation as the document carries it.

    Only fields the public claim is built from; a customer observation could
    never appear here (the window read filters ``source_type='vendor_probe'``),
    and nothing beyond these fields is disclosed even if stored.
    """
    return {
        "id": str(row.id),
        "timestamp": _iso(row.timestamp),
        "region": row.region,
        "status_code": row.status_code,
        "latency_ms": row.latency_ms,
        "error_type": row.error_type,
        "error_message": row.error_message,
    }


def build_evidence_document(
    incident: PublicIncident,
    vendor: VendorTracking,
    observations: list[Observation],
    *,
    version: int,
    supersedes_version: int | None,
    truncated: bool,
) -> dict[str, Any]:
    """Assemble the canonical document for one freeze.

    ``observations`` must already be the window slice, oldest first. Every
    input is a stored fact; the output contains no wall-clock field, which is
    exactly what makes the artifact reproducible.
    """
    duration_ms: int | None = None
    if incident.resolved_at is not None:
        duration_ms = int(
            (incident.resolved_at - incident.started_at).total_seconds() * 1000
        )

    return {
        "artifact": {
            "kind": "reliastra.public_incident_evidence",
            "schema_version": EVIDENCE_SCHEMA_VERSION,
            "generator": EVIDENCE_GENERATOR,
            "generator_version": EVIDENCE_GENERATOR_VERSION,
            "evidence_version": version,
            "supersedes_version": supersedes_version,
        },
        "methodology": {
            "version": incident.methodology_version,
            "attribution": incident.attribution_status,
            "detection_rule": incident.detection_rule,
            "detection_metadata": incident.detection_metadata,
            "record_url": (
                f"/observatory/{vendor.vendor_name}/incidents/{incident.id}"
            ),
            "claim": incident.description,
            "claim_scope": (
                "This document covers one observed endpoint from one "
                "observation region. It is not a statement about the "
                "vendor's services as a whole, other regions, or any "
                "customer's traffic."
            ),
        },
        "incident": {
            "id": str(incident.id),
            "vendor": vendor.vendor_name,
            "vendor_display_name": vendor.display_name,
            "category": vendor.category,
            "endpoint_url": incident.endpoint_url,
            "target_name": incident.target_name,
            "region": incident.region,
            "status": incident.status,
            "severity": incident.severity,
            "failure_kind": incident.failure_kind,
            "started_at": _iso(incident.started_at),
            "detected_at": _iso(incident.detected_at),
            "resolved_at": _iso(incident.resolved_at),
            "duration_ms": duration_ms,
            "observation_count": incident.observation_count,
            "failure_count": incident.failure_count,
            "status_codes": incident.status_codes,
            "first_observation_id": incident.first_observation_id,
            "last_observation_id": incident.last_observation_id,
        },
        "observations": {
            "count": len(observations),
            "truncated": truncated,
            "truncation": (
                f"oldest rows beyond {EVIDENCE_MAX_OBSERVATIONS} dropped"
                if truncated
                else None
            ),
            "window_seconds_context_before": EVIDENCE_CONTEXT_SECONDS,
            "rows": [observation_entry(row) for row in observations],
        },
    }


def hash_document_core(document: dict[str, Any]) -> str:
    """SHA-256 over the canonical bytes of the document minus verification."""
    core = {key: value for key, value in document.items() if key != "verification"}
    return hashlib.sha256(canonical_json_bytes(core)).hexdigest()


def finalize_document(document: dict[str, Any]) -> dict[str, Any]:
    """Attach the verification block and return the served document."""
    return {
        **document,
        "verification": {
            "algorithm": VERIFICATION_ALGORITHM,
            "payload_sha256": hash_document_core(document),
            "covers": VERIFY_NOTE,
        },
    }


# ---------------------------------------------------------------------------
# Outbox wiring
# ---------------------------------------------------------------------------


def enqueue_evidence_freeze(session: AsyncSession, incident_id: uuid.UUID) -> None:
    """Request a freeze in the SAME transaction as an incident transition.

    Called by the public detector paths. The event is a plain outbox row: a
    rolled-back transition takes its event with it, and a committed
    transition always leaves one behind for the processor (or the daily
    reconciliation) to pick up.
    """
    from app.modules.observations.models import OutboxEvent

    session.add(
        OutboxEvent(
            event_type=EVENT_TYPE,
            payload=json.dumps({"incident_id": str(incident_id)}),
        )
    )


async def handle_evidence_requested(session: AsyncSession, payload: str) -> str:
    """Outbox handler: freeze the incident named in the event payload.

    Returns ``"created"``, ``"current"`` (a freeze already reflects the
    incident's current state - redelivery) or ``"missing"`` (the incident is
    gone, or the payload names something that can never exist - consumed,
    because retrying cannot change it). Transient database failures raise,
    which leaves the event pending for the next cycle.
    """
    try:
        parsed = json.loads(payload)
        incident_id = uuid.UUID(str(parsed["incident_id"]))
    except (ValueError, KeyError, TypeError):
        logger.exception("Malformed %s payload", EVENT_TYPE)
        return "missing"
    return await public_incident_evidence_service.freeze_for_incident(
        session, incident_id
    )


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


class PublicIncidentEvidenceRepository:
    @staticmethod
    async def latest_for_incident(
        session: AsyncSession, incident_id: uuid.UUID
    ) -> PublicIncidentEvidence | None:
        result = await session.execute(
            select(PublicIncidentEvidence)
            .where(PublicIncidentEvidence.incident_id == incident_id)
            .order_by(PublicIncidentEvidence.version.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_version(
        session: AsyncSession, incident_id: uuid.UUID, version: int
    ) -> PublicIncidentEvidence | None:
        result = await session.execute(
            select(PublicIncidentEvidence).where(
                PublicIncidentEvidence.incident_id == incident_id,
                PublicIncidentEvidence.version == version,
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def create(
        session: AsyncSession, artifact: PublicIncidentEvidence
    ) -> PublicIncidentEvidence:
        session.add(artifact)
        await session.flush()
        return artifact

    @staticmethod
    async def list_stale_incident_ids(
        session: AsyncSession, limit: int = 200
    ) -> list[PublicIncident]:
        """Incidents whose latest freeze does not match their live state.

        The reconciliation feed: no freeze at all, or a latest freeze frozen
        under a different status. Ordered oldest first so the queue drains in
        incident order across runs.
        """
        latest = (
            select(
                PublicIncidentEvidence.incident_id.label("incident_id"),
                PublicIncidentEvidence.incident_status.label("status"),
            )
            .order_by(
                PublicIncidentEvidence.incident_id.asc(),
                PublicIncidentEvidence.version.desc(),
            )
            .distinct(PublicIncidentEvidence.incident_id)
            .subquery()
        )
        result = await session.execute(
            select(PublicIncident)
            .outerjoin(latest, latest.c.incident_id == PublicIncident.id)
            .where(
                latest.c.status.is_(None)
                | (latest.c.status != PublicIncident.status)
            )
            .order_by(PublicIncident.started_at.asc())
            .limit(limit)
        )
        return list(result.scalars().all())


class PublicIncidentEvidenceService:
    def __init__(
        self,
        repository: PublicIncidentEvidenceRepository | None = None,
    ) -> None:
        self.repository = repository or PublicIncidentEvidenceRepository()

    # ------------------------------------------------------------------
    # Freeze
    # ------------------------------------------------------------------

    async def freeze_for_incident(
        self, session: AsyncSession, incident_id: uuid.UUID
    ) -> str:
        """Freeze the incident's current state as a new artifact version.

        Idempotent: when the newest freeze already reflects the incident's
        current status, this is a no-op (``"current"``). Concurrent freezes
        of the same version collide on the unique constraint; the loser
        treats the winner's row as the answer.
        """
        incident = await session.get(PublicIncident, incident_id)
        if incident is None:
            return "missing"
        vendor = await session.get(VendorTracking, incident.vendor_id)
        if vendor is None:
            return "missing"

        latest = await self.repository.latest_for_incident(session, incident_id)
        if latest is not None and latest.incident_status == incident.status:
            return "current"

        observations, truncated = await self._window_observations(session, incident)
        document = build_evidence_document(
            incident,
            vendor,
            observations,
            version=(latest.version + 1) if latest else 1,
            supersedes_version=latest.version if latest else None,
            truncated=truncated,
        )
        finalized = finalize_document(document)
        payload_bytes = canonical_json_bytes(finalized)
        artifact = PublicIncidentEvidence(
            incident_id=incident.id,
            version=(latest.version + 1) if latest else 1,
            incident_status=incident.status,
            artifact_schema_version=EVIDENCE_SCHEMA_VERSION,
            generator=EVIDENCE_GENERATOR,
            generator_version=EVIDENCE_GENERATOR_VERSION,
            methodology_version=incident.methodology_version,
            data_hash=finalized["verification"]["payload_sha256"],
            byte_size=len(payload_bytes),
            observation_count=len(observations),
            observations_truncated=truncated,
            supersedes_version=latest.version if latest else None,
            payload=payload_bytes.decode("utf-8"),
            observation_ids=[row["id"] for row in finalized["observations"]["rows"]],
        )
        try:
            await self.repository.create(session, artifact)
        except IntegrityError:
            # The unique (incident_id, version) constraint: a concurrent
            # processor froze this version first. That is the same outcome
            # redelivery would produce, so the event is done either way.
            logger.info(
                "Evidence freeze for incident %s raced a concurrent freeze",
                incident_id,
            )
            return "current"
        logger.info(
            "Froze public incident evidence: incident=%s version=%s status=%s "
            "observations=%s sha256=%s",
            incident.id,
            artifact.version,
            artifact.incident_status,
            artifact.observation_count,
            artifact.data_hash,
        )
        # The dataset mirror's inputs changed: request a refresh on the same
        # durable pattern. Content-hash idempotency makes this cheap for the
        # publisher even when several freezes land in one drain cycle.
        from app.modules.dataset.service import enqueue_dataset_refresh

        enqueue_dataset_refresh(session)
        # The per-incident social draft rides the same durable pattern: a
        # lifecycle change may need a new draft version, and content-hash
        # idempotency makes redelivery a no-op.
        from app.modules.digest.service import enqueue_social_draft

        enqueue_social_draft(session, incident.id)
        return "created"

    async def _window_observations(
        self, session: AsyncSession, incident: PublicIncident
    ) -> tuple[list[Observation], bool]:
        """The frozen window slice, oldest first, newest kept under the cap.

        The upper bound prefers the stamped resolution observation's own
        timestamp; if that row has aged out of the partitioned store the
        bound falls back to ``resolved_at`` (the first recovery success),
        which is still a stored fact. In either case the bound never moves
        with the clock.
        """
        resolution_observed_at: datetime | None = None
        if incident.resolution_observation_id:
            row = await session.execute(
                select(Observation).where(
                    Observation.id == uuid.UUID(incident.resolution_observation_id)
                )
            )
            found = row.scalar_one_or_none()
            if found is not None:
                resolution_observed_at = found.timestamp
        since, until = evidence_window_bounds(
            incident, resolution_observed_at=resolution_observed_at
        )
        # Through the shared observation read port, same as detection: the
        # evidence window is the same slice the detector saw, bounded to the
        # incident's own facts.
        newest_first = await ObservationRepository.list_for_endpoints(
            session,
            [incident.endpoint_url],
            source_type="vendor_probe",
            limit=EVIDENCE_MAX_OBSERVATIONS,
            since=since,
            until=until,
        )
        truncated = len(newest_first) == EVIDENCE_MAX_OBSERVATIONS
        return list(reversed(newest_first)), truncated

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    async def get_latest(
        self, session: AsyncSession, incident_id: uuid.UUID
    ) -> PublicIncidentEvidence | None:
        return await self.repository.latest_for_incident(session, incident_id)

    async def get_version(
        self, session: AsyncSession, incident_id: uuid.UUID, version: int
    ) -> PublicIncidentEvidence | None:
        if version < 1:
            return None
        return await self.repository.get_version(session, incident_id, version)

    # ------------------------------------------------------------------
    # Reconciliation
    # ------------------------------------------------------------------

    async def reconcile(self, session: AsyncSession, limit: int = 200) -> int:
        """Re-freeze incidents whose latest artifact lags their live state.

        The recovery path for a processor outage (or an incident frozen
        before this feature deployed): the outbox event is the fast path,
        this sweep is the guaranteed one. Idempotent by the same rule as the
        freeze itself - matching state is a no-op.
        """
        stale = await PublicIncidentEvidenceRepository.list_stale_incident_ids(
            session, limit
        )
        created = 0
        for incident in stale:
            outcome = await self.freeze_for_incident(session, incident.id)
            if outcome == "created":
                created += 1
        if stale:
            logger.info(
                "Public evidence reconciliation: %s stale incidents, %s frozen",
                len(stale),
                created,
            )
        return created


public_incident_evidence_service = PublicIncidentEvidenceService()
