"""Acquisition first-touch attribution (one immutable row per account).

Stores the original marketing acquisition source for every RELIASTRA
account: UTM fields + landing path + referrer host, a derived channel,
and a non-destructive last-touch mirror. ``user_id`` is UNIQUE - the
first_touch_* story is exactly one row per user, forever.

Revision ID: 0024_acquisition_first_touch
Revises: 0023_harden_payout_destination
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0024_acquisition_first_touch"
down_revision: Union[str, Sequence[str], None] = "0023_harden_payout_destination"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "acquisition_first_touch"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE in inspector.get_table_names():
        return

    op.create_table(
        _TABLE,
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        # FIRST TOUCH (immutable by policy)
        sa.Column("channel", sa.String(length=20), nullable=False, server_default="direct"),
        sa.Column("source", sa.String(length=120), nullable=True),
        sa.Column("medium", sa.String(length=120), nullable=True),
        sa.Column("campaign", sa.String(length=120), nullable=True),
        sa.Column("content", sa.String(length=200), nullable=True),
        sa.Column("term", sa.String(length=200), nullable=True),
        sa.Column("landing_path", sa.String(length=300), nullable=True),
        sa.Column("referrer_host", sa.String(length=200), nullable=True),
        sa.Column(
            "first_touch_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        # LAST TOUCH (non-destructive mirror)
        sa.Column("last_channel", sa.String(length=20), nullable=True),
        sa.Column("last_source", sa.String(length=120), nullable=True),
        sa.Column("last_medium", sa.String(length=120), nullable=True),
        sa.Column("last_campaign", sa.String(length=120), nullable=True),
        sa.Column("last_touch_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("extras", postgresql.JSON(), nullable=True),
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
        "ix_acquisition_first_touch_channel",
        _TABLE,
        ["channel"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_acquisition_first_touch_channel", table_name=_TABLE
    )
    op.drop_table(_TABLE)
