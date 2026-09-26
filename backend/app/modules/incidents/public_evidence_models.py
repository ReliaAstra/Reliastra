"""Public incident evidence artifacts: the immutable record of a claim.

One row is one *freeze* of a public incident: the incident's fields, the raw
``vendor_probe`` observations of its window, and the detection provenance,
serialised to canonical JSON bytes, hashed, and stored. The bytes are the
artifact of record - the row stores them verbatim (as text, not JSONB, so no
type reparses or reorders what was hashed), and the API serves exactly those
bytes.

Append-only by design. A public incident is frozen when it opens and again
when it resolves; the second freeze supersedes the first. Editing a published
artifact in place would make every checksum on the internet stale while the
URL keeps serving new bytes under the old claim, so update and delete are
blocked at the model level - the same guard ``EvidenceSnapshot`` uses for
tenant evidence.

Historical freezes stay bound to the methodology version that produced them
(``methodology_version``) and the document shape that carried them
(``artifact_schema_version``). A methodology change creates a new version;
it never rewrites an old artifact.
"""

import uuid

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class PublicIncidentEvidence(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "public_incident_evidence"
    __table_args__ = (
        UniqueConstraint(
            "incident_id",
            "version",
            name="uq_public_incident_evidence_version",
        ),
        Index(
            "ix_public_incident_evidence_incident",
            "incident_id",
            "version",
        ),
        Index("ix_public_incident_evidence_data_hash", "data_hash"),
    )

    incident_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("public_incidents.id", ondelete="CASCADE"),
        nullable=False,
    )
    #: Freeze number for the incident, starting at 1. Incremented on every
    #: state change of the underlying incident (open freeze, resolution
    #: freeze); never reused, never edited.
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    #: The incident's status at freeze time ("open" or "resolved"). What the
    #: document claims about the window is exactly this state - an open
    #: freeze never quietly becomes a resolved one.
    incident_status: Mapped[str] = mapped_column(String(16), nullable=False)
    #: Document shape version, separate from methodology: it describes the
    #: payload's fields, not how the claim was produced.
    artifact_schema_version: Mapped[str] = mapped_column(String(20), nullable=False)
    generator: Mapped[str] = mapped_column(String(64), nullable=False)
    generator_version: Mapped[str] = mapped_column(String(32), nullable=False)
    #: Copied from the incident: the artifact stays bound to the methodology
    #: version whose detector produced the window.
    methodology_version: Mapped[str] = mapped_column(String(20), nullable=False)
    #: SHA-256 hex digest over the canonical bytes of the document WITHOUT its
    #: verification block. The verification block records this hash inside the
    #: served document, so a third party can recompute it by dropping the
    #: block and re-canonicalising - the recipe travels with the artifact.
    data_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    observation_count: Mapped[int] = mapped_column(Integer, nullable=False)
    #: True when the window hit the observation cap and the OLDEST rows were
    #: dropped. Disclosed in the artifact, never silent.
    observations_truncated: Mapped[bool] = mapped_column(Boolean, nullable=False)
    #: The freeze this one replaces, when a previous freeze exists.
    supersedes_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    #: The canonical JSON bytes of the full document (verification block
    #: included). This is what the API serves - byte-for-byte.
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    #: Observation id provenance for quick checks without parsing the payload.
    observation_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    # created_at/updated_at come from TimestampMixin; created_at doubles as
    # the freeze timestamp the descriptor publishes (generated_at).


@event.listens_for(PublicIncidentEvidence, "before_update")
def _prevent_evidence_update(*_: object) -> None:
    raise ValueError("Public incident evidence artifacts are immutable")


@event.listens_for(PublicIncidentEvidence, "before_delete")
def _prevent_evidence_delete(*_: object) -> None:
    raise ValueError("Public incident evidence artifacts are immutable")
