from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class OutreachLead(UUIDMixin, TimestampMixin, Base):
    """One candidate agency website. Dedup key is the normalized domain."""

    __tablename__ = "outreach_leads"

    domain: Mapped[str] = mapped_column(String(253), nullable=False, unique=True, index=True)
    website: Mapped[str] = mapped_column(String(1024), nullable=False)
    agency_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    country: Mapped[str | None] = mapped_column(String(64), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    size_band: Mapped[str | None] = mapped_column(String(32), nullable=True)
    founder_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(320), nullable=True, index=True)
    contact_route: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    care_plan_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    care_plan_tiers: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    services_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # new | queued | approved | sent | killed | skipped
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="new", index=True)
    kill_reason: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    evidence: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    seed_source: Mapped[str | None] = mapped_column(String(128), nullable=True)

    __table_args__ = (Index("ix_outreach_leads_status", "status"),)


class OutreachDraft(UUIDMixin, TimestampMixin, Base):
    """One reviewable draft per lead. Exactly one row per lead."""

    __tablename__ = "outreach_drafts"

    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, unique=True, index=True
    )
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    body_text: Mapped[str] = mapped_column(Text, nullable=False)
    angle: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # draft | queued | approved | sent | killed
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    resend_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    send_error: Mapped[str | None] = mapped_column(String(500), nullable=True)


class OutreachSend(UUIDMixin, TimestampMixin, Base):
    """Append-only send log. One row per attempted send (for caps + 30-day rule)."""

    __tablename__ = "outreach_sends"

    lead_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    draft_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    recipient: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    sender: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    resend_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # sent | failed | suppressed
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)

    __table_args__ = (Index("ix_outreach_sends_lead_created", "lead_id", "created_at"),)


class OutreachSuppression(UUIDMixin, TimestampMixin, Base):
    """Opt-outs, bounces, complaints. Checked before any draft is queued/sent."""

    __tablename__ = "outreach_suppressions"

    # lowercased email address or bare domain
    value: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # email | domain
    reason: Mapped[str] = mapped_column(String(64), nullable=False)  # opt_out | bounce | complaint
    source: Mapped[str | None] = mapped_column(String(128), nullable=True)

    __table_args__ = (UniqueConstraint("value", name="uq_outreach_suppression_value"),)
