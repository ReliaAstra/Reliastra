"""Every email the support desk sends, and the rules they follow.

Three messages exist, one per side of the loop:

============================  ============================================
:func:`announce_to_admins`    a new request arrives - the alert that makes an
                              instant answer possible
:func:`acknowledge_requester` "we have it" - so the writer is not left
                              wondering whether the form submitted
:func:`send_reply`            the answer itself, written by a person
============================  ============================================

All three go through :func:`send_transactional_email`, which is Resend-first
with the SMTP fallback, sets the category's ``Reply-To`` (``support@`` for
these categories) and persists an :class:`EmailRecord` for the send. That
record is what lets the admin Email Activity page show what was actually
delivered, rather than what we intended to deliver.

Delivery failures never raise. A support request must be recorded even when
the mail provider is down - the row is the truth, the email is the
notification - so every function here returns a boolean (or the list of
recipients that accepted mail) and logs.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from app.config import settings
from app.modules.email_events.sender import send_transactional_email
from app.platform.integrations.email_layout import (
    ensure_transactional_footer,
    escape,
    frontend_url,
    render_email,
)

logger = logging.getLogger(__name__)

#: Email categories. Chosen so ``_reply_to_for_category`` routes the answer
#: back to the monitored support alias: a customer hitting Reply on any of
#: these reaches a human mailbox, not ``noreply@``.
CATEGORY_ALERT = "support_alert"
CATEGORY_ACKNOWLEDGEMENT = "support_acknowledgement"
CATEGORY_REPLY = "support_reply"

#: How much of a request is quoted back in an alert. Long enough to triage
#: from the notification alone, short enough that the alert does not become
#: the record.
_QUOTE_LIMIT = 1200


def admin_ticket_url(ticket_id: uuid.UUID | str) -> str:
    """Deep link straight into the admin reply box for one ticket."""
    return frontend_url(f"/admin/support/{ticket_id}")


def _quote(body: str, limit: int = _QUOTE_LIMIT) -> str:
    text = (body or "").strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}\n[...]"


def _request_facts(
    *,
    ticket_number: str,
    subject: str,
    category: str,
    priority: str,
    requester_name: str | None,
    requester_email: str,
    source: str | None,
) -> dict[str, str]:
    return {
        "ticket_number": ticket_number,
        "subject": subject,
        "category": category,
        "priority": priority,
        "requester_name": requester_name or requester_email,
        "requester_email": requester_email,
        "source": source or "console",
    }


async def announce_to_admins(
    db: Any,
    *,
    ticket_id: uuid.UUID | str,
    ticket_number: str,
    subject: str,
    body: str,
    category: str,
    priority: str,
    requester_name: str | None,
    requester_email: str,
    source: str | None,
    recipients: list[str] | None = None,
    org_id: uuid.UUID | None = None,
) -> list[str]:
    """Alert every configured admin address about a new support request.

    Returns the addresses the provider accepted, so the caller can report
    honestly whether anyone was told (``admin_notified`` on the receipt). An
    empty list means the message is still safe in the queue - but no email
    went out, and the console will say so.
    """
    support_alias = settings.SUPPORT_EMAIL
    targets = recipients if recipients is not None else settings.support_notification_recipients
    if not targets:
        logger.warning(
            "No support notification recipients configured; ticket %s alerted nobody",
            ticket_number,
        )
        return []

    facts = _request_facts(
        ticket_number=ticket_number,
        subject=subject,
        category=category,
        priority=priority,
        requester_name=requester_name,
        requester_email=requester_email,
        source=source,
    )
    link = admin_ticket_url(ticket_id)
    urgent = priority in {"urgent", "critical", "high"}
    heading = "New support email"
    subject_line = f"[Support]{' · ' + priority if urgent else ''} {ticket_number} - {subject}"

    body_text = "\n".join(
        [
            f"New support request {ticket_number}.",
            "",
            f"From: {facts['requester_name']} <{facts['requester_email']}>",
            f"Category: {facts['category']}",
            f"Priority: {facts['priority']}",
            f"Arrived via: {facts['source']}",
            "",
            "Message:",
            _quote(body),
            "",
            "Reply from the admin inbox:",
            link,
        ]
    )
    requester_line = (
        f"From {escape(facts['requester_name'])} "
        f"&lt;{escape(facts['requester_email'])}&gt;<br>"
    )
    triage_line = (
        f"Category {escape(facts['category'])} &middot; "
        f"priority {escape(facts['priority'])} &middot; via {escape(facts['source'])}"
    )
    panel = "".join(
        [
            (
                f'<p style="margin:0 0 8px"><strong>{escape(ticket_number)}</strong><br>'
                f"{escape(subject)}</p>"
            ),
            '<p class="note" style="margin:0">',
            requester_line,
            triage_line,
            "</p>",
        ]
    )
    body_html = "".join(
        [
            f'<div class="panel">{panel}</div>',
            f"<p style=\"white-space:pre-wrap\">{escape(_quote(body))}</p>",
            f'<p><a class="button" href="{escape(link)}">Open the reply box</a></p>',
            (
                '<p class="note">Answering from the admin inbox emails the requester '
                "immediately and records the reply on the ticket.</p>"
            ),
        ]
    )
    text, html = render_email(
        heading=heading,
        body_html=body_html,
        body_text=body_text,
        preheader=f"{facts['requester_name']}: {subject}",
    )

    delivered: list[str] = []
    for recipient in targets:
        ok, _provider_id = await send_transactional_email(
            db,
            to=recipient,
            subject=subject_line,
            html=html,
            text=text,
            category=CATEGORY_ALERT,
            org_id=org_id,
            template="support_new_request_alert",
            reply_to=support_alias,
        )
        if ok:
            delivered.append(recipient)
        else:
            logger.warning(
                "Support alert for %s could not be delivered to %s",
                ticket_number,
                recipient,
            )
    return delivered


async def acknowledge_requester(
    db: Any,
    *,
    ticket_number: str,
    subject: str,
    body: str,
    category: str,
    priority: str,
    requester_name: str | None,
    requester_email: str,
    source: str | None,
    to_email: str,
    user_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
) -> bool:
    """Confirm receipt and restate what happens next.

    This is the message that makes the "no live chat" decision acceptable: the
    writer is told, in writing, that a person has it, which address to watch,
    and that replying to the email reaches the same team.
    """
    if not to_email:
        return False

    facts = _request_facts(
        ticket_number=ticket_number,
        subject=subject,
        category=category,
        priority=priority,
        requester_name=requester_name,
        requester_email=requester_email,
        source=source,
    )
    greeting = f"Hello {facts['requester_name']}," if requester_name else "Hello,"
    support_email = support_alias = settings.SUPPORT_EMAIL
    heading = "We received your email"
    subject_line = f"[{ticket_number}] We received your support email"

    body_text = "\n".join(
        [
            greeting,
            "",
            (
                "Your message reached the RELIASTRA support team. It is queued as "
                f"{ticket_number} and a person will answer it by email - replies come "
                f"from {support_email} to this address."
            ),
            "",
            f"Subject: {subject}",
            "",
            "Your message, as received:",
            "",
            _quote(body),
            "",
            "Reply to this email if you have more to add; it reaches the same team.",
        ]
    )
    panel = "".join(
        [
            (
                '<p class="note" style="margin:0 0 8px">Queued as '
                f"<strong>{escape(ticket_number)}</strong></p>"
            ),
            f'<p style="margin:0">{escape(subject)}</p>',
        ]
    )
    body_html = "".join(
        [
            f"<p>{escape(greeting)}</p>",
            (
                "<p>Your message reached the RELIASTRA support team. A person will answer "
                f'it by email - replies come from <a href="mailto:{escape(support_email)}">'
                f"{escape(support_email)}</a> to this address.</p>"
            ),
            f'<div class="panel">{panel}</div>',
            '<p class="note" style="margin:0 0 6px"><strong>Your message, as received</strong></p>',
            f"<p style=\"white-space:pre-wrap\">{escape(_quote(body))}</p>",
            "<p>Reply to this email if you have more to add; it reaches the same team.</p>",
        ]
    )
    text, html = render_email(
        heading=heading,
        body_html=body_html,
        body_text=body_text,
        preheader=f"{ticket_number} is queued for a human reply",
    )

    ok, _provider_id = await send_transactional_email(
        db,
        to=to_email,
        subject=subject_line,
        html=html,
        text=text,
        category=CATEGORY_ACKNOWLEDGEMENT,
        user_id=user_id,
        org_id=org_id,
        template="support_acknowledgement",
        reply_to=support_alias,
    )
    if not ok:
        logger.warning("Support acknowledgement for %s failed", ticket_number)
    return ok


async def send_reply(
    db: Any,
    *,
    ticket_id: uuid.UUID | str,
    ticket_number: str,
    subject: str,
    reply_body: str,
    admin_name: str,
    to_email: str,
    user_id: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
) -> bool:
    """Email an admin's answer to the requester.

    The admin's words are sent verbatim (with the canonical footer appended
    exactly once), under a subject that threads with the original request, and
    the ticket reference is in the body so the requester can quote it back.
    """
    if not to_email:
        return False

    support_alias = settings.SUPPORT_EMAIL
    body_text = "\n".join(
        [
            (reply_body or "").strip(),
            "",
            f"Ticket {ticket_number} - {subject}",
            f"- {admin_name}, RELIASTRA Support",
        ]
    )
    paragraphs = [
        f"<p style=\"white-space:pre-wrap\">{escape(p.strip())}</p>"
        for p in (reply_body or "").split("\n\n")
        if p.strip()
    ]
    body_html = "".join(
        [
            *paragraphs,
            (
                f'<p class="note">{escape(ticket_number)} &middot; {escape(subject)}'
                f"<br>- {escape(admin_name)}, RELIASTRA Support</p>"
            ),
        ]
    )
    # ``ensure_transactional_footer`` is idempotent (it keys off the footer
    # marker), so a reply that already quotes the footer - a pasted thread,
    # say - never gets a second copy.
    text, html = ensure_transactional_footer(body_text=body_text, html_body=body_html)

    ok, _provider_id = await send_transactional_email(
        db,
        to=to_email,
        subject=f"Re: {subject} [{ticket_number}]",
        html=html,
        text=text,
        category=CATEGORY_REPLY,
        user_id=user_id,
        org_id=org_id,
        template="support_reply",
        reply_to=support_alias,
    )
    if not ok:
        logger.warning("Support reply for %s could not be emailed", ticket_number)
    return ok
