"""Canonical checkout failure reasons.

A payment failure is a *product state*, not an exception message. The frontend
must be able to show a customer exactly what happened and what to do next
without relaying a provider's raw error string — "Amount must be greater than
100" or "Invalid Authorization token" means nothing to a buyer and, worse,
leaks implementation detail of a third party they never agreed to debug.

So the backend classifies every rejection into one of the slugs below, and the
UI maps slug → copy. The mapping lives in
``frontend/src/lib/billing/checkout-errors.ts`` and
``backend/tests/unit/test_checkout_failure_reasons.py`` guards that the two
lists stay in step, because a slug the UI does not know silently degrades into
a generic error — the exact failure mode this exists to prevent.

Two rules for adding a reason:

1. it must describe something the customer can act on (or that support needs to
   see), not an internal stack state; and
2. it must never carry provider detail. The message an operator reads goes to
   the log; the customer gets the slug and the RELIASTRA wording.
"""

from __future__ import annotations

from typing import Any, ClassVar

from app.core.exceptions import AppException, ValidationException


class CheckoutReason:
    """The closed set of customer-visible checkout failure reasons."""

    # ── Before payment ───────────────────────────────────────────────────────
    PRICE_NOT_CONFIGURED = "price_not_configured"
    """No payment price is published for this plan/currency, so checkout
    cannot honestly quote an amount. Self-serve is disabled rather than
    guessing a figure."""

    METHOD_UNAVAILABLE = "payment_method_unavailable"
    """The requested payment method is not enabled for this checkout."""

    PLAN_NOT_SELFSERVE = "plan_not_self_serve"
    """Enterprise (Contact Sales) or Free (nothing to charge)."""

    PROVIDER_UNAVAILABLE = "paystack_unavailable"
    """Paystack could not be reached or refused the initialization. Retry."""

    SESSION_EXPIRED = "session_expired"
    """The signed-in session no longer authorizes this checkout."""

    QUOTE_STALE = "quote_stale"
    """The checkout quote no longer matches the backend's current price, so
    the page must be refreshed before any money moves."""

    # ── During payment ───────────────────────────────────────────────────────
    CANCELLED = "payment_cancelled"
    """The customer closed the payment experience without paying."""

    DECLINED = "card_declined"
    """The issuing bank declined the card."""

    ACTION_REQUIRED = "authentication_required"
    """3-D Secure / Strong Customer Authentication is pending or was not
    completed. Not a failure — the customer may be able to retry."""

    PENDING = "payment_pending"
    """Paystack has not settled the transaction yet."""

    # ── After payment ────────────────────────────────────────────────────────
    VERIFICATION_UNAVAILABLE = "verification_unavailable"
    """RELIASTRA could not reach Paystack to confirm the payment. The money may
    have moved; the customer must not be told it failed."""

    NOT_FOUND = "transaction_not_found"
    """The reference does not exist at the provider."""

    NOT_PAID = "transaction_not_paid"
    """The provider reports this reference as not successfully paid."""

    AMOUNT_MISMATCH = "amount_below_plan_price"
    """Collected amount does not cover the plan. Integrity rejection."""

    CURRENCY_MISMATCH = "currency_mismatch"
    """Charged in a currency other than the one disclosed at checkout."""

    ORG_MISMATCH = "organization_mismatch"
    """The payment belongs to a different organization."""

    REPLAYED = "payment_replayed"
    """This reference has already been applied, or an older one was
    re-presented after cancellation."""

    CHANNEL_POLICY = "payment_channel_not_supported"
    """Settled over a payment rail this global checkout never offered."""

    DUPLICATE_PAYMENT = "duplicate_payment"
    """A second, valid payment for a period already covered. Applied as
    credit, and surfaced honestly — never silently swallowed."""


#: Reasons that mean "we know for certain nothing was taken". The UI wording
#: differs sharply between "your card was declined" and "we could not confirm
#: your payment", so this classification is contractual, not cosmetic: it is
#: what allows a screen to promise the customer they were not charged.
#:
#: Being absent from both sets is a legitimate state — it means the outcome is
#: genuinely unknown to us (a provider that reported a payment we cannot
#: reconcile) and the copy must not take a position on the money.
AMOUNT_NEUTRAL_REASONS = frozenset(
    {
        CheckoutReason.CANCELLED,
        CheckoutReason.DECLINED,
        CheckoutReason.ACTION_REQUIRED,
        CheckoutReason.PRICE_NOT_CONFIGURED,
        CheckoutReason.METHOD_UNAVAILABLE,
        CheckoutReason.PLAN_NOT_SELFSERVE,
        CheckoutReason.SESSION_EXPIRED,
        CheckoutReason.QUOTE_STALE,
        # A payment we could not even create, and a reference the gateway does
        # not know, are both cases where no capture exists to worry about.
        CheckoutReason.PROVIDER_UNAVAILABLE,
        CheckoutReason.NOT_FOUND,
    }
)

#: Reasons where a capture may already exist and must be waited for, not
#: re-attempted. These drive the "we are checking this for you" treatment, and
#: the rule the UI copy obeys: never invite another payment from here.
MONEY_MAY_HAVE_MOVED_REASONS = frozenset(
    {
        CheckoutReason.VERIFICATION_UNAVAILABLE,
        CheckoutReason.PENDING,
    }
)


class CheckoutRejectedException(ValidationException):
    """A classified checkout/verification failure.

    Subclasses :class:`ValidationException` rather than replacing it, for two
    reasons that are both about not breaking trust in the API:

    * every existing caller and handler that catches a validation failure on a
      billing route keeps catching this one — a payment path must not start
      throwing an uncaught type because the error got more precise;
    * the HTTP status is still the accurate one (409 for a policy/integrity
      rejection the client cannot fix by retrying, 503 when the provider could
      not be reached and the same click may well work in a minute).

    ``reason`` carries the machine-readable slug, and it also rides in
    ``details`` so the UI can branch on it without string-matching a sentence.
    """

    #: A checkout rejection is not a form-validation failure: the values the
    #: customer submitted are fine, and what is wrong is the state of the world
    #: (this plan is not self-serve, this payment was already applied, this
    #: transaction belongs to someone else). No amount of retrying fixes that,
    #: so the default is 409 Conflict rather than 422 — and the one case where
    #: a retry *is* the answer, the provider being unreachable, is stated
    #: explicitly as 503 at those call sites. A new reason therefore inherits the
    #: safe status instead of silently advertising itself as retryable input.
    DEFAULT_STATUS_CODE: ClassVar[int] = 409

    def __init__(
        self,
        reason: str,
        message: str,
        *,
        status_code: int = DEFAULT_STATUS_CODE,
        extra: dict[str, Any] | None = None,
    ) -> None:
        self.reason = reason
        self.message = message
        details: list[dict[str, Any]] = [{"field": "reason", "issue": reason}]
        for key, value in (extra or {}).items():
            if value is not None:
                details.append({"field": key, "issue": str(value)})
        # Direct to ``AppException``: ``ValidationException`` pins both the
        # status and the code, and this failure type exists precisely to state
        # them more accurately while remaining the same catchable kind.
        AppException.__init__(
            self,
            message=message,
            status_code=status_code,
            code="CHECKOUT_FAILED",
            details=details,
        )
