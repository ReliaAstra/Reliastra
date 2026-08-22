"""partner_notification_preferences

Adds ``partner_notification_preferences`` — per-partner delivery preferences
for the partner program's notification system (email copy per event type plus
the browser/Chrome notification opt-in). In-app notifications are always
delivered and are therefore not gated by a column here.

Also merges the two 0021 heads (``0021_partner_payout_details`` and
``0021_add_supabase_user_id``) back into a single linear history.

Revision ID: 0022_partner_notifications
Revises: 0021_partner_payout_details, 0021_add_supabase_user_id
Create Date: 2026-08-22
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0022_partner_notifications"
down_revision: Union[str, Sequence[str], None] = (
    "0021_partner_payout_details",
    "0021_add_supabase_user_id",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "partner_notification_preferences" in inspector.get_table_names():
        return

    op.create_table(
        "partner_notification_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "email_referral", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "email_commission",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "email_payout", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "email_support", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "email_announcement",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "email_marketing",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "browser_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_partner_notification_preferences_user_id",
        "partner_notification_preferences",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_partner_notification_preferences_user_id",
        table_name="partner_notification_preferences",
    )
    op.drop_table("partner_notification_preferences")
