"""Explicit public endpoint contracts; never rewrite observations or incidents."""
import sqlalchemy as sa
from alembic import op

revision = '0044_endpoint_expectations'
down_revision = '0043_digest_drafts'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('vendor_endpoints', sa.Column('expected_status_codes', sa.JSON(), nullable=False, server_default='[200]'))


def downgrade():
    op.drop_column('vendor_endpoints', 'expected_status_codes')
