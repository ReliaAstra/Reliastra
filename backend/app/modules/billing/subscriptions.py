"""Subscription reads and lifecycle: plan details, history, cancel/resume.

Answers "what does this org have?" (plan details, transactions, documents)
and mutates local subscription state (cancel at period end, resume, expiry).
No Paystack calls here - checkout/verification own the provider side.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ResourceNotFoundException,
    ValidationException,
)
from app.modules.billing.commercial_terms import (
    REFUND_POLICY_PATH,
    cancellation_after_effect,
    cancellation_summary,
    refund_summary,
    trial_summary,
)
from app.modules.billing.disclosure import (
    currency_payload,
    resolve_payment_price_async,
)
from app.modules.billing.documents import (
    filename_for,
    invoice_number,
    receipt_number,
    render_invoice,
    render_receipt,
)
from app.modules.billing.pricing import (
    MONTHLY as MONTHLY_INTERVAL,
)
from app.modules.billing.pricing import (
    format_money,
)
from app.modules.billing.repository import BillingRepository
from app.modules.billing.schemas import (
    BillingTransactionResponse,
    BillingTransactionsResponse,
    PaymentCurrencyResponse,
    PlanDetailsResponse,
    SubscriptionActionResponse,
)
from app.platform.commercial.entitlements import (
    PLAN_FEATURES,
    TRIAL_DAYS,
    Plan,
    get_dependency_limit,
    get_effective_entitlements,
    get_min_check_interval,
    get_plan_billing_availability,
    get_plan_price_usd,
    get_retention_days,
    get_team_limit,
)

logger = logging.getLogger(__name__)


def _payment_method_display(subscription: Any) -> str | None:
    last4 = getattr(subscription, "payment_method_last4", None)
    brand = getattr(subscription, "payment_method_brand", None)
    if not isinstance(last4, str) or not last4:
        channel = getattr(subscription, "payment_method_channel", None)
        return channel.title() if isinstance(channel, str) and channel else None
    label = brand.title() if isinstance(brand, str) and brand else "Card"
    return f"{label} ···· {last4}"


def _document_fields(tx) -> dict[str, str]:
    tid = str(tx.id)
    return {
        "invoice_number": invoice_number(tx),
        "receipt_number": receipt_number(tx),
        "invoice_url": f"/v1/billing/transactions/{tid}/invoice",
        "receipt_url": f"/v1/billing/transactions/{tid}/receipt",
        "invoice_download_url": f"/v1/billing/transactions/{tid}/invoice?download=1",
        "receipt_download_url": f"/v1/billing/transactions/{tid}/receipt?download=1",
    }


class BillingSubscriptions:
    """Reads and lifecycle transitions for local subscription state."""

    def __init__(self, repository: BillingRepository) -> None:
        self.repository = repository

    async def get_plan_details(
        self, session: AsyncSession, org_id: uuid.UUID
    ) -> PlanDetailsResponse:
        org = await self.repository.get_org(session, org_id)
        if not org:
            raise ResourceNotFoundException("Organization not found")
        subscription = await self.repository.get_subscription(session, org_id)

        # Centralized evaluation-aware entitlement resolution. Server time only.
        subscription = await self._expire_cancelled_if_due(session, org, subscription)
        ent = get_effective_entitlements(org)
        effective_plan = ent["effective_plan"]
        base_price = get_plan_price_usd(effective_plan)
        # Real account consequences for the fallback message (never fabricated).
        fallback_info = await self._build_fallback_info(session, org, ent)
        effective_is_custom = get_plan_billing_availability(effective_plan) == "contact_sales"
        cancel_at_end = (
            getattr(subscription, "cancel_at_period_end", False) is True
            if subscription is not None
            else False
        )
        stored_plan = ent["subscription_plan"]
        is_paid = stored_plan not in {Plan.FREE.value, Plan.ENTERPRISE.value}
        status = subscription.status if subscription else None
        last4 = getattr(subscription, "payment_method_last4", None) if subscription else None
        brand = getattr(subscription, "payment_method_brand", None) if subscription else None
        expiry_month, exp_year = None, None
        month_raw = getattr(subscription, "payment_method_exp_month", None) if subscription else None
        if isinstance(month_raw, int):
            expiry_month = month_raw
        year_raw = getattr(subscription, "payment_method_exp_year", None) if subscription else None
        if isinstance(year_raw, int):
            exp_year = year_raw
        channel = getattr(subscription, "payment_method_channel", None) if subscription else None
        canceled_at = getattr(subscription, "canceled_at", None) if subscription else None
        period_start = getattr(subscription, "current_period_start", None) if subscription else None
        return PlanDetailsResponse(
            org_id=org.id,
            plan=stored_plan,
            effective_plan=effective_plan,
            is_trial_active=ent["is_evaluation_active"],
            trial_days_remaining=ent["evaluation_days_remaining"],
            trial_length_days=TRIAL_DAYS,
            is_evaluation_active=ent["is_evaluation_active"],
            evaluation_status=ent["evaluation_status"],
            evaluation_started_at=ent["evaluation_started_at"],
            evaluation_expires_at=ent["evaluation_expires_at"],
            evaluation_days_remaining=ent["evaluation_days_remaining"],
            evaluation_used=ent["evaluation_used"],
            max_dependencies=get_dependency_limit(effective_plan),
            max_team_members=get_team_limit(effective_plan),
            min_check_interval_seconds=get_min_check_interval(effective_plan),
            data_retention_days=get_retention_days(effective_plan),
            effective_features=ent["effective_features"],
            fallback_info=fallback_info,
            subscription_status=status,
            current_period_start=period_start if isinstance(period_start, datetime) else None,
            current_period_end=(
                subscription.current_period_end if subscription else None
            ),
            price_usd=base_price,
            billing_interval=(
                subscription.billing_interval if subscription is not None else None
            ),
            # Enterprise uses custom pricing - never advertise a numeric price.
            effective_is_custom=effective_is_custom,
            # Payment currency + canonical disclosure (+ the display-only FX
            # reference), resolved from the same source the checkout uses -
            # never a frontend literal.
            payment=PaymentCurrencyResponse(**(await currency_payload())),
            cancel_at_period_end=cancel_at_end,
            canceled_at=canceled_at if isinstance(canceled_at, datetime) else None,
            payment_method_brand=brand if isinstance(brand, str) else None,
            payment_method_last4=last4 if isinstance(last4, str) else None,
            payment_method_exp_month=expiry_month if isinstance(expiry_month, int) else None,
            payment_method_exp_year=exp_year if isinstance(exp_year, int) else None,
            payment_method_channel=channel if isinstance(channel, str) else None,
            payment_method_display=_payment_method_display(subscription) if subscription else None,
            billing_email=await self._billing_email_for_org(session, org_id),
            organization_name=getattr(org, "name", None),
            trial_summary=trial_summary(),
            cancellation_summary=cancellation_summary(),
            refund_summary=refund_summary(),
            refund_policy_path=REFUND_POLICY_PATH,
            can_cancel=bool(is_paid and status == "active" and not cancel_at_end),
            can_resume=bool(is_paid and cancel_at_end and status == "active"),
            can_change_plan=get_plan_billing_availability(stored_plan) != "contact_sales",
            **await self._next_charge_fields(subscription),
        )

    async def _next_charge_fields(self, subscription) -> dict:
        """Next renewal amount for the billing page, converted at the live rate.

        Empty when there is no active paid subscription: the UI must not show
        a "next charge" figure the customer will never be billed - and empty
        when no rate is available to convert it, rather than inventing one.
        """
        if subscription is None or subscription.plan == Plan.FREE.value:
            return {}
        if getattr(subscription, "cancel_at_period_end", False) is True:
            return {}
        price = await resolve_payment_price_async(
            subscription.plan, subscription.billing_interval or MONTHLY_INTERVAL
        )
        if not price.is_configured:
            return {}
        return {
            "next_charge_amount_minor": price.payment_amount,
            "next_charge_amount_display": format_money(
                price.payment_amount, price.payment_currency
            ),
        }

    async def get_transactions(
        self, session: AsyncSession, org_id: uuid.UUID
    ) -> BillingTransactionsResponse:
        """Payment history with the ACTUAL charged amount/currency per payment.

        Every figure comes from the persisted provider response - never from
        re-resolving today's price list - so history stays truthful even after
        a repricing. Display strings are formatted here for the same reason
        every other amount string is: the UI never composes money itself.
        """
        from app.platform.commercial.entitlements import get_plan_display_name

        items = []
        for tx in await self.repository.list_transactions(session, org_id):
            items.append(
                BillingTransactionResponse(
                    id=tx.id,
                    reference=tx.reference,
                    provider=tx.provider.capitalize() if tx.provider else "Paystack",
                    plan=tx.plan,
                    display_plan=get_plan_display_name(tx.plan),
                    billing_interval=tx.billing_interval,
                    status=tx.status,
                    product_currency=tx.product_currency,
                    product_amount_minor=tx.product_amount_minor,
                    product_price_display=format_money(
                        tx.product_amount_minor, tx.product_currency
                    )
                    or None,
                    charged_currency=tx.charged_currency,
                    charged_amount_minor=tx.charged_amount_minor,
                    charged_amount_display=format_money(
                        tx.charged_amount_minor, tx.charged_currency
                    ),
                    paid_at=tx.paid_at,
                    verified_at=tx.verified_at,
                    period_start=tx.period_start,
                    period_end=tx.period_end,
                    created_at=tx.created_at,
                    # A duplicate is shown, never hidden: a customer who paid
                    # twice for one month needs to see both lines and the
                    # credit, not a history that quietly dropped one.
                    duplicate=bool(tx.duplicate),
                    **_document_fields(tx),
                )
            )
        return BillingTransactionsResponse(
            items=items,
            payment=PaymentCurrencyResponse(**await currency_payload()),
        )

    async def _build_fallback_info(
        self, session: AsyncSession, org, ent: dict
    ) -> dict | None:
        """Build the account-specific post-evaluation consequences.

        e.g.  17 dependencies configured, 1 active on Free, 16 paused.
        Uses real counts, never invented numbers, so the fallback message is
        commercially meaningful and explainable.
        """
        try:
            from app.modules.dependencies.repository import DependencyRepository
            from app.modules.organizations.repository import OrganizationRepository

            total_deps = await DependencyRepository.count_for_org(session, org.id)
            effective = ent["effective_plan"]
            free_limit = get_dependency_limit(Plan.FREE.value) or 0
            current_limit = get_dependency_limit(effective)
            # Enterprise/custom plans have no fixed numeric limit.
            if current_limit is None:
                current_limit = max(total_deps, free_limit)
            # Estimate paused if they were to fall back now
            would_pause = max(0, total_deps - free_limit) if ent["is_evaluation_active"] else 0
            members = await OrganizationRepository.list_members(session, org.id)
            team_count = len(members)
            team_free = get_team_limit(Plan.FREE.value) or 1
            team_current = get_team_limit(effective)
            if team_current is None:
                team_current = max(team_count, team_free)
            return {
                "dependencies_configured": total_deps,
                "dependencies_active": min(total_deps, current_limit),
                "dependencies_paused_if_expired": would_pause,
                "free_dependency_limit": free_limit,
                "current_dependency_limit": current_limit,
                "team_members": team_count,
                "team_free_limit": team_free,
                "team_current_limit": team_current,
                "evidence_available": bool(ent["effective_features"].get("evidence_generation")),
                "evidence_free_available": bool(PLAN_FEATURES[Plan.FREE.value].get("evidence_generation")),
                "api_available": bool(ent["effective_features"].get("api_access")),
                "retention_days_current": get_retention_days(effective),
                "retention_days_free": get_retention_days(Plan.FREE.value),
            }
        except Exception:
            return None

    async def _billing_email_for_org(
        self, session: AsyncSession, org_id: uuid.UUID
    ) -> str | None:
        from app.modules.organizations.repository import OrganizationRepository
        from app.modules.users.repository import UserRepository

        try:
            members = await OrganizationRepository.list_members(session, org_id)
            owner = next((m for m in members if m.role == "owner"), None)
            if owner is None:
                return None
            user = await UserRepository.get_by_id(session, owner.user_id)
            return user.email if user else None
        except Exception:  # pragma: no cover
            logger.warning("Could not resolve billing email for org %s", org_id)
            return None

    async def _expire_cancelled_if_due(
        self, session: AsyncSession, org, subscription
    ):
        """Drop a cancelled-at-period-end subscription once the paid period ends.

        Paid, non-cancelled subscriptions are not auto-expired: Reliastra owns
        the period and a missed one-off renewal must not silently strip a
        customer who already paid. Cancellation is the only path that ends
        entitlement at ``current_period_end``.
        """
        if subscription is None or org is None:
            return subscription
        if getattr(subscription, "cancel_at_period_end", False) is not True:
            return subscription
        end = getattr(subscription, "current_period_end", None)
        if not isinstance(end, datetime):
            return subscription
        now = datetime.now(timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if now < end:
            return subscription
        await self.repository.update_subscription(
            session,
            subscription,
            status="canceled",
            plan=Plan.FREE.value,
            cancel_at_period_end=False,
        )
        from app.modules.organizations.repository import OrganizationRepository

        await OrganizationRepository.update(
            session, org, plan=Plan.FREE.value, evaluation_status="expired"
        )
        await session.refresh(org)
        return subscription

    async def cancel_subscription(
        self, session: AsyncSession, org_id: uuid.UUID
    ) -> SubscriptionActionResponse:
        org = await self.repository.get_org(session, org_id)
        if not org:
            raise ResourceNotFoundException("Organization not found")
        subscription = await self.repository.get_subscription(session, org_id)
        subscription = await self._expire_cancelled_if_due(session, org, subscription)
        if (
            subscription is None
            or subscription.plan == Plan.FREE.value
            or subscription.status != "active"
        ):
            raise ValidationException("There is no paid subscription to cancel.")
        if getattr(subscription, "cancel_at_period_end", False) is True:
            return SubscriptionActionResponse(
                plan=subscription.plan,
                subscription_status=subscription.status,
                cancel_at_period_end=True,
                canceled_at=subscription.canceled_at,
                current_period_end=subscription.current_period_end,
                message="This subscription is already scheduled to cancel at the end of the paid period.",
                cancellation_summary=cancellation_summary(),
                cancellation_after_effect=cancellation_after_effect(),
                refund_summary=refund_summary(),
            )
        now = datetime.now(timezone.utc)
        await self.repository.update_subscription(
            session,
            subscription,
            cancel_at_period_end=True,
            canceled_at=now,
        )
        return SubscriptionActionResponse(
            plan=subscription.plan,
            subscription_status=subscription.status,
            cancel_at_period_end=True,
            canceled_at=now,
            current_period_end=subscription.current_period_end,
            message=(
                "Cancellation is scheduled. Access continues until the end of "
                "the current paid period. Future renewal will stop."
            ),
            cancellation_summary=cancellation_summary(),
            cancellation_after_effect=cancellation_after_effect(),
            refund_summary=refund_summary(),
        )

    async def resume_subscription(
        self, session: AsyncSession, org_id: uuid.UUID
    ) -> SubscriptionActionResponse:
        org = await self.repository.get_org(session, org_id)
        if not org:
            raise ResourceNotFoundException("Organization not found")
        subscription = await self.repository.get_subscription(session, org_id)
        subscription = await self._expire_cancelled_if_due(session, org, subscription)
        if subscription is None or getattr(subscription, "cancel_at_period_end", False) is not True:
            raise ValidationException("This subscription is not scheduled to cancel.")
        if subscription.plan == Plan.FREE.value or subscription.status != "active":
            raise ValidationException(
                "The paid period has already ended. Subscribe again from checkout."
            )
        await self.repository.update_subscription(
            session,
            subscription,
            cancel_at_period_end=False,
            canceled_at=None,
        )
        return SubscriptionActionResponse(
            plan=subscription.plan,
            subscription_status=subscription.status,
            cancel_at_period_end=False,
            canceled_at=None,
            current_period_end=subscription.current_period_end,
            message="Cancellation was withdrawn. The subscription will renew at the end of the current period.",
            cancellation_summary=cancellation_summary(),
            cancellation_after_effect=cancellation_after_effect(),
            refund_summary=refund_summary(),
        )

    async def render_billing_document(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        transaction_id: uuid.UUID,
        kind: str,
    ) -> tuple[str, str]:
        org = await self.repository.get_org(session, org_id)
        if not org:
            raise ResourceNotFoundException("Organization not found")
        tx = await self.repository.get_transaction_for_org(
            session, org_id, transaction_id
        )
        if tx is None:
            raise ResourceNotFoundException("Transaction not found")
        email = await self._billing_email_for_org(session, org_id)
        if kind == "receipt":
            html = render_receipt(
                tx, organization_name=org.name, billing_email=email or tx.email
            )
        else:
            html = render_invoice(
                tx, organization_name=org.name, billing_email=email or tx.email
            )
            kind = "invoice"
        return html, filename_for(kind, tx)
