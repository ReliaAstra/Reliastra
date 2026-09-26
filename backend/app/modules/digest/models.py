"""Digest persistence: the draft ledger for newsletter and social content.

One table, ``digest_drafts``: append-only rows of generated DRAFT content.
A draft is a record, not a side effect - the generator creates rows with
status ``draft`` and nothing else ever writes here. Send/post actions are
NOT part of this module (no auto-posting, by design): a human reviews the
draft on the admin surface and acts outside the generation pipeline.

Append-only in practice, like the evidence and publication ledgers: a
draft whose content changed regenerates as a NEW row (the previous draft
may already be under human review - reviewed content is never mutated
behind the reviewer's back). Uniqueness on (kind, period_key,
content_hash) makes regeneration idempotent; incident ids are stored as
provenance, not FKs - a draft outlives the rows it summarized.
"""

from datetime import date

from sqlalchemy import CheckConstraint, Date, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin

KIND_WEEKLY_DIGEST = "weekly_digest"
KIND_INCIDENT_SOCIAL = "incident_social"
KNOWN_KINDS = (KIND_WEEKLY_DIGEST, KIND_INCIDENT_SOCIAL)

STATUS_DRAFT = "draft"


class DigestDraft(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "digest_drafts"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('weekly_digest', 'incident_social')",
            name="ck_digest_drafts_kind_known",
        ),
        CheckConstraint("status = 'draft'", name="ck_digest_drafts_status_draft"),
        UniqueConstraint(
            "kind", "period_key", "content_hash", name="uq_digest_drafts_content"
        ),
        Index("ix_digest_drafts_kind_created", "kind", "created_at"),
    )

    #: What the draft is: ``weekly_digest`` or ``incident_social``.
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    #: Idempotency scope: ISO week (``2026-W39``) for weekly digests, the
    #: incident id for social drafts.
    period_key: Mapped[str] = mapped_column(String(64), nullable=False)
    #: Always ``draft``. The generator never advances content state; a human
    #: does, outside this table.
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=STATUS_DRAFT, server_default="draft"
    )
    #: Newsletter subject. None for social drafts.
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    #: The plain-text draft. Deterministic from canonical records.
    text_body: Mapped[str] = mapped_column(Text, nullable=False)
    #: Newsletter HTML rendering of the same content. None for social.
    html_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: SHA-256 of the content tuple (subject, text, html). Idempotency key
    #: together with (kind, period_key).
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    #: First day (inclusive, UTC) of the window the draft covers.
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    #: Last day (inclusive, UTC) of the window the draft covers.
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    #: Provenance: the incident ids summarized, oldest first. Not FKs - a
    #: draft outlives the records it summarized.
    incident_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    #: Provenance: sorted distinct vendor slugs appearing in the draft.
    vendor_slugs: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    #: Generator identity + version (e.g. ``reliastra-digest/1.0``).
    generator: Mapped[str] = mapped_column(String(64), nullable=False)
    #: Detection methodology version shared by the summarized incidents.
    methodology_version: Mapped[str] = mapped_column(String(32), nullable=False)

    # created_at doubles as the generation timestamp (TimestampMixin).


# No foreign keys: the draft ledger must survive independently of the rows
# it summarizes (an incident may later age out of the public window while
# the draft still says exactly what was reviewed, and when).
