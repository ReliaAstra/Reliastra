"""Digest drafts: newsletter and social posts, generated for human review.

Additive only. Phase 9 of the intelligence rollout: the canonical public
incident records are rendered into DRAFT content - a weekly newsletter
digest and one short social post per incident - by a scheduled, idempotent
job. Nothing here auto-posts: ``digest_drafts`` rows are review artifacts
with status ``draft``, and only a human moves content out of the admin
surface. The generation pipeline writes rows and stops there.

Append-only like the evidence ledger and the publication ledger: a draft
whose content changed regenerates as a NEW row (the previous draft may
already be under human review - reviewed content is never mutated behind
the reviewer's back). Uniqueness on (kind, period_key, content_hash) makes
regeneration idempotent; incident ids are stored as provenance, not FKs -
a draft outlives the rows it summarized.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0043_digest_drafts"
down_revision: str | None = "0042_dataset_publications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "digest_drafts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("period_key", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("subject", sa.String(length=500), nullable=True),
        sa.Column("text_body", sa.Text(), nullable=False),
        sa.Column("html_body", sa.Text(), nullable=True),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("incident_ids", postgresql.JSONB(), nullable=False),
        sa.Column("vendor_slugs", postgresql.JSONB(), nullable=False),
        sa.Column("generator", sa.String(length=64), nullable=False),
        sa.Column("methodology_version", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "kind IN ('weekly_digest', 'incident_social')",
            name="ck_digest_drafts_kind_known",
        ),
        sa.CheckConstraint(
            "status = 'draft'",
            name="ck_digest_drafts_status_draft",
        ),
        sa.UniqueConstraint(
            "kind",
            "period_key",
            "content_hash",
            name="uq_digest_drafts_content",
        ),
    )
    op.create_index(
        "ix_digest_drafts_kind_created",
        "digest_drafts",
        ["kind", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_digest_drafts_kind_created", table_name="digest_drafts")
    op.drop_table("digest_drafts")
