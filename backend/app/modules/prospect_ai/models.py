"""Prospect AI persistence models.

Two tables, both admin-scoped (no tenant FKs - prospecting is Reliastra's
own outbound motion):

* ``prospect_reports`` - one uploaded report (the daily research JSON).
* ``prospect_leads``   - one prospect per row, deduped by domain inside a
  report, carrying the researched evidence fields verbatim plus the AI
  draft (subject/body) and its review/send state.
"""

from __future__ import annotations

import uuid

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class ProspectReport(UUIDMixin, TimestampMixin, Base):
    """One imported prospect report."""

    __tablename__ = "prospect_reports"

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    report_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    prospect_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_md: Mapped[str | None] = mapped_column(Text, nullable=True)


class ProspectLead(UUIDMixin, TimestampMixin, Base):
    """One researched prospect and its AI draft.

    Evidence fields are stored verbatim from the report; the draft columns
    are the only AI-generated content. ``draft_status``:
    ``pending`` -> ``ready`` -> ``sent`` (or ``failed``).
    """

    __tablename__ = "prospect_leads"
    __table_args__ = (
        UniqueConstraint("report_id", "domain", name="uq_prospect_lead_report_domain"),
        Index("ix_prospect_leads_report_status", "report_id", "draft_status"),
    )

    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("prospect_reports.id", ondelete="CASCADE"),
        nullable=False,
    )
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    product: Mapped[str | None] = mapped_column(Text, nullable=True)
    website: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    domain: Mapped[str] = mapped_column(String(253), nullable=False, index=True)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    why_this_person: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_dependencies: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    pain_signal: Mapped[str | None] = mapped_column(Text, nullable=True)
    why_reliastra_is_relevant: Mapped[str | None] = mapped_column(Text, nullable=True)
    outreach_hook: Mapped[str | None] = mapped_column(Text, nullable=True)
    verdict: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    draft_subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    draft_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    draft_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    drafted_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_message_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
