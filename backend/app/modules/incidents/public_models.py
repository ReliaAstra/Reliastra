"""Public incident records: RELIASTRA-observed incidents on catalog vendors.

These are NOT the tenant-scoped ``Incident`` rows the customer console uses.
A public incident is what independence observation of the public catalog
produced: one vendor, one observed endpoint, one observation point, with the
exact provenance a reader needs to reconstruct the claim. The two models
never share rows - customer incidents stay tenant private (even for public
URLs), and public incidents are derived exclusively from
``source_type='vendor_probe'`` observations.

Recognition rules, same as the customer detector and deliberately so: a row
is created only when the deterministic detection policy confirms the failure
run (``evaluate_detection``, single-observation persistence = N consecutive
failed observations). A single failed probe writes nothing public. That is
the publication gate the methodology states: RELIASTRA publishes
*confirmed observed degradation*, never a suspicion.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin

#: Where a public incident's claim comes from. ``OBSERVED`` means the
#: incident exists because RELIASTRA probes measured it - it is the only
#: value the public catalog uses today. The column is explicit so a future
#: ``reported_by_vendor`` or ``correlated`` state can never be silently
#: collapsed into an observed claim.
ATTRIBUTION_OBSERVED = "observed"


class PublicIncident(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "public_incidents"
    __table_args__ = (
        Index(
            "ix_public_incidents_vendor_started",
            "vendor_id",
            "started_at",
        ),
        Index(
            "uq_public_incidents_open_endpoint",
            "endpoint_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
    )

    vendor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vendor_trackings.id", ondelete="CASCADE"),
        nullable=False,
    )
    endpoint_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vendor_endpoints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    #: The observation point label that measured this. Single topology today.
    region: Mapped[str] = mapped_column(String(50), nullable=False)
    #: Denormalised so a URL edited later cannot rewrite history.
    endpoint_url: Mapped[str] = mapped_column(String(500), nullable=False)
    #: Display name of the observed target at detection time, for the same
    #: reason (identity refreshes must not rewrite published records).
    target_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    status: Mapped[str] = mapped_column(
        String(16), default="open", nullable=False, index=True
    )
    severity: Mapped[str] = mapped_column(
        String(16), default="major", nullable=False
    )
    #: http_5xx / http_4xx / transport / timeout / mixed / unknown.
    failure_kind: Mapped[str] = mapped_column(
        String(32), default="unknown", nullable=False
    )

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    observation_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failure_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status_codes: Mapped[list[int] | None] = mapped_column(JSONB, nullable=True)
    #: Observation id provenance, stored as text: ``observations`` is a
    #: partitioned time-series table and a foreign key across partitions is
    #: not enforceable, so the reference is preserved without a constraint.
    first_observation_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True
    )
    last_observation_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True
    )

    detection_rule: Mapped[str] = mapped_column(String(64), nullable=False)
    detection_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    methodology_version: Mapped[str] = mapped_column(
        String(20), default="v1.0", nullable=False
    )
    attribution_status: Mapped[str] = mapped_column(
        String(24), default=ATTRIBUTION_OBSERVED, nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
