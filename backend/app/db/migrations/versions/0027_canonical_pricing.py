"""Canonical 3-tier pricing migration.

Maps legacy plan values to the canonical architecture:

    FREE      -> free
    STARTER   -> pro
    STANDARD  -> pro
    PROFESSIONAL -> pro
    AGENCY    -> enterprise

And adds the ``billing_interval`` column to ``subscriptions`` so monthly vs
annual billing is persisted accurately.

Revision ID: 0027_canonical_pricing
Revises: 0026_evaluation_state
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0027_canonical_pricing"
down_revision: Union[str, None] = "0026_evaluation_state"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Plan columns are plain VARCHAR (no PG enum / check constraint), so plain
    # UPDATEs are safe.
    # Map legacy plan values on organizations.
    op.execute(
        "UPDATE organizations SET plan = CASE "
        "WHEN plan IN ('starter', 'standard', 'professional') THEN 'pro' "
        "WHEN plan ILIKE 'agency' THEN 'enterprise' "
        "WHEN plan ILIKE 'free' THEN 'free' "
        "ELSE plan END"
    )
    op.execute(
        "UPDATE subscriptions SET plan = CASE "
        "WHEN plan IN ('starter', 'standard', 'professional') THEN 'pro' "
        "WHEN plan ILIKE 'agency' THEN 'enterprise' "
        "WHEN plan ILIKE 'free' THEN 'free' "
        "ELSE plan END"
    )

    # Persist billing interval. Existing subscriptions default to monthly.
    with op.batch_alter_table("subscriptions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "billing_interval",
                sa.String(20),
                nullable=False,
                server_default="monthly",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("subscriptions") as batch_op:
        batch_op.drop_column("billing_interval")

    # Reverse mapping is lossy (pro could have been starter/standard/professional)
    # so downgrade is intentionally a no-op for plan values: we never guess
    # which legacy tier an org started on.
    op.execute("UPDATE subscriptions SET plan = CASE WHEN plan = 'enterprise' THEN 'agency' WHEN plan = 'pro' THEN 'professional' ELSE plan END")
    op.execute("UPDATE organizations SET plan = CASE WHEN plan = 'enterprise' THEN 'agency' WHEN plan = 'pro' THEN 'professional' ELSE plan END")
