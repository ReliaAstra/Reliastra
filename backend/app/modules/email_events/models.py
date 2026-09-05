from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Text, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class EmailRecord(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "email_records"

    # Resend email ID (re_...) — unique when present
    resend_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    recipient: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    sender: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Correlation
    organization_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    correlation_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    template: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # State machine: created -> sending -> sent -> delivered | delayed | bounced | failed | suppressed | complained
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="sent", index=True)
    last_event_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    __table_args__ = (
        Index("ix_email_records_recipient_category", "recipient", "category"),
    )


class ResendWebhookEvent(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "resend_webhook_events"

    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="resend")
    event_id: Mapped[str] = mapped_column(String(128), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    resend_email_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    recipient: Mapped[str | None] = mapped_column(String(320), nullable=True, index=True)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("provider", "event_id", name="uq_resend_event_id"),
        Index("ix_resend_events_email_id", "resend_email_id"),
    )


class EmailSuppression(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "email_suppressions"

    recipient: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    reason: Mapped[str] = mapped_column(String(64), nullable=False)  # bounce, complaint, suppressed
    last_event_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
