"""Persist the public endpoint schedule.

Revision ID: 0032_public_probe_schedule
Revises: 0031_encrypt_alert_configs
"""
from alembic import op
import sqlalchemy as sa
revision = '0032_public_probe_schedule'
down_revision = '0031_encrypt_alert_configs'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('vendor_endpoints', sa.Column('next_check_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_vendor_endpoints_next_check_at', 'vendor_endpoints', ['next_check_at'])

def downgrade():
    op.drop_index('ix_vendor_endpoints_next_check_at', table_name='vendor_endpoints')
    op.drop_column('vendor_endpoints', 'next_check_at')
