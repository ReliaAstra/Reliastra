"""Billing service facade: the stable public API over billing collaborators.

``BillingService`` keeps its constructor and method signatures; the work
moved into focused modules behind it:

- :mod:`paystack` - HTTP client, API wrapper, payload helpers.
- :mod:`subscriptions` - plan reads, history, cancel/resume/expiry.
- :mod:`checkout` - quotes and payment initialization.
- :mod:`verification` - transaction verification and its effects.
- :mod:`commissions` - partner ledger effects.
- :mod:`webhooks` - idempotent Paystack event intake.

``repository`` and ``client`` stay plain writable attributes: tests swap the
Paystack client per-case (including via ``mock.patch``), and ``__setattr__``
propagates every swap to the collaborators holding the same dependency.

Tests that stub billing behavior should target the collaborator that owns
it (``service._verification.verify_transaction``,
``service._webhooks._claim_webhook_event``) - stubbing the facade method
only affects direct calls, not the internal charge.success -> verify hop.
"""

import uuid
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.checkout import BillingCheckout
from app.modules.billing.commissions import PartnerCommissions
from app.modules.billing.paystack import (
    PaystackClient,
    close_paystack_http_client,
    paystack_client,
)
from app.modules.billing.pricing import (
    MONTHLY as MONTHLY_INTERVAL,
)
from app.modules.billing.repository import BillingRepository
from app.modules.billing.schemas import (
    BillingTransactionsResponse,
    CheckoutQuoteResponse,
    InitializePaymentRequest,
    InitializePaymentResponse,
    PaystackWebhookResponse,
    PlanDetailsResponse,
    SubscriptionActionResponse,
    VerifyTransactionResponse,
)
from app.modules.billing.subscriptions import BillingSubscriptions
from app.modules.billing.verification import BillingVerification
from app.modules.billing.webhooks import BillingWebhooks
from app.platform.commercial.entitlements import (
    PLAN_AMOUNTS,
)


class BillingService:
    """Billing facade - same API, work delegated to collaborators."""

    def __init__(
        self,
        repository: BillingRepository = BillingRepository(),
        client: PaystackClient = paystack_client,
    ) -> None:
        self._commissions = PartnerCommissions()
        self._subscriptions = BillingSubscriptions(repository)
        self._checkout = BillingCheckout(repository, client, self._subscriptions)
        self._verification = BillingVerification(repository, client, self._commissions)
        self._webhooks = BillingWebhooks(repository, self._verification, self._commissions)
        # Plain attributes (NOT properties) so mock.patch teardown, which
        # restores via the instance __dict__, keeps working - and assignment
        # still propagates to collaborators through __setattr__ below.
        self.repository = repository
        self.client = client

    def __setattr__(self, name: str, value: object) -> None:
        """Propagate shared-dependency swaps to the collaborators that hold them.

        ``billing_service.client = fake`` (and ``mock.patch`` of the same
        attribute, which tests use per-case) must reach the collaborators,
        which keep their own ``self.client`` / ``self.repository`` references.
        """
        super().__setattr__(name, value)
        if name == "repository":
            holders = ("_subscriptions", "_checkout", "_verification", "_webhooks")
        elif name == "client":
            holders = ("_checkout", "_verification")
        else:
            return
        for holder in holders:
            collaborator = self.__dict__.get(holder)
            if collaborator is not None:
                setattr(collaborator, name, value)

    async def get_plan_details(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
    ) -> PlanDetailsResponse:
        return await self._subscriptions.get_plan_details(session, org_id)

    async def get_transactions(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
    ) -> BillingTransactionsResponse:
        return await self._subscriptions.get_transactions(session, org_id)

    async def cancel_subscription(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
    ) -> SubscriptionActionResponse:
        return await self._subscriptions.cancel_subscription(session, org_id)

    async def resume_subscription(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
    ) -> SubscriptionActionResponse:
        return await self._subscriptions.resume_subscription(session, org_id)

    async def render_billing_document(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        transaction_id: uuid.UUID,
        kind: str,
    ) -> tuple[str, str]:
        return await self._subscriptions.render_billing_document(
            session, org_id, transaction_id, kind
        )

    async def checkout_quote(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        *,
        plan: str,
        billing_interval: str = MONTHLY_INTERVAL,
    ) -> CheckoutQuoteResponse:
        return await self._checkout.checkout_quote(
            session, org_id, plan=plan, billing_interval=billing_interval
        )

    async def initialize_payment(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        request: InitializePaymentRequest,
        *,
        user_id: uuid.UUID | None = None,
    ) -> InitializePaymentResponse:
        return await self._checkout.initialize_payment(session, org_id, request, user_id=user_id)

    async def verify_transaction(
        self,
        session: AsyncSession,
        reference: str,
        caller_org_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
    ) -> VerifyTransactionResponse:
        return await self._verification.verify_transaction(
            session, reference, caller_org_id, user_id
        )

    async def handle_webhook(
        self,
        session: AsyncSession,
        payload: dict[str, Any],
        signature: str | None = None,
        raw_body: bytes | None = None,
    ) -> PaystackWebhookResponse:
        return await self._webhooks.handle_webhook(session, payload, signature, raw_body)


billing_service = BillingService()

# Re-exported so existing importers keep working: lifespan imports
# close_paystack_http_client, tests import PLAN_AMOUNTS / paystack_client /
# PaystackClient, and one test patches through service.httpx.AsyncClient.
__all__ = [
    "PLAN_AMOUNTS",
    "BillingService",
    "PaystackClient",
    "billing_service",
    "close_paystack_http_client",
    "httpx",
    "paystack_client",
]
