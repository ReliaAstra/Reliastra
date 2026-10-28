"""Prospect AI v2: approval workflow columns + LLM provider profiles.

* ``prospect_leads`` gains the send-authority state machine columns
  (``approved_at``, ``sent_at``, ``batch_id``) and the v2 drafting
  reasoning columns (``draft_angle``, ``draft_rejected_angles``).
* ``ai_provider_profiles`` - the single active admin-configured LLM
  provider (provider-agnostic: openai_compatible / anthropic / google).
  The API key is stored Fernet-encrypted; the migration never stores or
  migrates a plaintext key.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0049_prospect_ai_v2"
down_revision = "0048_prospect_ai"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "prospect_leads",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "prospect_leads",
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "prospect_leads",
        sa.Column("batch_id", UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "prospect_leads",
        sa.Column("draft_angle", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "prospect_leads",
        sa.Column("draft_rejected_angles", JSONB(), nullable=True),
    )
    # Backfill the read path: rows already sent carry their send timestamp
    # as the draft's updated_at upper bound.
    op.execute(
        "UPDATE prospect_leads SET sent_at = updated_at "
        "WHERE draft_status = 'sent' AND sent_at IS NULL"
    )
    op.create_index(
        "ix_prospect_leads_sent_at",
        "prospect_leads",
        ["sent_at"],
        postgresql_where=sa.text("sent_at IS NOT NULL"),
    )
    op.create_index(
        "ix_prospect_leads_batch", "prospect_leads", ["batch_id"]
    )

    op.create_table(
        "ai_provider_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False, server_default="Primary"),
        sa.Column("provider_type", sa.String(length=32), nullable=False, server_default="openai_compatible"),
        sa.Column("endpoint_url", sa.String(length=1024), nullable=False),
        sa.Column("model_name", sa.String(length=255), nullable=False),
        sa.Column("api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("temperature", sa.Float(), nullable=False, server_default="0.3"),
        sa.Column("max_tokens", sa.Integer(), nullable=False, server_default="2048"),
        sa.Column("timeout_seconds", sa.Float(), nullable=False, server_default="60"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("last_test_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_test_ok", sa.Boolean(), nullable=True),
        sa.Column("last_test_detail", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_ai_provider_profiles_active", "ai_provider_profiles", ["is_active"]
    )


def downgrade() -> None:
    op.drop_index("ix_ai_provider_profiles_active", table_name="ai_provider_profiles")
    op.drop_table("ai_provider_profiles")
    op.drop_index("ix_prospect_leads_batch", table_name="prospect_leads")
    op.drop_index("ix_prospect_leads_sent_at", table_name="prospect_leads")
    op.drop_column("prospect_leads", "draft_rejected_angles")
    op.drop_column("prospect_leads", "draft_angle")
    op.drop_column("prospect_leads", "batch_id")
    op.drop_column("prospect_leads", "sent_at")
    op.drop_column("prospect_leads", "approved_at")
