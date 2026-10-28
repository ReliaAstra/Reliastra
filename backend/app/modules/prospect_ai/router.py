"""Prospect AI admin surface: import, draft generation, review, send.

``/v1/admin/prospect-ai/*`` - every route requires the dedicated ADMIN
console session (``require_system_admin``). Drafting is reviewer-triggered
and capped per call; sending is per-lead and goes through the Email Center
pipeline, so nothing ever sends without a human pressing the button.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import SlidingWindowRateLimiter, enforce_rate_limit
from app.db.session import get_db
from app.modules.admin.decorators import audit_log
from app.modules.admin.guards import require_system_admin
from app.modules.email_center.service import email_service
from app.modules.prospect_ai.models import ProspectLead, ProspectReport
from app.modules.prospect_ai.schemas import (
    MAX_LEADS_PER_GENERATE,
    ProspectAiStatus,
    ProspectDraftPatch,
    ProspectGenerateRequest,
    ProspectImportRequest,
    ProspectImportResponse,
    ProspectLeadOut,
    ProspectReportOut,
    ProspectSendRequest,
)
from app.modules.prospect_ai.service import (
    build_send_request,
    draft_lead,
    lead_from_prospect,
    parse_prospects,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/v1/admin/prospect-ai",
    tags=["Admin - Prospect AI"],
    dependencies=[Depends(require_system_admin)],
)

_generate_limiter = SlidingWindowRateLimiter(
    limit=30, window_seconds=3600, key_prefix="rl_prospect_generate"
)
_send_limiter = SlidingWindowRateLimiter(
    limit=60, window_seconds=3600, key_prefix="rl_prospect_send"
)


def _report_out(row: ProspectReport) -> ProspectReportOut:
    return ProspectReportOut(
        id=row.id,
        title=row.title,
        report_date=row.report_date,
        source_filename=row.source_filename,
        prospect_count=row.prospect_count,
        skipped_count=row.skipped_count,
        notes=row.notes,
        created_at=row.created_at,
    )


def _lead_out(row: ProspectLead) -> ProspectLeadOut:
    return ProspectLeadOut(
        id=row.id,
        report_id=row.report_id,
        rank=row.rank,
        company=row.company,
        product=row.product,
        website=row.website,
        domain=row.domain,
        contact_name=row.contact_name,
        role=row.role,
        contact_email=row.contact_email,
        pain_signal=row.pain_signal,
        external_dependencies=row.external_dependencies,
        evidence=row.evidence,
        why_reliastra_is_relevant=row.why_reliastra_is_relevant,
        outreach_hook=row.outreach_hook,
        verdict=row.verdict,
        draft_subject=row.draft_subject,
        draft_body=row.draft_body,
        draft_status=row.draft_status,
        draft_error=row.draft_error,
        drafted_at=row.drafted_at,
        sent_message_id=row.sent_message_id,
    )


async def _get_lead(db: AsyncSession, lead_id: uuid.UUID) -> ProspectLead | None:
    return (
        await db.execute(select(ProspectLead).where(ProspectLead.id == lead_id))
    ).scalar_one_or_none()


@router.get("/status", response_model=ProspectAiStatus)
async def status(
    db: AsyncSession = Depends(get_db),
) -> ProspectAiStatus:
    from app.modules.ai_integration.service import AIService

    model = AIService().platform_model()
    total_reports = int(
        await db.execute(select(func.count()).select_from(ProspectReport)).scalar() or 0
    )
    total_leads = int(
        await db.execute(select(func.count()).select_from(ProspectLead)).scalar() or 0
    )
    by_status_rows = (
        await db.execute(
            select(ProspectLead.draft_status, func.count()).group_by(
                ProspectLead.draft_status
            )
        )
    ).all()
    return ProspectAiStatus(
        ai_available=model is not None,
        model_name=model.model_name if model else None,
        total_reports=total_reports,
        total_leads=total_leads,
        leads_by_status={str(k or "unknown"): int(v) for k, v in by_status_rows},
    )


@router.post("/import", response_model=ProspectImportResponse, status_code=201)
@audit_log(action="prospect_ai.report.import", entity_type="prospect_report")
async def import_report(
    payload: ProspectImportRequest, db: AsyncSession = Depends(get_db)
) -> ProspectImportResponse:
    prospects, meta = parse_prospects(payload.json_text)
    title = str(meta.get("report") or meta.get("title") or payload.filename)[:500]
    report_date = meta.get("report_date")
    notes = None
    summary = meta.get("summary")
    if isinstance(summary, dict):
        intro = summary.get("intro")
        if isinstance(intro, str):
            notes = intro[:4000]
    elif isinstance(summary, str):
        notes = summary[:4000]

    row = ProspectReport(
        title=title,
        report_date=str(report_date)[:32] if report_date else None,
        source_filename=payload.filename,
        prospect_count=0,
        skipped_count=0,
        notes=notes,
        raw_md=(payload.md_text or None),
    )
    db.add(row)
    await db.flush()

    seen_domains: set[str] = set()
    imported = skipped = 0
    for prospect in prospects:
        lead = lead_from_prospect(prospect)
        if lead is None or not lead.domain or lead.domain in seen_domains:
            skipped += 1
            continue
        seen_domains.add(lead.domain)
        lead.report_id = row.id
        db.add(lead)
        imported += 1

    row.prospect_count = imported
    row.skipped_count = skipped
    await db.commit()
    await db.refresh(row)
    logger.info(
        "Prospect report imported id=%s file=%s imported=%d skipped=%d",
        row.id, payload.filename, imported, skipped,
    )
    return ProspectImportResponse(
        report=_report_out(row), imported=imported, skipped=skipped
    )


@router.get("/reports", response_model=list[ProspectReportOut])
async def list_reports(
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[ProspectReportOut]:
    rows = (
        await db.execute(
            select(ProspectReport)
            .order_by(ProspectReport.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [_report_out(r) for r in rows]


@router.get("/leads", response_model=list[ProspectLeadOut])
async def list_leads(
    report_id: uuid.UUID | None = None,
    status_filter: str | None = Query(default=None, alias="status", max_length=16),
    q: str | None = Query(default=None, max_length=128),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
) -> list[ProspectLeadOut]:
    stmt = select(ProspectLead).order_by(ProspectLead.rank.asc().nulls_last(), ProspectLead.created_at.asc())
    if report_id is not None:
        stmt = stmt.where(ProspectLead.report_id == report_id)
    if status_filter:
        stmt = stmt.where(ProspectLead.draft_status == status_filter)
    if q:
        like = f"%{q.strip().lower()[:128]}%"
        stmt = stmt.where(
            (func.lower(ProspectLead.company).like(like))
            | (func.lower(ProspectLead.domain).like(like))
        )
    rows = (await db.execute(stmt.limit(limit))).scalars().all()
    return [_lead_out(r) for r in rows]


@router.post("/generate", response_model=list[ProspectLeadOut])
@audit_log(action="prospect_ai.draft.generate", entity_type="prospect_lead")
async def generate_drafts(
    payload: ProspectGenerateRequest, db: AsyncSession = Depends(get_db)
) -> list[ProspectLeadOut]:
    try:
        await enforce_rate_limit(_generate_limiter, key="generate")
    except Exception:
        pass
    lead_ids = payload.lead_ids[:MAX_LEADS_PER_GENERATE]
    out: list[ProspectLeadOut] = []
    for lead_id in lead_ids:
        lead = await _get_lead(db, lead_id)
        if lead is None:
            continue
        if lead.draft_status == "sent":
            out.append(_lead_out(lead))
            continue
        lead = await draft_lead(lead, payload.tone)
        out.append(_lead_out(lead))
    await db.commit()
    return out


@router.patch("/leads/{lead_id}", response_model=ProspectLeadOut)
@audit_log(action="prospect_ai.draft.review", entity_type="prospect_lead")
async def review_draft(
    lead_id: uuid.UUID,
    payload: ProspectDraftPatch,
    db: AsyncSession = Depends(get_db),
) -> ProspectLeadOut:
    from app.core.exceptions import NotFoundException

    lead = await _get_lead(db, lead_id)
    if lead is None:
        raise NotFoundException("Lead not found")
    if lead.draft_status == "sent":
        raise NotFoundException("Sent drafts are immutable")
    if payload.subject is not None:
        lead.draft_subject = payload.subject.strip()[:500]
    if payload.body_text is not None:
        lead.draft_body = payload.body_text.strip()[:20000]
    if lead.draft_status != "sent":
        lead.draft_status = "ready"
        lead.draft_error = None
    await db.commit()
    await db.refresh(lead)
    return _lead_out(lead)


@router.post("/leads/{lead_id}/send", response_model=ProspectLeadOut)
@audit_log(action="prospect_ai.draft.send", entity_type="prospect_lead")
async def send_draft(
    lead_id: uuid.UUID,
    payload: ProspectSendRequest,
    admin_user=Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
) -> ProspectLeadOut:
    from app.core.exceptions import NotFoundException, ValidationException

    try:
        await enforce_rate_limit(_send_limiter, key="send")
    except Exception:
        pass
    lead = await _get_lead(db, lead_id)
    if lead is None:
        raise NotFoundException("Lead not found")
    try:
        request = build_send_request(lead, payload.sender, payload.reply_to)
        message, _detail = await email_service.send(
            db,
            admin_user_id=admin_user.id,
            admin_email=admin_user.email,
            payload=request,
        )
    except ValueError as exc:
        raise ValidationException(str(exc) or "Send blocked") from exc
    lead.draft_status = "sent"
    lead.sent_message_id = message.id
    await db.commit()
    await db.refresh(lead)
    logger.info(
        "Prospect draft sent lead=%s message=%s", lead.id, message.id
    )
    return _lead_out(lead)


@router.delete("/reports/{report_id}", status_code=200)
@audit_log(action="prospect_ai.report.delete", entity_type="prospect_report")
async def delete_report(
    report_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> dict:
    from sqlalchemy import delete as sa_delete

    from app.core.exceptions import NotFoundException

    row = (
        await db.execute(select(ProspectReport).where(ProspectReport.id == report_id))
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundException("Report not found")
    await db.execute(sa_delete(ProspectLead).where(ProspectLead.report_id == report_id))
    await db.delete(row)
    await db.commit()
    return {"deleted": str(report_id)}
