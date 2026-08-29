"""Billing & subscription emails — rendered through the shared transactional layout.

Every message here inherits :mod:`app.infrastructure.email_layout`, which owns
the canonical support-and-appreciation footer, so billing can never ship an
email that forgets it (or ships it twice).

Currency discipline
-------------------
No price string in this module is hardcoded. Product prices come from
``app.core.permissions`` and payment amounts from
``app.core.payment_pricing`` — the same two sources the checkout used — so a
receipt can never contradict what Paystack actually collected. Receipts state
the *charged* amount and its ISO currency code in words (``NGN 60,000.00 NGN``
style output from :func:`format_money`), never a bare symbol.

The pre-payment currency disclosure paragraph belongs to the *decision*
surfaces (pricing, upgrade, checkout confirmation). A receipt is not a decision
surface: it reports what happened, so it states the currency factually instead
of repeating the forward-looking notice. This is the one intentional difference
between the billing emails and the web notice; the meaning never conflicts.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import date, datetime

from app.core.payment_pricing import (
    PRODUCT_CURRENCY,
    format_money,
    resolve_payment_price,
)
from app.core.permissions import (
    PLAN_PRICES_USD,
    get_plan_annual_price_usd,
    get_plan_display_name,
)
from app.infrastructure.email import email_client
from app.infrastructure.email_layout import (
    escape,
    frontend_url,
    render_email,
    site_url,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PaymentSummary:
    """What was actually collected, straight from the provider payload."""

    plan: str
    billing_interval: str
    amount_minor: int | None
    currency: str
    reference: str | None = None
    paid_at: datetime | None = None
    period_start: datetime | None = None
    period_end: datetime | None = None

    @property
    def charged_label(self) -> str:
        if not self.amount_minor:
            return ""
        return format_money(self.amount_minor, self.currency)

    @property
    def plan_name(self) -> str:
        return get_plan_display_name(self.plan)

    @property
    def interval_label(self) -> str:
        return "annual" if (self.billing_interval or "").lower() == "annual" else "monthly"

    @property
    def payment_price_label(self) -> str:
        """The published payment price for this plan/interval (may be empty)."""
        price = resolve_payment_price(self.plan, self.interval_label)
        return format_money(price.payment_amount, price.payment_currency)

    @property
    def product_price_label(self) -> str:
        usd = (
            get_plan_annual_price_usd(self.plan)
            if self.interval_label == "annual"
            else PLAN_PRICES_USD.get(self.plan, 0)
        )
        if not usd:
            return ""
        return format_money(int(usd) * 100, PRODUCT_CURRENCY)

    @property
    def period_label(self) -> str:
        if not self.period_start or not self.period_end:
            return ""
        return (
            f"{_day(self.period_start)} \u2013 {_day(self.period_end)}"
        )


def _day(value: datetime | date) -> str:
    return value.strftime("%d %b %Y")


async def _send(*, to_email: str, subject: str, body: str, html: str) -> bool:
    """Send through SMTP off the event loop. Never raises to the caller."""
    if not to_email:
        return False
    try:
        return bool(
            await asyncio.to_thread(
                email_client.send_email,
                to_email=to_email,
                subject=subject,
                body=body,
                html_body=html,
            )
        )
    except Exception:
        logger.warning("Billing email '%s' to %s failed", subject, to_email, exc_info=True)
        return False


# ── Subscription confirmation ───────────────────────────────────────────────


def render_subscription_confirmed_email(
    *, user_name: str, org_name: str, payment: PaymentSummary
) -> tuple[str, str]:
    billing_url = frontend_url("/settings/billing")
    amount_line = (
        f"Amount charged: {payment.charged_label}\n" if payment.charged_label else ""
    )
    body_text = f"""
Hello {user_name},

Your RELIASTRA subscription is active. {org_name} is now on the {payment.plan_name} plan ({payment.interval_label} billing).

{amount_line}Billing currency: {payment.currency}
Renews: {_day(payment.period_end) if payment.period_end else 'see your billing page'}

Manage your plan, seats and usage at any time: {billing_url}

Best regards,
The Reliastra Team
""".strip()
    rows = []
    if payment.charged_label:
        rows.append(
            f"<tr><td style=\"padding:6px 0;color:#55565e\">Amount charged</td>"
            f"<td style=\"padding:6px 0;text-align:right\"><strong>{escape(payment.charged_label)}</strong></td></tr>"
        )
    rows.append(
        f"<tr><td style=\"padding:6px 0;color:#55565e\">Billing currency</td>"
        f"<td style=\"padding:6px 0;text-align:right\">{escape(payment.currency)}</td></tr>"
    )
    rows.append(
        f"<tr><td style=\"padding:6px 0;color:#55565e\">Billing</td>"
        f"<td style=\"padding:6px 0;text-align:right\">{escape(payment.interval_label.capitalize())}</td></tr>"
    )
    if payment.period_end:
        rows.append(
            f"<tr><td style=\"padding:6px 0;color:#55565e\">Renews</td>"
            f"<td style=\"padding:6px 0;text-align:right\">{escape(_day(payment.period_end))}</td></tr>"
        )
    body_html = (
        f"<p>Hello <strong>{escape(user_name)}</strong>,</p>"
        f"<p>Your RELIASTRA subscription is active. <strong>{escape(org_name)}</strong> "
        f"is now on the <strong>{escape(payment.plan_name)}</strong> plan "
        f"({escape(payment.interval_label)} billing).</p>"
        '<div class="panel"><table style="width:100%;border-collapse:collapse;font-size:14px">'
        + "".join(rows)
        + "</table></div>"
        '<p style="text-align: center;">'
        f'<a href="{billing_url}" class="button">Manage your plan</a></p>'
    )
    return render_email(
        heading="Your RELIASTRA subscription is active",
        body_html=body_html,
        body_text=body_text,
        preheader=f"{payment.plan_name} plan ({payment.interval_label} billing) is now active",
    )


async def send_subscription_confirmed_email(
    *, to_email: str, user_name: str, org_name: str, payment: PaymentSummary
) -> bool:
    plain, html = render_subscription_confirmed_email(
        user_name=user_name, org_name=org_name, payment=payment
    )
    return await _send(
        to_email=to_email,
        subject=f"RELIASTRA {payment.plan_name} — subscription confirmed",
        body=plain,
        html=html,
    )


# ── Payment receipt ─────────────────────────────────────────────────────────


def render_payment_receipt_email(
    *, user_name: str, org_name: str, payment: PaymentSummary
) -> tuple[str, str]:
    body_text = f"""
Hello {user_name},

This is your receipt for the recent RELIASTRA payment.

Plan: {payment.plan_name} ({payment.interval_label} billing)
Workspace: {org_name}
Amount charged: {payment.charged_label or 'See your billing page'}
Currency: {payment.currency}
Payment reference: {payment.reference or 'N/A'}
Date: {_day(payment.paid_at) if payment.paid_at else 'N/A'}
{f'Billing period: {payment.period_label}' if payment.period_label else ''}

This amount was processed through Paystack in {payment.currency}. If anything looks incorrect, reply to this email and our team will resolve it.

Best regards,
The Reliastra Team
""".strip()
    rows = [
        ("Plan", f"{payment.plan_name} ({payment.interval_label})"),
        ("Workspace", org_name),
        ("Amount charged", payment.charged_label or "—"),
        ("Currency", payment.currency),
        ("Payment reference", payment.reference or "—"),
        ("Date", _day(payment.paid_at) if payment.paid_at else "—"),
    ]
    if payment.period_label:
        rows.append(("Billing period", payment.period_label))
    table = "".join(
        f"<tr><td style=\"padding:6px 0;color:#55565e\">{escape(label)}</td>"
        f"<td style=\"padding:6px 0;text-align:right\">{escape(value)}</td></tr>"
        for label, value in rows
    )
    body_html = (
        f"<p>Hello <strong>{escape(user_name)}</strong>,</p>"
        "<p>This is your receipt for the recent RELIASTRA payment.</p>"
        f'<div class="panel"><table style="width:100%;border-collapse:collapse;font-size:14px">{table}</table></div>'
        f'<p class="note">This amount was processed through Paystack in '
        f"{escape(payment.currency)}. If anything looks incorrect, reply to this "
        "email and our team will resolve it.</p>"
    )
    return render_email(
        heading=f"Payment receipt — {payment.plan_name}",
        body_html=body_html,
        body_text=body_text,
        preheader=f"{payment.charged_label or 'Receipt'} for your RELIASTRA subscription",
    )


async def send_payment_receipt_email(
    *, to_email: str, user_name: str, org_name: str, payment: PaymentSummary
) -> bool:
    plain, html = render_payment_receipt_email(
        user_name=user_name, org_name=org_name, payment=payment
    )
    return await _send(
        to_email=to_email,
        subject=f"RELIASTRA receipt — {payment.charged_label or payment.plan_name}",
        body=plain,
        html=html,
    )


# ── Renewal notice ──────────────────────────────────────────────────────────


def render_renewal_reminder_email(
    *, user_name: str, org_name: str, payment: PaymentSummary, days_left: int
) -> tuple[str, str]:
    amount = payment.charged_label or payment.payment_price_label
    next_charge_line = f"Next charge: {amount} on {_day(payment.period_end)}" if amount and payment.period_end else ""
    body_text = f"""
Hello {user_name},

Your {payment.plan_name} subscription for {org_name} renews in {days_left} day{'s' if days_left == 1 else ''}.

{next_charge_line}
Billing currency: {payment.currency}

Your payment method is charged automatically — no action is needed. To change plan or cancel before then: {frontend_url('/settings/billing')}

Best regards,
The Reliastra Team
""".strip()
    rows = []
    if amount:
        rows.append(
            f"<tr><td style=\"padding:6px 0;color:#55565e\">Next charge</td>"
            f"<td style=\"padding:6px 0;text-align:right\"><strong>{escape(amount)}</strong></td></tr>"
        )
    if payment.period_end:
        rows.append(
            f"<tr><td style=\"padding:6px 0;color:#55565e\">On</td>"
            f"<td style=\"padding:6px 0;text-align:right\">{escape(_day(payment.period_end))}</td></tr>"
        )
    rows.append(
        f"<tr><td style=\"padding:6px 0;color:#55565e\">Billing currency</td>"
        f"<td style=\"padding:6px 0;text-align:right\">{escape(payment.currency)}</td></tr>"
    )
    body_html = (
        f"<p>Hello <strong>{escape(user_name)}</strong>,</p>"
        f"<p>Your <strong>{escape(payment.plan_name)}</strong> subscription for "
        f"{escape(org_name)} renews in <strong>{days_left} day{'s' if days_left == 1 else ''}</strong>.</p>"
        '<div class="panel"><table style="width:100%;border-collapse:collapse;font-size:14px">'
        + "".join(rows)
        + "</table></div>"
        f'<p style="text-align: center;"><a href="{frontend_url("/settings/billing")}" class="button">Review billing</a></p>'
    )
    return render_email(
        heading="Upcoming renewal",
        body_html=body_html,
        body_text=body_text,
        preheader=f"Your {payment.plan_name} subscription renews in {days_left} days",
    )


async def send_renewal_reminder_email(
    *, to_email: str, user_name: str, org_name: str, payment: PaymentSummary, days_left: int
) -> bool:
    plain, html = render_renewal_reminder_email(
        user_name=user_name, org_name=org_name, payment=payment, days_left=days_left
    )
    return await _send(
        to_email=to_email,
        subject=f"Your RELIASTRA {payment.plan_name} plan renews in {days_left} days",
        body=plain,
        html=html,
    )


# ── Trial / evaluation reminder ─────────────────────────────────────────────


def render_trial_ending_email(
    *,
    user_name: str,
    org_name: str,
    days_left: int,
    plan: str = "pro",
) -> tuple[str, str]:
    price = resolve_payment_price(plan, "monthly")
    upgrade_url = frontend_url("/settings/billing")
    amount_bits: list[str] = []
    if price.product_amount:
        amount_bits.append(
            f"Pro is {format_money(price.product_amount, price.product_currency)} per month"
        )
    if price.payment_amount and price.payment_currency != price.product_currency:
        amount_bits.append(
            f"billed as {format_money(price.payment_amount, price.payment_currency)}"
        )
    price_line = ", ".join(amount_bits)
    body_text = f"""
Hello {user_name},

Your {days_left} day{'s' if days_left == 1 else ''} of full RELIASTRA access for {org_name} {'ends tomorrow' if days_left <= 1 else f'end in {days_left} days'}.

{price_line + '.' if price_line else ''}
Your configuration and history are preserved either way — nothing is deleted.

Keep full access: {upgrade_url}

Best regards,
The Reliastra Team
""".strip()
    body_html = (
        f"<p>Hello <strong>{escape(user_name)}</strong>,</p>"
        f"<p>Your <strong>{days_left} day{'s' if days_left == 1 else ''}</strong> of full "
        f"RELIASTRA access for {escape(org_name)} "
        f"{'ends tomorrow' if days_left <= 1 else f'end in {days_left} days'}.</p>"
        + (f'<div class="panel"><p class="note" style="margin:0">{escape(price_line)}.</p></div>' if price_line else "")
        + "<p>Your configuration and history are preserved either way — nothing is deleted.</p>"
        f'<p style="text-align: center;"><a href="{upgrade_url}" class="button">Keep full access</a></p>'
    )
    return render_email(
        heading="Your full-access evaluation is ending",
        body_html=body_html,
        body_text=body_text,
        preheader=f"{days_left} days of full access remaining",
    )


async def send_trial_ending_email(
    *, to_email: str, user_name: str, org_name: str, days_left: int
) -> bool:
    plain, html = render_trial_ending_email(
        user_name=user_name, org_name=org_name, days_left=days_left
    )
    return await _send(
        to_email=to_email,
        subject="Your RELIASTRA full-access trial is ending soon",
        body=plain,
        html=html,
    )


# ── Trial / evaluation expiry ───────────────────────────────────────────────


def render_trial_expired_email(
    *, user_name: str, org_name: str, trial_days: int, fallback_lines: list[str]
) -> tuple[str, str]:
    """Expiry notice. Content (limits, paused capabilities) is security- and
    entitlement-critical, so it lives in the body; the shared footer sits below
    it, separated."""
    origin = frontend_url("/settings/billing")
    price = resolve_payment_price("pro", "monthly")
    price_bits: list[str] = []
    if price.product_amount:
        price_bits.append(
            f"Pro ({format_money(price.product_amount, price.product_currency)}/mo)"
        )
    if price.payment_amount and price.payment_currency != price.product_currency:
        price_bits.append(
            f"billed in {format_money(price.payment_amount, price.payment_currency)}"
        )
    price_line = " ".join(price_bits)
    bullet_text = "".join(f"- {line}\n" for line in fallback_lines)
    body_text = f"""
Hello {user_name},

Your {trial_days}-day RELIASTRA trial for {org_name} has ended.

What this means:
{bullet_text.rstrip()}

{f'{price_line} unlocks evidence reports, deterministic attribution, Slack alerts and API access.' if price_line else ''}

Upgrade to keep full visibility: {origin}

Best regards,
The Reliastra Team
""".strip()
    bullets = "".join(f"<li>{escape(line)}</li>" for line in fallback_lines)
    body_html = (
        f"<p>Hello <strong>{escape(user_name)}</strong>,</p>"
        f"<p>Your <strong>{trial_days}-day RELIASTRA trial</strong> for "
        f"<strong>{escape(org_name)}</strong> has ended.</p>"
        '<div class="panel"><p class="note" style="margin:0 0 6px"><strong>What this means</strong></p>'
        f"<ul style=\"margin:0\">{bullets}</ul></div>"
        + (
            f'<p class="note">{escape(price_line)} unlocks evidence reports, deterministic '
            "attribution, Slack alerts and API access.</p>"
            if price_line
            else ""
        )
        + f'<p style="text-align: center;"><a href="{origin}" class="button">Upgrade to keep full visibility</a></p>'
    )
    return render_email(
        heading="Your RELIASTRA trial has ended",
        body_html=body_html,
        body_text=body_text,
        preheader="Your full-access evaluation has ended",
    )


def billing_portal_url() -> str:
    return site_url("/settings/billing")
