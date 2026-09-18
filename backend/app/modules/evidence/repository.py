import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.evidence.models import EvidenceReport, EvidenceSnapshot


class EvidenceRepository:
    @staticmethod
    async def create(
        session: AsyncSession,
        org_id: uuid.UUID,
        incident_id: uuid.UUID,
        file_path: str,
        file_size_bytes: int,
        checksum: str,
        expires_at: datetime | None = None,
        renderer: str | None = None,
        renderer_version: str | None = None,
    ) -> EvidenceReport:
        report = EvidenceReport(
            org_id=org_id,
            incident_id=incident_id,
            file_path=file_path,
            file_size_bytes=file_size_bytes,
            checksum=checksum,
            generated_at=datetime.now(timezone.utc),
            expires_at=expires_at,
            renderer=renderer,
            renderer_version=renderer_version,
        )
        session.add(report)
        await session.flush()
        return report

    @staticmethod
    async def get_by_id(
        session: AsyncSession, report_id: uuid.UUID
    ) -> EvidenceReport | None:
        result = await session.execute(
            select(EvidenceReport).where(EvidenceReport.id == report_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_file_path(
        session: AsyncSession, file_path: str
    ) -> EvidenceReport | None:
        """Resolve a report from its object key.

        Used by the idempotency check: an ``EvidenceSnapshot`` records the path
        it was generated to, and the report row is what the console reads, so
        the path is the join between "these facts were already documented" and
        "here is the artifact".
        """
        result = await session.execute(
            select(EvidenceReport).where(EvidenceReport.file_path == file_path)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_incident(
        session: AsyncSession, incident_id: uuid.UUID
    ) -> EvidenceReport | None:
        result = await session.execute(
            select(EvidenceReport)
            .where(EvidenceReport.incident_id == incident_id)
            .order_by(EvidenceReport.generated_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_for_org(
        session: AsyncSession,
        org_id: uuid.UUID,
        limit: int = 50,
    ) -> list[EvidenceReport]:
        result = await session.execute(
            select(EvidenceReport)
            .where(EvidenceReport.org_id == org_id)
            .order_by(EvidenceReport.generated_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())


class EvidenceSnapshotRepository:
    @staticmethod
    async def create(
        session: AsyncSession, **values: Any
    ) -> EvidenceSnapshot:
        snapshot = EvidenceSnapshot(**values)
        session.add(snapshot)
        await session.flush()
        return snapshot

    @staticmethod
    async def get_by_verification_id(
        session: AsyncSession, verification_id: str
    ) -> EvidenceSnapshot | None:
        result = await session.execute(
            select(EvidenceSnapshot).where(
                EvidenceSnapshot.verification_id == verification_id
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_latest_for_incident(
        session: AsyncSession, incident_id: uuid.UUID
    ) -> EvidenceSnapshot | None:
        result = await session.execute(
            select(EvidenceSnapshot)
            .where(EvidenceSnapshot.incident_id == incident_id)
            .order_by(EvidenceSnapshot.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_report_checksum(
        session: AsyncSession, report_checksum: str
    ) -> EvidenceSnapshot | None:
        """The snapshot that issued the exact bytes a report holds.

        The verification id is the one identifier a recipient of an artifact
        needs and the one an account cannot currently read back: it is printed
        inside the document and the QR code, but no response carries it, so a
        client holding a report id could not reach the verification record that
        proves it. That gap is what this lookup closes.

        ``report_checksum`` is the SHA-256 of the bytes, recorded on the
        immutable snapshot at the same moment the report row recorded the same
        value, so equality is an exact binding rather than a heuristic. A
        regeneration produces different bytes because the generation timestamp
        is inside the document, so a match is 1:1 in practice; if two artifacts
        ever did share bytes they would be the same document with the same
        hashed facts, and either verification record would answer for both.
        ``created_at`` descending keeps the answer deterministic regardless.
        """
        result = await session.execute(
            select(EvidenceSnapshot)
            .where(EvidenceSnapshot.report_checksum == report_checksum)
            .order_by(EvidenceSnapshot.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
