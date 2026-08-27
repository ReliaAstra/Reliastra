"""Email verification OTP codes (signup hard gate).

Adds ``email_verification_codes``: one-time 6-digit codes proving control of
a signup email address. Only an HMAC of the code is stored, salted by user id
and SECRET_KEY, so the table cannot be replayed if leaked. ``attempts``
bounds online guessing.

Revision ID: 0025_email_verification_otp
Revises: 0024_acquisition_first_touch
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0025_email_verification_otp"
down_revision: Union[str, Sequence[str], None] = "0024_acquisition_first_touch"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "email_verification_codes"


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
        ),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "is_used", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        f"ix_{_TABLE}_user_id", _TABLE, ["user_id"], unique=False
    )
    op.create_index(
        f"ix_{_TABLE}_code_hash", _TABLE, ["code_hash"], unique=False
    )
    # The hot lookup is "newest outstanding code for this user".
    op.create_index(
        f"ix_{_TABLE}_user_active",
        _TABLE,
        ["user_id", "is_used", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _TABLE not in inspector.get_table_names():
        return
    op.drop_index(f"ix_{_TABLE}_user_active", table_name=_TABLE)
    op.drop_index(f"ix_{_TABLE}_code_hash", table_name=_TABLE)
    op.drop_index(f"ix_{_TABLE}_user_id", table_name=_TABLE)
    op.drop_table(_TABLE)
