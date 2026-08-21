"""Partner-facing API — ``/v1/partners/*``.

Every route is scoped to the authenticated user's own partner account. The
partner is resolved server-side from the JWT; no endpoint accepts a
client-supplied ``partner_id`` ownership claim.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenException
from app.core.rate_limit import SlidingWindowRateLimiter, enforce_rate_limit
from app.db.session import get_db
from app.dependencies import get_current_user
from app.modules.partners.commissions import commission_service
from app.modules.partners.payouts import payout_service
from app.modules.partners.repository import (
    PartnerCommissionRepository,
    PartnerPayoutRepository,
    PartnerProfileRepository,
)
from app.modules.partners.schemas import (
    CommissionItem,
    CommissionListResponse,
    PartnerApplyRequest,
    PartnerDashboardResponse,
    PartnerProfileResponse,
    PayoutItem,
    PayoutListResponse,
    PayoutSettingsUpdateRequest,
    ReferralListResponse,
)
from app.modules.partners.service import partner_service
from app.modules.users.models import User

partners_router = APIRouter(prefix="/v1/partners", tags=["Partners"])

_apply_limiter = SlidingWindowRateLimiter(
    limit=5, window_seconds=3600, key_prefix="partner_apply"
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
