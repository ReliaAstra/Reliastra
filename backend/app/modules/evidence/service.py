"""SLA evidence generation.

An evidence artifact is the one thing in this product a customer hands to
someone else as proof, so the rules here are stricter than elsewhere:

* **Every figure comes from the incident's own window.** ``check_results``
  inside ``[started_at, resolved_at]`` - the authoritative, synchronously
  written record - reduced by :mod:`app.modules.evidence.metrics`. A rolling
  24-hour aggregate is still computed, but it is labelled as context and never
  presented as the incident measurement.
* **Nothing is fabricated.** The report states the detection rule that
  actually fired (persisted on the incident when it opened) and draws its chart
  from the observations it carries. Where a value cannot be computed it is
  reported as unavailable, with the reason.
* **Two hashes, two meanings.** ``data_hash`` is the SHA-256 of the canonical
  JSON evidence payload - the facts. ``report_checksum`` is the SHA-256 of the
  rendered PDF bytes - the document. They are different values describing
  different things and neither substitutes for the other.
* **A report row means the artifact exists.** The database row is written only
  after both object uploads have been verified in the bucket, so a row whose
  PDF cannot be retrieved cannot come into existence. Failures are recorded on
  the incident (``evidence_status``/``evidence_error``) and are retryable.
* **Generation is idempotent.** The same inputs produce the same ``data_hash``;
  a task retry, a duplicated resolve or a concurrent worker finds the existing
  artifact and returns it instead of minting a second one. Explicit
  regeneration (``force=True``) is the only path that creates a new artifact
  for unchanged inputs.

The service itself is a thin facade: ``EvidenceService`` keeps its
constructor and method signatures, and the work lives in focused
collaborators - :mod:`rendering`, :mod:`context`, :mod:`generation` and
:mod:`reports` (errors in :mod:`errors`).

Tests that stub internals should target the owning collaborator
(``service._renderer._render_html``) - stubbing the facade only affects
direct calls, not the internal generate -> render hop.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_log import AuditLogService
from app.infrastructure.storage import storage_client
from app.modules.evidence.context import EvidenceContext
from app.modules.evidence.errors import (
    EvidenceGenerationError,
    EvidenceNotEntitledError,
)
from app.modules.evidence.generation import (
    DEFAULT_METHODOLOGY_VERSION,
    TARGET_UPTIME_PCT,
    EvidenceGeneration,
    canonical_json_bytes,
)
from app.modules.evidence.rendering import (
    RENDERER_CHROMIUM,
    RENDERER_XHTML2PDF,
    EvidenceRenderer,
    _footer_template,
)
from app.modules.evidence.reports import EvidenceReports
from app.modules.evidence.repository import (
    EvidenceRepository,
    EvidenceSnapshotRepository,
)
from app.modules.evidence.schemas import (
    EvidenceReportDownloadResponse,
    EvidenceReportResponse,
)
from app.modules.incidents.repository import IncidentRepository


class EvidenceService:
    """Evidence facade - same API, work delegated to collaborators."""

    def __init__(
        self,
        repository: EvidenceRepository = EvidenceRepository(),
        inc_repository: IncidentRepository = IncidentRepository(),
        snapshot_repository: EvidenceSnapshotRepository = EvidenceSnapshotRepository(),
    ) -> None:
        self.repository = repository
        self.inc_repository = inc_repository
        self.snapshot_repository = snapshot_repository
        self._renderer = EvidenceRenderer()
        self._context = EvidenceContext()
        self._generation = EvidenceGeneration(
            repository,
            inc_repository,
            snapshot_repository,
            self._renderer,
            self._context,
        )
        self._reports = EvidenceReports(
            repository, snapshot_repository, self._generation, self._context
        )

    async def generate_for_incident(
        self,
        session: AsyncSession,
        incident_id: uuid.UUID,
        *,
        force: bool = False,
    ) -> EvidenceReportResponse:
        return await self._generation.generate_for_incident(session, incident_id, force=force)

    async def list_reports(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        limit: int = 50,
    ) -> list[EvidenceReportResponse]:
        return await self._reports.list_reports(session, org_id, limit)

    async def get_report_download(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        report_id: uuid.UUID,
    ) -> EvidenceReportDownloadResponse:
        return await self._reports.get_report_download(session, org_id, report_id)

    async def get_report_artifact(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        report_id: uuid.UUID,
    ) -> tuple[bytes, str, str]:
        return await self._reports.get_report_artifact(session, org_id, report_id)

    async def regenerate_report(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        report_id: uuid.UUID,
    ) -> EvidenceReportResponse:
        return await self._reports.regenerate_report(session, org_id, report_id)


evidence_service = EvidenceService()
# Re-exported so existing importers keep working: tasks and several test
# modules import the errors, renderer identities, methodology version,
# uptime target, and payload/footer helpers from here, and storage /
# audit patches resolve through service.storage_client / AuditLogService.
__all__ = [
    "DEFAULT_METHODOLOGY_VERSION",
    "RENDERER_CHROMIUM",
    "RENDERER_XHTML2PDF",
    "TARGET_UPTIME_PCT",
    "AuditLogService",
    "EvidenceGenerationError",
    "EvidenceNotEntitledError",
    "EvidenceService",
    "_footer_template",
    "canonical_json_bytes",
    "evidence_service",
    "storage_client",
]
