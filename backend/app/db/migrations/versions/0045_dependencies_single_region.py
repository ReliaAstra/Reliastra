"""Collapse the two-label region default on `dependencies` to the one deployed worker.

Migration 0038 corrected `vendor_endpoints.regions` to a single `us-east` label
but never touched `dependencies.regions`, so every customer dependency created
before that fix still carried `["us-east", "eu-west"]`. The scheduler dispatches
one task per region, so those rows produced two probe rows per interval from a
single worker - and under `OBSERVATION_TOPOLOGY=multi` the quorum rule counts
distinct observation-point labels, which would have satisfied
`QUORUM_MIN_REGIONS = 2` from one host.

Only the *labels* are rewritten. No observation, incident or check result is
touched: the extra rows stay in the record as what was actually measured.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = '0045_dependencies_single_region'
down_revision = '0044_endpoint_expectations'
branch_labels = None
depends_on = None

DEPLOYED_REGION = 'us-east'
LEGACY_DEFAULT = ['us-east', 'eu-west']


def upgrade():
    bind = op.get_bind()
    dependencies = sa.table(
        'dependencies',
        sa.column('id', postgresql.UUID),
        sa.column('regions', sa.JSON),
    )
    # Only rows that still hold exactly the legacy default are rewritten, so a
    # dependency someone deliberately configured is left alone.
    bind.execute(
        dependencies.update()
        .where(dependencies.c.regions == LEGACY_DEFAULT)
        .values(regions=[DEPLOYED_REGION])
    )


def downgrade():
    # Deliberately not reversible: restoring the two-label default would put
    # every dependency back into dispatching two probes per interval from one
    # worker. The labels carry no observational weight, so nothing measurable is
    # lost by leaving them collapsed.
    pass
