"""Evidence artifact provenance: renderer and signature columns.

The evidence document now carries two things it never recorded before, and both
have to survive the request that produced them:

* ``evidence_reports.renderer`` / ``.renderer_version`` - which PDF renderer
  produced the bytes whose checksum is published. The template is laid out by
  Chromium and, when that is unavailable, by xhtml2pdf; pagination differs
  between them, so a report whose renderer is unknown cannot be reproduced from
  its own metadata. Recording it also makes a silent fallback impossible: the
  degradation becomes a fact on the row, in the payload and on the page.
* ``evidence_snapshots.signature`` / ``.signature_alg`` / ``.signing_key_id`` -
  the Ed25519 signature over the canonical payload bytes, so authenticity can be
  established by a third party holding only the published public key. A hash
  stored in our own database proves consistency, not authorship.

Nullable by design: artifacts generated before this change exist, and an
unsigned deployment is a legitimate state that the document states out loud.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0037_evidence_provenance"
down_revision: Union[str, None] = "0036_merge_heads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "evidence_reports",
        sa.Column("renderer", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "evidence_reports",
        sa.Column("renderer_version", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "evidence_snapshots",
        sa.Column("signature", sa.String(length=160), nullable=True),
    )
    op.add_column(
        "evidence_snapshots",
        sa.Column("signature_alg", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "evidence_snapshots",
        sa.Column("signing_key_id", sa.String(length=64), nullable=True),
    )
    # Signatures are looked up by key when a deployment rotates its signing key:
    # "which artifacts were issued under key X" has to be answerable without a
    # full-table scan, because that question arrives during an incident.
    op.create_index(
        "ix_evidence_snapshots_signing_key_id",
        "evidence_snapshots",
        ["signing_key_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_evidence_snapshots_signing_key_id", table_name="evidence_snapshots"
    )
    op.drop_column("evidence_snapshots", "signing_key_id")
    op.drop_column("evidence_snapshots", "signature_alg")
    op.drop_column("evidence_snapshots", "signature")
    op.drop_column("evidence_reports", "renderer_version")
    op.drop_column("evidence_reports", "renderer")
