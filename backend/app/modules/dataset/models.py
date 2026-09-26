"""Public dataset publications: the durable record of what was published.

One row per published dataset revision. The table is the publisher's
idempotency anchor and its audit trail at once: a snapshot whose content
hash matches the newest row for the same target+branch is a no-op, and every
successful GitHub commit leaves exactly one row naming the commit, the tree,
and the counts that produced it.

Deliberately append-only in practice (the service never updates or deletes
rows); failures are not recorded here - they are the retryable task's
business, and recording them would duplicate what the worker logs already
say while implying a publication that never happened.
"""


from sqlalchemy import Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class DatasetPublication(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "dataset_publications"
    __table_args__ = (
        UniqueConstraint(
            "target",
            "branch",
            "content_hash",
            name="uq_dataset_publications_state",
        ),
        UniqueConstraint(
            "target",
            "branch",
            "commit_sha",
            name="uq_dataset_publications_commit",
        ),
        Index(
            "ix_dataset_publications_target",
            "target",
            "branch",
            "created_at",
        ),
    )

    #: ``owner/name`` of the dataset repository. Part of the identity key:
    #: two targets (a mirror, a staging repo) publish independently.
    target: Mapped[str] = mapped_column(String(200), nullable=False)
    branch: Mapped[str] = mapped_column(String(100), nullable=False)
    #: SHA-256 over the dataset tree's per-file hashes - the fingerprint of
    #: the exact bytes published. The idempotency key.
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    #: GitHub object ids of the commit that was pushed.
    tree_sha: Mapped[str] = mapped_column(String(40), nullable=False)
    commit_sha: Mapped[str] = mapped_column(String(40), nullable=False)
    file_count: Mapped[int] = mapped_column(Integer, nullable=False)
    incident_count: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Incidents whose newest freeze is in the dataset. An incident without a
    #: frozen artifact appears in the incident files but not the evidence
    #: directory - the counts state that gap numerically.
    evidence_count: Mapped[int] = mapped_column(Integer, nullable=False)
    vendor_count: Mapped[int] = mapped_column(Integer, nullable=False)
    #: What triggered this publication: ``scheduled`` (beat) or ``outbox``
    #: (a freeze event's fast path). Provenance for the commit cadence.
    trigger: Mapped[str] = mapped_column(String(20), nullable=False)

    # created_at doubles as the publication timestamp (TimestampMixin).


# No foreign keys: the publication log must survive independently of the
# rows it snapshots (an incident may later age out of the public window while
# the dataset log still says exactly what was published and when).
