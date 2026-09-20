"""Evidence reports: read paths over generated artifacts.

Listing, signed downloads, raw artifact bytes, and explicit regeneration
(the one path that mints a new artifact for unchanged inputs).
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundException
from app.infrastructure.storage import storage_client
from app.modules.evidence import design
from app.modules.evidence.context import EvidenceContext
from app.modules.evidence.generation import EvidenceGeneration
from app.modules.evidence.repository import (
    EvidenceRepository,
    EvidenceSnapshotRepository,
)
from app.modules.evidence.schemas import (
    EvidenceReportDownloadResponse,
    EvidenceReportResponse,
)

logger = logging.getLogger(__name__)


class EvidenceReports:
    """Read paths; regeneration delegates to generation."""

    def __init__(
        self,
        repository: EvidenceRepository,
        snapshot_repository: EvidenceSnapshotRepository,
        generation: EvidenceGeneration,
        context: EvidenceContext,
    ) -> None:
        self.repository = repository
        self.snapshot_repository = snapshot_repository
        self._generation = generation
        self._context = context

    async def list_reports(
        self, session: AsyncSession, org_id: uuid.UUID, limit: int = 50
    ) -> list[EvidenceReportResponse]:
        reports = await self.repository.list_for_org(session, org_id, limit=limit)
        return [EvidenceReportResponse.model_validate(item) for item in reports]

    async def get_report_download(
        self, session: AsyncSession, org_id: uuid.UUID, report_id: uuid.UUID
    ) -> EvidenceReportDownloadResponse:
        """Issue a signed download URL for a report whose PDF is verified present.

        The stored object is stat'ed first. A record whose artifact has been
        deleted from the bucket is a broken artifact and must be reported as
        one - issuing a link that 404s would be worse than an error.
        """
        from app.core.exceptions import ArtifactMissingException
        from app.infrastructure.storage import StorageObjectMissing

        report = await self.repository.get_by_id(session, report_id)
        if not report or report.org_id != org_id:
            raise ResourceNotFoundException("Evidence report not found")

        try:
            stored = storage_client.stat_object(report.file_path)
        except StorageObjectMissing as exc:
            raise ArtifactMissingException(
                f"The stored artifact for report {report.id} is missing from "
                "object storage. Regenerate the report to restore it.",
                details=[{"field": "report_id", "issue": "artifact_missing"}],
            ) from exc

        if int(stored.get("size_bytes") or 0) != int(report.file_size_bytes):
            logger.warning(
                "Stored size for report %s (%s) differs from the recorded %s",
                report.id,
                stored.get("size_bytes"),
                report.file_size_bytes,
            )

        data = EvidenceReportResponse.model_validate(report).model_dump()
        data["download_url"] = storage_client.get_presigned_url(
            report.file_path, expires_seconds=3600
        )

        # Attach the path from this artifact back to its own verification
        # record. Without it the CLI (and the console) can retrieve a document
        # but cannot answer the question the document exists to answer - "is
        # this what RELIASTRA issued?" - without the operator finding the
        # verification id inside the PDF and typing it.
        snapshot = await self.snapshot_repository.get_by_report_checksum(
            session, report.checksum
        )
        if snapshot is not None:
            data["verification_id"] = snapshot.verification_id
            data["verification_url"] = design.verification_url(
                snapshot.verification_id
            )
            data["data_hash"] = snapshot.data_hash
            data["methodology_version"] = snapshot.methodology_version
            data["signed"] = snapshot.signature is not None
            data["signature_alg"] = snapshot.signature_alg

        return EvidenceReportDownloadResponse.model_validate(data)

    async def get_report_artifact(
        self, session: AsyncSession, org_id: uuid.UUID, report_id: uuid.UUID
    ) -> tuple[bytes, str, str]:
        """Read a report's rendered bytes for the account that owns it.

        Returns ``(payload, filename, checksum)``. The same three checks as the
        metadata path apply, in the same order: the report must belong to this
        account, and the stored object must actually exist - a record whose
        artifact is gone is a broken artifact, and streaming an empty response
        would report that as a successful download.
        """
        from app.core.exceptions import ArtifactMissingException
        from app.infrastructure.storage import StorageObjectMissing

        report = await self.repository.get_by_id(session, report_id)
        if not report or report.org_id != org_id:
            raise ResourceNotFoundException("Evidence report not found")

        try:
            payload = storage_client.download_bytes(report.file_path)
        except StorageObjectMissing as exc:
            raise ArtifactMissingException(
                f"The stored artifact for report {report.id} is missing from "
                "object storage. Regenerate the report to restore it.",
                details=[{"field": "report_id", "issue": "artifact_missing"}],
            ) from exc

        if len(payload) != int(report.file_size_bytes):
            logger.warning(
                "Stored artifact for report %s is %d bytes; the record says %s",
                report.id,
                len(payload),
                report.file_size_bytes,
            )

        return payload, f"reliastra-evidence-{report.id}.pdf", report.checksum

    async def regenerate_report(
        self, session: AsyncSession, org_id: uuid.UUID, report_id: uuid.UUID
    ) -> EvidenceReportResponse:
        """Produce a fresh artifact for the same incident.

        Explicit regeneration bypasses the idempotency short-circuit: the
        operator asked for a new document, and it gets a new verification id,
        a new object key and a new checksum even when the inputs are unchanged.
        """
        report = await self.repository.get_by_id(session, report_id)
        if not report or report.org_id != org_id:
            raise ResourceNotFoundException("Evidence report not found")
        await self._context._enforce_evidence_entitlement(session, org_id)
        return await self._generation.generate_for_incident(
            session, report.incident_id, force=True
        )
