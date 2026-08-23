import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class AcquisitionFirstTouch(UUIDMixin, TimestampMixin, Base):
    """Immutable first-touch acquisition record; one row per account.

    ``first_*`` columns are written exactly once (at signup) and never
    mutated by later campaigns. ``last_*`` columns are a convenience mirror
    of the most recent touch so later-campaign context survives without
    violating first-touch immutability. ``extras`` is free-form space for
    future click IDs / experiment IDs - no migration required.
    """

    __tablename__ = "acquisition_first_touch"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # ── FIRST TOUCH (immutable) ─────────────────────────────────────────
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="direct")
    source: Mapped[str | None] = mapped_column(String(120), nullable=True)
    medium: Mapped[str | None] = mapped_column(String(120), nullable=True)
    campaign: Mapped[str | None] = mapped_column(String(120), nullable=True)
    content: Mapped[str | None] = mapped_column(String(200), nullable=True)
    term: Mapped[str | None] = mapped_column(String(200), nullable=True)
    landing_path: Mapped[str | None] = mapped_column(String(300), nullable=True)
    referrer_host: Mapped[str | None] = mapped_column(String(200), nullable=True)
    first_touch_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )

    # ── LAST TOUCH (non-destructive mirror) ─────────────────────────────
    last_channel: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_source: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_medium: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_campaign: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_touch_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    extras: Mapped[dict | None] = mapped_column(JSON, nullable=True)
