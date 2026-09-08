"""Email Center persistence models.

Three tables, all admin-scoped (no tenant FKs - the console sends as
Reliastra itself, not on behalf of a customer organization):

* ``email_center_senders``   - candidate sender aliases + local enable flag.
  Verification state is NOT stored here; it is resolved live from Resend.
* ``email_center_messages``  - one audit record per send attempt.
* ``email_center_templates`` - reusable subject/body templates with
  ``{{variable}}`` placeholders.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class EmailCenterSender(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "email_center_senders"

    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    domain: Mapped[str] = mapped_column(String(253), nullable=False, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")


class EmailCenterMessage(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "email_center_messages"

    admin_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    admin_email: Mapped[str | None] = mapped_column(String(320), nullable=True)

    sender: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    sender_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    recipients: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    text_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    html_body: Mapped[str | None] = mapped_column(Text, nullable=True)

    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="resend")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued", index=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    failure_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_test: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    attachments_meta: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(
        String(128), nullable=True, unique=True, index=True
    )

    __table_args__ = (
        Index("ix_email_center_messages_created", "created_at"),
        Index("ix_email_center_messages_status_created", "status", "created_at"),
    )


class EmailCenterTemplate(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "email_center_templates"

    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    text_body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    html_body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    variables: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("name", name="uq_email_center_template_name"),
    )
