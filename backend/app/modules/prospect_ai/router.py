"""Prospect AI admin surface: import, draft generation, review, send.

``/v1/admin/prospect-ai/*`` - every route requires the dedicated ADMIN
console session (``require_system_admin``). Drafting is reviewer-triggered
and capped per call; sending is per-lead and goes through the Email Center
pipeline, so nothing ever sends without a human pressing the button.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import SlidingWindowRateLimiter, enforce_rate_limit
from app.db.session import get_db
from app.modules.admin.decorators import audit_log
from app.modules.admin.guards import require_system_admin
from app.modules.email_center.service import email_service
from app.modules.prospect_ai import provider as provider_layer
from app.modules.prospect_ai.models import ProspectLead, ProspectReport
from app.modules.prospect_ai.schemas import (
    MAX_LEADS_PER_BATCH,
    MAX_LEADS_PER_GENERATE,
    ProspectAiStatus,
    ProspectBatchApproveRequest,
    ProspectBatchSendRequest,
    ProspectBatchSendResponse,
    ProspectDraftPatch,
    ProspectGenerateRequest,
    ProspectImportRequest,
    ProspectImportResponse,
    ProspectLeadBatchResult,
    ProspectLeadOut,
    ProspectProviderConfig,
    ProspectProviderOut,
    ProspectProviderTestRequest,
    ProspectProviderTestResponse,
    ProspectReportOut,
    ProspectSendRequest,
)
from app.modules.prospect_ai.service import (
    _daily_send_cap,
    build_send_request,
    count_sent_today,
    draft_lead,
    lead_from_prospect,
    parse_prospects,
    sends_remaining_today,
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
        draft_angle=row.draft_angle,
        draft_rejected_angles=row.draft_rejected_angles,
        drafted_at=row.drafted_at,
        approved_at=row.approved_at,
        sent_message_id=row.sent_message_id,
        sent_at=row.sent_at,
        batch_id=row.batch_id,
    )


def _provider_out(profile) -> ProspectProviderOut:
    from app.modules.prospect_ai.provider import profile_to_llm

    last4 = None
    try:
        key = profile_to_llm(profile).api_key
        last4 = key[-4:] if key else None
    except Exception:
        last4 = None
    return ProspectProviderOut(
        label=profile.label,
        provider_type=profile.provider_type,
        endpoint_url=profile.endpoint_url,
        model=profile.model_name,
        api_key_last4=last4,
        temperature=profile.temperature,
        max_tokens=profile.max_tokens,
        timeout_seconds=profile.timeout_seconds,
        is_active=bool(profile.is_active),
        last_test_at=profile.last_test_at,
        last_test_ok=profile.last_test_ok,
        last_test_detail=profile.last_test_detail,
    )


async def _get_lead(db: AsyncSession, lead_id: uuid.UUID) -> ProspectLead | None:
    return (
        await db.execute(select(ProspectLead).where(ProspectLead.id == lead_id))
    ).scalar_one_or_none()


@router.get("/status", response_model=ProspectAiStatus)
async def status(
    db: AsyncSession = Depends(get_db),
) -> ProspectAiStatus:
    from app.modules.prospect_ai.provider import active_profile_source, get_active_profile

    profile = await get_active_profile(db)
    model = await provider_layer.resolve_active_profile(db)
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
    cap = _daily_send_cap()
    sent_today = await count_sent_today(db)
    return ProspectAiStatus(
        ai_available=model is not None,
        model_name=model.model_name if model else None,
        total_reports=total_reports,
        total_leads=total_leads,
        leads_by_status={str(k or "unknown"): int(v) for k, v in by_status_rows},
        provider_source=active_profile_source(profile),
        daily_send_cap=cap,
        sends_remaining_today=max(0, cap - sent_today),
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
        if lead.draft_status == "approved" and not payload.force:
            # An approved draft stays approved until the human explicitly
            # asks for regeneration (unlock in the UI).
            out.append(_lead_out(lead))
            continue
        lead = await draft_lead(lead, payload.tone, db)
        out.append(_lead_out(lead))
    await db.commit()
    return out


@router.post("/leads/{lead_id}/approve", response_model=ProspectLeadOut)
@audit_log(action="prospect_ai.draft.approve", entity_type="prospect_lead")
async def approve_draft(
    lead_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> ProspectLeadOut:
    """Human approval stamps the draft; only approved drafts can send."""
    from datetime import datetime, timezone

    from app.core.exceptions import NotFoundException, ValidationException

    lead = await _get_lead(db, lead_id)
    if lead is None:
        raise NotFoundException("Lead not found")
    if lead.draft_status == "sent":
        raise ValidationException("Draft was already sent.")
    if lead.draft_status == "approved":
        return _lead_out(lead)
    subject = (lead.draft_subject or "").strip()
    body = (lead.draft_body or "").strip()
    if not subject or not body:
        raise ValidationException("Nothing to approve: generate or write a draft first.")
    lead.draft_status = "approved"
    lead.approved_at = datetime.now(timezone.utc)
    lead.draft_error = None
    await db.commit()
    await db.refresh(lead)
    return _lead_out(lead)


@router.post("/leads/{lead_id}/unapprove", response_model=ProspectLeadOut)
@audit_log(action="prospect_ai.draft.unapprove", entity_type="prospect_lead")
async def unapprove_draft(
    lead_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> ProspectLeadOut:
    """Return an approved draft to review (padlock opens, nothing sends)."""
    from app.core.exceptions import NotFoundException, ValidationException

    lead = await _get_lead(db, lead_id)
    if lead is None:
        raise NotFoundException("Lead not found")
    if lead.draft_status == "sent":
        raise ValidationException("Sent drafts are immutable.")
    if lead.draft_status == "approved":
        lead.draft_status = "ready"
        lead.approved_at = None
        await db.commit()
        await db.refresh(lead)
    return _lead_out(lead)


@router.post("/approve-batch", response_model=list[ProspectLeadOut])
@audit_log(action="prospect_ai.draft.approve_batch", entity_type="prospect_lead")
async def approve_batch(
    payload: ProspectBatchApproveRequest, db: AsyncSession = Depends(get_db)
) -> list[ProspectLeadOut]:
    """Bulk approval: every selected lead still holding a real, unsent,
    unapproved draft becomes approved. Others are skipped."""
    from datetime import datetime, timezone


    lead_ids = payload.lead_ids[:MAX_LEADS_PER_BATCH]
    now = datetime.now(timezone.utc)
    out: list[ProspectLeadOut] = []
    for lead_id in lead_ids:
        lead = await _get_lead(db, lead_id)
        if lead is None:
            continue
        if lead.draft_status in ("ready",) and (lead.draft_subject or "").strip() and (
            lead.draft_body or ""
        ).strip():
            lead.draft_status = "approved"
            lead.approved_at = now
            lead.draft_error = None
        out.append(_lead_out(lead))
    await db.commit()
    return out


@router.post("/send-batch", response_model=ProspectBatchSendResponse)
@audit_log(action="prospect_ai.draft.send_batch", entity_type="prospect_lead")
async def send_batch(
    payload: ProspectBatchSendRequest,
    admin_user=Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
) -> ProspectBatchSendResponse:
    """Send many approved drafts in one request.

    Authority stays where it belongs: every lead must already be
    ``approved`` before it is selected - the batch button turns many
    approvals into many emails, it does not create any. Each lead sends
    individually through the Email Center pipeline with its own
    idempotency key; one bad address never aborts the batch. A daily
    deliverability cap bounds how much of the sender reputation this one
    surface can spend per day.
    """
    from app.core.exceptions import NotFoundException, ValidationException

    try:
        await enforce_rate_limit(_send_limiter, key="send-batch")
    except Exception:
        pass
    lead_ids = list(dict.fromkeys(str(i) for i in payload.lead_ids))[:MAX_LEADS_PER_BATCH]
    template_html: str | None = None
    if payload.template_id is not None:
        template = await email_service.get_template(db, payload.template_id)
        if template is None:
            raise NotFoundException("Template not found")
        template_html = (template.html_body or "").strip() or None
        if template_html is None:
            raise ValidationException("Template has no HTML body to render.")
    remaining = sends_remaining_today(await count_sent_today(db))
    if remaining == 0:
        raise ValidationException(
            f"Daily send cap ({_daily_send_cap()}) reached - resume tomorrow "
            "to protect deliverability."
        )
    batch_id = uuid.uuid4()
    results: list[ProspectLeadBatchResult] = []
    sent = failed = 0
    for lead_id in lead_ids:
        if sent >= remaining:
            results.append(
                ProspectLeadBatchResult(
                    lead_id=uuid.UUID(lead_id), status="skipped",
                    error="daily send cap reached",
                )
            )
            continue
        lead = await _get_lead(db, uuid.UUID(lead_id))
        if lead is None:
            results.append(ProspectLeadBatchResult(
                lead_id=uuid.UUID(lead_id), status="skipped", error="lead not found"))
            failed += 1
            continue
        if lead.draft_status == "sent":
            results.append(ProspectLeadBatchResult(
                lead_id=lead.id, status="skipped", error="already sent"))
            continue
        if lead.draft_status != "approved":
            results.append(ProspectLeadBatchResult(
                lead_id=lead.id, status="skipped", error="not approved"))
            failed += 1
            continue
        try:
            request = build_send_request(
                lead, payload.sender, payload.reply_to, template_html=template_html
            )
            message, _detail = await email_service.send(
                db,
                admin_user_id=admin_user.id,
                admin_email=admin_user.email,
                payload=request,
            )
        except Exception as exc:
            detail = str(exc)[:300] or "send failed"
            logger.warning("Batch send failed lead=%s: %s", lead.id, detail)
            results.append(ProspectLeadBatchResult(
                lead_id=lead.id, status="failed", error=detail))
            failed += 1
            await db.commit()
            continue
        lead.draft_status = "sent"
        lead.sent_message_id = message.id
        lead.sent_at = datetime.now(timezone.utc)
        lead.batch_id = batch_id
        results.append(ProspectLeadBatchResult(
            lead_id=lead.id, status="sent", message_id=message.id))
        sent += 1
    await db.commit()
    logger.info(
        "Prospect batch %s: requested=%d sent=%d failed=%d",
        batch_id, len(lead_ids), sent, failed,
    )
    return ProspectBatchSendResponse(
        batch_id=batch_id, requested=len(lead_ids), sent=sent, failed=failed,
        results=results,
    )


@router.get("/provider", response_model=ProspectProviderOut | None)
async def get_provider(db: AsyncSession = Depends(get_db)) -> ProspectProviderOut | None:
    """The active LLM profile (key masked to its last 4 chars)."""
    from app.modules.prospect_ai.provider import get_active_profile

    profile = await get_active_profile(db)
    if profile is None:
        return None
    return _provider_out(profile)


@router.put("/provider", response_model=ProspectProviderOut)
@audit_log(action="prospect_ai.provider.save", entity_type="ai_provider_profile")
async def save_provider(
    payload: ProspectProviderConfig, db: AsyncSession = Depends(get_db)
) -> ProspectProviderOut:
    """Save (or replace) the single active provider profile. The key is
    stored encrypted at rest; it is only ever decrypted in memory at call
    time. Test the endpoint before saving when unsure."""

    profile = await provider_layer.save_profile(
        db,
        provider_type=payload.provider_type,
        endpoint_url=payload.endpoint_url,
        model_name=payload.model,
        api_key=payload.api_key,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
        timeout_seconds=payload.timeout_seconds,
        label=payload.label,
    )
    profile.last_test_at = None
    profile.last_test_ok = None
    profile.last_test_detail = None
    await db.commit()
    await db.refresh(profile)
    logger.info(
        "AI provider profile saved: provider=%s model=%s endpoint=%s",
        profile.provider_type, profile.model_name, profile.endpoint_url,
    )
    return _provider_out(profile)


@router.post("/provider/test", response_model=ProspectProviderTestResponse)
@audit_log(action="prospect_ai.provider.test", entity_type="ai_provider_profile")
async def test_provider(
    payload: ProspectProviderTestRequest, db: AsyncSession = Depends(get_db)
) -> ProspectProviderTestResponse:
    """Prove the endpoint works. Unsaved candidate values are probed
    without persisting anything; a test against the saved profile records
    its outcome on the profile (and nothing else)."""
    result = await provider_layer.test_profile(
        db,
        api_key=payload.api_key,
        provider_type=payload.provider_type,
        endpoint_url=payload.endpoint_url,
        model_name=payload.model,
    )
    return ProspectProviderTestResponse(
        ok=bool(result.get("ok")),
        latency_ms=result.get("latency_ms"),
        model=result.get("model"),
        detail=str(result.get("detail") or ""),
    )


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
    if lead.draft_status == "approved":
        # Any human edit reopens review: the padlock must not survive a
        # rewrite of the text it locked.
        lead.approved_at = None
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
    template_html: str | None = None
    if payload.template_id is not None:
        template = await email_service.get_template(db, payload.template_id)
        if template is None:
            raise NotFoundException("Template not found")
        template_html = (template.html_body or "").strip() or None
        if template_html is None:
            raise ValidationException("Template has no HTML body to render.")
    try:
        request = build_send_request(
            lead, payload.sender, payload.reply_to, template_html=template_html
        )
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
    lead.sent_at = datetime.now(timezone.utc)
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
