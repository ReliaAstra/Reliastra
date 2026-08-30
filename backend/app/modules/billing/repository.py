import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.models import BillingTransaction, Subscription
from app.modules.organizations.models import Organization
from app.modules.organizations.repository import OrganizationRepository


class BillingRepository:
    @staticmethod
    async def get_org(
        session: AsyncSession, org_id: uuid.UUID
    ) -> Organization | None:
        return await OrganizationRepository.get_by_id(session, org_id)

    # ── Persisted transactions (the actual charge, as the provider reported it)

    @staticmethod
    async def record_transaction(
        session: AsyncSession,
        *,
        organization_id: uuid.UUID,
        reference: str,
        plan: str,
        billing_interval: str,
        charged_currency: str,
        charged_amount_minor: int,
        product_currency: str,
        product_amount_minor: int | None = None,
        email: str | None = None,
        user_id: uuid.UUID | None = None,
        verified_at: datetime | None = None,
        duplicate: bool = False,
        paid_at: datetime | None = None,
        period_start: datetime | None = None,
        period_end: datetime | None = None,
        provider_metadata: dict[str, Any] | None = None,
    ) -> BillingTransaction:
        """Upsert the payment record for one provider reference.

        The verify endpoint and the ``charge.success`` webhook land here for
        the same reference, so this must be idempotent: the second delivery
        refreshes, it never duplicates the charge.
        """
        result = await session.execute(
            select(BillingTransaction).where(
                BillingTransaction.provider == "paystack",
                BillingTransaction.reference == reference,
            )
        )
        transaction = result.scalar_one_or_none()
        values = {
            "organization_id": organization_id,
            "email": email,
            "plan": plan,
            "billing_interval": billing_interval,
            "product_currency": product_currency,
            "product_amount_minor": product_amount_minor,
            "charged_currency": charged_currency,
            "charged_amount_minor": charged_amount_minor,
            "paid_at": paid_at,
            "period_start": period_start,
            "period_end": period_end,
            "provider_metadata": provider_metadata,
            "user_id": user_id,
            "verified_at": verified_at,
        }
        if transaction is None:
            transaction = BillingTransaction(
                provider="paystack",
                reference=reference,
                status="success",
                **values,
            )
            session.add(transaction)
        else:
            for key, value in values.items():
                # Attribution fields are only ever filled in, never blanked.
                # The ``charge.success`` webhook usually arrives first and
                # carries no payer identity (it is a server-to-server event);
                # the customer's own verify call follows seconds later and does.
                # Overwriting with ``None`` here would erase exactly the
                # provenance the billing record exists to keep.
                if value is None and key in {"user_id", "verified_at"}:
                    continue
                setattr(transaction, key, value)
            # ``duplicate`` is sticky: once a second payment for the period has
            # been seen, a later idempotent re-delivery must not un-flag it.
            if duplicate:
                transaction.duplicate = True
            # A refund/dispute already seen by the webhook outranks a later
            # re-verification of the same reference; never regress the state.
            if transaction.status == "pending":
                transaction.status = "success"
        await session.flush()
        return transaction

    @staticmethod
    async def mark_transaction_status(
        session: AsyncSession,
        *,
        reference: str,
        status: str,
        provider: str = "paystack",
    ) -> None:
        """Move a transaction to ``refunded``/``disputed`` when the provider says so."""
        result = await session.execute(
            select(BillingTransaction).where(
                BillingTransaction.provider == provider,
                BillingTransaction.reference == reference,
            )
        )
        transaction = result.scalar_one_or_none()
        if transaction is not None and transaction.status == "success":
            transaction.status = status
            session.add(transaction)
            await session.flush()

    @staticmethod
    async def list_transactions(
        session: AsyncSession, organization_id: uuid.UUID, *, limit: int = 50
    ) -> list[BillingTransaction]:
        result = await session.execute(
            select(BillingTransaction)
            .where(BillingTransaction.organization_id == organization_id)
            .order_by(BillingTransaction.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_subscription(
        session: AsyncSession, org_id: uuid.UUID
    ) -> Subscription | None:
        result = await session.execute(
            select(Subscription).where(Subscription.organization_id == org_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def create_subscription(
        session: AsyncSession,
        org_id: uuid.UUID,
        provider: str = "paystack",
        provider_customer_id: str | None = None,
        provider_subscription_id: str | None = None,
        plan: str = "free",
        status: str = "inactive",
        billing_interval: str = "monthly",
        current_period_start: Any = None,
        current_period_end: Any = None,
    ) -> Subscription:
        # Every field is a named parameter on purpose. This constructor used to
        # take **periods and read two keys out of it, which silently discarded
        # billing_interval — an annual customer was created on the monthly
        # default, so the interval they paid for was not the interval recorded.
        subscription = Subscription(
            organization_id=org_id,
            provider=provider,
            provider_customer_id=provider_customer_id,
            provider_subscription_id=provider_subscription_id,
            plan=plan,
            status=status,
            billing_interval=billing_interval,
            current_period_start=current_period_start,
            current_period_end=current_period_end,
        )
        session.add(subscription)
        await session.flush()
        return subscription

    @staticmethod
    async def update_subscription(
        session: AsyncSession, subscription: Subscription, **kwargs: Any
    ) -> Subscription:
        for key, value in kwargs.items():
            if value is not None and hasattr(subscription, key):
                setattr(subscription, key, value)
        session.add(subscription)
        await session.flush()
        return subscription

    @staticmethod
    async def get_org_by_provider_customer(
        session: AsyncSession,
        customer_id: str,
        provider: str = "paystack",
    ) -> Organization | None:
        result = await session.execute(
            select(Organization)
            .join(
                Subscription,
                Subscription.organization_id == Organization.id,
            )
            .where(
                Subscription.provider_customer_id == customer_id,
                Subscription.provider == provider,
            )
        )
        return result.scalar_one_or_none()
