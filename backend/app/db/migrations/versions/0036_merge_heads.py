"""merge billing-control-center branch heads

Revision ID: 0036_merge_heads
Revises: 0035_incident_evidence_state, 0035_outreach_hunter
Create Date: 2026-09-10

Both 0035 branches descend from 0034_billing_control_center. Without this
merge, `alembic upgrade head` (run by every container entrypoint) fails
with "Multiple head revisions" and the api container restart-loops.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0036_merge_heads'
down_revision: Union[str, None] = ('0035_incident_evidence_state', '0035_outreach_hunter')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
