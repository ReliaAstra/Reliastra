"""Reliastra-managed LLM: drop per-organization AI providers.

AI explanations are now produced by the LLM Reliastra operates, configured
through platform environment variables (RELIASTRA_AI_*). Organizations no
longer register providers, endpoints, models or API keys — the only tenant
control left is an opt-out flag on the organization itself.

Revision ID: 0020_platform_managed_ai
Revises: 0019_drop_founding_customer
Create Date: 2026-08-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0020_platform_managed_ai"
down_revision: Union[str, None] = "0019_drop_founding_customer"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    org_columns = {col["name"] for col in inspector.get_columns("organizations")}
    if "ai_explanations_enabled" not in org_columns:
        op.add_column(
            "organizations",
            sa.Column(
                "ai_explanations_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )

    if "ai_providers" in inspector.get_table_names():
        if bind.dialect.name == "postgresql":
            op.execute(sa.text("DROP INDEX IF EXISTS uq_ai_providers_default_per_org"))
            op.execute(sa.text("DROP INDEX IF EXISTS ix_ai_providers_organization_id"))
        op.drop_table("ai_providers")


def downgrade() -> None:
    op.create_table(
        "ai_providers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("provider_type", sa.String(50), nullable=False),
        sa.Column("endpoint_url", sa.String(500), nullable=False),
        sa.Column("encrypted_api_key", sa.Text(), nullable=True),
        sa.Column("model_name", sa.String(100), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("max_tokens", sa.Integer(), nullable=False, server_default="4096"),
        sa.Column("temperature", sa.Float(), nullable=False, server_default="0.3"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_ai_providers_organization_id", "ai_providers", ["organization_id"]
    )
    if op.get_bind().dialect.name == "postgresql":
        op.create_index(
            "uq_ai_providers_default_per_org",
            "ai_providers",
            ["organization_id"],
            unique=True,
            postgresql_where=sa.text("is_default = true"),
        )

    op.drop_column("organizations", "ai_explanations_enabled")
