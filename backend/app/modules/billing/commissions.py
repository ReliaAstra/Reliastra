"""Partner commissions: record on payment, reverse on refund, churn on cancel.

Stateless helpers over the partner tables - called by verification (record)
and webhooks (reverse on refund/dispute, churn on subscription disable).
"""

import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.paystack import _parse_datetime

logger = logging.getLogger(__name__)


class PartnerCommissions:
    """Stateless partner-ledger effects (record / reverse / churn)."""

    @staticmethod
    async def _record_partner_commission(
        session: AsyncSession,
        org_id: uuid.UUID,
        data: dict[str, Any],
        reference: str,
    ) -> None:
        """Convert a verified payment into a partner commission.

        Failures here must never fail the payment itself - the customer has
        already paid and their plan must be provisioned.
        """
        try:
            collected = data.get("amount")
            if not collected:
                return

            from app.modules.partners.commissions import commission_service

            paid_at = _parse_datetime(data.get("paid_at"))

            await commission_service.record_payment(
                session,
                organization_id=org_id,
                collected_minor=int(collected),
                currency=str(data.get("currency") or "USD").upper()[:3],
                payment_reference=reference,
                paid_at=paid_at,
                payment_provider="paystack",
            )
        except Exception:
            logger.exception(
                "Partner commission processing failed for payment %s",
                reference,
            )

    @staticmethod
    async def _reverse_partner_commissions(
        session: AsyncSession, data: dict[str, Any], reason: str
    ) -> None:
        """Reverse partner commissions after a refund or chargeback.

        The original commission rows are never deleted - their status is set
        to ``reversed``.
        """
        try:
            transaction = data.get("transaction")
            transaction = transaction if isinstance(transaction, dict) else {}
            reference = (
                data.get("transaction_reference")
                or data.get("reference")
                or transaction.get("reference")
            )
            if not reference:
                logger.info("Ignoring %s event without a transaction reference", reason)
                return

            from app.modules.partners.commissions import commission_service

            count = await commission_service.reverse_by_reference(
                session,
                payment_reference=str(reference),
                reason=reason,
            )
            if count:
                logger.info(
                    "Reversed %d partner commissions for %s (%s)",
                    count,
                    reference,
                    reason,
                )
        except Exception:
            logger.exception("Partner commission reversal failed for %s", reason)

    @staticmethod
    async def _handle_partner_churn(
        session: AsyncSession, data: dict[str, Any]
    ) -> None:
        try:
            customer = data.get("customer")
            customer = customer if isinstance(customer, dict) else {}
            customer_code = customer.get("customer_code")
            if not customer_code:
                return

            from app.modules.billing.repository import BillingRepository
            from app.modules.partners.commissions import commission_service

            org = await BillingRepository.get_org_by_provider_customer(
                session, str(customer_code)
            )
            if org is None:
                return
            await commission_service.handle_churn(session, organization_id=org.id)
        except Exception:
            logger.exception("Partner churn handling failed")
