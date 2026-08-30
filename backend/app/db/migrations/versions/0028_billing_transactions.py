"""Persisted billing transactions — the actual charged amount and currency.

Adds ``billing_transactions``: one row per collected payment, recording both
sides of the pricing contract exactly as they stood at payment time:

* ``product_currency``/``product_amount_minor`` — the USD list price the
  checkout quoted (e.g. 3900 = $39.00);
* ``charged_currency``/``charged_amount_minor`` — what Paystack reported
  collecting, in its own figures (e.g. 6000000 = ₦60,000.00 NGN).

Receipts, the billing page and finance reconciliation read this table rather
than recomputing prices, so a customer's history never rewrites itself when a
price list changes.

Revision ID: 0028_billing_transactions
Revises: 0027_canonical_pricing
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "0028_billing_transactions"
down_revision: Union[str, None] = "0027_canonical_pricing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "billing_transactions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "provider", sa.String(50), nullable=False, server_default="paystack"
        ),
        sa.Column("reference", sa.String(200), nullable=False),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("plan", sa.String(50), nullable=False),
        sa.Column(
            "billing_interval",
            sa.String(20),
            nullable=False,
            server_default="monthly",
        ),
        sa.Column("product_currency", sa.String(3), nullable=False),
        sa.Column("product_amount_minor", sa.BigInteger(), nullable=True),
        sa.Column("charged_currency", sa.String(3), nullable=False),
        sa.Column("charged_amount_minor", sa.BigInteger(), nullable=False),
        sa.Column(
            "status", sa.String(20), nullable=False, server_default="success"
        ),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_metadata", sa.JSON(), nullable=True),
        sa.UniqueConstraint(
            "provider", "reference", name="uq_billing_transactions_provider_reference"
        ),
    )
    op.create_index(
        "ix_billing_transactions_organization_id",
        "billing_transactions",
        ["organization_id"],
    )
    op.create_index(
        "ix_billing_transactions_reference", "billing_transactions", ["reference"]
    )


def downgrade() -> None:
    op.drop_index("ix_billing_transactions_reference", table_name="billing_transactions")
    op.drop_index(
        "ix_billing_transactions_organization_id", table_name="billing_transactions"
    )
    op.drop_table("billing_transactions")
