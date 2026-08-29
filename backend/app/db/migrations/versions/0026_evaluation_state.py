"""Evaluation lifecycle: explicit server-side entitlement state.

Every newly created organization receives 14 days of full product access.
The evaluation is a first-class server-side state, not a frontend flag.

Adds to ``organizations``:
* evaluation_started_at  — when the 14-day window began (server time)
* evaluation_expires_at  — when it ends (started_at + 14 days)
* evaluation_status      — active | expired | converted | none
* evaluation_used        — True once the org has consumed its one evaluation

Backfill: existing rows get started_at = created_at, expires_at = created_at +14d.
Status is derived from plan + expiry so billing never depends on a background job.

Revision ID: 0026_evaluation_state
Revises: 0025_email_verification_otp
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0026_evaluation_state"
down_revision: Union[str, Sequence[str], None] = "0025_email_verification_otp"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("organizations")}

    if "evaluation_started_at" not in cols:
        op.add_column(
            "organizations",
            sa.Column("evaluation_started_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "evaluation_expires_at" not in cols:
        op.add_column(
            "organizations",
            sa.Column("evaluation_expires_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "evaluation_status" not in cols:
        op.add_column(
            "organizations",
            sa.Column("evaluation_status", sa.String(length=20), nullable=True),
        )
    if "evaluation_used" not in cols:
        op.add_column(
            "organizations",
            sa.Column("evaluation_used", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    # Backfill: every existing org had an implicit trial from created_at.
    # New columns are filled so the explicit state matches the legacy derivation.
    op.execute(
        sa.text(
            """
            UPDATE organizations
            SET evaluation_started_at = COALESCE(evaluation_started_at, created_at),
                evaluation_expires_at = COALESCE(
                    evaluation_expires_at,
                    created_at + INTERVAL '14 days'
                ),
                evaluation_used = TRUE
            WHERE evaluation_started_at IS NULL
               OR evaluation_expires_at IS NULL
            """
        )
    )
    # Status for backfilled rows: paid -> converted, free+active -> active, free+expired -> expired
    op.execute(
        sa.text(
            """
            UPDATE organizations
            SET evaluation_status = CASE
                WHEN plan != 'free' THEN 'converted'
                WHEN evaluation_expires_at > NOW() THEN 'active'
                ELSE 'expired'
            END
            WHERE evaluation_status IS NULL
            """
        )
    )
    op.create_index(
        "ix_organizations_evaluation_expires_at",
        "organizations",
        ["evaluation_expires_at"],
    )
    op.create_index(
        "ix_organizations_evaluation_status",
        "organizations",
        ["evaluation_status"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("organizations")}
    for idx in ["ix_organizations_evaluation_status", "ix_organizations_evaluation_expires_at"]:
        try:
            op.drop_index(idx, table_name="organizations")
        except Exception:
            pass
    for col in ["evaluation_used", "evaluation_status", "evaluation_expires_at", "evaluation_started_at"]:
        if col in cols:
            op.drop_column("organizations", col)
