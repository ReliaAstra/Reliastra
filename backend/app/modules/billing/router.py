import json

from fastapi import APIRouter, Depends, Header, Query, Request
from pydantic import BaseModel, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ValidationException,
)
from app.core.permissions import (
    Plan,
    PLAN_BILLING_AVAILABILITY,
    PLAN_DEPENDENCY_LIMITS,
    PLAN_DESCRIPTIONS,
    PLAN_DISPLAY_NAMES,
    PLAN_FEATURES,
    PLAN_PRICES_USD,
    PLAN_RETENTION_DAYS,
    PLAN_TAGS,
    PLAN_TEAM_LIMITS,
    get_min_check_interval,
    is_enterprise_plan,
)
from app.core.payment_disclosure import currency_payload
from app.core.payment_pricing import format_money, resolve_payment_price
from app.db.session import get_db
from app.dependencies import (
    get_current_org,
    get_current_user,
    require_admin,
    require_member,
)
from app.modules.billing.schemas import (
    BillingTransactionsResponse,
    CheckoutQuoteResponse,
    InitializePaymentRequest,
    PaymentCurrencyResponse,
    InitializePaymentResponse,
    PaystackWebhookPayload,
    PaystackWebhookResponse,
    PlanDetailsResponse,
    VerifyTransactionResponse,
)
from app.modules.billing.service import BillingService, billing_service
from app.modules.organizations.models import Organization
from app.modules.users.models import User

router = APIRouter(prefix="/v1", tags=["Billing"])


def get_bill_service() -> BillingService:
    return billing_service


# ── Public Endpoints (no auth required) ──────────────────────────────────────────


class PricingTransparencyResponse(BaseModel):
    """The mandatory transparency triple for one plan, pre-formatted.

    ``{product_price, actual_charge, payment_provider}`` is exactly what the
    spec requires on every RELIASTRA-owned payment screen. It is rendered here,
    server-side, so pricing cards, the checkout review, the billing page and
    the receipt emails can never show different versions of the same promise.
    """

    product_price: str | None = None
    actual_charge: str | None = None
    payment_provider: str = "Paystack"
    payment_provider_display: str = "Paystack — secure hosted checkout"
    currency_label: str = "US Dollars (USD)"


class PricingPlanResponse(BaseModel):
    plan: str
    display_name: str
    description: str
    tag: str | None = None
    # PRODUCT list price (canonical, unchanged by anything here).
    price_usd: int
    price_annual_usd: int | None = None
    # PAYMENT price for this plan, in the currency Paystack charges. Separate
    # from the USD list price above and never derived from it: the UI shows
    # "billed as <amount> <currency>" only when the business published it.
    # Pre-formatted so no surface composes a currency figure locally.
    payment_amount_display: str | None = None
    payment_annual_amount_display: str | None = None
    product_price_display: str | None = None
    product_annual_price_display: str | None = None
    # The mandatory 3-line block for each billing interval.
    transparency: dict[str, PricingTransparencyResponse] = {}
    # False when no payment price is published for the processing currency:
    # the CTA must not start a checkout that cannot be priced.
    checkout_ready: bool = True
    max_dependencies: int | None = None
    max_team_members: int | None = None
    min_check_interval_seconds: int | None = None
    data_retention_days: int | None = None
    features: dict
    # Billing availability: "self_serve" or "contact_sales".
    billing_availability: str
    # Enterprise/custom indicators — the UI must route Enterprise to Contact
    # Sales and must never render a numeric price for it.
    is_enterprise: bool = False
    is_custom_pricing: bool = False


class PricingPlansResponse(BaseModel):
    plans: list[PricingPlanResponse]
    # Currency the customer will actually be charged in + the canonical
    # disclosure + the display-only FX reference, served once so no surface
    # writes its own copy.
    payment: PaymentCurrencyResponse


@router.get("/pricing", response_model=PricingPlansResponse)
async def get_pricing_plans() -> PricingPlansResponse:
    """Public endpoint returning exactly the three customer-facing plans."""
    from app.core.permissions import CANONICAL_PLANS, get_plan_annual_price_usd
    from app.core.payment_pricing import transparency_lines

    currency = PaymentCurrencyResponse(**await currency_payload())
    plans = []
    for plan_id in sorted(CANONICAL_PLANS):
        p = plan_id
        is_enterprise = is_enterprise_plan(p)
        monthly = resolve_payment_price(p, "monthly")
        annual = resolve_payment_price(p, "annual")
        plans.append(
            PricingPlanResponse(
                plan=p,
                payment_amount_display=(
                    format_money(monthly.payment_amount, monthly.payment_currency) or None
                ),
                payment_annual_amount_display=(
                    format_money(annual.payment_amount, annual.payment_currency) or None
                ),
                product_price_display=(
                    format_money(monthly.product_amount, monthly.product_currency) or None
                ),
                product_annual_price_display=(
                    format_money(annual.product_amount, annual.product_currency) or None
                ),
                transparency={
                    "monthly": PricingTransparencyResponse(
                        **transparency_lines(p, "monthly", price=monthly)
                    ),
                    "annual": PricingTransparencyResponse(
                        **transparency_lines(p, "annual", price=annual)
                    ),
                },
                # Only self-serve *paid* plans need a published payment price;
                # Free has nothing to charge and Enterprise routes to Contact Sales.
                checkout_ready=(
                    True if (is_enterprise or p == Plan.FREE.value)
                    else (monthly.is_configured or annual.is_configured)
                ),
                display_name=PLAN_DISPLAY_NAMES.get(p, p),
                description=PLAN_DESCRIPTIONS.get(p, ""),
                tag=PLAN_TAGS.get(p),
                price_usd=PLAN_PRICES_USD.get(p, 0),
                price_annual_usd=get_plan_annual_price_usd(p),
                max_dependencies=PLAN_DEPENDENCY_LIMITS.get(p),
                max_team_members=PLAN_TEAM_LIMITS.get(p),
                min_check_interval_seconds=get_min_check_interval(p),
                data_retention_days=PLAN_RETENTION_DAYS.get(p),
                features=PLAN_FEATURES.get(p, {}),
                billing_availability=PLAN_BILLING_AVAILABILITY.get(p, "contact_sales"),
                is_enterprise=is_enterprise,
                is_custom_pricing=is_enterprise,
            )
        )
    return PricingPlansResponse(plans=plans, payment=currency)


@router.get("/billing/currency", response_model=PaymentCurrencyResponse)
async def get_payment_currency() -> PaymentCurrencyResponse:
    """The currency Paystack will charge, plus the canonical disclosure.

    Public and cheap on purpose: the marketing pricing page, the upgrade modal
    and the billing page all read the same object, so the currency statement a
    prospect sees before signing up cannot differ from the one a customer sees
    at checkout. ``fx_reference`` is the cached market estimate (display
    only — never a pricing input) and is ``null`` when disabled/unavailable.
    """
    return PaymentCurrencyResponse(**await currency_payload())


@router.get("/pricing/fx-reference")
async def get_fx_reference() -> dict:
    """The FX estimate payment surfaces may show, or ``{available: false}``.

    Kept as its own endpoint for completeness of the contract: same payload the
    shared currency object embeds, so nothing has to restate the label, the
    source or the timestamp.
    """
    from app.core.fx_reference import fx_reference_payload

    payload = await fx_reference_payload()
    if payload is None:
        return {"available": False}
    return payload


# ── Authenticated Endpoints ──────────────────────────────────────────────────────


@router.get("/billing/plan", response_model=PlanDetailsResponse)
async def get_organization_plan(
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: BillingService = Depends(get_bill_service),
) -> PlanDetailsResponse:
    return await service.get_plan_details(db, current_org.id)


@router.get(
    "/billing/transactions",
    response_model=BillingTransactionsResponse,
)
async def get_billing_transactions(
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: BillingService = Depends(get_bill_service),
) -> BillingTransactionsResponse:
    """Payment history — each row states the ACTUAL charged amount/currency.

    These are the figures Paystack reported when collecting, persisted at
    payment time (see ``billing_transactions``). The response also carries the
    payment/currency disclosure payload so the receipts view renders the same
    transparency triple as the checkout, from the same resolver.
    """
    return await service.get_transactions(db, current_org.id)


@router.get(
    "/billing/checkout/quote",
    response_model=CheckoutQuoteResponse,
)
async def get_checkout_quote(
    plan: str = Query(min_length=1, max_length=50, description="Plan id"),
    interval: str = Query(
        default="monthly", pattern="^(monthly|annual)$", description="Billing interval"
    ),
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: BillingService = Depends(get_bill_service),
) -> CheckoutQuoteResponse:
    """The authoritative quote behind RELIASTRA's checkout page.

    The browser chooses *which* plan and interval it wants to see and receives
    every other figure — price, charge amount, currency, disclosure, payment
    methods — already resolved. It is the read half of the same resolution the
    write half (``/billing/initialize``) charges with, so what a customer
    reviews is literally what Paystack is asked to collect, and no screen has to
    derive money from a plan id.

    Authenticated, and scoped to the caller's organization: the quote carries
    that organization's name and billing email, which must not be readable for
    someone else's account.
    """
    return await service.checkout_quote(
        db, current_org.id, plan=plan, billing_interval=interval
    )


@router.post(
    "/billing/initialize",
    response_model=InitializePaymentResponse,
    dependencies=[Depends(require_admin)],
)
async def initialize_payment(
    request: InitializePaymentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: BillingService = Depends(get_bill_service),
) -> InitializePaymentResponse:
    # Authorization comes from ``require_admin`` above (starting a charge spends
    # the organization's money); ``get_current_user`` supplies *identity* so the
    # acting person is recorded on the transaction. A billing dispute needs to
    # know who clicked, and only the authenticated request can say.
    return await service.initialize_payment(
        db, current_org.id, request, user_id=current_user.id
    )


@router.post(
    "/billing/verify",
    response_model=VerifyTransactionResponse,
    dependencies=[Depends(require_member)],
)
async def verify_transaction(
    reference: str = Query(min_length=1, max_length=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: BillingService = Depends(get_bill_service),
) -> VerifyTransactionResponse:
    # Scoped to the caller's organization and replay-protected inside the
    # service. Domain exceptions propagate through the global handlers —
    # wrapping them here used to leak upstream error details (Paystack
    # bodies, DB messages) to clients.
    return await service.verify_transaction(
        db, reference, caller_org_id=current_org.id, user_id=current_user.id
    )


@router.post("/billing/webhook", response_model=PaystackWebhookResponse)
async def paystack_webhook(
    request: Request,
    # FIX 10: the Paystack signature header is mandatory (OpenAPI
    # `required: true`). Requests without it are rejected by FastAPI with a
    # 422 before reaching the handler; the service re-checks for defense in
    # depth and verifies the HMAC-SHA512.
    x_paystack_signature: str = Header(alias="x-paystack-signature"),
    db: AsyncSession = Depends(get_db),
    service: BillingService = Depends(get_bill_service),
) -> PaystackWebhookResponse:
    raw_body = await request.body()
    try:
        payload = PaystackWebhookPayload.model_validate(json.loads(raw_body))
    except (json.JSONDecodeError, UnicodeDecodeError, ValidationError) as exc:
        raise ValidationException("Invalid Paystack webhook body") from exc
    return await service.handle_webhook(
        db,
        payload.model_dump(),
        signature=x_paystack_signature,
        raw_body=raw_body,
    )
