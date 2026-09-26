"""Digest drafts admin HTTP surface.

``/v1/admin/digest/*`` - every route requires a dedicated ADMIN-console
session (``require_system_admin``). The Next.js admin proxy forwards
``/api/admin/digest/*`` here with its CSRF marker.

Read-only review plus one manual generation trigger that shares the beat's
exact code path. There is deliberately NO send/post endpoint: delivery of a
draft is a human action outside this API, and this surface will never grow
one silently (that would be auto-posting by another name).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.modules.admin.guards import require_system_admin
from app.modules.digest.models import KNOWN_KINDS, DigestDraft
from app.modules.digest.service import digest_draft_service, week_window

router = APIRouter(
    prefix="/v1/admin/digest",
    tags=["Admin - Digest Drafts"],
    dependencies=[Depends(require_system_admin)],
)


class DigestDraftResponse(BaseModel):
    """One draft row, verbatim. The reviewer reads exactly what was
    generated - no server-side re-rendering of reviewed content."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    kind: str
    period_key: str
    status: str
    subject: str | None
    text_body: str
    html_body: str | None
    content_hash: str
    period_start: date
    period_end: date
    incident_ids: list[str]
    vendor_slugs: list[str]
    generator: str
    methodology_version: str
    created_at: object
    updated_at: object


class DigestDraftListResponse(BaseModel):
    items: list[DigestDraftResponse]
    has_more: bool


class GenerateDigestRequest(BaseModel):
    weeks_ago: int = Field(default=1, ge=0, le=12)


class GenerateDigestResponse(BaseModel):
    period_start: date
    period_end: date
    counts: dict[str, int]


def _to_response(draft: DigestDraft) -> DigestDraftResponse:
    return DigestDraftResponse(
        id=draft.id,
        kind=draft.kind,
        period_key=draft.period_key,
        status=draft.status,
        subject=draft.subject,
        text_body=draft.text_body,
        html_body=draft.html_body,
        content_hash=draft.content_hash,
        period_start=draft.period_start,
        period_end=draft.period_end,
        incident_ids=list(draft.incident_ids or []),
        vendor_slugs=list(draft.vendor_slugs or []),
        generator=draft.generator,
        methodology_version=draft.methodology_version,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )


@router.get("/drafts", response_model=DigestDraftListResponse, summary="List drafts")
async def list_drafts(
    kind: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> DigestDraftListResponse:
    if kind is not None and kind not in KNOWN_KINDS:
        return DigestDraftListResponse(items=[], has_more=False)
    rows = await digest_draft_service.repository.list_recent(
        db, kind=kind, limit=limit + 1
    )
    has_more = len(rows) > limit
    return DigestDraftListResponse(
        items=[_to_response(d) for d in rows[:limit]], has_more=has_more
    )


@router.get(
    "/drafts/{draft_id}", response_model=DigestDraftResponse, summary="Draft detail"
)
async def get_draft(
    draft_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> DigestDraftResponse:
    draft = await digest_draft_service.repository.get_by_id(db, draft_id)
    if draft is None:
        from app.core.exceptions import ResourceNotFoundException

        raise ResourceNotFoundException("Digest draft not found")
    return _to_response(draft)


@router.post(
    "/generate",
    response_model=GenerateDigestResponse,
    summary="Generate drafts for a past week",
)
async def generate_drafts(
    request: GenerateDigestRequest,
    db: AsyncSession = Depends(get_db),
) -> GenerateDigestResponse:
    """The beat's exact code path, runnable by hand: idempotent, drafts
    only. Useful after an incident resolves late in a reviewed week."""
    day = datetime.now(timezone.utc).date() - timedelta(weeks=request.weeks_ago)
    period_start, period_end = week_window(day)
    counts = await digest_draft_service.generate_pending(
        db, period_start, period_end, site_url=settings.SITE_URL
    )
    await db.commit()
    return GenerateDigestResponse(
        period_start=period_start,
        period_end=period_end,
        counts=counts,
    )
