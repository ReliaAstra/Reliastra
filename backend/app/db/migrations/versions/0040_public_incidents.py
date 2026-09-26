"""Public incident records for the observatory catalog.

Additive only. Creates ``public_incidents``: RELIASTRA-observed incident
records derived from public vendor probes. They are deliberately a separate
table from the tenant-scoped ``incidents`` table - customer incidents stay
tenant private, public incidents come only from ``vendor_probe``
observations, and the two never share rows (mirroring the ``org_id IS NULL``
convention the observation dual-write already uses).

The partial unique index ``uq_public_incidents_open_endpoint`` enforces the
same invariant as 0014 does for customer incidents: at most one open
incident per observed target. Concurrent probe tasks both see "no open
incident" reliably fail under it; resolved duplicates are idempotent.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0040_public_incidents"
down_revision: str | None = "0039_intelligence_taxonomy"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "public_incidents",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("endpoint_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("region", sa.String(length=50), nullable=False),
        sa.Column("endpoint_url", sa.String(length=500), nullable=False),
        sa.Column("target_name", sa.String(length=200), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="open"),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="major"),
        sa.Column("failure_kind", sa.String(length=32), nullable=False, server_default="unknown"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("observation_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status_codes", postgresql.JSONB(), nullable=True),
        sa.Column("first_observation_id", sa.String(length=36), nullable=True),
        sa.Column("last_observation_id", sa.String(length=36), nullable=True),
        sa.Column("detection_rule", sa.String(length=64), nullable=False),
        sa.Column("detection_metadata", postgresql.JSONB(), nullable=True),
        sa.Column("methodology_version", sa.String(length=20), nullable=False, server_default="v1.0"),
        sa.Column("attribution_status", sa.String(length=24), nullable=False, server_default="observed"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["vendor_id"], ["vendor_trackings.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["endpoint_id"], ["vendor_endpoints.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_public_incidents_vendor_started",
        "public_incidents",
        ["vendor_id", "started_at"],
    )
    op.create_index("ix_public_incidents_endpoint_id", "public_incidents", ["endpoint_id"])
    op.create_index("ix_public_incidents_status", "public_incidents", ["status"])
    op.create_index("ix_public_incidents_started_at", "public_incidents", ["started_at"])
    op.create_index(
        "uq_public_incidents_open_endpoint",
        "public_incidents",
        ["endpoint_id"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )


def downgrade() -> None:
    op.drop_index("uq_public_incidents_open_endpoint", table_name="public_incidents")
    op.drop_index("ix_public_incidents_started_at", table_name="public_incidents")
    op.drop_index("ix_public_incidents_status", table_name="public_incidents")
    op.drop_index("ix_public_incidents_endpoint_id", table_name="public_incidents")
    op.drop_index("ix_public_incidents_vendor_started", table_name="public_incidents")
    op.drop_table("public_incidents")
