from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.infrastructure.email import email_client
from app.infrastructure.email_resend import send_via_resend
from app.modules.email_events.models import EmailRecord

logger = logging.getLogger(__name__)


async def send_transactional_email(
    db: AsyncSession,
    *,
    to: str,
    subject: str,
    html: str,
    text: str | None = None,
    category: str,
    org_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    template: str | None = None,
    correlation_id: str | None = None,
) -> tuple[bool, str | None]:
    """Send via Resend (preferred) with SMTP fallback, and persist EmailRecord with Resend ID.
    Never logs secrets or tokens. Returns (ok, resend_id)."""
    # Choose sender based on category
    sender = (
        settings.RESEND_ALERTS_FROM_EMAIL
        if category in {"monitor_alert", "incident", "alert"}
        else settings.RESEND_FROM_EMAIL
    )
    # Tags for correlation (opaque ids only)
    tags = []
    if org_id:
        tags.append({"name": "org_id", "value": str(org_id)[:64]})
    if template:
        tags.append({"name": "template", "value": template[:64]})

    # Try Resend if configured
    api_key = settings.RESEND_API_KEY.get_secret_value() if settings.RESEND_API_KEY else None
    if api_key:
        ok, resend_id = await send_via_resend(
            to=to,
            subject=subject,
            html=html,
            text=text,
            category=category,
            tags=tags,
            correlation_id=correlation_id,
        )
        # Persist record
        try:
            rec = EmailRecord(
                resend_id=resend_id,
                recipient=to,
                sender=sender,
                subject=subject[:500],
                category=category,
                organization_id=org_id,
                user_id=user_id,
                correlation_id=correlation_id,
                template=template,
                status="sent" if ok else "failed",
                last_event_at=datetime.now(UTC),
                meta={"resend_id": resend_id, "category": category},
            )
            db.add(rec)
            await db.flush()
        except Exception as exc:
            logger.warning("failed to persist EmailRecord: %s", exc)
        if ok:
            return True, resend_id
        # fall through to SMTP on Resend failure

    # SMTP fallback (existing EmailClient)
    try:
        import asyncio

        ok = await asyncio.to_thread(
            email_client.send_email,
            to_email=to,
            subject=subject,
            body=text or "",
            html_body=html,
        )
        # Persist with no resend_id
        try:
            rec = EmailRecord(
                resend_id=None,
                recipient=to,
                sender=sender,
                subject=subject[:500],
                category=category,
                organization_id=org_id,
                user_id=user_id,
                correlation_id=correlation_id,
                template=template,
                status="sent" if ok else "failed",
                last_event_at=datetime.now(UTC),
            )
            db.add(rec)
            await db.flush()
        except Exception:
            pass
        return ok, None
    except Exception as exc:
        logger.warning("SMTP fallback failed: %s", exc)
        return False, None
