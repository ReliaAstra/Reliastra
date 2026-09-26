"""Public incident intelligence API (unauthenticated, rate limited).

The searchable history of incidents RELIASTRA detected on the public
catalog. Machine readable by design: the web observatory consumes these
endpoints through the same contract as any external reader.

Mount: ``/v1/public/incidents`` (kept outside ``/v1/vendors/{vendor}`` so
the global search surface has no slug-collision rules to work around).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.incidents.public_schemas import (
    PublicIncidentDetailResponse,
    PublicIncidentListResponse,
)
from app.modules.incidents.public_service import (
    PublicIncidentService,
    public_incident_service,
)
from app.platform.web.rate_limit import enforce_public_read_limit

router = APIRouter(prefix="/v1/public/incidents", tags=["Public incidents"])

_SEARCH_CACHE_TTL = 60


def get_public_incident_service() -> PublicIncidentService:
    return public_incident_service


@router.get("", response_model=PublicIncidentListResponse)
async def search_public_incidents(
    request: Request,
    vendor: str | None = Query(default=None, description="Vendor slug, e.g. stripe"),
    category: str | None = Query(default=None, description="Category slug, e.g. ai"),
    region: str | None = Query(default=None, description="Observation point label"),
    status: str | None = Query(default=None, description="open or resolved"),
    failure_kind: str | None = Query(default=None),
    since: datetime | None = Query(default=None, description="started_at lower bound"),
    until: datetime | None = Query(default=None, description="started_at upper bound"),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    service: PublicIncidentService = Depends(get_public_incident_service),
) -> PublicIncidentListResponse:
    await enforce_public_read_limit(request)
    from app.infrastructure.redis_client import safe_redis_get, safe_redis_setex

    cache_key = (
        "public_incidents:"
        f"{vendor}:{category}:{region}:{status}:{failure_kind}:{since}:{until}:{cursor}:{limit}"
    )
    cached = await safe_redis_get(cache_key)
    if cached:
        try:
            return PublicIncidentListResponse.model_validate_json(cached)
        except Exception:
            pass
    response = await service.search(
        db,
        vendor_name=vendor,
        category=category,
        region=region,
        status=status,
        failure_kind=failure_kind,
        started_after=since,
        started_before=until,
        cursor=cursor,
        limit=limit,
    )
    await safe_redis_setex(cache_key, _SEARCH_CACHE_TTL, response.model_dump_json())
    return response


@router.get("/{incident_id}", response_model=PublicIncidentDetailResponse)
async def get_public_incident(
    request: Request,
    incident_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    service: PublicIncidentService = Depends(get_public_incident_service),
) -> PublicIncidentDetailResponse:
    await enforce_public_read_limit(request)
    from app.infrastructure.redis_client import safe_redis_get, safe_redis_setex

    cache_key = f"public_incident:{incident_id}"
    cached = await safe_redis_get(cache_key)
    if cached:
        try:
            return PublicIncidentDetailResponse.model_validate_json(cached)
        except Exception:
            pass
    response = await service.get_detail(db, incident_id)
    await safe_redis_setex(cache_key, _SEARCH_CACHE_TTL, response.model_dump_json())
    return response
