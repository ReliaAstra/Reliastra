"""Prospect AI: report + lead tables for AI-drafted first-touch outreach.

Two admin-scoped tables:

* ``prospect_reports`` - one uploaded prospect research report (JSON).
* ``prospect_leads``   - one prospect per row (deduped by domain within a
  report) with the researched evidence fields verbatim plus the AI draft
  columns (subject/body/status/error).

No backfill: prospects are imported from reports by the admin surface.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0048_prospect_ai"
down_revision = "0047_retire_baked_email_seeds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prospect_reports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("report_date", sa.String(length=32), nullable=True),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("prospect_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("raw_md", sa.Text(), nullable=True),
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

    op.create_table(
        "prospect_leads",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "report_id",
            UUID(as_uuid=True),
            sa.ForeignKey("prospect_reports.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rank", sa.Integer(), nullable=True),
        sa.Column("company", sa.String(length=255), nullable=False),
        sa.Column("product", sa.Text(), nullable=True),
        sa.Column("website", sa.String(length=1024), nullable=True),
        sa.Column("domain", sa.String(length=253), nullable=False),
        sa.Column("contact_name", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=255), nullable=True),
        sa.Column("contact_email", sa.String(length=320), nullable=True),
        sa.Column("why_this_person", sa.Text(), nullable=True),
        sa.Column("external_dependencies", sa.Text(), nullable=True),
        sa.Column("evidence", sa.Text(), nullable=True),
        sa.Column("pain_signal", sa.Text(), nullable=True),
        sa.Column("why_reliastra_is_relevant", sa.Text(), nullable=True),
        sa.Column("outreach_hook", sa.Text(), nullable=True),
        sa.Column("verdict", sa.String(length=255), nullable=True),
        sa.Column("raw", JSONB(), nullable=True),
        sa.Column("draft_subject", sa.String(length=500), nullable=True),
        sa.Column("draft_body", sa.Text(), nullable=True),
        sa.Column("draft_status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("draft_error", sa.Text(), nullable=True),
        sa.Column("drafted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_message_id", UUID(as_uuid=True), nullable=True),
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
        sa.UniqueConstraint("report_id", "domain", name="uq_prospect_lead_report_domain"),
    )
    op.create_index(
        "ix_prospect_leads_domain", "prospect_leads", ["domain"]
    )
    op.create_index(
        "ix_prospect_leads_report_status",
        "prospect_leads",
        ["report_id", "draft_status"],
    )


def downgrade() -> None:
    op.drop_index("ix_prospect_leads_report_status", table_name="prospect_leads")
    op.drop_index("ix_prospect_leads_domain", table_name="prospect_leads")
    op.drop_table("prospect_leads")
    op.drop_table("prospect_reports")
