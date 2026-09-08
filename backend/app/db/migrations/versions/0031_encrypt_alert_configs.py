"""Encrypt legacy notification destinations using the existing application key.

Revision ID: 0031_encrypt_alert_configs
Revises: 0030_email_events
"""
from alembic import op
import sqlalchemy as sa

revision = '0031_encrypt_alert_configs'
down_revision = '0030_email_events'
branch_labels = None
depends_on = None


def upgrade():
    from app.core.security import encrypt_jsonb
    table = sa.table('alert_configs', sa.column('id', sa.Uuid), sa.column('config', sa.JSON))
    connection = op.get_bind()
    for row in connection.execute(sa.select(table.c.id, table.c.config)):
        if '_encrypted_data' not in row.config:
            connection.execute(table.update().where(table.c.id == row.id).values(config={'_encrypted_data': encrypt_jsonb(row.config)}))


def downgrade():
    # Never put credentials back into plaintext during rollback.
    pass
