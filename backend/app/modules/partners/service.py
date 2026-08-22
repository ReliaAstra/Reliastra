"""Business logic for the Partner Referral program (v1).

The entire economic model is one sentence: a partner shares one referral
link; a customer signs up through it and subscribes; the partner earns a
recurring commission while the customer stays subscribed.

No commission math lives in routers — it all lives here and in
:mod:`app.modules.partners.commissions`.
"""

from __future__ import annotations

import logging
import secrets
import string
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.audit_log import AuditLogService
from app.core.exceptions import (
    ForbiddenException,
    ResourceNotFoundException,
    ValidationException,
)
from app.core.security import verify_password
from app.modules.partners.destination import (
    decrypt_bank_details,
    decrypt_text,
    describe_destination,
    encrypt_bank_details,
    encrypt_text,
    mask_bank_details,
    mask_wallet,
)
from app.modules.partners.constants import PartnerStatus, ReferralStatus
from app.modules.partners.models import (
    PartnerCommission,
    PartnerProfile,
    PartnerReferral,
)
from app.modules.partners.repository import (
    PartnerCommissionRepository,
    PartnerProfileRepository,
    PartnerReferralRepository,
)
from app.modules.partners.schemas import (
    PartnerDashboardResponse,
    PartnerProfileResponse,
    PayoutSettingsUpdateRequest,
    ReferralItem,
    ReferralListResponse,
)
from app.modules.referrals.repository import ReferralCodeRepository
from app.modules.users.repository import UserRepository

logger = logging.getLogger(__name__)

_CODE_CHARS = string.ascii_uppercase + string.digits


def _code_fragment(length: int = 4) -> str:
    return "".join(secrets.choice(_CODE_CHARS) for _ in range(length))


def _build_referral_code(full_name: str) -> str:
    """Build a referral code in the same format as the PLG referral system:
    ``<4-char name prefix>-<4 random chars>`` (e.g. ``ALEX-7X2K``)."""
    cleaned = "".join(c for c in full_name if c.isalpha()).upper()
    prefix = cleaned[:4] if len(cleaned) >= 4 else cleaned.ljust(4, "X")
    return f"{prefix}-{_code_fragment(4)}"


def _period_month(moment: datetime) -> str:
    as_utc = moment.astimezone(timezone.utc) if moment.tzinfo else moment
    return f"{as_utc.year:04d}-{as_utc.month:02d}"


def mask_email(email: str) -> str:
    """Mask an email address for partner-facing display: ``a***@example.com``."""
    if not email or "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    head = local[0] if local else "*"
    return f"{head}***@{domain}"


def apply_rate(amount_minor: int, rate_pct: int) -> int:
    """Compute ``rate_pct``% of ``amount_minor`` with integer half-up rounding.

    Never uses floating point. 4900 minor at 30% -> 1470 minor.
    """
    return (int(amount_minor) * int(rate_pct) + 50) // 100


class PartnerService:
    def __init__(self) -> None:
        self.profile_repo = PartnerProfileRepository()
        self.referral_repo = PartnerReferralRepository()
        self.commission_repo = PartnerCommissionRepository()
        self.code_repo = ReferralCodeRepository()

    # ── Activation ────────────────────────────────────────────────────────

    async def activate_partner(
        self, session: AsyncSession, user, agree_terms: bool
    ) -> PartnerProfileResponse:
        """Activate the referral program for a user (idempotent).

        If the user is already a partner their existing profile is returned
        instead of creating a duplicate. A referral code is ensured first
        (reusing the PLG ``referral_codes`` identity), then the partner
        profile is linked to it.
        """
        existing = await self.profile_repo.get_by_user_id(session, user.id)
        if existing:
            return await self._to_profile_response(session, existing)

        if not agree_terms:
            raise ValidationException("You must agree to the partner terms")

        code = await self.code_repo.get_by_user_id(session, user.id)
        if code is None:
            code = await self._create_unique_code(session, user.id, user.full_name)

        profile = await self.profile_repo.create(
            session, user_id=user.id, referral_code_id=code.id
        )
        await AuditLogService.log_event(
            session=session,
            event_type="partner_activated",
            user_id=user.id,
            resource_type="partner",
            resource_id=str(profile.id),
            payload={"referral_code": code.code},
        )
        return await self._to_profile_response(session, profile)

    async def _create_unique_code(
        self, session: AsyncSession, user_id: uuid.UUID, full_name: str
    ):
        for _ in range(10):
            candidate = _build_referral_code(full_name)
            if not await self.code_repo.code_exists(session, candidate):
                return await self.code_repo.create(session, user_id, candidate)
        raise ValidationException("Unable to generate a unique referral code")

    # ── Profile ───────────────────────────────────────────────────────────

    async def get_partner_for_user(
        self, session: AsyncSession, user_id: uuid.UUID
    ) -> PartnerProfile:
        profile = await self.profile_repo.get_by_user_id(session, user_id)
        if profile is None:
            raise ResourceNotFoundException(
                "Partner profile not found — activate the referral program first"
            )
        return profile

    async def get_my_profile(
        self, session: AsyncSession, user_id: uuid.UUID
    ) -> PartnerProfileResponse:
        profile = await self.get_partner_for_user(session, user_id)
        return await self._to_profile_response(session, profile)

    async def update_payout_settings(
        self,
        session: AsyncSession,
        user_id: uuid.UUID,
        body: PayoutSettingsUpdateRequest,
    ) -> PartnerProfileResponse:
        """Persist a partner's payout destination.

        Crypto methods require a wallet address (and optionally a network);
        bank transfers require structured ``bank_details``. Clearing a
        method is not supported through this endpoint — a partner may switch
        methods, which replaces the destination wholesale.

        This is the highest-risk write in the program: whoever controls the
        destination receives the money. So the change is (a) re-authenticated
        with the account password, (b) stored encrypted, (c) announced to the
        partner out-of-band, and (d) subject to a cool-down before it can be
        paid out.
        """
        profile = await self.get_partner_for_user(session, user_id)
        user = await UserRepository.get_by_id(session, user_id)
        if user is None:
            raise ResourceNotFoundException("User not found")

        # Re-authenticate password-based accounts. Federated accounts (Supabase
        # / OAuth) have no local password to check — their identity provider
        # already gates the session — so they are exempt rather than locked out.
        if user.password_hash:
            if not body.current_password:
                raise ValidationException(
                    "Confirm your account password to change your payout destination"
                )
            if not verify_password(body.current_password, user.password_hash):
                raise ForbiddenException("Incorrect account password")

        previous_summary = describe_destination(profile)
        had_destination = bool(profile.payout_method)

        # Assign directly (rather than via ``profile_repo.update``) because a
        # method switch must clear the previously configured destination —
        # e.g. ``bank`` → ``crypto_usdc`` has to null out ``bank_details`` and
        # vice-versa, and the repo's ``update`` helper skips ``None`` values.
        if body.payout_method in ("crypto_usdc", "crypto_usdt"):
            address = (body.wallet_address or "").strip()
            if not address:
                raise ValidationException(
                    "A wallet address is required for crypto payouts"
                )
            profile.payout_method = body.payout_method
            profile.wallet_address = encrypt_text(address)
            profile.payout_network = (body.network or "").strip() or None
            profile.bank_details = None
        else:  # bank
            details = body.bank_details or {}
            if not details.get("account_number") or not details.get("bank_name"):
                raise ValidationException(
                    "Bank name and account number are required for bank transfers"
                )
            profile.payout_method = "bank"
            profile.wallet_address = None
            profile.payout_network = None
            profile.bank_details = encrypt_bank_details(
                {
                    k: v
                    for k, v in {
                        "account_name": details.get("account_name"),
                        "bank_name": details.get("bank_name"),
                        "account_number": details.get("account_number"),
                        "routing_number": details.get("routing_number"),
                        "swift_bic": details.get("swift_bic"),
                    }.items()
                    if v is not None
                }
            )

        profile.payout_details_updated_at = datetime.now(timezone.utc)
        session.add(profile)
        await session.flush()

        await AuditLogService.log_event(
            session=session,
            event_type="partner_payout_settings_updated",
            user_id=user_id,
            resource_type="partner",
            resource_id=str(profile.id),
            # Never write the destination itself into the audit payload — the
            # masked summary is enough to reconstruct what happened.
            payload={
                "payout_method": body.payout_method,
                "previous_destination": previous_summary if had_destination else None,
                "new_destination": describe_destination(profile),
            },
        )

        # Tell the partner out-of-band. If this change was not theirs, this
        # notification (plus the cool-down) is their chance to catch it.
        try:
            from app.modules.partners.notifications import (
                partner_notification_service,
            )

            await partner_notification_service.payout_destination_changed(
                session,
                partner_user_id=user_id,
                destination=describe_destination(profile),
                cooldown_hours=int(
                    settings.PARTNER_PAYOUT_DESTINATION_COOLDOWN_HOURS
                ),
            )
        except Exception:  # pragma: no cover - defensive
            logger.exception(
                "Failed to notify partner %s of payout destination change",
                profile.id,
            )

        return await self._to_profile_response(session, profile)

    async def _to_profile_response(
        self, session: AsyncSession, profile: PartnerProfile
    ) -> PartnerProfileResponse:
        code = ""
        if profile.referral_code_id:
            from app.modules.referrals.models import ReferralCode

            result = await session.execute(
                select(ReferralCode).where(ReferralCode.id == profile.referral_code_id)
            )
            rc = result.scalar_one_or_none()
            code = rc.code if rc else ""
        return PartnerProfileResponse(
            partner_id=profile.id,
            referral_code=code,
            referral_link=f"{settings.partner_referral_base_url}/{code}",
            commission_rate=int(settings.PARTNER_COMMISSION_RATE),
            status=profile.status,
            created_at=profile.created_at,
            payout_method=profile.payout_method,
            # Masked: the partner already knows their own address, and a
            # hijacked session should not be able to read it back out.
            wallet_address=mask_wallet(decrypt_text(profile.wallet_address)),
            payout_network=profile.payout_network,
            bank_details=mask_bank_details(
                decrypt_bank_details(profile.bank_details)
            ),
            payout_details_updated_at=profile.payout_details_updated_at,
            payout_destination=(
                describe_destination(profile) if profile.payout_method else None
            ),
        )

    # ── Dashboard ─────────────────────────────────────────────────────────

    async def get_dashboard(
        self, session: AsyncSession, user_id: uuid.UUID
    ) -> PartnerDashboardResponse:
        profile = await self.get_partner_for_user(session, user_id)
        code = (await self._to_profile_response(session, profile)).referral_code
        referral_link = f"{settings.partner_referral_base_url}/{code}"

        signups = await self.referral_repo.count_by_partner(session, profile.id)
        active_paid = await self.referral_repo.count_by_partner(
            session, profile.id, status=ReferralStatus.PAID.value
        )
        now_period = _period_month(datetime.now(timezone.utc))

        monthly = await self.commission_repo.sum_amount_by_partner(
            session, profile.id, statuses=[], period=now_period
        )
        pending = await self.commission_repo.sum_amount_by_partner(
            session,
            profile.id,
            statuses=["pending", "payable"],
            exclude_reversed=True,
        )
        total_earned = await self.commission_repo.sum_amount_by_partner(
            session, profile.id, statuses=[]
        )
        total_paid = await self.commission_repo.sum_amount_by_partner(
            session, profile.id, statuses=["paid"]
        )

        # The withdrawable figure is *not* ``pending`` — that sum includes
        # commissions still inside the hold period and commissions already
        # reserved by an open payout. Only released, unreserved commissions
        # can actually be paid out.
        from app.modules.partners.payouts import payout_service

        payable_balance = await payout_service.payable_balance(session, profile.id)
        in_transit = await self.commission_repo.sum_amount_by_partner(
            session,
            profile.id,
            statuses=["payable"],
            exclude_reversed=True,
        ) - payable_balance

        return PartnerDashboardResponse(
            referral_link=referral_link,
            clicks=profile.click_count,
            signups=signups,
            active_paid_customers=active_paid,
            monthly_commission_minor=monthly,
            pending_commission_minor=pending,
            payable_balance_minor=payable_balance,
            in_transit_minor=max(in_transit, 0),
            total_earned_minor=total_earned,
            total_paid_minor=total_paid,
            minimum_payout_minor=int(settings.PARTNER_MINIMUM_PAYOUT_MINOR),
            currency=settings.PARTNER_DEFAULT_CURRENCY,
        )

    # ── Referrals ─────────────────────────────────────────────────────────

    async def list_referrals(
        self,
        session: AsyncSession,
        user_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> ReferralListResponse:
        profile = await self.get_partner_for_user(session, user_id)
        offset = (page - 1) * page_size
        referrals, total = await self.referral_repo.list_by_partner(
            session, profile.id, offset=offset, limit=page_size
        )
        items: list[ReferralItem] = []
        for ref in referrals:
            items.append(await self._referral_item(session, ref))
        return ReferralListResponse(
            items=items, page=page, page_size=page_size, total=total
        )

    async def _referral_item(
        self, session: AsyncSession, ref: PartnerReferral
    ) -> ReferralItem:
        user = await UserRepository.get_by_id(session, ref.referred_user_id)
        masked = mask_email(user.email) if user else None

        plan = None
        org_name = None
        if ref.referred_org_id:
            from app.modules.organizations.repository import OrganizationRepository

            org = await OrganizationRepository.get_by_id(session, ref.referred_org_id)
            if org:
                plan = org.plan
                org_name = org.name

        subscription_minor = 0
        commission_minor = 0
        latest = await session.execute(
            select(PartnerCommission)
            .where(
                PartnerCommission.partner_id == ref.partner_id,
                PartnerCommission.referral_id == ref.id,
                PartnerCommission.status != "reversed",
            )
            .order_by(PartnerCommission.created_at.desc())
            .limit(1)
        )
        row = latest.scalar_one_or_none()
        if row:
            subscription_minor = row.subscription_amount_minor
            commission_minor = row.commission_amount_minor

        return ReferralItem(
            referral_id=ref.id,
            status=ref.status,
            plan=plan,
            subscription_amount_minor=subscription_minor,
            commission_rate=int(settings.PARTNER_COMMISSION_RATE),
            monthly_commission_minor=commission_minor,
            masked_email=masked,
            organization_name=org_name,
            created_at=ref.created_at,
            subscribed_at=ref.subscribed_at,
        )

    # ── Attribution binding (called at registration) ──────────────────────

    async def bind_referral(
        self,
        session: AsyncSession,
        *,
        referral_code: str,
        new_user_id: uuid.UUID,
        new_org_id: uuid.UUID | None,
    ) -> PartnerReferral | None:
        """Link a newly registered user to the partner who referred them.

        Returns ``None`` (no-op) when the code is unknown, when the user
        referred themselves, or when the partner is not eligible to earn.
        Idempotent: a repeated registration cannot create a duplicate.
        """
        code_obj = await self.code_repo.get_by_code(session, referral_code)
        if code_obj is None:
            return None

        partner = await self.profile_repo.get_by_user_id(session, code_obj.user_id)
        if partner is None:
            return None
        if partner.status != PartnerStatus.ACTIVE.value:
            logger.warning("Rejected referral from non-active partner %s", partner.id)
            return None
        if partner.user_id == new_user_id:
            logger.warning("User %s attempted to refer themselves", new_user_id)
            return None
        existing = await self.referral_repo.get_by_referred_user(session, new_user_id)
        if existing is not None:
            return existing

        referral = await self.referral_repo.create(
            session,
            partner_id=partner.id,
            referred_user_id=new_user_id,
            referred_org_id=new_org_id,
            status=ReferralStatus.SIGNED_UP.value,
        )
        await AuditLogService.log_event(
            session=session,
            event_type="partner_referral_created",
            user_id=partner.user_id,
            resource_type="partner_referral",
            resource_id=str(referral.id),
            payload={
                "partner_id": str(partner.id),
                "referred_user_id": str(new_user_id),
                "referral_code": code_obj.code,
            },
        )

        # Tell the partner someone used their link (in-app always, email when
        # their preferences allow it). Never let a notification failure undo
        # the referral itself.
        try:
            from app.modules.partners.notifications import (
                partner_notification_service,
            )

            referred_user = await UserRepository.get_by_id(session, new_user_id)
            await partner_notification_service.referral_signup(
                session,
                partner_user_id=partner.user_id,
                referred_email=mask_email(referred_user.email)
                if referred_user and referred_user.email
                else None,
            )
        except Exception:  # pragma: no cover - defensive
            logger.exception("Failed to notify partner %s of referral", partner.id)

        return referral


partner_service = PartnerService()
