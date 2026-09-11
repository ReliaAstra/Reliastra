"""Outreach service: review queue, warmup caps, suppression, isolated send.

Send path is deliberately manual-only: the router exposes per-draft send,
tasks never send. Every send re-checks suppression, dedup recency, the daily
cap, and sender-domain verification before touching the provider.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.email_center import resend_client
from app.modules.email_events.models import EmailRecord, EmailSuppression
from app.modules.outreach import hunter
from app.modules.outreach.models import (
    OutreachDraft,
    OutreachLead,
    OutreachSend,
    OutreachSuppression,
)

logger = logging.getLogger(__name__)

OUTREACH_CATEGORY = "outreach"
WARMUP_CEILING = 50
RESEND_LOOKBACK_DAYS = 30


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _is_suppressed(session: AsyncSession, email: str | None, domain: str) -> str | None:
    """Return the suppression reason, checking outreach + global lists."""
    if email:
        key = email.strip().lower()
        row = (
            await session.execute(
                select(OutreachSuppression).where(OutreachSuppression.value == key)
            )
        ).scalar_one_or_none()
        if row:
            return f"outreach:{row.reason}"
        glob = (
            await session.execute(
                select(EmailSuppression).where(EmailSuppression.recipient == key)
            )
        ).scalar_one_or_none()
        if glob:
            return f"global:{glob.reason}"
    dom = (domain or "").strip().lower()
    if dom:
        row = (
            await session.execute(
                select(OutreachSuppression).where(OutreachSuppression.value == dom)
            )
        ).scalar_one_or_none()
        if row:
            return f"outreach-domain:{row.reason}"
    return None


async def sent_today(session: AsyncSession) -> int:
    day_start = _utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    result = await session.execute(
        select(func.count())
        .select_from(OutreachSend)
        .where(
            OutreachSend.created_at >= day_start,
            OutreachSend.status == "sent",
        )
    )
    return int(result.scalar_one() or 0)


async def health_pause(session: AsyncSession) -> str | None:
    """Auto-pause when bounce/complaint rates breach warmup gates."""
    day_start = _utcnow() - timedelta(days=1)
    result = await session.execute(
        select(EmailRecord.status, func.count())
        .where(
            EmailRecord.category == OUTREACH_CATEGORY,
            EmailRecord.created_at >= day_start,
        )
        .group_by(EmailRecord.status)
    )
    counts = {row[0]: int(row[1]) for row in result.all()}
    sent = counts.get("sent", 0) + counts.get("delivered", 0)
    if sent < 5:
        return None  # too little data to judge
    total = sum(counts.values()) or 1
    bounced = counts.get("bounced", 0) + counts.get("failed", 0)
    complained = counts.get("complained", 0)
    if bounced / total > 0.03:
        return f"bounce rate {bounced}/{total} over 3% in last 24h"
    if complained / max(sent, 1) > 0.001:
        return f"complaint rate {complained}/{sent} over 0.1% in last 24h"
    return None


async def upsert_hunter_lead(
    session: AsyncSession,
    *,
    url: str,
    html: str,
    seed_source: str | None,
) -> OutreachLead:
    domain = hunter.normalize_domain(url)
    if not domain:
        raise ValueError("unparseable-url")
    existing = (
        await session.execute(select(OutreachLead).where(OutreachLead.domain == domain))
    ).scalar_one_or_none()
    if existing:
        return existing  # dedup: first sighting wins, never duplicate

    text = hunter.strip_tags(html)
    verdict = hunter.judge(text)
    emails = hunter.extract_emails(html, domain) if verdict.keep else []
    linkedin, x_url = hunter.extract_social(html)
    _ = x_url
    lead = OutreachLead(
        domain=domain,
        website=url[:1024],
        agency_name=hunter.extract_agency_name(html),
        size_band=verdict.size_band,
        contact_email=emails[0] if emails else None,
        contact_route=None if emails else url[:1024],
        linkedin_url=linkedin,
        care_plan_url=url[:1024] if verdict.keep else None,
        care_plan_tiers=hunter.extract_care_plan_tiers(text) if verdict.keep else None,
        services_summary="; ".join(verdict.retainer_signals[:8]) if verdict.keep else None,
        status="new" if verdict.keep else "killed",
        kill_reason=None if verdict.keep else verdict.kill_reason,
        evidence={
            "signals": verdict.retainer_signals,
            "emails_found": len(emails),
            "has_linkedin": bool(linkedin),
        },
        seed_source=(seed_source or "manual")[:128],
    )
    session.add(lead)
    await session.flush()

    if verdict.keep:
        subject, body, angle = hunter.build_draft(
            lead.agency_name, lead.care_plan_tiers, verdict.retainer_signals
        )
        session.add(
            OutreachDraft(
                lead_id=lead.id,
                subject=subject,
                body_text=body,
                angle=angle,
                status="queued" if emails else "draft",
            )
        )
    return lead


async def send_draft(
    session: AsyncSession, draft_id: uuid.UUID, *, from_email: str, reply_to: str
) -> OutreachSend:
    """Reviewer-triggered send with every V1 guardrail enforced."""
    draft = (
        await session.execute(select(OutreachDraft).where(OutreachDraft.id == draft_id))
    ).scalar_one_or_none()
    if draft is None:
        raise LookupError("draft-not-found")
    if draft.status == "sent":
        raise ValueError("already-sent")
    if draft.status == "killed":
        raise ValueError("draft-killed")

    lead = (
        await session.execute(select(OutreachLead).where(OutreachLead.id == draft.lead_id))
    ).scalar_one()
    if not lead.contact_email:
        raise ValueError("no-public-email")

    suppressed = await _is_suppressed(session, lead.contact_email, lead.domain)
    if suppressed:
        raise ValueError(f"suppressed:{suppressed}")

    # One send per domain per 30 days — no re-contact, ever.
    cutoff = _utcnow() - timedelta(days=RESEND_LOOKBACK_DAYS)
    recent = (
        await session.execute(
            select(func.count())
            .select_from(OutreachSend)
            .where(
                OutreachSend.lead_id == lead.id,
                OutreachSend.status == "sent",
                OutreachSend.created_at >= cutoff,
            )
        )
    ).scalar_one()
    if int(recent or 0) > 0:
        raise ValueError("recently-contacted")

    cap = max(1, min(int(settings.OUTREACH_DAILY_CAP), WARMUP_CEILING))
    if await sent_today(session) >= cap:
        raise ValueError("daily-cap-reached")

    pause = await health_pause(session)
    if pause:
        raise ValueError(f"auto-paused:{pause}")

    # Sender domain must be Resend-verified; never invent verification state.
    sender_domain = from_email.partition("@")[2].strip(">").lower()
    snapshot = await resend_client.fetch_domains()
    info = snapshot.status_for(sender_domain) if sender_domain else None
    if info is None or not info.verified:
        raise ValueError("sender-domain-not-verified")

    text = draft.body_text + "\n\n—\nNo longer want these? Reply STOP and you will never hear from us again."
    result = await resend_client.send_email(
        sender=from_email,
        to=[lead.contact_email],
        subject=draft.subject,
        html=None,
        text=text,
        reply_to=reply_to,
        tags=[
            {"name": "category", "value": OUTREACH_CATEGORY},
            {"name": "correlation_id", "value": str(lead.id)},
        ],
    )
    send = OutreachSend(
        lead_id=lead.id,
        draft_id=draft.id,
        recipient=lead.contact_email,
        sender=from_email,
        subject=draft.subject,
        resend_id=result.resend_id,
        status="sent" if result.ok else "failed",
        error=None if result.ok else (result.error_code or "provider_error"),
    )
    session.add(send)
    if result.ok:
        session.add(
            EmailRecord(
                resend_id=result.resend_id,
                recipient=lead.contact_email,
                sender=from_email,
                subject=draft.subject,
                category=OUTREACH_CATEGORY,
                correlation_id=str(lead.id),
                status="sent",
            )
        )
        draft.status = "sent"
        draft.resend_id = result.resend_id
        draft.sent_at = _utcnow()
        draft.send_error = None
        lead.status = "sent"
    else:
        draft.send_error = result.error_code or "provider_error"
        logger.warning("Outreach send failed lead=%s err=%s", lead.domain, draft.send_error)
    await session.flush()
    return send
