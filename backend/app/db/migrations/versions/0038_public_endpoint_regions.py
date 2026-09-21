"""Public vendor endpoints advertise the observation point that exists.

``0004_vendor_endpoints`` seeded every public vendor endpoint with
``regions = ["us-east", "eu-west"]``, and made that pair the column default.
The deployed system issues probes from one observation point
(``OBSERVATION_TOPOLOGY = single``, one worker, ``_DEFAULT_REGION = us-east``),
so until the first probe result overwrote the row, the public record at
``/observatory/{vendor}`` advertised two region labels for a dependency that
had ever been measured from one.

That is not a cosmetic problem. The public pages are explicit - deliberately,
and at length - that a region label names the worker that ran a probe and that
two labels are not two independent origins. Printing a second label that no
probe ever used undermines the one distinction the record exists to make, and
it does so on the surface a search engine or a model is most likely to quote.

What this migration does:

* Sets the column default to ``["us-east"]``, so a newly created endpoint
  advertises the observation point that exists.
* Rewrites rows that still carry exactly the seeded pair to ``["us-east"]`` -
  but only where no observation was ever recorded from ``eu-west`` for that
  endpoint URL. A label earned by a real probe is data, not a default, and is
  left alone.

The data half is not reversible: once a seeded default and a deliberate
configuration both read ``["us-east"]`` they cannot be told apart, so
``downgrade`` restores the column default only.
"""

from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0038_public_endpoint_regions"
down_revision: Union[str, None] = "0037_evidence_provenance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

#: The pair written by 0004 for every endpoint it seeded.
SEEDED_PAIR = {"us-east", "eu-west"}

#: The observation point that is actually deployed.
DEPLOYED_REGION = "us-east"

OLD_DEFAULT = '["us-east", "eu-west"]'
NEW_DEFAULT = '["us-east"]'


def upgrade() -> None:
    op.alter_column(
        "vendor_endpoints",
        "regions",
        existing_type=sa.JSON(),
        existing_nullable=False,
        server_default=NEW_DEFAULT,
    )

    bind = op.get_bind()

    endpoints = sa.table(
        "vendor_endpoints",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("endpoint_url", sa.String()),
        sa.column("regions", sa.JSON()),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    observations = sa.table(
        "observations",
        sa.column("endpoint_url", sa.String()),
        sa.column("region", sa.String()),
    )

    # Which regions each endpoint URL was actually observed from. A label in
    # this set is a measurement, not a default, and is never removed.
    observed_regions: dict[str, set[str]] = {}
    for row in bind.execute(
        sa.select(observations.c.endpoint_url, observations.c.region).distinct()
    ):
        observed_regions.setdefault(row.endpoint_url, set()).add(row.region)

    now = datetime.now(timezone.utc)
    normalized = 0
    for row in bind.execute(
        sa.select(endpoints.c.id, endpoints.c.endpoint_url, endpoints.c.regions)
    ):
        regions = row.regions if isinstance(row.regions, list) else []
        if set(regions) != SEEDED_PAIR:
            continue
        # Keep any label a probe actually ran under; drop the ones it did not.
        earned = observed_regions.get(row.endpoint_url, set())
        if (set(regions) - {DEPLOYED_REGION}) & earned:
            continue
        bind.execute(
            endpoints.update()
            .where(endpoints.c.id == row.id)
            .values(regions=[DEPLOYED_REGION], updated_at=now)
        )
        normalized += 1

    if normalized:
        # A migration that quietly rewrites published data should say so in
        # the log the deployment reads.
        print(
            f"0038_public_endpoint_regions: normalized {normalized} vendor "
            f"endpoint(s) from the seeded {sorted(SEEDED_PAIR)} to "
            f"['{DEPLOYED_REGION}']"
        )


def downgrade() -> None:
    # Column default only. The rewritten rows are not restored: after this
    # migration a seeded pair and a deliberate single-region configuration are
    # indistinguishable, and inventing the difference would be worse than
    # leaving the corrected value in place.
    op.alter_column(
        "vendor_endpoints",
        "regions",
        existing_type=sa.JSON(),
        existing_nullable=False,
        server_default=OLD_DEFAULT,
    )
