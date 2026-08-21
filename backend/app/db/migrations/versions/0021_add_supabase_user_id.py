"""Add supabase_user_id to users.

Revision ID: 0021_add_supabase_user_id
Revises: 0020_platform_managed_ai
Create Date: 2026-08-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0021_add_supabase_user_id"
down_revision: Union[str, None] = "0020_platform_managed_ai"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    user_columns = {col["name"] for col in inspector.get_columns("users")}
    if "supabase_user_id" not in user_columns:
        op.add_column(
            "users",
            sa.Column(
                "supabase_user_id",
                sa.String(length=255),
                nullable=True,
            ),
        )
        op.create_index(
            "ix_users_supabase_user_id",
            "users",
            ["supabase_user_id"],
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    user_columns = {col["name"] for col in inspector.get_columns("users")}
    if "supabase_user_id" in user_columns:
        op.drop_index("ix_users_supabase_user_id", table_name="users")
        op.drop_column("users", "supabase_user_id")
