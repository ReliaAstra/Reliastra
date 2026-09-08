"""email center - admin operational email console

Revision ID: 0033_email_center
Revises: 0032_public_probe_schedule
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0033_email_center"
down_revision: Union[str, None] = "0032_public_probe_schedule"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_center_senders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("domain", sa.String(253), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_email_center_senders_email", "email_center_senders", ["email"])
    op.create_index("ix_email_center_senders_domain", "email_center_senders", ["domain"])

    op.create_table(
        "email_center_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("admin_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("admin_email", sa.String(320), nullable=True),
        sa.Column("sender", sa.String(320), nullable=False),
        sa.Column("sender_name", sa.String(120), nullable=True),
        sa.Column("recipients", JSONB, nullable=False, server_default="{}"),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("text_body", sa.Text(), nullable=True),
        sa.Column("html_body", sa.Text(), nullable=True),
        sa.Column("provider", sa.String(32), nullable=False, server_default="resend"),
        sa.Column("status", sa.String(32), nullable=False, server_default="queued"),
        sa.Column("provider_message_id", sa.String(64), nullable=True),
        sa.Column("failure_code", sa.String(64), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("template_id", UUID(as_uuid=True), nullable=True),
        sa.Column("attachments_meta", JSONB, nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=True, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_email_center_messages_admin", "email_center_messages", ["admin_user_id"])
    op.create_index("ix_email_center_messages_sender", "email_center_messages", ["sender"])
    op.create_index("ix_email_center_messages_status", "email_center_messages", ["status"])
    op.create_index(
        "ix_email_center_messages_provider_id", "email_center_messages", ["provider_message_id"]
    )
    op.create_index("ix_email_center_messages_template", "email_center_messages", ["template_id"])
    op.create_index(
        "ix_email_center_messages_idempotency", "email_center_messages", ["idempotency_key"]
    )
    op.create_index("ix_email_center_messages_created", "email_center_messages", ["created_at"])
    op.create_index(
        "ix_email_center_messages_status_created",
        "email_center_messages",
        ["status", "created_at"],
    )

    op.create_table(
        "email_center_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(120), nullable=False, unique=True),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("text_body", sa.Text(), nullable=False, server_default=""),
        sa.Column("html_body", sa.Text(), nullable=False, server_default=""),
        sa.Column("variables", JSONB, nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_by_admin_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("name", name="uq_email_center_template_name"),
    )
    op.create_index("ix_email_center_templates_name", "email_center_templates", ["name"])


def downgrade() -> None:
    op.drop_table("email_center_templates")
    op.drop_table("email_center_messages")
    op.drop_table("email_center_senders")
