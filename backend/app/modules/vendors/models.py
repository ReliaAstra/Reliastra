import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class VendorCategory(UUIDMixin, TimestampMixin, Base):
    """First class taxonomy entry for the public intelligence catalog.

    Categories are data, not code: onboarding a category is a registry entry
    plus a row here, not an application change. ``slug`` is the canonical
    public identifier and appears in URLs (/observatory/{slug} when the slug
    is not a vendor) and in API responses.
    """

    __tablename__ = "vendor_categories"

    slug: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class VendorTracking(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "vendor_trackings"

    vendor_name: Mapped[str] = mapped_column(
        String(100), unique=True, index=True, nullable=False
    )
    display_name: Mapped[str] = mapped_column(String(150), nullable=False)
    endpoint_url: Mapped[str] = mapped_column(String(500), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Intelligence entity fields (additive; migration 0039+) ────────────
    # A vendor is a canonical infrastructure entity, not merely a webpage:
    # identity links, a written definition of what is being observed, and a
    # foreign key into the category taxonomy.
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("vendor_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    official_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    website_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    documentation_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status_page_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)


# Compatibility alias while callers migrate from the original flat model name.
Vendor = VendorTracking


class VendorEndpoint(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "vendor_endpoints"
    __table_args__ = (
        UniqueConstraint(
            "vendor_id", "endpoint_url", name="uq_vendor_endpoints_vendor_url"
        ),
        UniqueConstraint(
            "vendor_id", "slug", name="uq_vendor_endpoints_vendor_slug"
        ),
    )

    vendor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vendor_trackings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    endpoint_url: Mapped[str] = mapped_column(String(500), nullable=False)
    check_interval_seconds: Mapped[int] = mapped_column(
        Integer, default=300, nullable=False
    )
    regions: Mapped[list[str]] = mapped_column(
        JSON, default=lambda: ["us-east"], nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    next_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    health_status: Mapped[str] = mapped_column(
        String(30), default="unknown", nullable=False
    )
    last_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Observation target identity (additive; migration 0039+) ───────────
    # One vendor can expose several products and several observed surfaces.
    # These columns give every observed target a stable, human readable
    # identity so dependency pages, datasets and future public incidents can
    # reference it without relying on a raw URL or a database id.
    slug: Mapped[str | None] = mapped_column(String(100), nullable=True)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    kind: Mapped[str] = mapped_column(
        String(50), default="status_page", nullable=False
    )
    product_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    methodology_version: Mapped[str] = mapped_column(
        String(20), default="v1.0", nullable=False
    )
