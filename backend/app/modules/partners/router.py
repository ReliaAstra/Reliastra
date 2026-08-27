"""Partner-facing API — ``/v1/partners/*``.

Every route is scoped to the authenticated user's own partner account. The
partner is resolved server-side from the JWT; no endpoint accepts a
client-supplied ``partner_id`` ownership claim.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenException, ResourceNotFoundException
from app.core.rate_limit import SlidingWindowRateLimiter, enforce_rate_limit
from app.db.session import get_db
from app.dependencies import get_current_user
from app.modules.partners.commissions import commission_service
from app.modules.partners.notifications import partner_notification_service
from app.modules.partners.payouts import payout_service
from app.modules.partners.repository import (
    PartnerCommissionRepository,
    PartnerPayoutRepository,
    PartnerProfileRepository,
)
from app.modules.partners.schemas import (
    CommissionItem,
    CommissionListResponse,
    NotificationItem,
    NotificationListResponse,
    NotificationMarkReadRequest,
    NotificationPreferencesResponse,
    NotificationPreferencesUpdateRequest,
    NotificationUnreadCountResponse,
    PartnerAnalyticsResponse,
    PartnerApplyRequest,
    PartnerDashboardResponse,
    PartnerProfileResponse,
    PartnerTicketCreateRequest,
    PartnerTicketDetailResponse,
    PartnerTicketListResponse,
    PartnerTicketMessageCreateRequest,
    PartnerTicketMessageItem,
    PayoutItem,
    PayoutListResponse,
    PayoutSettingsUpdateRequest,
    ReferralDetailResponse,
    ReferralListResponse,
)
from app.modules.partners.service import partner_service
from app.modules.partners.support import partner_support_service
from app.modules.users.models import User

partners_router = APIRouter(prefix="/v1/partners", tags=["Partners"])

_apply_limiter = SlidingWindowRateLimiter(
    limit=5, window_seconds=3600, key_prefix="partner_apply"
)
_support_limiter = SlidingWindowRateLimiter(
    limit=10, window_seconds=3600, key_prefix="partner_support_ticket"
)
_support_message_limiter = SlidingWindowRateLimiter(
    limit=60, window_seconds=3600, key_prefix="partner_support_message"
)


async def require_partner_user(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> User:
    """Authenticate a human partner, never an organization API key."""
    if getattr(request.state, "auth_method", None) == "apikey":
        raise ForbiddenException(
            "Organization API keys cannot access partner self-service routes"
        )
    return current_user


@partners_router.post(
    "/apply",
    response_model=PartnerProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Activate the referral program",
)
async def apply(
    request: Request,
    body: PartnerApplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> PartnerProfileResponse:
    """Opt into the referral program and get a referral link.

    Idempotent — an existing partner receives their current profile.
    """
    await enforce_rate_limit(request, _apply_limiter)
    return await partner_service.activate_partner(db, current_user, body.agree_terms)


@partners_router.get(
    "/me", response_model=PartnerProfileResponse, summary="Get my partner profile"
)
async def get_me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> PartnerProfileResponse:
    return await partner_service.get_my_profile(db, current_user.id)


@partners_router.put(
    "/payout-settings",
    response_model=PartnerProfileResponse,
    summary="Save payout destination (wallet / bank)",
)
async def update_payout_settings(
    body: PayoutSettingsUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> PartnerProfileResponse:
    """Persist how the partner wants to be paid.

    Crypto methods require ``wallet_address`` (and optionally ``network``);
    ``bank`` requires ``bank_details`` with at least ``bank_name`` and
    ``account_number``. The admin panel surfaces this destination when
    settling payouts.
    """
    return await partner_service.update_payout_settings(
        db, current_user.id, body
    )


@partners_router.get(
    "/dashboard",
    response_model=PartnerDashboardResponse,
    summary="Partner dashboard summary",
)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> PartnerDashboardResponse:
    return await partner_service.get_dashboard(db, current_user.id)


@partners_router.get(
    "/referrals", response_model=ReferralListResponse, summary="List my referrals"
)
async def list_referrals(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> ReferralListResponse:
    return await partner_service.list_referrals(
        db, current_user.id, page=page, page_size=page_size
    )


@partners_router.get(
    "/referrals/{referral_id}",
    response_model=ReferralDetailResponse,
    summary="Referral detail with timeline",
)
async def get_referral_detail(
    referral_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> ReferralDetailResponse:
    return await partner_service.get_referral_detail(
        db, current_user.id, referral_id
    )


@partners_router.get(
    "/analytics",
    response_model=PartnerAnalyticsResponse,
    summary="Partner analytics (attribution, funnel, trend)",
)
async def get_analytics(
    days: int = Query(default=30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> PartnerAnalyticsResponse:
    return await partner_service.get_analytics(db, current_user.id, days=days)


@partners_router.get(
    "/commissions",
    response_model=CommissionListResponse,
    summary="Commission ledger",
)
async def list_commissions(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> CommissionListResponse:
    profile = await partner_service.get_partner_for_user(db, current_user.id)
    offset = (page - 1) * page_size
    rows, total = await PartnerCommissionRepository.list_by_partner(
        db, profile.id, offset=offset, limit=page_size
    )
    items = [
        CommissionItem(
            id=c.id,
            referral_id=c.referral_id,
            period=c.period,
            subscription_amount_minor=c.subscription_amount_minor,
            commission_rate=c.rate,
            commission_amount_minor=c.commission_amount_minor,
            currency=c.currency,
            status=c.status,
            created_at=c.created_at,
            payable_at=c.payable_at,
            paid_at=c.paid_at,
        )
        for c in rows
    ]
    return CommissionListResponse(
        items=items, page=page, page_size=page_size, total=total
    )


@partners_router.get(
    "/payouts", response_model=PayoutListResponse, summary="My payouts"
)
async def list_payouts(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> PayoutListResponse:
    profile = await partner_service.get_partner_for_user(db, current_user.id)
    offset = (page - 1) * page_size
    rows, total = await PartnerPayoutRepository.list_by_partner(
        db, profile.id, offset=offset, limit=page_size
    )
    items = [
        PayoutItem(
            id=p.id,
            period=p.period,
            amount_minor=p.amount_minor,
            currency=p.currency,
            status=p.status,
            paid_at=p.paid_at,
            transaction_reference=p.transaction_reference,
        )
        for p in rows
    ]
    return PayoutListResponse(items=items, page=page, page_size=page_size, total=total)


@partners_router.post(
    "/payouts/request",
    response_model=PayoutItem,
    status_code=status.HTTP_201_CREATED,
    summary="Request a payout of the full payable balance",
)
async def request_payout(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> PayoutItem:
    """Create a pending payout for the partner's entire payable balance.

    The request is *administratively settled* in v1 — an admin still marks the
    payout paid. A payout destination must be configured first (see
    ``PUT /v1/partners/payout-settings``).
    """
    profile = await partner_service.get_partner_for_user(db, current_user.id)
    if not profile.payout_method:
        raise ForbiddenException(
            "Configure a payout method in Settings → Payout Info before requesting a payout"
        )
    payout = await payout_service.create_payout(db, profile.id)
    return PayoutItem(
        id=payout.id,
        period=payout.period,
        amount_minor=payout.amount_minor,
        currency=payout.currency,
        status=payout.status,
        paid_at=payout.paid_at,
        transaction_reference=payout.transaction_reference,
    )


# ═══════════════════════════ Notifications ═══════════════════════════════


@partners_router.get(
    "/notifications",
    response_model=NotificationListResponse,
    summary="My notification feed",
)
async def list_notifications(
    unread_only: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> NotificationListResponse:
    """Every partner-program event that concerns this partner.

    The dashboard polls this endpoint; when a new unread item appears it can
    also raise a browser (Chrome) notification if the partner opted in via
    ``PUT /v1/partners/notification-preferences``.
    """
    rows, total = await partner_notification_service.list_for_user(
        db, current_user.id, unread_only=unread_only, page=page, page_size=page_size
    )
    unread = await partner_notification_service.unread_count(db, current_user.id)
    return NotificationListResponse(
        items=[
            NotificationItem(
                id=notification.id,
                event=notification.notification_type,
                title=notification.title,
                body=notification.body,
                action_url=notification.action_url,
                action_label=notification.action_label,
                priority=notification.priority,
                is_read=delivery.is_read,
                created_at=notification.created_at,
            )
            for notification, delivery in rows
        ],
        page=page,
        page_size=page_size,
        total=total,
        unread=unread,
    )


@partners_router.get(
    "/notifications/unread-count",
    response_model=NotificationUnreadCountResponse,
    summary="Unread notification count",
)
async def notifications_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> NotificationUnreadCountResponse:
    return NotificationUnreadCountResponse(
        unread=await partner_notification_service.unread_count(db, current_user.id)
    )


@partners_router.post(
    "/notifications/read",
    response_model=NotificationUnreadCountResponse,
    summary="Mark notifications read",
)
async def mark_notifications_read(
    body: NotificationMarkReadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> NotificationUnreadCountResponse:
    await partner_notification_service.mark_read(
        db, current_user.id, body.notification_ids or None
    )
    return NotificationUnreadCountResponse(
        unread=await partner_notification_service.unread_count(db, current_user.id)
    )


@partners_router.delete(
    "/notifications/{notification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Dismiss a notification",
)
async def dismiss_notification(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> None:
    dismissed = await partner_notification_service.dismiss(
        db, current_user.id, notification_id
    )
    if dismissed == 0:
        raise ResourceNotFoundException("Notification not found")


@partners_router.get(
    "/notification-preferences",
    response_model=NotificationPreferencesResponse,
    summary="Get notification preferences",
)
async def get_notification_preferences(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> NotificationPreferencesResponse:
    prefs = await partner_notification_service.get_preferences(db, current_user.id)
    return NotificationPreferencesResponse.model_validate(prefs, from_attributes=True)


@partners_router.put(
    "/notification-preferences",
    response_model=NotificationPreferencesResponse,
    summary="Update notification preferences",
)
async def update_notification_preferences(
    body: NotificationPreferencesUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> NotificationPreferencesResponse:
    """Persist which events send an email, and the browser-push opt-in.

    In-app notifications are always delivered — they are the partner's record
    of what happened — so there is no switch to turn them off.
    """
    prefs = await partner_notification_service.update_preferences(
        db, current_user.id, body.model_dump(exclude_none=True)
    )
    return NotificationPreferencesResponse.model_validate(prefs, from_attributes=True)


# ═══════════════════════════ Support desk ════════════════════════════════


@partners_router.get(
    "/support/tickets",
    response_model=PartnerTicketListResponse,
    summary="My support conversations",
)
async def list_support_tickets(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> PartnerTicketListResponse:
    return await partner_support_service.list_tickets(
        db, current_user.id, page=page, page_size=page_size
    )


@partners_router.post(
    "/support/tickets",
    response_model=PartnerTicketDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start a support conversation",
)
async def create_support_ticket(
    request: Request,
    body: PartnerTicketCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> PartnerTicketDetailResponse:
    """Open a ticket that lands directly in the admin support queue.

    The conversation is live in both directions: the admin sees it at
    ``/admin/support`` and any reply appears in the partner's dashboard.
    """
    await enforce_rate_limit(request, _support_limiter)
    return await partner_support_service.create_ticket(
        db,
        current_user,
        subject=body.subject,
        message=body.message,
        priority=body.priority,
    )


@partners_router.get(
    "/support/tickets/{ticket_id}",
    response_model=PartnerTicketDetailResponse,
    summary="Conversation thread",
)
async def get_support_thread(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> PartnerTicketDetailResponse:
    return await partner_support_service.get_thread(db, current_user.id, ticket_id)


@partners_router.post(
    "/support/tickets/{ticket_id}/messages",
    response_model=PartnerTicketMessageItem,
    status_code=status.HTTP_201_CREATED,
    summary="Reply in a conversation",
)
async def add_support_message(
    request: Request,
    ticket_id: uuid.UUID,
    body: PartnerTicketMessageCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_partner_user),
) -> PartnerTicketMessageItem:
    await enforce_rate_limit(request, _support_message_limiter)
    return await partner_support_service.add_message(
        db, current_user, ticket_id, body.body
    )
