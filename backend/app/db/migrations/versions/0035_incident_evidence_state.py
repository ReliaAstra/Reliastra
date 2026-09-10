"""Incident detection provenance and evidence generation state.

Two additive groups of columns on ``incidents``, both required to make the
pipeline observable instead of inferential:

* **Detection provenance** - ``detection_rule`` and ``detection_metadata``
  record *which* rule opened the incident and the exact figures behind it
  (consecutive failures, agreeing observation points, thresholds). Evidence
  artifacts are generated asynchronously, possibly in another process, and must
  state the real rule rather than a hard-coded claim; that is only possible if
  the decision was persisted when it was made.

* **Evidence state** - ``evidence_status`` / ``evidence_error`` /
  ``evidence_attempted_at``. Before this, a failed generation (plan gate, PDF
  renderer, object storage) left no trace on the incident at all: the console
  rendered "none" forever and the only signal was a worker log line. The
  statuses are ``pending`` (not yet attempted), ``generating``, ``available``,
  ``failed`` (retryable) and ``not_entitled`` (the plan does not include
  evidence generation - a deliberate product state, not an error).

Both groups are additive with server defaults, so existing rows stay valid and
no data is rewritten. ``check_results.quorum_confirmed`` is intentionally left
alone: its meaning is now "the detector confirmed this result" under whichever
topology is configured, and renaming it would churn the API contract for no
gain.

Revision ID: 0035_incident_evidence_state
Revises: 0034_billing_control_center
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0035_incident_evidence_state"
down_revision: Union[str, None] = "0034_billing_control_center"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Closed set, enforced in the database so a typo in application code cannot
# leave an incident in a state no reader understands.
_EVIDENCE_STATUSES = (
    "pending",
    "generating",
    "available",
    "failed",
    "not_entitled",
)


def upgrade() -> None:
    op.add_column(
        "incidents",
        sa.Column(
            "evidence_status",
            sa.String(length=24),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "incidents",
        sa.Column("evidence_error", sa.Text(), nullable=True),
    )
    op.add_column(
        "incidents",
        sa.Column("evidence_attempted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "incidents",
        sa.Column("detection_rule", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "incidents",
        sa.Column(
            "detection_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.create_check_constraint(
        "ck_incidents_evidence_status_known",
        "incidents",
        sa.column("evidence_status").in_(_EVIDENCE_STATUSES),
    )
    # The console filters incidents by evidence state; keep that a cheap scan.
    op.create_index(
        "ix_incidents_evidence_status",
        "incidents",
        ["evidence_status"],
    )


def downgrade() -> None:
    op.drop_index("ix_incidents_evidence_status", table_name="incidents")
    op.drop_constraint(
        "ck_incidents_evidence_status_known", "incidents", type_="check"
    )
    op.drop_column("incidents", "detection_metadata")
    op.drop_column("incidents", "detection_rule")
    op.drop_column("incidents", "evidence_attempted_at")
    op.drop_column("incidents", "evidence_error")
    op.drop_column("incidents", "evidence_status")
