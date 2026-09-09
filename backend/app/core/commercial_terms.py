"""Canonical commercial terms for RELIASTRA billing.

This module is the single source of customer-facing billing, cancellation and
refund copy. Pricing pages, checkout, the billing control center, invoices,
receipts and transactional email all read from here so the product cannot
advertise two different contracts.

Nothing here invents a money-back window. RELIASTRA's Terms of Service define
cancellation (cancel anytime; access continues to the end of the paid period)
and do not define a fixed refund period. Refunds of collected payments are
handled as billing operations through Paystack when issued — they are not
automatic, and they are not a substitute for cancellation.

A defined refund-period (for example a 14- or 30-day money-back guarantee) is
a business policy decision that has not been recorded. Until it is, this
module must not claim one.
"""

from __future__ import annotations

from app.core.permissions import TRIAL_DAYS, get_plan_price_usd
from app.config import settings

# ── Identity ────────────────────────────────────────────────────────────────

SELLER_LEGAL_NAME = "Reliastra, Inc."
SELLER_BRAND = "RELIASTRA"
SELLER_SUPPORT_EMAIL = "support@reliastra.com"
BILLING_EMAIL = "billing@reliastra.com"
REFUND_POLICY_PATH = "/refund-policy"
TERMS_PATH = "/terms"
PRIVACY_PATH = "/privacy"
BILLING_PATH = "/settings/billing"

# No advertised money-back window. ``None`` is the honest value: do not
# replace it with a number.
REFUND_PERIOD_DAYS: int | None = None

TRIAL_REQUIRES_PAYMENT = False
PAYMENT_REQUIRED_BEFORE_TRIAL = False
CANCELLATION_TAKES_EFFECT = "end_of_paid_period"


def _pro_price() -> int:
    return int(get_plan_price_usd("pro"))


def trial_summary() -> str:
    return (
        f"Every new organization receives {TRIAL_DAYS} days of Pro capabilities. "
        "No payment method is required to start. When the trial ends without a "
        "paid subscription, the organization continues on Free."
    )


def trial_end_summary() -> str:
    price = _pro_price()
    return (
        f"When the {TRIAL_DAYS}-day trial ends, the organization reverts to the "
        f"Free plan unless a paid Pro subscription (${price} USD / month) is "
        "active. Configuration and history are preserved."
    )


def price_after_trial_summary() -> str:
    price = _pro_price()
    return (
        f"Pro is ${price} USD per month after the trial, billed through Paystack "
        "for the selected interval. Payment is collected when you subscribe, "
        "not when the trial starts."
    )


def cancellation_summary() -> str:
    return (
        "You may cancel at any time. Access continues until the end of the "
        "current paid period. Cancellation stops future renewal; it does not "
        "by itself refund the current period."
    )


def cancellation_after_effect() -> str:
    return (
        "After cancellation takes effect, the organization returns to the Free "
        "plan. Monitors, configuration and history are preserved; Free limits "
        "apply. You can resume before the period ends if you change your mind."
    )


def refund_summary() -> str:
    return (
        "RELIASTRA does not advertise a fixed money-back window. To request a "
        f"refund of a collected payment, email {BILLING_EMAIL} with the payment "
        "reference from your invoice or receipt. If a refund is issued, it is "
        "processed through Paystack to the original payment method."
    )


def refund_eligibility() -> str:
    return (
        "Refund requests apply to paid Pro charges collected through Paystack. "
        f"The {TRIAL_DAYS}-day evaluation does not require payment, so there is "
        "nothing to refund during the trial. Free plans are not charged."
    )


def refund_period() -> str:
    return (
        "There is no advertised refund period. Cancellation is the defined "
        "customer right under the Terms of Service. A refund of a collected "
        "payment is a separate billing decision, not an automatic entitlement."
    )


def refund_how_to_request() -> str:
    return (
        f"Email {BILLING_EMAIL} from the billing address on the account. Include "
        "the organization name and the payment reference shown on the invoice, "
        "receipt, or billing history."
    )


def refund_destination() -> str:
    return (
        "If a refund is issued, it is sent through Paystack to the original "
        "payment method. RELIASTRA never stores full card numbers."
    )


def refund_processing() -> str:
    return (
        "Issued refunds are processed by Paystack to the original payment "
        "method. The corresponding billing history row is marked refunded. "
        "Partner commissions on a refunded payment are reversed."
    )


def cancellation_versus_refund() -> str:
    return (
        "Cancellation ends future renewal and keeps access until the paid "
        "period ends. A refund, if issued, returns collected funds through "
        "Paystack. Cancelling does not by itself create a refund of the "
        "current period."
    )


def promotional_treatment() -> str:
    return (
        "If a discounted or promotional payment is refunded, the refund is of "
        "the amount actually collected. Partner commissions on that payment "
        "are reversed."
    )


def terms_acceptance_label() -> str:
    return (
        f"I agree to the Terms of Service and understand the cancellation and "
        f"refund terms. Pro is ${_pro_price()} USD per month after the "
        f"{TRIAL_DAYS}-day trial."
    )


def checkout_what_you_buy() -> str:
    return (
        f"RELIASTRA Pro: 50 dependencies, 15-second checks, 90-day retention, "
        f"attribution, evidence and API access, billed ${_pro_price()} USD per "
        "month (or the published annual price) through Paystack."
    )


def public_policy() -> dict:
    """The payload every refund/checkout/billing surface renders from."""
    return {
        "seller_legal_name": SELLER_LEGAL_NAME,
        "seller_brand": SELLER_BRAND,
        "billing_email": BILLING_EMAIL,
        "support_email": SELLER_SUPPORT_EMAIL,
        "refund_policy_path": REFUND_POLICY_PATH,
        "terms_path": TERMS_PATH,
        "privacy_path": PRIVACY_PATH,
        "billing_path": BILLING_PATH,
        "refund_period_days": REFUND_PERIOD_DAYS,
        "trial_length_days": TRIAL_DAYS,
        "trial_requires_payment": TRIAL_REQUIRES_PAYMENT,
        "payment_required_before_trial": PAYMENT_REQUIRED_BEFORE_TRIAL,
        "cancellation_takes_effect": CANCELLATION_TAKES_EFFECT,
        "pro_price_usd": _pro_price(),
        "trial_summary": trial_summary(),
        "trial_end_summary": trial_end_summary(),
        "price_after_trial_summary": price_after_trial_summary(),
        "cancellation_summary": cancellation_summary(),
        "cancellation_after_effect": cancellation_after_effect(),
        "refund_summary": refund_summary(),
        "refund_eligibility": refund_eligibility(),
        "refund_period": refund_period(),
        "refund_how_to_request": refund_how_to_request(),
        "refund_destination": refund_destination(),
        "refund_processing": refund_processing(),
        "cancellation_versus_refund": cancellation_versus_refund(),
        "promotional_treatment": promotional_treatment(),
        "terms_acceptance_label": terms_acceptance_label(),
        "what_you_buy": checkout_what_you_buy(),
        "sections": [
            {"id": "eligibility", "title": "Eligibility", "body": refund_eligibility()},
            {"id": "refund-period", "title": "Refund period", "body": refund_period()},
            {"id": "request", "title": "How to request a refund", "body": refund_how_to_request()},
            {"id": "destination", "title": "Where refunds are sent", "body": refund_destination()},
            {"id": "processing", "title": "Processing", "body": refund_processing()},
            {
                "id": "cancellation",
                "title": "Cancellation versus refund",
                "body": cancellation_versus_refund(),
            },
            {
                "id": "promotional",
                "title": "Promotional and discounted subscriptions",
                "body": promotional_treatment(),
            },
            {"id": "trial", "title": "Trial", "body": trial_summary()},
            {
                "id": "after-trial",
                "title": "After the trial",
                "body": trial_end_summary(),
            },
            {"id": "price", "title": "Price after trial", "body": price_after_trial_summary()},
            {
                "id": "cancel-access",
                "title": "What happens after cancellation",
                "body": cancellation_after_effect(),
            },
        ],
    }


def billing_contact() -> str:
    return settings.BILLING_EMAIL or BILLING_EMAIL
