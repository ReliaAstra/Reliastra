"""Public incident evidence artifacts.

Additive only. Phase 5 of the intelligence rollout: every detector-confirmed
public incident gains a deterministic, reproducible, immutable evidence
document - the raw observations of its window plus the exact claim and
detection provenance, canonical-JSON hashed and frozen as bytes.

``public_incident_evidence`` is an append-only ledger per incident: a freeze
runs when the incident opens and again when it resolves, each version
immutable, the newest one the one the API serves. Versions exist because the
incident's own state changes; a document that said "ongoing" must never be
edited in place to say "resolved".

``public_incidents.resolution_observation_id`` stamps the probe that confirmed
recovery, symmetric to ``last_observation_id`` for the failing run. It gives
the evidence window an upper bound that is a fact of the incident (a stored
observation id), not a function of when generation happened - which is what
makes a frozen document reproducible from stored data at any later time.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0041_public_incident_evidence"
down_revision: str | None = "0040_public_incidents"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "public_incident_evidence",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "incident_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("incident_status", sa.String(length=16), nullable=False),
        sa.Column("artifact_schema_version", sa.String(length=20), nullable=False),
        sa.Column("generator", sa.String(length=64), nullable=False),
        sa.Column("generator_version", sa.String(length=32), nullable=False),
        sa.Column("methodology_version", sa.String(length=20), nullable=False),
        sa.Column("data_hash", sa.String(length=64), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("observation_count", sa.Integer(), nullable=False),
        sa.Column("observations_truncated", sa.Boolean(), nullable=False),
        sa.Column("supersedes_version", sa.Integer(), nullable=True),
        # The artifact of record is the exact canonical bytes, stored as text:
        # an immutable document served byte-for-byte must not pass through a
        # type (JSONB) that reparses and reorders it. Readers who want a
        # parsed document canonicalise these bytes themselves.
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("observation_ids", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["incident_id"],
            ["public_incidents.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "incident_id",
            "version",
            name="uq_public_incident_evidence_version",
        ),
    )
    op.create_index(
        "ix_public_incident_evidence_incident",
        "public_incident_evidence",
        ["incident_id", "version"],
    )
    op.create_index(
        "ix_public_incident_evidence_data_hash",
        "public_incident_evidence",
        ["data_hash"],
    )

    op.add_column(
        "public_incidents",
        sa.Column("resolution_observation_id", sa.String(length=36), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("public_incidents", "resolution_observation_id")
    op.drop_index(
        "ix_public_incident_evidence_data_hash",
        table_name="public_incident_evidence",
    )
    op.drop_index(
        "ix_public_incident_evidence_incident",
        table_name="public_incident_evidence",
    )
    op.drop_table("public_incident_evidence")
