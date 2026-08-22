"""harden_partner_payout_destination

Payout destinations become sensitive data at rest:

* ``partner_profiles.wallet_address`` is widened to 500 chars because the
  value is now Fernet ciphertext (``enc:v1:…``) rather than a raw address.
  ``bank_details`` keeps its JSONB type and holds ``{"__enc__": "enc:v1:…"}``.
* ``partner_profiles.payout_details_updated_at`` records the last destination
  change, which drives the payout cool-down.

Existing rows are left as-is: they are plaintext and are read transparently by
``app.modules.partners.destination``, then encrypted on the partner's next
save. Nothing has to be migrated in place, so this stays a metadata-only
change and cannot corrupt live payout data.

Revision ID: 0023_harden_payout_destination
Revises: 0022_partner_notifications
Create Date: 2026-08-22
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0023_harden_payout_destination"
down_revision: Union[str, None] = "0022_partner_notifications"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("partner_profiles")}

    op.alter_column(
        "partner_profiles",
        "wallet_address",
        existing_type=sa.String(200),
        type_=sa.String(500),
        existing_nullable=True,
    )

    if "payout_details_updated_at" not in columns:
        op.add_column(
            "partner_profiles",
            sa.Column(
                "payout_details_updated_at",
                sa.DateTime(timezone=True),
                nullable=True,
            ),
        )


def downgrade() -> None:
    op.drop_column("partner_profiles", "payout_details_updated_at")
    op.alter_column(
        "partner_profiles",
        "wallet_address",
        existing_type=sa.String(500),
        type_=sa.String(200),
        existing_nullable=True,
    )
