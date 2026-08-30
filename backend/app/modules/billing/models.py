import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    JSON,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class Subscription(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "subscriptions"
    __table_args__ = (
        UniqueConstraint("organization_id", name="uq_subscriptions_organization_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(
        String(50), nullable=False, default="paystack"
    )
    provider_customer_id: Mapped[str | None] = mapped_column(
        String(200), nullable=True, index=True
    )
    provider_subscription_id: Mapped[str | None] = mapped_column(
        String(200), nullable=True
    )
    plan: Mapped[str] = mapped_column(String(50), nullable=False, default="free")
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="inactive"
    )
    # Billing interval the subscription was purchased under: "monthly" or
    # "annual". The charged amount must match this interval.
    billing_interval: Mapped[str] = mapped_column(
        String(20), nullable=False, default="monthly"
    )
    current_period_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class BillingTransaction(UUIDMixin, TimestampMixin, Base):
    """A payment the gateway actually collected, recorded as it happened.

    This table is the audit answer to "what did this customer really pay?".
    ``charged_amount_minor``/``charged_currency`` are copied from Paystack's
    verification response — the provider's own numbers, never a recomputed
    price. ``product_amount_minor``/``product_currency`` record the USD list
    price the checkout was quoting at the time, so a receipt can restate the
    full transparency triple long after either price list changed.

    One row per payment ``reference``; re-verifying a paid reference updates
    the existing row instead of duplicating it.
    """

    __tablename__ = "billing_transactions"
    __table_args__ = (
        UniqueConstraint(
            "provider", "reference", name="uq_billing_transactions_provider_reference"
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(
        String(50), nullable=False, default="paystack"
    )
    # Paystack's own transaction reference (also the idempotency key).
    reference: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    # What was bought.
    plan: Mapped[str] = mapped_column(String(50), nullable=False)
    billing_interval: Mapped[str] = mapped_column(
        String(20), nullable=False, default="monthly"
    )
    # ── What RELIASTRA quoted (product pricing, USD minor units) ──────────
    product_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    product_amount_minor: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )
    # ── What Paystack actually charged (payment pricing, provider figures) ─
    charged_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    charged_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # success | refunded | disputed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="success")
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    period_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Small, curated subset of the provider response (id, channel, gateway
    # reference) for reconciliation. Deliberately not the raw payload: it
    # carries customer PII we do not need duplicated here.
    provider_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)
