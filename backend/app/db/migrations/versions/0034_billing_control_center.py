"""Subscription cancellation state and masked payment method.

Adds the fields the billing control center needs:

* ``cancel_at_period_end`` / ``canceled_at`` so a customer can cancel without
  losing access before the paid period ends, and resume before then.
* Masked payment-method columns (brand, last4, expiry, channel) populated
  from Paystack's authorization object at verification time. Full card
  numbers are never stored.

Revision ID: 0034_billing_control_center
Revises: 0033_email_center
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0034_billing_control_center"
down_revision: Union[str, None] = "0033_email_center"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "subscriptions",
        sa.Column(
            "cancel_at_period_end",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "subscriptions",
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "subscriptions",
        sa.Column("payment_method_brand", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "subscriptions",
        sa.Column("payment_method_last4", sa.String(length=4), nullable=True),
    )
    op.add_column(
        "subscriptions",
        sa.Column("payment_method_exp_month", sa.Integer(), nullable=True),
    )
    op.add_column(
        "subscriptions",
        sa.Column("payment_method_exp_year", sa.Integer(), nullable=True),
    )
    op.add_column(
        "subscriptions",
        sa.Column("payment_method_channel", sa.String(length=40), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("subscriptions", "payment_method_channel")
    op.drop_column("subscriptions", "payment_method_exp_year")
    op.drop_column("subscriptions", "payment_method_exp_month")
    op.drop_column("subscriptions", "payment_method_last4")
    op.drop_column("subscriptions", "payment_method_brand")
    op.drop_column("subscriptions", "canceled_at")
    op.drop_column("subscriptions", "cancel_at_period_end")
