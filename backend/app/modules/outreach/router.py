"""Outreach admin surface: review queue, manual hunt trigger, sends, QA.

``/v1/admin/outreach/*`` - every route requires a dedicated ADMIN-console
session (``require_system_admin``). Sends are per-draft and reviewer-triggered;
no endpoint, task, or schedule sends without a human approving that draft.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.rate_limit import SlidingWindowRateLimiter, enforce_rate_limit
from app.db.session import get_db
from app.modules.admin.decorators import audit_log
from app.modules.admin.guards import require_system_admin
from app.modules.outreach.models import (
    OutreachDraft,
    OutreachLead,
    OutreachSuppression,
)
from app.modules.outreach.schemas import (
    OutreachDraftOut,
    OutreachDraftPatch,
    OutreachHuntRequest,
    OutreachLeadCreate,
    OutreachLeadOut,
    OutreachLeadPatch,
    OutreachOverviewOut,
    OutreachQaOut,
    OutreachSuppressionCreate,
)
from app.modules.outreach.service import (
    WARMUP_CEILING,
    health_pause,
    send_draft,
    sent_today,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/v1/admin/outreach",
    tags=["Admin - Outreach"],
    dependencies=[Depends(require_system_admin)],
)

_send_limiter = SlidingWindowRateLimiter(
    limit=60, window_seconds=3600, key_prefix="rl_outreach_send"
)
_hunt_limiter = SlidingWindowRateLimiter(
    limit=10, window_seconds=3600, key_prefix="rl_outreach_hunt"
)

_VALID_LEAD_STATUS = {"new", "queued", "approved", "sent", "killed", "skipped"}
_VALID_DRAFT_STATUS = {"draft", "queued", "approved", "sent", "killed"}


def _lead_out(row: OutreachLead) -> OutreachLeadOut:
    return OutreachLeadOut(
        id=row.id,
        domain=row.domain,
        website=row.website,
        agency_name=row.agency_name,
        country=row.country,
        city=row.city,
        size_band=row.size_band,
        founder_name=row.founder_name,
        contact_email=row.contact_email,
        contact_route=row.contact_route,
        linkedin_url=row.linkedin_url,
        care_plan_url=row.care_plan_url,
        care_plan_tiers=row.care_plan_tiers,
        status=row.status,
        kill_reason=row.kill_reason,
        seed_source=row.seed_source,
        created_at=row.created_at,
    )


@router.get("/overview", response_model=OutreachOverviewOut)
async def overview(db: AsyncSession = Depends(get_db)) -> OutreachOverviewOut:
    totals = dict(
        (
            await db.execute(
                select(OutreachLead.status, func.count()).group_by(OutreachLead.status)
            )
        ).all()
    )
    kills = dict(
        (
            await db.execute(
                select(OutreachLead.kill_reason, func.count())
                .where(OutreachLead.status == "killed")
                .group_by(OutreachLead.kill_reason)
            )
        ).all()
    )
    pause = await health_pause(db)
    return OutreachOverviewOut(
        queued_today=int(totals.get("new", 0)) + int(totals.get("queued", 0)),
        sent_today=await sent_today(db),
        daily_cap=max(1, min(int(settings.OUTREACH_DAILY_CAP), WARMUP_CEILING)),
        warmup_ceiling=WARMUP_CEILING,
        paused=pause is not None,
        pause_reason=pause,
        totals={k: int(v) for k, v in totals.items()},
        kill_breakdown={str(k or "unknown"): int(v) for k, v in kills.items()},
    )


@router.get("/leads", response_model=list[OutreachLeadOut])
async def list_leads(
    status: str | None = Query(default=None, max_length=32),
    q: str | None = Query(default=None, max_length=128),
    page: int = Query(default=1, ge=1, le=1000),
    page_size: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[OutreachLeadOut]:
    stmt = select(OutreachLead).order_by(OutreachLead.created_at.desc())
    if status:
        stmt = stmt.where(OutreachLead.status == status)
    if q:
        like = f"%{q.strip().lower()[:128]}%"
        stmt = stmt.where(
            (func.lower(OutreachLead.domain).like(like))
            | (func.lower(OutreachLead.agency_name).like(like))
        )
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()
    return [_lead_out(r) for r in rows]


@router.post("/leads", response_model=OutreachLeadOut, status_code=201)
@audit_log(action="outreach.lead.create", entity_type="outreach_lead")
async def create_lead(
    payload: OutreachLeadCreate, db: AsyncSession = Depends(get_db)
) -> OutreachLeadOut:
    from app.modules.outreach.hunter import normalize_domain

    domain = normalize_domain(payload.website)
    if not domain:
        from app.core.exceptions import ValidationException

        raise ValidationException("Unparseable website URL")
    existing = (
        await db.execute(select(OutreachLead).where(OutreachLead.domain == domain))
    ).scalar_one_or_none()
    if existing:
        return _lead_out(existing)
    row = OutreachLead(
        domain=domain,
        website=payload.website[:1024],
        status="new",
        seed_source=(payload.seed_source or "manual")[:128],
        contact_route=payload.website[:1024],
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _lead_out(row)


@router.patch("/leads/{lead_id}", response_model=OutreachLeadOut)
@audit_log(action="outreach.lead.review", entity_type="outreach_lead")
async def review_lead(
    lead_id: uuid.UUID, payload: OutreachLeadPatch, db: AsyncSession = Depends(get_db)
) -> OutreachLeadOut:
    from app.core.exceptions import ValidationException

    row = (
        await db.execute(select(OutreachLead).where(OutreachLead.id == lead_id))
    ).scalar_one_or_none()
    if row is None:
        from app.core.exceptions import NotFoundException

        raise NotFoundException("Lead not found")
    if payload.status:
        if payload.status not in _VALID_LEAD_STATUS:
            raise ValidationException("Invalid lead status")
        row.status = payload.status
    if payload.kill_reason is not None:
        row.kill_reason = payload.kill_reason[:1024]
    await db.commit()
    await db.refresh(row)
    return _lead_out(row)


@router.get("/drafts", response_model=list[OutreachDraftOut])
async def list_drafts(
    status: str | None = Query(default=None, max_length=32),
    page: int = Query(default=1, ge=1, le=1000),
    page_size: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[OutreachDraftOut]:
    stmt = (
        select(OutreachDraft, OutreachLead)
        .join(OutreachLead, OutreachLead.id == OutreachDraft.lead_id)
        .order_by(OutreachDraft.created_at.desc())
    )
    if status:
        stmt = stmt.where(OutreachDraft.status == status)
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    out: list[OutreachDraftOut] = []
    for draft, lead in (await db.execute(stmt)).all():
        out.append(
            OutreachDraftOut(
                id=draft.id,
                lead_id=draft.lead_id,
                agency_name=lead.agency_name,
                domain=lead.domain,
                contact_email=lead.contact_email,
                subject=draft.subject,
                body_text=draft.body_text,
                angle=draft.angle,
                status=draft.status,
                sent_at=draft.sent_at,
                send_error=draft.send_error,
            )
        )
    return out


@router.patch("/drafts/{draft_id}", response_model=OutreachDraftOut)
@audit_log(action="outreach.draft.review", entity_type="outreach_draft")
async def review_draft(
    draft_id: uuid.UUID, payload: OutreachDraftPatch, db: AsyncSession = Depends(get_db)
) -> OutreachDraftOut:
    from app.core.exceptions import NotFoundException, ValidationException

    draft = (
        await db.execute(select(OutreachDraft).where(OutreachDraft.id == draft_id))
    ).scalar_one_or_none()
    if draft is None:
        raise NotFoundException("Draft not found")
    if draft.status == "sent":
        raise ValidationException("Sent drafts are immutable")
    if payload.subject is not None:
        draft.subject = payload.subject[:500]
    if payload.body_text is not None:
        draft.body_text = payload.body_text[:20000]
    if payload.status:
        if payload.status not in _VALID_DRAFT_STATUS:
            raise ValidationException("Invalid draft status")
        draft.status = payload.status
    await db.commit()
    await db.refresh(draft)
    lead = (
        await db.execute(select(OutreachLead).where(OutreachLead.id == draft.lead_id))
    ).scalar_one()
    return OutreachDraftOut(
        id=draft.id,
        lead_id=draft.lead_id,
        agency_name=lead.agency_name,
        domain=lead.domain,
        contact_email=lead.contact_email,
        subject=draft.subject,
        body_text=draft.body_text,
        angle=draft.angle,
        status=draft.status,
        sent_at=draft.sent_at,
        send_error=draft.send_error,
    )


@router.post("/drafts/{draft_id}/send")
@audit_log(action="outreach.draft.send", entity_type="outreach_draft")
async def send_reviewed_draft(
    draft_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> dict:
    from app.core.exceptions import ValidationException

    try:
        await enforce_rate_limit(_send_limiter, key="send")
    except Exception:
        pass
    try:
        send = await send_draft(
            db,
            draft_id,
            from_email=settings.OUTREACH_FROM_EMAIL,
            reply_to=settings.OUTREACH_REPLY_TO,
        )
    except LookupError:
        from app.core.exceptions import NotFoundException

        raise NotFoundException("Draft not found")
    except ValueError as exc:
        raise ValidationException(str(exc) or "Send blocked")
    await db.commit()
    logger.info("Outreach draft sent id=%s resend=%s", draft_id, send.resend_id)
    return {"send_id": str(send.id), "resend_id": send.resend_id, "status": send.status}


@router.post("/hunt", status_code=202)
@audit_log(action="outreach.hunt.trigger", entity_type="outreach_hunt")
async def trigger_hunt(payload: OutreachHuntRequest) -> dict:
    try:
        await enforce_rate_limit(_hunt_limiter, key="hunt")
    except Exception:
        pass
    from app.modules.outreach.tasks import process_seed_urls

    urls = [u.strip() for u in payload.urls if u.strip()][:300]
    process_seed_urls.delay(urls, payload.seed_source or "manual")
    return {"accepted": len(urls)}


@router.get("/suppressions", response_model=list[dict])
async def list_suppressions(db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (
        await db.execute(select(OutreachSuppression).order_by(OutreachSuppression.created_at.desc()).limit(500))
    ).scalars().all()
    return [
        {"id": str(r.id), "value": r.value, "kind": r.kind, "reason": r.reason}
        for r in rows
    ]


@router.post("/suppressions", status_code=201)
@audit_log(action="outreach.suppression.add", entity_type="outreach_suppression")
async def add_suppression(
    payload: OutreachSuppressionCreate, db: AsyncSession = Depends(get_db)
) -> dict:
    value = payload.value.strip().lower()
    kind = "email" if "@" in value else "domain"
    existing = (
        await db.execute(select(OutreachSuppression).where(OutreachSuppression.value == value))
    ).scalar_one_or_none()
    if existing:
        return {"id": str(existing.id), "value": existing.value, "deduped": True}
    row = OutreachSuppression(value=value, kind=kind, reason=payload.reason[:64], source="admin")
    db.add(row)
    await db.commit()
    return {"id": str(row.id), "value": value, "deduped": False}


@router.get("/qa", response_model=OutreachQaOut)
async def qa(q: str = Query(min_length=2, max_length=500), db: AsyncSession = Depends(get_db)) -> OutreachQaOut:
    """Plain-English answers over the outreach queue. Fixed intents only (V1)."""
    text = q.strip().lower()
    if "kill" in text:
        kills = (
            await db.execute(
                select(OutreachLead.kill_reason, func.count())
                .where(OutreachLead.status == "killed")
                .group_by(OutreachLead.kill_reason)
            )
        ).all()
        total = sum(int(n) for _, n in kills)
        top = sorted(kills, key=lambda r: int(r[1]), reverse=True)[:8]
        summary = "; ".join(f"{k or 'unknown'}: {int(n)}" for k, n in top) or "no kills yet"
        return OutreachQaOut(
            answer=f"{total} leads killed. Top reasons — {summary}.",
            rows=[{"kill_reason": k, "count": int(n)} for k, n in top],
        )
    if "sent" in text or "volume" in text or "today" in text:
        pause = await health_pause(db)
        return OutreachQaOut(
            answer=(
                f"Sent today: {await sent_today(db)} of cap "
                f"{max(1, min(int(settings.OUTREACH_DAILY_CAP), WARMUP_CEILING))}."
                + (f" PAUSED: {pause}." if pause else " Deliverability gates holding.")
            )
        )
    # Fallback: filtered lead list over status/size/country/domain text.
    stmt = select(OutreachLead).order_by(OutreachLead.created_at.desc()).limit(25)
    for token in ("queued", "approved", "sent", "killed", "skipped", "new"):
        if token in text:
            stmt = select(OutreachLead).where(OutreachLead.status == token).order_by(
                OutreachLead.created_at.desc()
            ).limit(25)
            break
    rows = (await db.execute(stmt)).scalars().all()
    return OutreachQaOut(
        answer=f"{len(rows)} most recent matching leads.",
        rows=[
            {"domain": r.domain, "agency": r.agency_name, "status": r.status,
             "size": r.size_band, "email": bool(r.contact_email)}
            for r in rows
        ],
    )
