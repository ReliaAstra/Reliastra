"""Self-serve checkout: quotes and payment initialization.

Resolves the price a customer actually pays and starts the Paystack
transaction. Reads current-plan state through ``BillingSubscriptions``.

PRODUCT PRICING (USD list price: PLAN_PRICES_USD / PLAN_AMOUNTS in
``app.platform.commercial.entitlements``) and PAYMENT PRICING (the amount
actually charged through Paystack, in the processing currency) are two
separate concepts and are resolved through ``app.modules.billing.pricing``.
For a non-USD processor the payment price is the USD list price converted
at the live exchange rate (``resolve_payment_price_async``), and self-serve
checkout is disabled when no rate is available rather than silently
charging the USD minor-unit figure in another currency.

ENTERPRISE and FREE are NOT self-serve: enterprise routes to Contact
Sales, and free has nothing to charge.
"""

import hashlib
import hmac
import logging
import uuid
from collections.abc import Sequence

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import (
    ResourceNotFoundException,
    ValidationException,
)
from app.modules.billing.channels import (
    method_is_enabled,
    payment_method_descriptors,
    resolve_checkout_channels,
)
from app.modules.billing.checkout_reasons import (
    CheckoutReason,
    CheckoutRejectedException,
)
from app.modules.billing.commercial_terms import (
    BILLING_EMAIL,
    REFUND_POLICY_PATH,
    SELLER_LEGAL_NAME,
    TERMS_PATH,
    cancellation_summary,
    checkout_what_you_buy,
    refund_summary,
    terms_acceptance_label,
    trial_summary,
)
from app.modules.billing.disclosure import (
    currency_payload,
    resolve_payment_price_async,
)
from app.modules.billing.paystack import PaystackClient
from app.modules.billing.pricing import (
    ANNUAL as ANNUAL_INTERVAL,
)
from app.modules.billing.pricing import (
    MONTHLY as MONTHLY_INTERVAL,
)
from app.modules.billing.pricing import (
    PAYMENT_PROVIDER,
    PaymentPrice,
    format_money,
)
from app.modules.billing.repository import BillingRepository
from app.modules.billing.schemas import (
    CheckoutQuoteResponse,
    InitializePaymentRequest,
    InitializePaymentResponse,
)
from app.modules.billing.subscriptions import BillingSubscriptions
from app.platform.commercial.entitlements import (
    PLAN_AMOUNTS,
    PLAN_DISPLAY_NAMES,
    PLAN_FEATURES,
    TRIAL_DAYS,
    get_plan_billing_availability,
    is_paid_plan,
    normalize_plan,
)

logger = logging.getLogger(__name__)


def _price_token(price: PaymentPrice, channels: Sequence[str]) -> str:
    """Short digest of the exact figures a checkout quote was issued from.

    Not a signature and not a capability: it cannot price anything, choose a
    currency, or be edited into a different charge. It exists only so the
    checkout page can prove which quote the customer looked at, and so we can
    stop a payment rather than send Paystack a number nobody approved.
    """
    material = "|".join(
        [
            str(price.plan),
            str(price.interval),
            str(price.product_currency),
            str(price.product_amount),
            str(price.payment_currency),
            str(price.payment_amount),
            ",".join(sorted(channels)),
        ]
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:16]


class BillingCheckout:
    """Self-serve checkout over the current subscription state."""

    def __init__(
        self,
        repository: BillingRepository,
        client: PaystackClient,
        subscriptions: BillingSubscriptions,
    ) -> None:
        self.repository = repository
        self.client = client
        self._subscriptions = subscriptions

    async def checkout_quote(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        *,
        plan: str,
        billing_interval: str = MONTHLY_INTERVAL,
    ) -> CheckoutQuoteResponse:
        """The authoritative render-model for RELIASTRA's checkout page.

        Why an endpoint instead of letting the checkout page compute from the
        pricing list it already fetched: the page would then be *composing* a
        price - plan id plus interval in, "₦51,558" out - and any bug in that
        composition is a customer who was shown one number and charged another.
        So the page asks, and displays. It receives the product price, the
        payment amount, the currency names, the disclosure, the FX reference and
        the available payment methods as finished strings from the same
        resolvers that will price the actual transaction, which is the only way
        the review screen and Paystack can be guaranteed to agree.

        The response also gates the flow. ``available=False`` with a reason is
        the state where checkout must not be offered at all - an unpublished
        payment price for the processing currency, or a plan that is not
        self-serve - and the page then explains instead of presenting a CTA
        that would fail mid-payment.
        """
        from app.platform.commercial.entitlements import (
            PLAN_DESCRIPTIONS,
            get_plan_billing_availability,
        )

        normalized = normalize_plan(plan)
        interval = (billing_interval or MONTHLY_INTERVAL).strip().lower()
        interval = ANNUAL_INTERVAL if interval == ANNUAL_INTERVAL else MONTHLY_INTERVAL
        price = await resolve_payment_price_async(normalized, interval)
        methods = payment_method_descriptors()
        policy = resolve_checkout_channels()
        disclosure = await currency_payload()

        org = await self.repository.get_org(session, org_id)
        subscription = await self.repository.get_subscription(session, org_id)

        # Whose mailbox the receipt goes to - shown for confirmation, and sent
        # to Paystack as the payer identity. Read from the organization's owner,
        # never trusted from a request body that could name someone else.
        billing_email = None
        from app.modules.organizations.repository import OrganizationRepository
        from app.modules.users.repository import UserRepository

        try:
            members = await OrganizationRepository.list_members(session, org_id)
            owner = next((m for m in members if m.role == "owner"), None)
            if owner is not None:
                user = await UserRepository.get_by_id(session, owner.user_id)
                billing_email = user.email if user else None
        except Exception:  # pragma: no cover - identity is advisory, not gating
            logger.warning("Could not resolve billing email for org %s", org_id)

        current_plan = subscription.plan if subscription is not None else None
        current_interval = (
            subscription.billing_interval if subscription is not None else None
        )
        already_subscribed = bool(
            subscription is not None
            and subscription.status == "active"
            and current_plan == normalized
            and (current_interval or MONTHLY_INTERVAL) == interval
        )

        available = True
        reason: str | None = None
        message: str | None = None
        if get_plan_billing_availability(normalized) == "contact_sales":
            available, reason = False, CheckoutReason.PLAN_NOT_SELFSERVE
            message = (
                "Enterprise is set up with our team rather than through "
                "self-serve checkout."
            )
        elif not price.is_configured:
            available, reason = False, CheckoutReason.PRICE_NOT_CONFIGURED
            product_display = format_money(
                price.product_amount, price.product_currency
            ) or "the USD list price"
            period = "year" if interval == ANNUAL_INTERVAL else "month"
            message = (
                f"Online checkout cannot price this plan in "
                f"{price.payment_currency} right now. The plan price is "
                f"{product_display} per {period}; contact "
                "billing@reliastra.com and we will set up your subscription "
                "directly."
            )
        elif not settings.PAYSTACK_SECRET_KEY:
            # Configuration gap, never a customer-facing detail: the checkout
            # says "unavailable, try again / contact us" and no amount is
            # invented to keep the button alive.
            available, reason = False, CheckoutReason.PROVIDER_UNAVAILABLE
            message = (
                "Online payment is temporarily unavailable. No charge has been "
                "made - please try again shortly or contact "
                "billing@reliastra.com."
            )

        trial_note = None
        plan_details = await self._subscriptions.get_plan_details(session, org_id)
        if plan_details.is_trial_active:
            trial_note = (
                f"Your {plan_details.trial_days_remaining}-day evaluation is "
                "still running. Subscribing now starts billing immediately and "
                "ends the evaluation."
            )

        return CheckoutQuoteResponse(
            plan=normalized,
            display_plan=PLAN_DISPLAY_NAMES.get(normalized, normalized.title()),
            description=PLAN_DESCRIPTIONS.get(normalized, ""),
            features=PLAN_FEATURES.get(normalized),
            billing_interval=interval,
            product_currency=price.product_currency,
            product_amount_minor=price.product_amount,
            product_price_display=format_money(
                price.product_amount, price.product_currency
            )
            or None,
            payment_currency=price.payment_currency,
            payment_amount_minor=price.payment_amount,
            payment_amount_display=format_money(
                price.payment_amount, price.payment_currency
            )
            or None,
            payment_currency_name=price.payment_currency_name,
            payment_provider=PAYMENT_PROVIDER,
            # Straight index, not a fallback: ``currency_payload()`` is the one
            # disclosure object every payment surface renders from, so the
            # checkout cannot drift to a different provider label than pricing
            # and billing already show.
            payment_provider_display=disclosure["payment_provider_display"],
            period_word="year" if interval == ANNUAL_INTERVAL else "month",
            currency_notice=disclosure.get("notice"),
            fx_reference=disclosure.get("fx_reference"),
            payment_methods=methods,
            channels=list(policy.enabled),
            price_token=_price_token(price, policy.enabled),
            organization_name=getattr(org, "name", None),
            billing_email=billing_email,
            current_plan=current_plan,
            current_interval=current_interval,
            already_subscribed=already_subscribed,
            available=available,
            unavailable_reason=reason,
            unavailable_message=message,
            checkout_enabled=bool(settings.PAYSTACK_SECRET_KEY),
            trial_note=trial_note,
            trial_length_days=TRIAL_DAYS,
            trial_requires_payment=False,
            trial_summary=trial_summary(),
            cancellation_summary=cancellation_summary(),
            refund_summary=refund_summary(),
            refund_policy_path=REFUND_POLICY_PATH,
            terms_path=TERMS_PATH,
            terms_acceptance_label=terms_acceptance_label(),
            what_you_buy=checkout_what_you_buy(),
            seller_legal_name=SELLER_LEGAL_NAME,
            billing_contact=BILLING_EMAIL,
        )

    async def initialize_payment(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        request: InitializePaymentRequest,
        *,
        user_id: uuid.UUID | None = None,
    ) -> InitializePaymentResponse:
        """Create the Paystack transaction for one organization's checkout.

        Every number that reaches Paystack is resolved here, from server-side
        configuration - ``request`` carries a plan and a billing interval and
        nothing else. There is deliberately no amount, currency or channel
        field to accept: a client cannot price its own subscription, choose
        which rails it pays through, or pick the currency its charge settles
        in. The price the customer was shown and the money RELIASTRA agrees to
        receive are the same fact, and only the backend may hold it.
        """
        org = await self.repository.get_org(session, org_id)
        if not org:
            raise ResourceNotFoundException("Organization not found")

        plan = normalize_plan(request.plan)

        # Enterprise is NOT self-serve - it routes to Contact Sales. Never
        # create a fake $0 checkout or invent a numeric enterprise price.
        if get_plan_billing_availability(plan) == "contact_sales":
            raise CheckoutRejectedException(
                CheckoutReason.PLAN_NOT_SELFSERVE,
                "This plan is set up with our team rather than through "
                "self-serve checkout. Contact sales and we will have it "
                "running for you.",
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

        if not request.terms_accepted:
            raise ValidationException(
                "Accept the Terms of Service to continue with checkout."
            )

        interval = request.billing_interval.value
        price = await resolve_payment_price_async(plan, interval)
        if not price.is_configured:
            # The product price exists, but no exchange rate is available to
            # convert it into the processing currency. Charging the USD
            # minor-unit figure as Naira would mis-bill the customer, so we
            # stop here - before any Paystack transaction exists.
            logger.warning(
                "Checkout disabled for plan '%s' (%s): no %s rate available to convert the price",
                plan,
                interval,
                price.payment_currency,
            )
            product_display = format_money(
                price.product_amount, price.product_currency
            ) or "the USD list price"
            period = "year" if interval == ANNUAL_INTERVAL else "month"
            raise CheckoutRejectedException(
                CheckoutReason.PRICE_NOT_CONFIGURED,
                f"Online checkout cannot price this plan in "
                f"{price.payment_currency} right now. The plan price is "
                f"{product_display} per {period}; contact "
                "billing@reliastra.com and we will set up your subscription "
                "directly.",
                status_code=409,
            )
        base_amount = int(price.payment_amount or 0)

        # The customer may choose *which* offered method to pay with; they may
        # not choose one RELIASTRA has not enabled. Rejecting here means a
        # hand-edited request never reaches Paystack asking for a channel the
        # checkout explicitly refuses to support for global buyers.
        method_id = (request.payment_method or "").strip()
        if method_id and not method_is_enabled(method_id):
            raise CheckoutRejectedException(
                CheckoutReason.METHOD_UNAVAILABLE,
                "That payment method is not available for this checkout. "
                "Please continue with an international card.",
                status_code=409,
                extra={"requested": method_id},
            )
        policy = resolve_checkout_channels()

        # The quote and this transaction are priced by the same resolution - but
        # a checkout page can sit open across an operator repricing the plan, and
        # the customer would then approve one number while we sent another. The
        # page echoes the token its quote was issued under (never an amount: a
        # token cannot price anything), and a mismatch stops the payment instead
        # of proceeding against a figure nobody approved.
        if request.expected_price_token:
            current_token = _price_token(price, policy.enabled)
            if not hmac.compare_digest(
                str(request.expected_price_token), current_token
            ):
                logger.warning(
                    "Checkout quote for org %s is stale (plan %s / %s); refusing to "
                    "charge the re-resolved price",
                    org_id,
                    plan,
                    interval,
                )
                raise CheckoutRejectedException(
                    CheckoutReason.QUOTE_STALE,
                    "The price shown on this page is no longer the price our system "
                    "has, so nothing has been charged. Reload to see the current "
                    "price and continue from there.",
                    status_code=409,
                )

        # The payer address handed to Paystack is also the mailbox its receipt
        # lands in, so it is chosen from this organization rather than from the
        # request. A client may name a member of this workspace (a teammate
        # paying on its behalf); naming an address outside it is ignored, not
        # obeyed - otherwise any authenticated user could send somebody else's
        # payment confirmation to a stranger.
        from app.modules.organizations.repository import OrganizationRepository
        from app.modules.users.repository import UserRepository

        members = await OrganizationRepository.list_members(session, org_id)
        owner = next((member for member in members if member.role == "owner"), None)
        owner_user = (
            await UserRepository.get_by_id(session, owner.user_id) if owner else None
        )
        email = owner_user.email if owner_user else None
        requested_email = str(request.email).strip() if request.email else ""
        if requested_email:
            claimed = await UserRepository.get_by_email(session, requested_email)
            if claimed is not None and any(
                member.user_id == claimed.id for member in members
            ):
                email = claimed.email
            else:
                logger.warning(
                    "Ignoring a payer email on checkout for org %s that belongs to "
                    "no member of that organization",
                    org_id,
                )
        if not email:
            raise ValidationException(
                "No email is available for payment initialization"
            )

        from app.infrastructure.email_layout import frontend_url

        # RELIASTRA generates the reference. Paystack's docs recommend exactly
        # this so the merchant owns one identifier from first click through to
        # reconciliation, and embedding the organization prefix makes a
        # misfiled payment findable in logs without opening the payload. Only
        # alphanumerics and ``-``, ``.``, ``=`` are permitted by the API.
        reference = f"reliastra-{org_id.hex[:8]}-{uuid.uuid4().hex[:16]}"

        try:
            result = await self.client.initialize_transaction(
                email=email,
                amount=base_amount,
                plan=plan,
                # The currency sent here is the currency every RELIASTRA
                # surface displays to the customer, resolved from the same
                # payment-pricing source of truth.
                currency=price.payment_currency,
                # Channels are declared per transaction, never inherited from
                # the dashboard: a global customer is offered only the rails
                # that can actually settle from their country.
                channels=list(policy.enabled),
                reference=reference,
                # Return the payer to RELIASTRA's checkout so the exact charge
                # is restated and verified there (the ?reference= handler).
                callback_url=frontend_url("/checkout"),
                metadata={
                    "org_id": str(org_id),
                    "plan": plan,
                    "billing_interval": interval,
                    "currency": price.payment_currency,
                    "amount_minor": str(base_amount),
                    "product_currency": price.product_currency,
                    "product_amount_minor": str(price.product_amount or 0),
                    "payment_provider": PAYMENT_PROVIDER,
                    "channels": ",".join(policy.enabled),
                    # Who authorized this purchase, for the billing record.
                    # Never card holder data: RELIASTRA holds none.
                    "actor_user_id": str(user_id) if user_id else None,
                },
            )
        except httpx.HTTPError as exc:
            # Logged with detail, answered without it. A provider outage has a
            # specific customer-facing shape - nothing moved, try again - that
            # no amount of upstream text improves.
            logger.warning("Paystack initialization failed: %s", exc)
            raise CheckoutRejectedException(
                CheckoutReason.PROVIDER_UNAVAILABLE,
                "We could not reach our payment provider just now. No money "
                "has moved - please try again in a moment.",
                status_code=503,
            ) from exc

        data = result.get("data") if isinstance(result.get("data"), dict) else {}
        if not result.get("status") or not data:
            logger.warning(
                "Paystack rejected initialization for org %s: %s",
                org_id,
                str(result.get("message") or "")[:200],
            )
            raise CheckoutRejectedException(
                CheckoutReason.PROVIDER_UNAVAILABLE,
                "We could not start the payment. No money has moved - please "
                "try again, or contact billing@reliastra.com if this persists.",
                status_code=503,
            )

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
                reference=str(data.get("reference") or reference),
                access_code=data["access_code"],
                # The public key is a *publishable* credential - Paystack's
                # InlineJS reference takes it in browser code. The secret key
                # never leaves this process.
                public_key=settings.PAYSTACK_PUBLIC_KEY or None,
                inline_js_enabled=bool(settings.PAYSTACK_INLINE_JS_ENABLED)
                and bool(settings.PAYSTACK_PUBLIC_KEY),
                inline_js_url=settings.PAYSTACK_INLINE_JS_URL,
                # Exactly the rails this transaction was opened with, so the
                # payment experience that launches cannot disagree with the
                # method the customer approved on the review screen.
                channels=list(policy.enabled),
                payment_methods=payment_method_descriptors(),
                # Echo of the real charge, so the confirmation screen and any
                # post-redirect page state the same currency Paystack holds.
                amount_minor=base_amount,
                currency=price.payment_currency,
                amount_display=format_money(base_amount, price.payment_currency),
                plan=plan,
                billing_interval=interval,
                # …and the product price it corresponds to, so the mandatory
                # "Product price / Actual charge / Payment provider" block is
                # backend-sourced end to end.
                product_currency=price.product_currency,
                product_amount_minor=price.product_amount,
                product_price_display=format_money(
                    price.product_amount, price.product_currency
                )
                or None,
                payment_provider=PAYMENT_PROVIDER,
            )
        except KeyError as exc:
            logger.warning(
                "Paystack initialization response for org %s is missing %s",
                org_id,
                exc,
            )
            raise CheckoutRejectedException(
                CheckoutReason.PROVIDER_UNAVAILABLE,
                "Our payment provider returned an incomplete response, so no "
                "payment was started. Please try again.",
                status_code=503,
            ) from exc
