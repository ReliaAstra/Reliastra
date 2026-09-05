from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.admin.guards import require_system_admin
from app.modules.email_events.models import EmailRecord, ResendWebhookEvent

router = APIRouter(
    prefix="/v1/admin/email",
    tags=["Admin — Email Health"],
    dependencies=[Depends(require_system_admin)],
)


@router.get("/health")
async def email_health(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    since = datetime.now(UTC) - timedelta(days=days)

    # counts
    def _q(status: str):
        return select(func.count(EmailRecord.id)).where(
            EmailRecord.created_at >= since, EmailRecord.status == status
        )

    total = (
        await db.execute(select(func.count(EmailRecord.id)).where(EmailRecord.created_at >= since))
    ).scalar() or 0
    sent = (await db.execute(_q("sent"))).scalar() or 0
    delivered = (await db.execute(_q("delivered"))).scalar() or 0
    delayed = (await db.execute(_q("delivery_delayed"))).scalar() or 0
    bounced = (await db.execute(_q("bounced"))).scalar() or 0
    complained = (await db.execute(_q("complained"))).scalar() or 0
    failed = (await db.execute(_q("failed"))).scalar() or 0
    suppressed = (await db.execute(_q("suppressed"))).scalar() or 0
    opened = (await db.execute(_q("opened"))).scalar() or 0
    clicked = (await db.execute(_q("clicked"))).scalar() or 0

    def rate(n: int) -> float | None:
        return round(n / sent * 100, 2) if sent else None

    return {
        "days": days,
        "total": total,
        "sent": sent,
        "delivered": delivered,
        "delivery_delayed": delayed,
        "bounced": bounced,
        "complained": complained,
        "failed": failed,
        "suppressed": suppressed,
        "opened": opened,
        "clicked": clicked,
        "delivery_rate": rate(delivered),
        "bounce_rate": rate(bounced),
        "complaint_rate": rate(complained),
        "failure_rate": rate(failed),
        "suppression_rate": rate(suppressed),
    }


@router.get("/events")
async def list_events(
    limit: int = Query(50, ge=1, le=100),
    event_type: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    q = select(ResendWebhookEvent).order_by(ResendWebhookEvent.created_at.desc()).limit(limit)
    if event_type:
        q = q.where(ResendWebhookEvent.event_type == event_type)
    res = await db.execute(q)
    out = []
    for e in res.scalars():
        out.append(
            {
                "id": str(e.id),
                "event_type": e.event_type,
                "event_id": e.event_id,
                "resend_email_id": e.resend_email_id,
                "recipient": e.recipient,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
        )
    return out


@router.get("/records")
async def list_records(
    limit: int = Query(50, ge=1, le=100),
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    q = select(EmailRecord).order_by(EmailRecord.created_at.desc()).limit(limit)
    if category:
        q = q.where(EmailRecord.category == category)
    res = await db.execute(q)
    out = []
    for r in res.scalars():
        out.append(
            {
                "id": str(r.id),
                "resend_id": r.resend_id,
                "recipient": r.recipient,
                "category": r.category,
                "status": r.status,
                "subject": r.subject,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return out
