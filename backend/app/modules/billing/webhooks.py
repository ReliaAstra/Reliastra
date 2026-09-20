"""Paystack webhooks: idempotent event intake and subscription sync.

Claims each event id exactly once (Redis SET-NX), routes
``charge.success`` through verification, flags refunds/disputes, and keeps
the local subscription row in sync with the provider (create/update on
subscription events, deactivate on disable).
"""

import hashlib
import hmac
import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import (
    ServiceUnavailableException,
    UnauthorizedException,
)
from app.modules.billing.commissions import PartnerCommissions
from app.modules.billing.paystack import (
    _billing_interval,
    _normalized_plan,
    _parse_datetime,
    _resolve_period_end,
    transaction_metadata,
)
from app.modules.billing.repository import BillingRepository
from app.modules.billing.schemas import (
    PaystackWebhookResponse,
)
from app.modules.billing.verification import BillingVerification
from app.platform.commercial.entitlements import (
    Plan,
)

logger = logging.getLogger(__name__)


class BillingWebhooks:
    """Idempotent Paystack event intake; delegates money effects."""

    def __init__(
        self,
        repository: BillingRepository,
        verification: BillingVerification,
        commissions: PartnerCommissions,
    ) -> None:
        self.repository = repository
        self._verification = verification
        self._commissions = commissions

    @staticmethod
    def _webhook_event_id(payload: dict[str, Any]) -> str | None:
        """Stable per-event identifier for idempotency (FIX 31)."""
        data = payload.get("data")
        data = data if isinstance(data, dict) else {}
        event_type = str(payload.get("event", ""))
        event_id = (
            data.get("id")
            or data.get("event_id")
            or data.get("reference")
            or data.get("subscription_code")
        )
        if not event_type or not event_id:
            return None
        return f"{event_type}:{event_id}"

    async def _claim_webhook_event(self, event_id: str) -> bool | None:
        """Claim *event_id* for processing. Tri-state - see the return values.

        Uses a Redis SET-NX with a 24h TTL so Paystack retries (which resend
        the same event) never double-process ``charge.success``.

        Returns:
            True  - claimed; this delivery should be processed.
            False - the event was already processed; skip it.
            None  - the idempotency store is unreachable, so we cannot tell.

        ``None`` is deliberately NOT collapsed into either bool. The caller
        must decide, because both defaults are wrong: treating it as a
        duplicate drops the payment, and treating it as claimed processes a
        money event with no duplicate protection at all.
        """
        from app.infrastructure.redis_client import safe_redis_claim

        return await safe_redis_claim(f"paystack:event:{event_id}", ex=24 * 3600)

    async def handle_webhook(
        self,
        session: AsyncSession,
        payload: dict[str, Any],
        signature: str | None = None,
        raw_body: bytes | None = None,
    ) -> PaystackWebhookResponse:
        if not signature:
            raise UnauthorizedException("Missing Paystack webhook signature")
        if not raw_body:
            raise UnauthorizedException("Missing raw request body")
        if not settings.PAYSTACK_SECRET_KEY:
            raise UnauthorizedException("Paystack webhook secret is not configured")

        expected = hmac.new(
            settings.PAYSTACK_SECRET_KEY.encode("utf-8"),
            raw_body,
            hashlib.sha512,
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise UnauthorizedException("Invalid Paystack webhook signature")

        event_type = str(payload.get("event", ""))
        data = payload.get("data")
        data = data if isinstance(data, dict) else {}
        logger.info("Received verified Paystack webhook: %s", event_type)

        # FIX 31: idempotency - skip events already processed in the last 24h.
        event_id = self._webhook_event_id(payload)
        if event_id:
            claimed = await self._claim_webhook_event(event_id)
            if claimed is False:
                logger.info("Skipping duplicate Paystack webhook event %s", event_id)
                return PaystackWebhookResponse(received=True, event_type=event_type)
            if claimed is None:
                # The idempotency store is down, so this delivery cannot be
                # de-duplicated. Refuse it instead of guessing.
                #
                # Answering 200 would permanently tell Paystack the event was
                # accepted, and every unprocessed payment, refund and
                # chargeback would be lost with no way to replay it. A 503
                # keeps the event in Paystack's retry queue until the store
                # recovers. The customer-facing /billing/verify path also
                # provisions independently, so this defers work rather than
                # losing it.
                logger.error(
                    "Paystack webhook idempotency store unavailable - refusing "
                    "event %s (type=%s) so Paystack retries it",
                    event_id,
                    event_type,
                    extra={"event_id": event_id, "event_type": event_type},
                )
                raise ServiceUnavailableException(
                    "Webhook idempotency store unavailable; please retry"
                )

        if event_type == "charge.success" and data.get("reference"):
            await self._verification.verify_transaction(session, str(data["reference"]))
        elif event_type == "subscription.create":
            await self._upsert_webhook_subscription(session, data)
        elif event_type in {"subscription.disable", "subscription.not_renew"}:
            await self._disable_webhook_subscription(session, data)
            # Churn stops future partner accrual but never reverses
            # commissions on revenue that was collected and kept.
            await self._commissions._handle_partner_churn(session, data)
        elif event_type in {"refund.processed", "charge.refunded"}:
            await self._commissions._reverse_partner_commissions(session, data, "refund")
            # The persisted transaction record must tell the truth about the
            # money: a refunded payment is flagged in the history the
            # customer sees on the billing page.
            await self._mark_transaction_status(session, data, "refunded")
            # A refunded payment must not keep the paid plan active. Mirror
            # the churn behaviour: mark the subscription inactive and drop
            # the organization back to the free plan.
            await self._disable_webhook_subscription(session, data)
        elif event_type in {"charge.dispute.create", "charge.dispute.remind"}:
            await self._commissions._reverse_partner_commissions(session, data, "chargeback")
            await self._mark_transaction_status(session, data, "disputed")
            await self._disable_webhook_subscription(session, data)

        return PaystackWebhookResponse(received=True, event_type=event_type)

    @staticmethod
    async def _mark_transaction_status(
        session: AsyncSession, data: dict[str, Any], status: str
    ) -> None:
        """Flag a persisted transaction on refund/dispute webhook events."""
        try:
            transaction = data.get("transaction")
            transaction = transaction if isinstance(transaction, dict) else {}
            reference = (
                data.get("transaction_reference")
                or data.get("reference")
                or transaction.get("reference")
            )
            if not reference:
                return
            await BillingRepository.mark_transaction_status(
                session, reference=str(reference), status=status
            )
        except Exception:
            logger.exception("Billing transaction status update failed (%s)", status)

    async def _upsert_webhook_subscription(
        self, session: AsyncSession, data: dict[str, Any]
    ) -> None:
        metadata = transaction_metadata(data.get("metadata"))
        org_id_raw = metadata.get("org_id")
        if not org_id_raw:
            logger.info("Ignoring subscription event without org_id metadata")
            return
        try:
            org_id = uuid.UUID(str(org_id_raw))
        except ValueError:
            logger.warning("Ignoring subscription event with invalid org_id")
            return
        org = await self.repository.get_org(session, org_id)
        if not org:
            logger.info("Ignoring subscription event for unknown org %s", org_id)
            return

        customer = data.get("customer")
        customer = customer if isinstance(customer, dict) else {}
        values = {
            "plan": _normalized_plan(data),
            "status": str(data.get("status") or "active"),
            "provider_customer_id": customer.get("customer_code"),
            "provider_subscription_id": data.get("subscription_code"),
            "current_period_start": _parse_datetime(data.get("createdAt")),
            "current_period_end": _resolve_period_end(
                _parse_datetime(data.get("createdAt")),
                _billing_interval(data),
                _parse_datetime(data.get("next_payment_date")),
            ),
            "billing_interval": _billing_interval(data),
        }
        subscription = await self.repository.get_subscription(session, org_id)
        if subscription:
            await self.repository.update_subscription(session, subscription, **values)
        else:
            await self.repository.create_subscription(session, org_id, **values)

        from app.modules.organizations.repository import OrganizationRepository

        await OrganizationRepository.update(
            session, org, plan=values["plan"], evaluation_status="converted"
        )

    async def _disable_webhook_subscription(
        self, session: AsyncSession, data: dict[str, Any]
    ) -> None:
        customer = data.get("customer")
        customer = customer if isinstance(customer, dict) else {}
        customer_code = customer.get("customer_code")
        if not customer_code:
            return
        org = await self.repository.get_org_by_provider_customer(
            session, str(customer_code)
        )
        if not org:
            return
        subscription = await self.repository.get_subscription(session, org.id)
        if subscription:
            await self.repository.update_subscription(
                session, subscription, status="inactive"
            )

        from app.modules.organizations.repository import OrganizationRepository

        # Refund/churn/disable returns to Free; evaluation is expired and will
        # not re-activate. Data is preserved, limits fall back.
        await OrganizationRepository.update(
            session, org, plan=Plan.FREE.value, evaluation_status="expired"
        )
