from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.email_events.models import (
    EmailRecord,
    EmailSuppression,
    ResendWebhookEvent,
)

logger = logging.getLogger(__name__)

# State ranking for out-of-order handling: higher = more terminal
STATE_RANK = {
    "created": 0,
    "sending": 1,
    "sent": 2,
    "scheduled": 2,
    "delivery_delayed": 3,
    "delayed": 3,
    "delivered": 4,
    "bounced": 5,
    "failed": 5,
    "suppressed": 5,
    "complained": 5,
    "opened": 3,
    "clicked": 3,
    "received": 3,
}


def _rank(s: str) -> int:
    return STATE_RANK.get((s or "").lower(), 0)


class ResendWebhookService:
    async def verify_signature(
        self,
        raw: bytes,
        svix_id: str | None,
        svix_timestamp: str | None,
        svix_signature: str | None,
    ) -> bool:
        secret = (
            settings.RESEND_WEBHOOK_SECRET.get_secret_value()
            if settings.RESEND_WEBHOOK_SECRET
            else None
        )
        if not secret:
            # In dev/test without secret, allow but warn (never in production)
            if settings.ENVIRONMENT == "production":
                return False
            logger.warning("RESEND_WEBHOOK_SECRET missing — skipping verification (dev only)")
            return True
        if not svix_id or not svix_timestamp or not svix_signature:
            return False
        # svix secret is whsec_<base64>
        b64 = secret.strip()
        b64 = b64.removeprefix("whsec_")
        try:
            key = base64.b64decode(b64)
        except Exception:
            return False
        to_sign = f"{svix_id}.{svix_timestamp}.{raw.decode('utf-8')}".encode()
        expected = base64.b64encode(hmac.new(key, to_sign, hashlib.sha256).digest()).decode()
        # svix_signature is like "v1,<b64> v1,<b64>" — compare any
        for part in svix_signature.split():
            if "," in part:
                _, sig = part.split(",", 1)
                if hmac.compare_digest(sig.strip(), expected):
                    # also check timestamp freshness (5 min)
                    try:
                        ts = int(svix_timestamp)
                        now = int(datetime.now(UTC).timestamp())
                        if abs(now - ts) > 300:
                            logger.warning("svix timestamp drift")
                            return False
                    except Exception:
                        pass
                    return True
        return False

    async def accept_event(
        self, db: AsyncSession, payload: dict[str, Any], svix_id: str | None
    ) -> str:
        # Resend payload: {type: "email.delivered", data: {email_id, to, from, subject, ...}, created_at}
        event_type = payload.get("type") or payload.get("event_type") or "unknown"
        data = payload.get("data") or {}
        # Stable event_id: prefer svix-id, else payload id
        event_id = (
            svix_id
            or str(payload.get("id") or data.get("email_id") or "")
            or f"unknown-{hash(json.dumps(payload, sort_keys=True))}"
        )
        resend_email_id = data.get("email_id") or data.get("id") or payload.get("email_id")
        recipient = None
        to_field = data.get("to")
        if isinstance(to_field, list) and to_field:
            recipient = to_field[0]
        elif isinstance(to_field, str):
            recipient = to_field
        recipient = recipient or data.get("recipient") or data.get("email")

        # Idempotency: try insert, unique constraint will catch duplicate
        evt = ResendWebhookEvent(
            provider="resend",
            event_id=event_id,
            event_type=event_type,
            resend_email_id=resend_email_id,
            recipient=recipient,
            payload=payload,
            processed_at=datetime.now(UTC),
        )
        db.add(evt)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            logger.info("duplicate webhook %s already processed", event_id)
            return "duplicate"

        # Async state update — do inline for now, but also queue Celery for heavy work
        await self._apply_state(db, evt)
        # Queue background
        try:
            from app.modules.email_events.tasks import process_resend_event

            process_resend_event.delay(str(evt.id))
        except Exception:
            pass
        await db.commit()
        return "accepted"

    async def _apply_state(self, db: AsyncSession, evt: ResendWebhookEvent):
        # Map event_type to status
        m = {
            "email.sent": "sent",
            "email.sending": "sending",
            "email.scheduled": "scheduled",
            "email.delivered": "delivered",
            "email.delivery_delayed": "delivery_delayed",
            "email.bounced": "bounced",
            "email.failed": "failed",
            "email.suppressed": "suppressed",
            "email.complained": "complained",
            "email.opened": "opened",
            "email.clicked": "clicked",
            "email.received": "received",
        }
        status = m.get(evt.event_type, evt.event_type.replace(".", "_"))
        if not evt.resend_email_id:
            return
        rec = await db.execute(
            select(EmailRecord).where(EmailRecord.resend_id == evt.resend_email_id)
        )
        email = rec.scalar_one_or_none()
        if not email:
            logger.debug("no EmailRecord for resend_id %s", evt.resend_email_id)
            # still handle suppression creation
        else:
            # Only allow forward progression
            if _rank(status) >= _rank(email.status):
                email.status = status
                email.last_event_at = datetime.now(UTC)
                # merge meta
                meta = email.meta or {}
                meta["last_event_type"] = evt.event_type
                meta["last_event_id"] = evt.event_id
                if evt.payload:
                    # store small diagnostic without PII
                    data = evt.payload.get("data") or {}
                    if "bounce" in evt.event_type:
                        meta["bounce"] = {
                            k: data.get(k)
                            for k in ("bounce_type", "bounce_subtype", "message")
                            if k in data
                        }
                    if "complain" in evt.event_type:
                        meta["complaint"] = True
                email.meta = meta
                db.add(email)

        # Handle suppression/bounce persistence
        if (
            evt.event_type in ("email.bounced", "email.complained", "email.suppressed")
            and evt.recipient
        ):
            # Permanent bounce => suppress
            is_permanent = True
            if evt.event_type == "email.bounced":
                data = evt.payload.get("data") or {}
                # Resend bounce_type: hard vs soft
                bt = str(data.get("bounce_type") or data.get("type") or "").lower()
                if bt in {"soft", "transient", "temporary"}:
                    is_permanent = False
            if is_permanent:
                # Upsert suppression
                existing = await db.execute(
                    select(EmailSuppression).where(EmailSuppression.recipient == evt.recipient)
                )
                sup = existing.scalar_one_or_none()
                if not sup:
                    sup = EmailSuppression(
                        recipient=evt.recipient,
                        reason=evt.event_type.split(".")[-1],
                        last_event_id=evt.event_id,
                        meta={"resend_email_id": evt.resend_email_id},
                    )
                    db.add(sup)
                else:
                    sup.reason = evt.event_type.split(".")[-1]
                    sup.last_event_id = evt.event_id
                    db.add(sup)
                # Observability: log warning for spike detection
                logger.warning(
                    "email suppression %s for %s id=%s",
                    evt.event_type,
                    evt.recipient[:3] + "***",
                    evt.resend_email_id,
                )

        # Observability counters
        try:
            from app.core.metrics import email_events_total

            email_events_total.labels(event_type=evt.event_type, status=status).inc()
        except Exception:
            pass
        await db.flush()


resend_webhook_service = ResendWebhookService()
