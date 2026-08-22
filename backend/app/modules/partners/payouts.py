"""Payout service for the Partner Referral program (v1).

Payouts are administratively driven in v1: an admin creates a payout from a
partner's payable balance and later marks it paid (or failed). The service
keeps the ledger consistent — payable commissions are reserved by a payout
and settle to ``paid`` only when the payout itself is marked paid.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.audit_log import AuditLogService
from app.core.exceptions import ResourceNotFoundException, ValidationException
from app.modules.partners.constants import CommissionStatus, PayoutStatus
from app.modules.partners.repository import (
    PartnerCommissionRepository,
    PartnerPayoutRepository,
    PartnerProfileRepository,
)
from app.modules.partners.service import _period_month

logger = logging.getLogger(__name__)


def describe_destination(partner) -> str:
    """Human-readable payout destination for notifications and emails.

    Never leaks a full bank account number — only the last four digits — while
    a crypto address is shown in full so the partner can verify it on-chain.
    """
    method = getattr(partner, "payout_method", None)
    if not method:
        return "your configured payout destination"
    if method == "bank":
        details = getattr(partner, "bank_details", None) or {}
        bank = details.get("bank_name") or "your bank account"
        acct = str(details.get("account_number") or "")
        return f"{bank} ••••{acct[-4:]}" if acct else bank
    label = {"crypto_usdc": "USDC", "crypto_usdt": "USDT"}.get(method, method)
    network = getattr(partner, "payout_network", None)
    address = getattr(partner, "wallet_address", None)
    parts = [label]
    if network:
        parts.append(f"on {network}")
    if address:
        parts.append(f"({address})")
    return " ".join(parts)


class PartnerPayoutService:
    def __init__(self) -> None:
        self.payout_repo = PartnerPayoutRepository()
        self.commission_repo = PartnerCommissionRepository()
        self.profile_repo = PartnerProfileRepository()

    @staticmethod
    async def _notify(partner, send) -> None:
        """Run a notification without ever failing the money transaction."""
        try:
            from app.modules.partners.notifications import (
                partner_notification_service,
            )

            await send(partner_notification_service)
        except Exception:  # pragma: no cover - defensive
            logger.exception(
                "Failed to send payout notification to partner %s", partner.id
            )

    async def payable_balance(
        self, session: AsyncSession, partner_id: uuid.UUID
    ) -> int:
        total = 0
        for commission in await self.commission_repo.payable_by_partner(
            session, partner_id
        ):
            total += commission.commission_amount_minor
        return total

    async def create_payout(
        self,
        session: AsyncSession,
        partner_id: uuid.UUID,
        amount_minor: int | None = None,
    ):
        partner = await self.profile_repo.get_by_id(session, partner_id)
        if partner is None:
            raise ResourceNotFoundException("Partner not found")

        payable = await self.commission_repo.payable_by_partner(session, partner_id)
        available = sum(c.commission_amount_minor for c in payable)
        amount = available if amount_minor is None else int(amount_minor)
        if amount <= 0 or amount > available:
            raise ValidationException(
                f"Payout amount must be between 1 and the payable balance ({available})"
            )

        # Apply the minimum payout threshold when the full balance is being
        # settled and it is below the configured minimum.
        if amount_minor is None and available < int(settings.PARTNER_MINIMUM_PAYOUT_MINOR):
            raise ValidationException(
                "Partner's payable balance is below the minimum payout threshold"
            )

        now = datetime.now(timezone.utc)
        payout = await self.payout_repo.create(
            session,
            partner_id=partner_id,
            amount_minor=amount,
            currency=settings.PARTNER_DEFAULT_CURRENCY,
            period=_period_month(now),
        )

        # Reserve payable commissions oldest-first until the payout amount
        # is covered. Reserved commissions stay "payable" (so the ledger
        # state machine is unchanged) but are excluded from future payouts.
        remaining = amount
        for commission in payable:
            if remaining <= 0:
                break
            take = min(commission.commission_amount_minor, remaining)
            remaining -= take
            await self.commission_repo.update(
                session, commission, payout_id=payout.id
            )

        await self._notify(
            partner,
            lambda svc: svc.payout_requested(
                session,
                partner_user_id=partner.user_id,
                amount_minor=amount,
                currency=payout.currency,
                destination=describe_destination(partner),
            ),
        )

        await AuditLogService.log_event(
            session=session,
            event_type="partner_payout_created",
            user_id=partner.user_id,
            resource_type="partner_payout",
            resource_id=str(payout.id),
            payload={"partner_id": str(partner_id), "amount_minor": amount},
        )
        return payout

    async def process_payout(
        self,
        session: AsyncSession,
        payout_id: uuid.UUID,
        action: str,
        transaction_reference: str | None,
    ):
        payout = await self.payout_repo.get_by_id(session, payout_id)
        if payout is None:
            raise ResourceNotFoundException("Payout not found")

        partner = await self.profile_repo.get_by_id(session, payout.partner_id)

        if action == "mark_paid":
            if not transaction_reference:
                raise ValidationException(
                    "transaction_reference is required to mark a payout paid"
                )
            now = datetime.now(timezone.utc)
            await self.payout_repo.update(
                session,
                payout,
                status=PayoutStatus.PAID.value,
                transaction_reference=transaction_reference,
                paid_at=now,
            )
            for commission in await self.commission_repo.commissions_for_payout(
                session, payout.id
            ):
                await self.commission_repo.update(
                    session,
                    commission,
                    status=CommissionStatus.PAID.value,
                    paid_at=now,
                )
            if partner is not None:
                await self._notify(
                    partner,
                    lambda svc: svc.payout_paid(
                        session,
                        partner_user_id=partner.user_id,
                        amount_minor=payout.amount_minor,
                        currency=payout.currency,
                        destination=describe_destination(partner),
                        transaction_reference=transaction_reference,
                    ),
                )
        elif action == "mark_failed":
            await self.payout_repo.update(
                session, payout, status=PayoutStatus.FAILED.value
            )
            # Return reserved commissions to the payable pool.
            #
            # NOTE: the repository's ``update`` helper skips ``None`` values,
            # so ``update(..., payout_id=None)`` is a silent no-op and would
            # strand the money forever — neither payable nor paid. The
            # reservation is therefore cleared directly on the model.
            for commission in await self.commission_repo.commissions_for_payout(
                session, payout.id
            ):
                commission.payout_id = None
                session.add(commission)
            await session.flush()
            if partner is not None:
                await self._notify(
                    partner,
                    lambda svc: svc.payout_failed(
                        session,
                        partner_user_id=partner.user_id,
                        amount_minor=payout.amount_minor,
                        currency=payout.currency,
                    ),
                )
        else:
            raise ValidationException(f"Unsupported payout action: {action}")

        await AuditLogService.log_event(
            session=session,
            event_type=f"partner_payout_{action}",
            resource_type="partner_payout",
            resource_id=str(payout.id),
            payload={
                "action": action,
                "transaction_reference": transaction_reference,
            },
        )
        return payout


payout_service = PartnerPayoutService()
