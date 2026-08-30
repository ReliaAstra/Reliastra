"""Attribute billing transactions to a payer and a verification time.

``billing_transactions`` recorded what was charged and when the provider took
the money. Three columns complete the record the way a billing dispute and a
customer receipt both need it:

* ``user_id`` — which person authorized the purchase, when it came through an
  authenticated checkout. ``SET NULL``: deleting a seat must never delete or
  reassign the financial record of what the organization paid.
* ``verified_at`` — when RELIASTRA confirmed the charge with Paystack, which
  differs from ``paid_at`` (the provider's own timestamp) whenever
  verification arrives late: a webhook retry, a customer who closed the tab and
  returned the next day. Both timestamps are needed to reconstruct what happened
  in what order.
* ``duplicate`` — a second collected payment for a period already covered. It is
  applied (the customer paid, so they keep the plan) but never invisible.

Revision ID: 0029_billing_tx_attribution
Revises: 0028_billing_transactions
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "0029_billing_tx_attribution"
down_revision: Union[str, None] = "0028_billing_transactions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "billing_transactions",
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "billing_transactions",
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "billing_transactions",
        sa.Column(
            "duplicate",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_foreign_key(
        "fk_billing_transactions_user_id",
        "billing_transactions",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_billing_transactions_user_id",
        "billing_transactions",
        ["user_id"],
    )
    # Backfill the verification time for existing rows: they were all applied
    # by a verification pass, so the provider's paid timestamp is the honest
    # value available. Left NULL where even that was never recorded, rather
    # than inventing a time.
    op.execute(
        "UPDATE billing_transactions SET verified_at = paid_at "
        "WHERE verified_at IS NULL AND paid_at IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_index("ix_billing_transactions_user_id", table_name="billing_transactions")
    op.drop_constraint(
        "fk_billing_transactions_user_id",
        "billing_transactions",
        type_="foreignkey",
    )
    op.drop_column("billing_transactions", "duplicate")
    op.drop_column("billing_transactions", "verified_at")
    op.drop_column("billing_transactions", "user_id")
