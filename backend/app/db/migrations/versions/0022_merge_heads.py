"""merge_heads

Revision ID: 0022_merge_heads
Revises: 0021_add_supabase_user_id, 0021_partner_payout_details
Create Date: 2026-08-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0022_merge_heads'
down_revision: Union[str, None] = ('0021_add_supabase_user_id', '0021_partner_payout_details')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
