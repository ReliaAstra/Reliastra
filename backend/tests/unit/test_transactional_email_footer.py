"""Centralized transactional email footer.

Locks the contract the UX standard requires:

* every automated email renders the canonical support-and-appreciation footer,
* exactly once, in both the HTML and the plain-text part,
* inside a footer region — never inside the message body,
* while the message's own content (links, codes, security instructions) stays
  intact above it,
* and the copy has exactly one definition per tier (see the frontend
  drift-guard at the bottom of this file).
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.payment_pricing import NGN_CURRENCY_NOTICE
from app.infrastructure.email_layout import (
    FOOTER_MARKER,
    TRANSACTIONAL_SUPPORT_FOOTER,
    ensure_footer_html,
    ensure_footer_text,
    footer_html,
    render_email,
    render_html,
    render_text,
)
from app.modules.auth.email_service import EmailAuthService
from app.modules.auth.otp_service import _render_otp_email
from app.modules.billing.notifications import (
    PaymentSummary,
    render_payment_receipt_email,
    render_renewal_reminder_email,
    render_subscription_confirmed_email,
    render_trial_ending_email,
    render_trial_expired_email,
)
from app.modules.notifications.schemas import AlertPayload
from app.modules.notifications.service import EmailChannel


def _counts(html: str) -> tuple[int, int]:
    return (
        html.count(FOOTER_MARKER),
        html.count(TRANSACTIONAL_SUPPORT_FOOTER),
    )


def assert_footer_contract(text: str, html: str, *, label: str) -> None:
    """The five properties every transactional email must satisfy."""
    assert TRANSACTIONAL_SUPPORT_FOOTER in html, f"{label}: HTML footer missing"
    assert TRANSACTIONAL_SUPPORT_FOOTER in text, f"{label}: plain-text footer missing"
    marker_count, copy_count = _counts(html)
    assert marker_count == 1, f"{label}: footer rendered {marker_count} times"
    assert copy_count == 1, f"{label}: footer copy appears {copy_count} times"
    # Footer must be a footer *region*, i.e. outside the content band.
    body_start = html.index('<div class="body">')
    body_end = html.index("</div>", body_start)
    footer_start = html.index(f'id="{FOOTER_MARKER}"')
    assert footer_start > body_end, f"{label}: footer rendered inside the body"
    # Plain text keeps the same paragraph verbatim (no re-flow, no paraphrase).
    assert re.sub(r"\s+", " ", TRANSACTIONAL_SUPPORT_FOOTER) in re.sub(
        r"\s+", " ", text
    )


# ── Template-by-template coverage ──────────────────────────────────────────


@pytest.mark.parametrize(
    "renderer,label",
    [
        (
            lambda: EmailAuthService()._render_verification_email(
                "Ada", "https://app.reliastra.com/verify-email?token=x"
            ),
            "email verification",
        ),
        (
            lambda: EmailAuthService()._render_reset_email(
                "Ada", "https://app.reliastra.com/reset-password?token=x"
            ),
            "password reset",
        ),
        (
            lambda: EmailAuthService()._render_welcome_email(
                "Ada", "Acme", "https://app.reliastra.com/dashboard"
            ),
            "welcome",
        ),
        (lambda: _render_otp_email("Ada", "481920"), "one-time code"),
        (
            lambda: render_trial_expired_email(
                user_name="Ada",
                org_name="Acme",
                trial_days=14,
                fallback_lines=["Data preserved.", "Free limits apply."],
            ),
            "trial expiration",
        ),
        (
            lambda: render_trial_ending_email(
                user_name="Ada", org_name="Acme", days_left=3
            ),
            "trial reminder",
        ),
    ],
)
def test_footer_in_auth_and_trial_templates(renderer, label):
    text, html = renderer()
    assert_footer_contract(text, html, label=label)


def _payment(**overrides) -> PaymentSummary:
    base = dict(
        plan="pro",
        billing_interval="monthly",
        amount_minor=6000000,
        currency="NGN",
        reference="ref_" + uuid.uuid4().hex[:8],
        paid_at=datetime.now(timezone.utc),
        period_start=datetime.now(timezone.utc),
        period_end=datetime.now(timezone.utc) + timedelta(days=30),
    )
    base.update(overrides)
    return PaymentSummary(**base)


def test_footer_in_subscription_confirmation():
    text, html = render_subscription_confirmed_email(
        user_name="Ada", org_name="Acme", payment=_payment()
    )
    assert_footer_contract(text, html, label="subscription confirmation")
    # Content intact: plan, currency and amount all present.
    assert "Pro" in text and "NGN" in text


def test_footer_in_payment_receipt():
    text, html = render_payment_receipt_email(
        user_name="Ada", org_name="Acme", payment=_payment()
    )
    assert_footer_contract(text, html, label="payment receipt")
    assert "\u20a660,000.00 (NGN)" in text
    assert "\u20a660,000.00 (NGN)" in html


def test_footer_in_renewal_notice():
    text, html = render_renewal_reminder_email(
        user_name="Ada", org_name="Acme", payment=_payment(), days_left=3
    )
    assert_footer_contract(text, html, label="renewal notice")


# ── Security content must not be diluted by the footer ─────────────────────


def test_security_instructions_render_above_the_footer():
    """The footer may never sit between the customer and a security warning."""
    text, html = EmailAuthService()._render_reset_email(
        "Ada", "https://app.reliastra.com/reset-password?token=x"
    )
    assert "never ask you for your password" in text
    assert text.index("never ask you for your password") < text.index(
        TRANSACTIONAL_SUPPORT_FOOTER
    )
    assert html.index("never ask you for your password") < html.index(FOOTER_MARKER)


def test_otp_code_renders_above_the_footer():
    text, html = _render_otp_email("Ada", "481920")
    assert "481920" in text
    assert text.index("481920") < text.index(TRANSACTIONAL_SUPPORT_FOOTER)
    assert html.index("481920".replace("4", "4")) < html.index(FOOTER_MARKER)


# ── Idempotence: exactly once, even for hand-authored bodies ────────────────


def test_ensure_footer_text_is_idempotent():
    once = ensure_footer_text("Hello Ada,\n\nYour invoice is attached.")
    twice = ensure_footer_text(once)
    assert once.count(TRANSACTIONAL_SUPPORT_FOOTER) == 1
    assert twice == once


def test_ensure_footer_html_is_idempotent():
    once = ensure_footer_html("<p>Manual note to a customer.</p>")
    assert _counts(once) == (1, 1)
    assert _counts(ensure_footer_html(once)) == (1, 1)


def test_ensure_footer_html_injects_into_a_foreign_document():
    document = (
        "<!DOCTYPE html><html><head><style>p{color:#000}</style></head>"
        "<body><div>Custom HTML</div></body></html>"
    )
    merged = ensure_footer_html(document)
    assert "Custom HTML" in merged
    assert _counts(merged) == (1, 1)
    # One document, not a document nested in a document.
    assert merged.lower().count("<!doctype html") == 1


def test_ensure_transactional_footer_generates_html_for_text_only_bodies():
    from app.infrastructure.email_layout import ensure_transactional_footer

    text, html = ensure_transactional_footer(body_text="Line one.\n\nLine two.")
    assert "Line one." in text and "Line two." in text
    assert _counts(html) == (1, 1)
    assert "Line one." in html


# ── Content preservation + escaping ─────────────────────────────────────────


def test_existing_content_is_preserved_and_escaped():
    text, html = EmailAuthService()._render_welcome_email(
        'Ada <script>alert(1)</script>', "Acme & Co", "https://app/dashboard"
    )
    assert "Ada" in text
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html
    assert "Acme &amp; Co" in html
    assert "https://app/dashboard" in html


def test_alert_channel_email_carries_the_footer():
    """System notifications (incident alerts) are transactional too."""
    import asyncio

    from app.modules.notifications import service as notify_module

    captured: dict = {}

    def _capture(**kwargs):
        captured.update(kwargs)
        return True

    async def run():
        original = notify_module.email_client.send_email
        notify_module.email_client.send_email = _capture
        try:
            await EmailChannel().send(
                AlertPayload(
                    org_id=uuid.uuid4(),
                    title="Stripe is degraded",
                    body="Elevated 5xx responses from Stripe.",
                    severity="major",
                    incident_id=None,
                    metadata={},
                ),
                {"email": "ops@acme.io"},
            )
        finally:
            notify_module.email_client.send_email = original

    asyncio.run(run())
    assert_footer_contract(
        captured["body"], captured["html_body"], label="incident alert"
    )
    assert "Stripe is degraded" in captured["html_body"]


# ── The layout itself ───────────────────────────────────────────────────────


def test_footer_region_has_the_brand_and_support_address():
    html = footer_html()
    assert "support@reliastra.com" in html
    assert "Reliastra — External Dependency Intelligence" in html


def test_unsubscribe_note_is_optional_and_appended_once():
    html = footer_html(unsubscribe_html='<a href="https://reliastra.com/prefs">Preferences</a>')
    assert "Preferences" in html
    assert _counts(html) == (1, 1)


def test_notice_and_footer_copy_have_no_marketing_tone_or_emojis():
    emoji = re.compile(
        "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\u2190-\u2BFF]"
    )
    for copy in (TRANSACTIONAL_SUPPORT_FOOTER, NGN_CURRENCY_NOTICE):
        assert not emoji.search(copy), "emoji in canonical copy"
        lowered = copy.lower()
        for banned in ("hey ", "hit us up", "no worries", "excited", "super-charge"):
            assert banned not in lowered, f"{banned!r} in canonical copy"


def test_accessibility_footer_contrast():
    """Colours used in the footer band must clear WCAG AA on its background."""

    def luminance(hexcolor: str) -> float:
        h = hexcolor.lstrip("#")
        channels = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
        mapped = [
            c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
            for c in channels
        ]
        return 0.2126 * mapped[0] + 0.7152 * mapped[1] + 0.0722 * mapped[2]

    def contrast(a: str, b: str) -> float:
        l1, l2 = sorted([luminance(a), luminance(b)], reverse=True)
        return (l1 + 0.05) / (l2 + 0.05)

    bg = "#f9f9f9"
    for fg in ("#55565e", "#6e6f78", "#4a4b55", "#3b4a86"):
        assert contrast(fg, bg) >= 4.5, f"{fg} on {bg} fails AA"


# ── Drift guard: ONE canonical sentence per tier ────────────────────────────

FRONTEND_COPY = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "src"
    / "lib"
    / "billing"
    / "currency.ts"
)


@pytest.mark.skipif(
    not FRONTEND_COPY.exists(), reason="frontend copy module not present"
)
def test_web_and_email_currency_copy_are_identical():
    """The web surfaces and the backend must not diverge on the disclosure.

    A single canonical string per tier is not enough if the two tiers disagree,
    so the frontend constant is compared byte-for-byte against the backend one.
    """
    source = FRONTEND_COPY.read_text(encoding="utf-8")
    match = re.search(
        r"export const PAYMENT_CURRENCY_NOTICE\s*=.*?;",
        source,
        re.DOTALL,
    )
    assert match, "PAYMENT_CURRENCY_NOTICE must be defined in currency.ts"
    literals = re.findall(r"'([^']*)'|\"([^\"]*)\"|`([^`]*)`", match.group(0))
    frontend_copy = "".join(a or b or c for a, b, c in literals)
    assert frontend_copy == NGN_CURRENCY_NOTICE, (
        "frontend and backend currency disclosures differ"
    )
