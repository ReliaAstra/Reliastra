"""Payment verification: confirm Paystack transactions, then apply effects.

Verifies the reference with Paystack, persists the transaction, activates
the subscription, records the partner commission, and notifies the org.
Failed attempts are recorded for support/debugging.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ResourceNotFoundException,
    ValidationException,
)
from app.modules.billing.channels import (
    settled_channel_is_acceptable,
)
from app.modules.billing.checkout_reasons import (
    CheckoutReason,
    CheckoutRejectedException,
)
from app.modules.billing.commissions import PartnerCommissions
from app.modules.billing.disclosure import (
    resolve_payment_price_async,
)
from app.modules.billing.notifications import (
    PaymentSummary,
    send_payment_receipt_email,
    send_subscription_confirmed_email,
)
from app.modules.billing.paystack import (
    PaystackClient,
    _authorization_fields,
    _billing_interval,
    _normalized_plan,
    _optional_uuid,
    _parse_datetime,
    _provider_metadata,
    _resolve_period_end,
    transaction_metadata,
)
from app.modules.billing.pricing import (
    ANNUAL as ANNUAL_INTERVAL,
)
from app.modules.billing.pricing import (
    PAYMENT_PROVIDER,
    format_money,
    payment_currency,
)
from app.modules.billing.repository import BillingRepository
from app.modules.billing.schemas import (
    VerifyTransactionResponse,
)
from app.platform.commercial.entitlements import (
    PLAN_DISPLAY_NAMES,
    Plan,
)

logger = logging.getLogger(__name__)


class BillingVerification:
    """Verify transactions, then apply subscription + commission effects."""

    def __init__(
        self,
        repository: BillingRepository,
        client: PaystackClient,
        commissions: PartnerCommissions,
    ) -> None:
        self.repository = repository
        self.client = client
        self._commissions = commissions

    @staticmethod
    def _unverified_response(
        reference: str,
        data: dict[str, Any],
        reason: str,
        message: str,
    ) -> VerifyTransactionResponse:
        """A payment the provider has not confirmed, described honestly.

        Returned rather than raised, because these are ordinary outcomes of a
        payment attempt (pending, declined, cancelled) rather than rejected
        requests: the checkout needs a shape it can render, and the plan stays
        whatever it already was.
        """
        return VerifyTransactionResponse(
            verified=False,
            plan=_normalized_plan(data),
            reference=str(data.get("reference") or reference),
            currency=str(data.get("currency") or "").upper() or None,
            amount_minor=int(data["amount"]) if data.get("amount") else None,
            reason=reason,
            reason_message=message,
        )

    async def verify_transaction(
        self,
        session: AsyncSession,
        reference: str,
        caller_org_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
    ) -> VerifyTransactionResponse:
        """Confirm a payment with Paystack and activate it - or say why not.

        The browser never decides anything here: the client supplies only a
        reference, and every other fact (what was bought, for how long, for how
        much, in which currency, by which organization) is read from Paystack's
        own answer and from RELIASTRA's published pricing. A successful
        `onSuccess` callback in the popup is a hint to call this endpoint,
        never proof of payment - proof is the provider's `status`, `amount`
        and `currency` over TLS, from a server.

        Every rejection carries a :class:`CheckoutReason` slug so the checkout
        can show a specific, actionable state instead of relaying a provider
        error string to a customer.
        """
        try:
            result = await self.client.verify_transaction(reference)
        except httpx.HTTPStatusError as exc:
            # A 404 is an answer, not an outage: the gateway looked up the
            # reference and has no such transaction. Classifying it as
            # "we could not reach the provider" would send the customer away to
            # wait for a confirmation that will never come, when the truth is
            # that there is nothing to confirm - and the reference to check.
            if exc.response.status_code == 404:
                logger.info(
                    "Paystack has no transaction for reference %s (404 from the "
                    "provider); reporting it as not found rather than unavailable",
                    reference,
                )
                raise CheckoutRejectedException(
                    CheckoutReason.NOT_FOUND,
                    "We could not find a payment with that reference at our "
                    "provider, so nothing has been applied. Check the reference, "
                    "and if you paid, send it to billing@reliastra.com.",
                    status_code=409,
                    extra={"reference": reference},
                ) from exc
            raise CheckoutRejectedException(
                CheckoutReason.VERIFICATION_UNAVAILABLE,
                "We could not confirm your payment with our provider yet. If "
                "you completed the charge it is not lost - we verify every "
                "payment automatically and will activate your plan. Please "
                "check back in a few minutes.",
                status_code=503,
                extra={"reference": reference},
            ) from exc
        except httpx.HTTPError as exc:
            # Deliberately *not* "your payment failed". The customer may well
            # have paid; the truth is that RELIASTRA cannot confirm it right
            # now. Telling them otherwise would have them retry the charge.
            logger.warning("Paystack verification failed for %s: %s", reference, exc)
            raise CheckoutRejectedException(
                CheckoutReason.VERIFICATION_UNAVAILABLE,
                "We could not confirm your payment with our provider yet. If "
                "you completed the charge it is not lost - we verify every "
                "payment automatically and will activate your plan. Please "
                "check back in a few minutes.",
                status_code=503,
                extra={"reference": reference},
            ) from exc

        data = result.get("data") if isinstance(result.get("data"), dict) else {}
        provider_status = str(data.get("status") or "").strip().lower()
        if not result.get("status") or provider_status != "success":
            # Distinguish "still pending / awaiting authentication" from
            # "declined", because one has an action and the other does not.
            if provider_status in {"pending", "failed", ""} and not result.get("status"):
                raise CheckoutRejectedException(
                    CheckoutReason.NOT_FOUND,
                    "We could not find that payment on our account. If you "
                    "were charged, contact billing@reliastra.com with the "
                    "reference below.",
                    extra={"reference": reference},
                )
            if provider_status == "pending":
                return self._unverified_response(
                    reference,
                    data,
                    CheckoutReason.PENDING,
                    "Your payment is still being processed by your bank. "
                    "Nothing further is needed from you - we activate your "
                    "plan as soon as it settles.",
                )
            if provider_status in {"failed", "abandoned"}:
                await self._record_failed_attempt(
                    session, data, reference, caller_org_id=caller_org_id
                )
                return self._unverified_response(
                    reference,
                    data,
                    CheckoutReason.DECLINED,
                    "Your payment was not completed. No charge was made to "
                    "your card - you can try again, or use a different card.",
                )
            return self._unverified_response(
                reference,
                data,
                CheckoutReason.NOT_PAID,
                "We have not received this payment yet. If you completed the "
                "charge it may still be settling; we activate your plan "
                "automatically once it does.",
            )

        metadata = transaction_metadata(data.get("metadata"))
        org_id_raw = metadata.get("org_id")
        if not org_id_raw:
            logger.warning(
                "Verified transaction %s has no organization metadata", reference
            )
            raise CheckoutRejectedException(
                CheckoutReason.ORG_MISMATCH,
                "We could not match this payment to a RELIASTRA workspace. "
                "Contact billing@reliastra.com with the reference below and "
                "we will apply it to the right account.",
                extra={"reference": reference},
            )
        try:
            org_id = uuid.UUID(str(org_id_raw))
        except ValueError as exc:
            # A malformed organization id is a provider-response integrity
            # problem, not something the customer can fix: log the detail, give
            # them the same "contact billing" path as an unmatched payment.
            logger.warning(
                "Transaction %s carries unparseable org_id %r", reference, org_id_raw
            )
            raise CheckoutRejectedException(
                CheckoutReason.ORG_MISMATCH,
                "We could not match this payment to a RELIASTRA workspace. "
                "Contact billing@reliastra.com with the reference below.",
                extra={"reference": reference},
            ) from exc

        # A member of organization B must not be able to trigger
        # provisioning for organization A's payment reference.
        if caller_org_id is not None and org_id != caller_org_id:
            logger.warning(
                "Blocked cross-organization verification: reference %s belongs "
                "to %s, requested by %s",
                reference,
                org_id,
                caller_org_id,
            )
            # 403, and worded to say no more than "not yours": the response must
            # not confirm that the reference exists somewhere else, which would
            # turn this endpoint into a way to enumerate other organizations'
            # payments. The reason slug still lets the checkout explain that
            # nothing was applied and who to contact.
            raise CheckoutRejectedException(
                CheckoutReason.ORG_MISMATCH,
                "This payment cannot be matched to your RELIASTRA workspace, so "
                "nothing has been applied. If you paid, send the reference to "
                "billing@reliastra.com and we will apply it to the right account.",
                status_code=403,
            )
        # Channel policy: a global RELIASTRA checkout opens card rails only, so
        # a payment reporting a different rail did not come from this checkout.
        # Accepting it would let a locally-restricted settlement (a Nigerian
        # USSD or bank-transfer payment arranged outside the product) activate a
        # worldwide subscription, which is the bypass this guard exists to stop.
        channel_ok, channel_reason = settled_channel_is_acceptable(data.get("channel"))
        if not channel_ok:
            logger.warning(
                "Rejected verification for reference %s: %s", reference, channel_reason
            )
            raise CheckoutRejectedException(
                CheckoutReason.CHANNEL_POLICY,
                "This payment arrived through a method RELIASTRA's global "
                "checkout does not use, so it has not been applied "
                "automatically. Contact billing@reliastra.com and we will "
                "reconcile it.",
                status_code=409,
                extra={"reference": reference},
            )

        plan = _normalized_plan(data)
        billing_interval = _billing_interval(data)

        # Integrity check: the collected amount must cover the PAYMENT price of
        # the plan + billing interval the transaction claims to buy. This
        # prevents both a tampered/undersized charge from unlocking a higher
        # tier AND the historical bug where an annual checkout silently billed
        # the monthly amount.
        expected_price = await resolve_payment_price_async(plan, billing_interval)
        expected_amount = expected_price.payment_amount
        collected = data.get("amount")
        if expected_amount is None:
            raise ValidationException(
                f"Plan '{plan}' is not available for self-serve checkout"
            )
        # Step 1 - CURRENCY. The expected amount is denominated in minor units
        # of the processing currency, so the integer comparison below is
        # meaningless until the denomination is known to match. A multi-currency
        # Paystack account can settle the same nominal amount in a far weaker
        # currency (3900 NGN is about $2.50, not the $39 Pro plan) and clear an
        # amount-only check. Checkout always initializes in the resolved
        # payment currency, so anything else did not come from our checkout.
        #
        # A MISSING currency is rejected too: defaulting it to the expected
        # value would let an omitted field pass the very check it must face.
        expected_currency = payment_currency()
        raw_currency = data.get("currency")
        collected_currency = str(raw_currency).strip().upper() if raw_currency else ""
        if collected_currency != expected_currency:
            logger.warning(
                "Rejected transaction %s: currency %r != expected %r",
                reference,
                collected_currency or None,
                expected_currency,
            )
            raise CheckoutRejectedException(
                CheckoutReason.CURRENCY_MISMATCH,
                f"The payment currency does not match this plan's billing "
                f"currency: it was collected in "
                f"{collected_currency or 'an unknown currency'}, but RELIASTRA "
                f"bills this plan in {expected_currency}, so it has not been "
                f"applied automatically. Contact billing@reliastra.com and we "
                f"will sort it out.",
                status_code=409,
                extra={"reference": reference},
            )

        # Step 2 - AMOUNT, now that both sides are in the same minor units.
        # Integer comparison only; never floats for money.
        if collected is None:
            raise ValidationException("Transaction is missing a collected amount")
        try:
            collected_minor = int(collected)
        except (TypeError, ValueError) as exc:
            raise ValidationException("Transaction amount is not an integer") from exc
        if collected_minor < expected_amount:
            logger.warning(
                "Rejected transaction %s: collected %s < expected %s (%s)",
                reference,
                collected_minor,
                expected_amount,
                expected_currency,
            )
            raise CheckoutRejectedException(
                CheckoutReason.AMOUNT_MISMATCH,
                "The amount collected does not cover the price of this plan, "
                "so it has not been applied automatically. Contact "
                "billing@reliastra.com and we will reconcile it.",
                status_code=409,
                extra={"reference": reference},
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
        # not newer than the already-applied one is a replay - e.g. re-using
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
                reason=CheckoutReason.REPLAYED,
            )

        # A second, *newer* payment for a period already covered is not a
        # replay - the customer really paid twice, usually by refreshing and
        # retrying. Refusing it would strand their money; ignoring it would be
        # a surprise on the invoice. So it is applied and stated plainly.
        duplicate_within_period = bool(
            subscription is not None
            and subscription.status == "active"
            and subscription.current_period_end is not None
            and paid_at is not None
            and str(subscription.provider_subscription_id or "") != reference
            and subscription.current_period_end > paid_at
        )
        if duplicate_within_period:
            logger.warning(
                "Duplicate payment for org %s within the active period "
                "(reference %s); applied and flagged for support",
                org_id,
                reference,
            )

        # Was this payment already the thing that made the organization paid?
        # Read before the update below, so it describes the state this call
        # found rather than the state it created. A customer who reloads the
        # confirmation page re-verifies the same reference, and telling them the
        # plan "was activated" again would imply something changed a second time
        # - the answer they need is that the same payment is still applied.
        already_applied = bool(
            subscription is not None
            and subscription.status == "active"
            and subscription.plan == plan
            and str(subscription.provider_subscription_id or "") == reference
        )

        period_end = _resolve_period_end(
            paid_at,
            billing_interval,
            _parse_datetime(data.get("next_payment_date")),
        )
        values = {
            "plan": plan,
            "status": "active",
            "provider_customer_id": customer_code,
            "provider_subscription_id": str(data.get("subscription_code") or reference),
            "current_period_start": paid_at,
            "current_period_end": period_end,
            "billing_interval": billing_interval,
            "cancel_at_period_end": False,
            "canceled_at": None,
            **_authorization_fields(data),
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

        # Persist the charge as the provider reported it. This is the
        # permanent record of "what was actually paid": currency-explicit
        # minor units from Paystack's own response, alongside the USD
        # product price the checkout quoted. Receipts and the billing page
        # read history from here, so a price-list change can never rewrite a
        # past payment. Idempotent on (provider, reference).
        try:
            await self.repository.record_transaction(
                session,
                organization_id=org_id,
                reference=str(data.get("reference") or reference),
                email=customer.get("email"),
                plan=plan,
                billing_interval=billing_interval,
                product_currency=expected_price.product_currency,
                product_amount_minor=expected_price.product_amount,
                charged_currency=collected_currency,
                charged_amount_minor=int(collected_minor),
                # Who authorized the purchase (never card data) and when
                # RELIASTRA confirmed it server-side. ``verified_at`` is kept
                # distinct from ``paid_at`` on purpose: the provider's
                # timestamp is when money moved, ours is when this record was
                # established as verified - the two differ under webhook retry
                # and are both needed in a dispute.
                user_id=_optional_uuid(metadata.get("actor_user_id")) or user_id,
                verified_at=datetime.now(timezone.utc),
                duplicate=duplicate_within_period,
                paid_at=paid_at,
                period_start=_parse_datetime(data.get("transaction_date")) or paid_at,
                period_end=period_end,
                provider_metadata=_provider_metadata(data),
            )
        except Exception:
            # The charge and provisioning are done; a record-keeping failure
            # must not turn a successful payment into a failed verification.
            # Logged loudly because reconciliation depends on this table.
            logger.exception(
                "Failed to persist billing transaction for reference %s", reference
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
        await self._commissions._record_partner_commission(session, org_id, data, reference)

        # Transactional email: subscription confirmation + receipt. Best-effort
        # and exactly-once per payment reference (a webhook retry and the
        # frontend verify call land in this same method).
        await self._notify_payment_succeeded(
            session,
            org=org,
            payment=PaymentSummary(
                plan=plan,
                billing_interval=billing_interval,
                amount_minor=int(collected_minor),
                currency=collected_currency or expected_currency,
                reference=reference,
                paid_at=paid_at,
                period_start=_parse_datetime(data.get("transaction_date")) or paid_at,
                period_end=period_end,
            ),
        )

        settled_currency = collected_currency or expected_currency
        return VerifyTransactionResponse(
            verified=True,
            plan=plan,
            billing_interval=billing_interval,
            # The confirmation screen needs the plan's *customer* name and the
            # period it bought, and must not re-derive either from a local
            # dictionary - so both are answered here, beside the figures.
            display_plan=PLAN_DISPLAY_NAMES.get(plan, plan.title()),
            period_word="year" if billing_interval == ANNUAL_INTERVAL else "month",
            activated=not already_applied,
            duplicate_payment=duplicate_within_period,
            reason=CheckoutReason.DUPLICATE_PAYMENT if duplicate_within_period else None,
            reference=reference,
            currency=settled_currency,
            amount_minor=int(collected_minor),
            amount_display=format_money(int(collected_minor), settled_currency),
            # Product side of the transparency triple, from the same figures
            # persisted on the transaction - the confirmation screen restates
            # the deal, not a fresh calculation.
            product_currency=expected_price.product_currency,
            product_amount_minor=expected_price.product_amount,
            product_price_display=format_money(
                expected_price.product_amount, expected_price.product_currency
            )
            or None,
            payment_provider=PAYMENT_PROVIDER,
        )

    async def _record_failed_attempt(
        self,
        session: AsyncSession,
        data: dict[str, Any],
        reference: str,
        *,
        caller_org_id: uuid.UUID | None,
    ) -> None:
        """Persist a declined/abandoned attempt so billing history is honest."""
        metadata = transaction_metadata(data.get("metadata"))
        org_id = _optional_uuid(metadata.get("org_id")) or caller_org_id
        if org_id is None:
            return
        plan = _normalized_plan(data)
        billing_interval = _billing_interval(data)
        price = await resolve_payment_price_async(plan, billing_interval)
        raw_amount = data.get("amount")
        try:
            amount_minor = int(raw_amount) if raw_amount is not None else int(price.payment_amount or 0)
        except (TypeError, ValueError):
            amount_minor = int(price.payment_amount or 0)
        currency = str(data.get("currency") or price.payment_currency or "").upper()[:3]
        try:
            await self.repository.record_transaction(
                session,
                organization_id=org_id,
                reference=str(data.get("reference") or reference),
                email=(data.get("customer") or {}).get("email")
                if isinstance(data.get("customer"), dict)
                else None,
                plan=plan,
                billing_interval=billing_interval,
                product_currency=price.product_currency,
                product_amount_minor=price.product_amount,
                charged_currency=currency or price.payment_currency,
                charged_amount_minor=amount_minor,
                paid_at=None,
                provider_metadata=_provider_metadata(data),
                status="failed",
            )
        except Exception:
            logger.exception(
                "Failed to persist declined billing attempt for reference %s", reference
            )

    async def _notify_payment_succeeded(
        self, session: AsyncSession, *, org, payment: PaymentSummary
    ) -> None:
        """Send confirmation + receipt once per payment reference.

        Never raises: the customer has already paid, and a broken SMTP socket
        must not turn a successful charge into a failed verification.
        """
        try:
            if payment.reference:
                from app.infrastructure.redis_client import safe_redis_claim

                claimed = await safe_redis_claim(
                    f"billing:receipt_sent:{payment.reference}", ex=30 * 24 * 3600
                )
                if claimed is False:
                    return
            from app.modules.organizations.repository import OrganizationRepository
            from app.modules.users.repository import UserRepository

            members = await OrganizationRepository.list_members(session, org.id)
            owner = next((m for m in members if m.role == "owner"), None)
            user = await UserRepository.get_by_id(session, owner.user_id) if owner else None
            if user is None or not user.email:
                logger.info(
                    "No owner email for org %s - payment emails skipped", org.id
                )
                return
            await send_subscription_confirmed_email(
                to_email=user.email,
                user_name=user.full_name or user.email.split("@")[0],
                org_name=org.name,
                payment=payment,
            )
            await send_payment_receipt_email(
                to_email=user.email,
                user_name=user.full_name or user.email.split("@")[0],
                org_name=org.name,
                payment=payment,
            )
        except Exception:
            logger.exception("Billing notification failed for reference %s", payment.reference)
