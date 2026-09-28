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
import json

import sqlalchemy as sa
from alembic import op

revision = '0045_dependencies_single_region'
down_revision = '0044_endpoint_expectations'
branch_labels = None
depends_on = None

DEPLOYED_REGION = 'us-east'
LEGACY_DEFAULT = ['us-east', 'eu-west']


def upgrade():
    # Raw SQL deliberately.
    #
    # `dependencies.regions` is JSON, not JSONB, and PostgreSQL's `json` type
    # has **no equality operator at all**: `WHERE regions = '...'::json` raises
    # `operator does not exist: json = json` and aborts the migration. That is
    # what CI caught on the first attempt; expressing the same comparison through
    # SQLAlchemy's expression language then failed differently, trying to
    # JSON-serialise the JSONB *type object* as though it were a value. Neither
    # problem exists in plain SQL, and a migration should not depend on a
    # query-builder's type-inference rules to be correct.
    #
    # `regions::jsonb` supplies the operator *and* normalises formatting, so this
    # matches a row stored as `["us-east", "eu-west"]` or `["us-east","eu-west"]`
    # alike, rather than depending on the exact text SQLAlchemy happened to
    # write when the column was populated.
    #
    # Only rows still holding exactly the legacy default are rewritten, so a
    # dependency someone deliberately configured is left alone.
    op.execute(
        sa.text(
            "UPDATE dependencies "
            "SET regions = CAST(:single AS json) "
            "WHERE regions::jsonb = CAST(:legacy AS jsonb)"
        ).bindparams(
            single=json.dumps([DEPLOYED_REGION]),
            legacy=json.dumps(LEGACY_DEFAULT),
        )
    )


def downgrade():
    # Deliberately not reversible: restoring the two-label default would put
    # every dependency back into dispatching two probes per interval from one
    # worker. The labels carry no observational weight, so nothing measurable is
    # lost by leaving them collapsed.
    pass
