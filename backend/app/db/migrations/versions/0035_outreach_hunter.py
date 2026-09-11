"""outreach hunter - review queue, isolated cold-outbound stream.

Revision ID: 0035_outreach_hunter
Revises: 0034_billing_control_center
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0035_outreach_hunter"
down_revision: Union[str, None] = "0034_billing_control_center"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "outreach_leads",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("domain", sa.String(253), nullable=False, unique=True),
        sa.Column("website", sa.String(1024), nullable=False),
        sa.Column("agency_name", sa.String(255), nullable=True),
        sa.Column("country", sa.String(64), nullable=True),
        sa.Column("city", sa.String(128), nullable=True),
        sa.Column("size_band", sa.String(32), nullable=True),
        sa.Column("founder_name", sa.String(255), nullable=True),
        sa.Column("contact_email", sa.String(320), nullable=True),
        sa.Column("contact_route", sa.String(1024), nullable=True),
        sa.Column("linkedin_url", sa.String(1024), nullable=True),
        sa.Column("care_plan_url", sa.String(1024), nullable=True),
        sa.Column("care_plan_tiers", sa.String(1024), nullable=True),
        sa.Column("services_summary", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="new"),
        sa.Column("kill_reason", sa.String(1024), nullable=True),
        sa.Column("evidence", sa.JSON(), nullable=True),
        sa.Column("seed_source", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_outreach_leads_domain", "outreach_leads", ["domain"])
    op.create_index("ix_outreach_leads_email", "outreach_leads", ["contact_email"])
    op.create_index("ix_outreach_leads_status", "outreach_leads", ["status"])

    op.create_table(
        "outreach_drafts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("lead_id", UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("body_text", sa.Text(), nullable=False),
        sa.Column("angle", sa.String(1024), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("resend_id", sa.String(64), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("send_error", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_outreach_drafts_lead", "outreach_drafts", ["lead_id"])
    op.create_index("ix_outreach_drafts_status", "outreach_drafts", ["status"])

    op.create_table(
        "outreach_sends",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("lead_id", UUID(as_uuid=True), nullable=False),
        sa.Column("draft_id", UUID(as_uuid=True), nullable=False),
        sa.Column("recipient", sa.String(320), nullable=False),
        sa.Column("sender", sa.String(320), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("resend_id", sa.String(64), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_outreach_sends_lead", "outreach_sends", ["lead_id"])
    op.create_index("ix_outreach_sends_recipient", "outreach_sends", ["recipient"])
    op.create_index("ix_outreach_sends_status", "outreach_sends", ["status"])
    op.create_index("ix_outreach_sends_lead_created", "outreach_sends", ["lead_id", "created_at"])

    op.create_table(
        "outreach_suppressions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("value", sa.String(320), nullable=False, unique=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("reason", sa.String(64), nullable=False),
        sa.Column("source", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_outreach_suppressions_value", "outreach_suppressions", ["value"])


def downgrade() -> None:
    op.drop_table("outreach_suppressions")
    op.drop_table("outreach_sends")
    op.drop_table("outreach_drafts")
    op.drop_table("outreach_leads")
