import hashlib
import hmac
import logging
import uuid
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import (
    ForbiddenException,
    ResourceNotFoundException,
    UnauthorizedException,
    ValidationException,
    ServiceUnavailableException,
)
from app.core.permissions import (
    EVALUATION_DAYS,
    PLAN_AMOUNTS,
    PLAN_ANNUAL_AMOUNTS,
    PLAN_FEATURES,
    TRIAL_DAYS,
    Plan,
    evaluation_days_remaining,
    get_dependency_limit,
    get_effective_entitlements,
    get_effective_plan_for_org,
    get_min_check_interval,
    get_plan_billing_availability,
    get_plan_price_usd,
    get_retention_days,
    get_team_limit,
    is_evaluation_active,
    is_paid_plan,
    normalize_plan,
)
from app.modules.billing.repository import BillingRepository
from app.modules.billing.schemas import (
    BillingInterval,
    InitializePaymentRequest,
    InitializePaymentResponse,
    PaystackWebhookResponse,
    PlanDetailsResponse,
    VerifyTransactionResponse,
)

logger = logging.getLogger(__name__)


class PaystackClient:
    """Small async Paystack client built on the project's existing HTTP stack."""

    def __init__(self) -> None:
        self.base_url = settings.PAYSTACK_BASE_URL.rstrip("/")
        self.secret_key = settings.PAYSTACK_SECRET_KEY

    def _headers(self) -> dict[str, str]:
        if not self.secret_key:
            raise ValidationException("Paystack is not configured")
        return {
            "Authorization": f"Bearer {self.secret_key}",
            "Content-Type": "application/json",
        }

    async def initialize_transaction(
        self,
        email: str,
        amount: int,
        plan: str,
        metadata: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{self.base_url}/transaction/initialize",
                headers=self._headers(),
                json={
                    "email": email,
                    "amount": amount,
                    # Without an explicit currency Paystack charges in the
                    # merchant account's default currency (typically NGN),
                    # turning a $39 checkout into ~$0.01.
                    "currency": settings.PAYSTACK_CURRENCY,
                    "plan": plan,
                    "metadata": metadata or {},
                },
            )
            response.raise_for_status()
            return response.json()

    async def verify_transaction(self, reference: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{self.base_url}/transaction/verify/{reference}",
                headers=self._headers(),
            )
            response.raise_for_status()
            return response.json()

    async def fetch_plan(self, plan_code_or_id: str) -> dict[str, Any] | None:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{self.base_url}/plan/{plan_code_or_id}",
                headers=self._headers(),
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()


paystack_client = PaystackClient()

# Amounts in minor units of PAYSTACK_CURRENCY (default USD cents) are now
# defined in ``app.core.permissions`` (PLAN_AMOUNTS / PLAN_ANNUAL_AMOUNTS) so
# the canonical pricing contract lives in ONE place. ENTERPRISE and FREE are
# NOT self-serve: enterprise routes to Contact Sales, and free has nothing to
# charge. The self-serve guards below reject anything not in PLAN_AMOUNTS.
_MONTHLY_AMOUNTS = PLAN_AMOUNTS
_ANNUAL_AMOUNTS = PLAN_ANNUAL_AMOUNTS


def _amount_for_interval(plan: str, interval: str) -> int | None:
    """Return the charged amount (minor units) for a plan + billing interval."""
    normalized = normalize_plan(plan)
    if interval == BillingInterval.ANNUAL.value:
        return _ANNUAL_AMOUNTS.get(normalized)
    return _MONTHLY_AMOUNTS.get(normalized)


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _normalized_plan(data: dict[str, Any]) -> str:
    metadata = data.get("metadata")
    metadata = metadata if isinstance(metadata, dict) else {}
    candidate: Any = metadata.get("plan")
    if not candidate:
        plan_data = data.get("plan")
        if isinstance(plan_data, dict):
            candidate = plan_data.get("name") or plan_data.get("plan_code")
        elif isinstance(plan_data, str):
            candidate = plan_data
    # Fall back to PRO for legacy free-form payloads; normalize_plan maps
    # legacy names to canonical ones.
    return normalize_plan(str(candidate or Plan.PRO.value))


def _billing_interval(data: dict[str, Any]) -> str:
    """Resolve the billing interval from metadata (default monthly)."""
    metadata = data.get("metadata")
    metadata = metadata if isinstance(metadata, dict) else {}
    candidate = str(metadata.get("billing_interval") or BillingInterval.MONTHLY.value).strip().lower()
    if candidate in {BillingInterval.MONTHLY.value, BillingInterval.ANNUAL.value}:
        return candidate
    return BillingInterval.MONTHLY.value


class BillingService:
    def __init__(
        self,
        repository: BillingRepository = BillingRepository(),
        client: PaystackClient = paystack_client,
    ) -> None:
        self.repository = repository
        self.client = client

    async def get_plan_details(
        self, session: AsyncSession, org_id: uuid.UUID
    ) -> PlanDetailsResponse:
        org = await self.repository.get_org(session, org_id)
        if not org:
            raise ResourceNotFoundException("Organization not found")
        subscription = await self.repository.get_subscription(session, org_id)

        # Centralized evaluation-aware entitlement resolution. Server time only.
        ent = get_effective_entitlements(org)
        effective_plan = ent["effective_plan"]
        base_price = get_plan_price_usd(effective_plan)
        # Real account consequences for the fallback message (never fabricated).
        fallback_info = await self._build_fallback_info(session, org, ent)
        effective_is_custom = get_plan_billing_availability(effective_plan) == "contact_sales"
        return PlanDetailsResponse(
            org_id=org.id,
            plan=ent["subscription_plan"],
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
            subscription_status=subscription.status if subscription else None,
            current_period_end=(
                subscription.current_period_end if subscription else None
            ),
            price_usd=base_price,
            billing_interval=(
                subscription.billing_interval if subscription is not None else None
            ),
            # Enterprise uses custom pricing — never advertise a numeric price.
            effective_is_custom=effective_is_custom,
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
            active_count = total_deps  # we have no paused state yet; count is authoritative
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

    async def initialize_payment(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        request: InitializePaymentRequest,
    ) -> InitializePaymentResponse:
        org = await self.repository.get_org(session, org_id)
        if not org:
            raise ResourceNotFoundException("Organization not found")

        plan = normalize_plan(request.plan)

        # Enterprise is NOT self-serve — it routes to Contact Sales. Never
        # create a fake $0 checkout or invent a numeric enterprise price.
        if get_plan_billing_availability(plan) == "contact_sales":
            raise ValidationException(
                "Enterprise plans use custom pricing. Please contact sales "
                "to configure your plan."
            )
        # Free is not a paid plan; there is nothing to charge.
        if not is_paid_plan(plan):
            raise ValidationException(
                f"Invalid paid plan: '{plan}'. The only self-serve paid plan is PRO."
            )
        if plan not in PLAN_AMOUNTS:
            raise ValidationException(
                f"Plan '{plan}' is not available for self-serve checkout. "
                f"Please contact sales."
            )

        interval = request.billing_interval.value
        base_amount = _amount_for_interval(plan, interval)
        if base_amount is None:
            raise ValidationException(
                f"Plan '{plan}' does not support {interval} billing."
            )

        email = str(request.email) if request.email else None
        if not email:
            from app.modules.organizations.repository import OrganizationRepository
            from app.modules.users.repository import UserRepository

            members = await OrganizationRepository.list_members(session, org_id)
            owner = next((member for member in members if member.role == "owner"), None)
            if owner:
                user = await UserRepository.get_by_id(session, owner.user_id)
                email = user.email if user else None
        if not email:
            raise ValidationException(
                "No email is available for payment initialization"
            )

        try:
            result = await self.client.initialize_transaction(
                email=email,
                amount=base_amount,
                plan=plan,
                metadata={
                    "org_id": str(org_id),
                    "plan": plan,
                    "billing_interval": interval,
                },
            )
        except httpx.HTTPError as exc:
            logger.warning("Paystack initialization failed: %s", exc)
            raise ValidationException("Paystack transaction initialization failed") from exc

        data = result.get("data") if isinstance(result.get("data"), dict) else {}
        if not result.get("status") or not data:
            raise ValidationException("Paystack transaction initialization failed")

        # Funnel analytics: this organization reached checkout with a
        # reachable email. If they never pay, sales can follow up manually.
        from app.modules.analytics.service import analytics_service

        await analytics_service.record_checkout_started(
            str(org_id),
            email=email,
            plan=plan,
            amount_minor=base_amount,
            reference=str(data.get("reference") or ""),
        )
        try:
            return InitializePaymentResponse(
                authorization_url=data["authorization_url"],
                reference=data["reference"],
                access_code=data["access_code"],
            )
        except KeyError as exc:
            raise ValidationException(
                "Paystack returned an incomplete response"
            ) from exc

    async def verify_transaction(
        self,
        session: AsyncSession,
        reference: str,
        caller_org_id: uuid.UUID | None = None,
    ) -> VerifyTransactionResponse:
        try:
            result = await self.client.verify_transaction(reference)
        except httpx.HTTPError as exc:
            logger.warning("Paystack verification failed for %s: %s", reference, exc)
            raise ValidationException("Unable to verify Paystack transaction") from exc

        data = result.get("data") if isinstance(result.get("data"), dict) else {}
        if not result.get("status") or data.get("status") != "success":
            return VerifyTransactionResponse(
                verified=False, plan=Plan.FREE.value, reference=reference
            )

        metadata = data.get("metadata")
        metadata = metadata if isinstance(metadata, dict) else {}
        org_id_raw = metadata.get("org_id")
        if not org_id_raw:
            logger.warning(
                "Verified transaction %s has no organization metadata", reference
            )
            return VerifyTransactionResponse(
                verified=False, plan=Plan.FREE.value, reference=reference
            )
        try:
            org_id = uuid.UUID(str(org_id_raw))
        except ValueError as exc:
            raise ValidationException(
                "Invalid organization metadata from Paystack"
            ) from exc

        # A member of organization B must not be able to trigger
        # provisioning for organization A's payment reference.
        if caller_org_id is not None and org_id != caller_org_id:
            raise ForbiddenException(
                "This transaction does not belong to your organization"
            )

        plan = _normalized_plan(data)
        billing_interval = _billing_interval(data)

        # Integrity check: the collected amount must cover the price of the
        # plan + billing interval the transaction claims to buy. This prevents
        # both a tampered/undersized charge from unlocking a higher tier AND
        # the previous bug where an annual checkout silently billed the monthly
        # amount.
        expected_amount = _amount_for_interval(plan, billing_interval)
        collected = data.get("amount")
        if expected_amount is None:
            raise ValidationException(
                f"Plan '{plan}' is not available for self-serve checkout"
            )
        # Step 1 — CURRENCY. PLAN_AMOUNTS is denominated in minor units of
        # PAYSTACK_CURRENCY, so the integer comparison below is meaningless
        # until the denomination is known to match. A multi-currency Paystack
        # account can settle the same nominal amount in a far weaker currency
        # (9900 NGN is about $6, not $39) and clear an amount-only check.
        # Checkout always initializes with settings.PAYSTACK_CURRENCY, so
        # anything else did not come from our checkout.
        #
        # A MISSING currency is rejected too: defaulting it to the expected
        # value would let an omitted field pass the very check it must face.
        expected_currency = (settings.PAYSTACK_CURRENCY or "USD").strip().upper()
        raw_currency = data.get("currency")
        collected_currency = str(raw_currency).strip().upper() if raw_currency else ""
        if collected_currency != expected_currency:
            logger.warning(
                "Rejected transaction %s: currency %r != expected %r",
                reference,
                collected_currency or None,
                expected_currency,
            )
            raise ValidationException(
                "Payment currency does not match the billing currency"
            )

        # Step 2 — AMOUNT, now that both sides are in the same minor units.
        # Integer comparison only; never floats for money.
        if collected is None:
            raise ValidationException("Transaction is missing a collected amount")
        try:
            collected_minor = int(collected)
        except (TypeError, ValueError) as exc:
            raise ValidationException("Transaction amount is not an integer") from exc
        if collected_minor < expected_amount:
            raise ValidationException(
                "Collected payment does not cover the selected plan price"
            )

        paid_at = _parse_datetime(data.get("paid_at"))

        org = await self.repository.get_org(session, org_id)
        if not org:
            raise ResourceNotFoundException("Organization not found")

        customer = data.get("customer")
        customer = customer if isinstance(customer, dict) else {}
        customer_code = customer.get("customer_code")
        subscription = await self.repository.get_subscription(session, org_id)

        # Replay protection. The subscription row persists which reference
        # provisioned it (provider_subscription_id) and when that payment
        # was made (current_period_start). Re-verifying the SAME reference
        # stays idempotent; presenting any OTHER reference whose payment is
        # not newer than the already-applied one is a replay — e.g. re-using
        # an old reference after cancellation to restore the paid plan for
        # free.
        if (
            subscription is not None
            and subscription.current_period_start is not None
            and paid_at is not None
            and str(subscription.provider_subscription_id or "") != reference
            and paid_at <= subscription.current_period_start
        ):
            logger.warning(
                "Rejected replayed billing verification for reference %s (org %s)",
                reference,
                org_id,
            )
            return VerifyTransactionResponse(
                verified=False,
                plan=subscription.plan or Plan.FREE.value,
                reference=reference,
            )

        values = {
            "plan": plan,
            "status": "active",
            "provider_customer_id": customer_code,
            "provider_subscription_id": str(data.get("subscription_code") or reference),
            "current_period_start": paid_at,
            "current_period_end": _parse_datetime(data.get("next_payment_date")),
            "billing_interval": billing_interval,
        }
        if subscription:
            await self.repository.update_subscription(session, subscription, **values)
        else:
            await self.repository.create_subscription(session, org_id, **values)

        from app.modules.organizations.repository import OrganizationRepository

        # Evaluation -> paid transition: paid plan becomes authoritative and the
        # evaluation is marked converted so it never re-activates. No conflicting
        # evaluation state: effective entitlements now follow the paid plan.
        await OrganizationRepository.update(
            session, org, plan=plan, evaluation_status="converted"
        )

        # Funnel analytics: this checkout lead converted. Single choke point
        # covers both the frontend verify call and the charge.success webhook.
        from app.modules.analytics.service import analytics_service

        await analytics_service.record_checkout_converted(str(org_id))

        # Partner network: a verified, collected payment is the only thing
        # that creates commission. We pass the amount Paystack reports as
        # actually collected, never a plan list price. Both the direct
        # verify call and the `charge.success` webhook land here, and the
        # commission service is idempotent on the payment reference, so a
        # duplicate delivery cannot pay a partner twice.
        await self._record_partner_commission(session, org_id, data, reference)

        return VerifyTransactionResponse(verified=True, plan=plan, reference=reference)

    @staticmethod
    async def _record_partner_commission(
        session: AsyncSession,
        org_id: uuid.UUID,
        data: dict[str, Any],
        reference: str,
    ) -> None:
        """Convert a verified payment into a partner commission.

        Failures here must never fail the payment itself — the customer has
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
        """Claim *event_id* for processing. Tri-state — see the return values.

        Uses a Redis SET-NX with a 24h TTL so Paystack retries (which resend
        the same event) never double-process ``charge.success``.

        Returns:
            True  — claimed; this delivery should be processed.
            False — the event was already processed; skip it.
            None  — the idempotency store is unreachable, so we cannot tell.

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

        # FIX 31: idempotency — skip events already processed in the last 24h.
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
                    "Paystack webhook idempotency store unavailable — refusing "
                    "event %s (type=%s) so Paystack retries it",
                    event_id,
                    event_type,
                    extra={"event_id": event_id, "event_type": event_type},
                )
                raise ServiceUnavailableException(
                    "Webhook idempotency store unavailable; please retry"
                )

        if event_type == "charge.success" and data.get("reference"):
            await self.verify_transaction(session, str(data["reference"]))
        elif event_type == "subscription.create":
            await self._upsert_webhook_subscription(session, data)
        elif event_type in {"subscription.disable", "subscription.not_renew"}:
            await self._disable_webhook_subscription(session, data)
            # Churn stops future partner accrual but never reverses
            # commissions on revenue that was collected and kept.
            await self._handle_partner_churn(session, data)
        elif event_type in {"refund.processed", "charge.refunded"}:
            await self._reverse_partner_commissions(session, data, "refund")
            # A refunded payment must not keep the paid plan active. Mirror
            # the churn behaviour: mark the subscription inactive and drop
            # the organization back to the free plan.
            await self._disable_webhook_subscription(session, data)
        elif event_type in {"charge.dispute.create", "charge.dispute.remind"}:
            await self._reverse_partner_commissions(session, data, "chargeback")
            await self._disable_webhook_subscription(session, data)

        return PaystackWebhookResponse(received=True, event_type=event_type)

    @staticmethod
    async def _reverse_partner_commissions(
        session: AsyncSession, data: dict[str, Any], reason: str
    ) -> None:
        """Reverse partner commissions after a refund or chargeback.

        The original commission rows are never deleted — their status is set
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

    async def _upsert_webhook_subscription(
        self, session: AsyncSession, data: dict[str, Any]
    ) -> None:
        metadata = data.get("metadata")
        metadata = metadata if isinstance(metadata, dict) else {}
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
            "current_period_end": _parse_datetime(data.get("next_payment_date")),
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


billing_service = BillingService()
