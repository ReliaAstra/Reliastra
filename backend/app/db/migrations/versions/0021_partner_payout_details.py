"""partner_payout_details

Adds the payout destination fields to ``partner_profiles`` so a partner can
configure how they want to be paid (USDC / USDT / bank) and the admin panel
can surface that destination when settling payouts.

* ``payout_method``  — ``crypto_usdc`` | ``crypto_usdt`` | ``bank`` (nullable).
* ``wallet_address`` — crypto wallet address (nullable; unused for bank).
* ``payout_network`` — blockchain network for crypto methods (nullable).
* ``bank_details``   — JSONB object holding bank-account fields (nullable).

All columns are nullable and default to ``NULL`` (no destination configured)
so existing partners are unaffected by the migration.

Revision ID: 0021_partner_payout_details
Revises: 0020_platform_managed_ai
Create Date: 2026-08-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0021_partner_payout_details"
down_revision: Union[str, None] = "0020_platform_managed_ai"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("partner_profiles")}

    if "payout_method" not in columns:
        op.add_column(
            "partner_profiles",
            sa.Column("payout_method", sa.String(20), nullable=True),
        )
    if "wallet_address" not in columns:
        op.add_column(
            "partner_profiles",
            sa.Column("wallet_address", sa.String(200), nullable=True),
        )
    if "payout_network" not in columns:
        op.add_column(
            "partner_profiles",
            sa.Column("payout_network", sa.String(50), nullable=True),
        )
    if "bank_details" not in columns:
        op.add_column(
            "partner_profiles",
            sa.Column(
                "bank_details",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=True,
            ),
        )


def downgrade() -> None:
    op.drop_column("partner_profiles", "bank_details")
    op.drop_column("partner_profiles", "payout_network")
    op.drop_column("partner_profiles", "wallet_address")
    op.drop_column("partner_profiles", "payout_method")
