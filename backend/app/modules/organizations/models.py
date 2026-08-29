import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, String, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, SoftDeleteMixin, UUIDMixin, TimestampMixin


class Organization(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    slug: Mapped[str] = mapped_column(
        String(150), unique=True, index=True, nullable=False
    )
    plan: Mapped[str] = mapped_column(
        String(50), default="free", nullable=False
    )
    has_agency_mode: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    # Opt-out for AI explanations in evidence reports. The LLM itself is
    # Reliastra-managed (see app.config RELIASTRA_AI_*) — organizations do
    # not configure providers, models or keys; they only choose whether the
    # explanation section is generated for them.
    ai_explanations_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    # 14-day full-access evaluation — first-class server-side entitlement state.
    # Every new organization receives Professional limits for 14 days; after
    # expiry it falls back to Free automatically. Stored on the organization so
    # no client state, cookie, or clock manipulation can extend or re-create it.
    evaluation_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=False
    )
    evaluation_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    evaluation_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True, index=True
    )
    evaluation_used: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    members: Mapped[list["OrganizationMember"]] = relationship(
        "OrganizationMember",
        back_populates="organization",
        cascade="all, delete-orphan",
    )


class OrganizationMember(UUIDMixin, SoftDeleteMixin, Base):
    __tablename__ = "organization_members"

    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        String(50), default="member", nullable=False
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="members"
    )
