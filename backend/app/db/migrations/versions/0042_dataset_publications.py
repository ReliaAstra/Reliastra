"""Public dataset publications: the durable record of GitHub dataset pushes.

Additive only. Phase 8 of the intelligence rollout: the public intelligence
dataset (observed incidents, their frozen evidence artifacts, the vendor
catalog) is published to a public GitHub repository by a scheduled,
idempotent job. ``dataset_publications`` is the append-only log of what was
published, when, and under which content hash - the same "a publication is a
record, not a side effect" discipline the evidence ledger uses.

The publisher's idempotency lives on this table: a snapshot whose content
hash matches the latest published hash for the same target+branch is a
no-op, so the schedule (and the outbox fast path) can run as often as they
like without duplicate commits.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0042_dataset_publications"
down_revision: str | None = "0041_public_incident_evidence"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "dataset_publications",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target", sa.String(length=200), nullable=False),
        sa.Column("branch", sa.String(length=100), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("tree_sha", sa.String(length=40), nullable=False),
        sa.Column("commit_sha", sa.String(length=40), nullable=False),
        sa.Column("file_count", sa.Integer(), nullable=False),
        sa.Column("incident_count", sa.Integer(), nullable=False),
        sa.Column("evidence_count", sa.Integer(), nullable=False),
        sa.Column("vendor_count", sa.Integer(), nullable=False),
        sa.Column("trigger", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "target",
            "branch",
            "content_hash",
            name="uq_dataset_publications_state",
        ),
        sa.UniqueConstraint(
            "target",
            "branch",
            "commit_sha",
            name="uq_dataset_publications_commit",
        ),
    )
    op.create_index(
        "ix_dataset_publications_target",
        "dataset_publications",
        ["target", "branch", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_dataset_publications_target",
        table_name="dataset_publications",
    )
    op.drop_table("dataset_publications")
