import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, event
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class EvidenceReport(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "evidence_reports"

    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    incident_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incidents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    #: Which renderer produced these bytes, and its version. Pagination is a
    #: property of the renderer as much as of the markup, so an artifact whose
    #: renderer is unknown cannot be reproduced from its own metadata - and a
    #: silent fallback to xhtml2pdf used to be undetectable after the fact.
    renderer: Mapped[str | None] = mapped_column(String(64), nullable=True)
    renderer_version: Mapped[str | None] = mapped_column(String(64), nullable=True)


class EvidenceSnapshot(UUIDMixin, Base):
    __tablename__ = "evidence_snapshots"

    incident_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incidents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dependency_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dependencies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    time_window_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    time_window_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    observation_ids: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    attribution_result: Mapped[dict[str, Any] | None] = mapped_column(
        JSON, nullable=True
    )
    methodology_version: Mapped[str] = mapped_column(
        String(20), nullable=False, default="v1.0"
    )
    data_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True
    )
    verification_id: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True
    )
    report_file_path: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    report_checksum: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    json_evidence_path: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    #: Ed25519 signature over the canonical payload bytes, base64url encoded,
    #: with the algorithm and key id that make it checkable. Stored on the
    #: immutable snapshot rather than the mutable report row: the signature is
    #: part of what was proven, and snapshots are the append-only record.
    #: Null when the deployment has no signing key - stated, not hidden.
    signature: Mapped[str | None] = mapped_column(String(160), nullable=True)
    signature_alg: Mapped[str | None] = mapped_column(String(32), nullable=True)
    signing_key_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


@event.listens_for(EvidenceSnapshot, "before_update")
def _prevent_snapshot_update(*_: Any) -> None:
    raise ValueError("Evidence snapshots are immutable")


@event.listens_for(EvidenceSnapshot, "before_delete")
def _prevent_snapshot_delete(*_: Any) -> None:
    raise ValueError("Evidence snapshots are immutable")
