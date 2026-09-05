"""email events — Resend webhook reliability

Revision ID: 0030_email_events
Revises: 0029_billing_tx_attribution
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0030_email_events"
down_revision: Union[str, None] = "0029_billing_tx_attribution"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_records",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("resend_id", sa.String(64), unique=True, nullable=True),
        sa.Column("recipient", sa.String(320), nullable=False),
        sa.Column("sender", sa.String(320), nullable=False),
        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("correlation_id", sa.String(64), nullable=True),
        sa.Column("template", sa.String(64), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="sent"),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_email_records_resend_id", "email_records", ["resend_id"])
    op.create_index("ix_email_records_recipient", "email_records", ["recipient"])
    op.create_index("ix_email_records_category", "email_records", ["category"])
    op.create_index("ix_email_records_org", "email_records", ["organization_id"])
    op.create_index("ix_email_records_recipient_category", "email_records", ["recipient", "category"])

    op.create_table(
        "resend_webhook_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("provider", sa.String(32), nullable=False, server_default="resend"),
        sa.Column("event_id", sa.String(128), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("resend_email_id", sa.String(64), nullable=True),
        sa.Column("recipient", sa.String(320), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("provider", "event_id", name="uq_resend_event_id"),
    )
    op.create_index("ix_resend_events_type", "resend_webhook_events", ["event_type"])
    op.create_index("ix_resend_events_email_id", "resend_webhook_events", ["resend_email_id"])

    op.create_table(
        "email_suppressions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("recipient", sa.String(320), nullable=False, unique=True),
        sa.Column("reason", sa.String(64), nullable=False),
        sa.Column("last_event_id", sa.String(128), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_suppressions_recipient", "email_suppressions", ["recipient"])


def downgrade() -> None:
    op.drop_table("email_suppressions")
    op.drop_table("resend_webhook_events")
    op.drop_table("email_records")
