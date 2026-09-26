"""Public incident intelligence API (unauthenticated, rate limited).

The searchable history of incidents RELIASTRA detected on the public
catalog. Machine readable by design: the web observatory consumes these
endpoints through the same contract as any external reader.

Mount: ``/v1/public/incidents`` (kept outside ``/v1/vendors/{vendor}`` so
the global search surface has no slug-collision rules to work around).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundException
from app.db.session import get_db
from app.modules.incidents.public_evidence import (
    PublicIncidentEvidenceService,
    public_incident_evidence_service,
)
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


# ------------------------------------------------------------------
# Evidence artifacts (frozen, hashed, served byte-for-byte)
# ------------------------------------------------------------------

_EVIDENCE_CACHE_TTL = 60
_EVIDENCE_VERSIONED_CACHE_TTL = 3600


def get_public_incident_evidence_service() -> PublicIncidentEvidenceService:
    return public_incident_evidence_service


async def _read_evidence(
    request: Request,
    db: AsyncSession,
    service: PublicIncidentEvidenceService,
    incident_id: uuid.UUID,
    version: int | None,
) -> Response:
    from app.infrastructure.redis_client import safe_redis_get, safe_redis_setex

    await enforce_public_read_limit(request)
    pinned = version is not None
    cache_key = (
        f"public_incident_evidence:{incident_id}"
        if not pinned
        else f"public_incident_evidence:{incident_id}:v{version}"
    )
    ttl = _EVIDENCE_VERSIONED_CACHE_TTL if pinned else _EVIDENCE_CACHE_TTL
    cached = await safe_redis_get(cache_key)
    entry: dict | None = None
    if cached:
        try:
            entry = json.loads(cached)
        except Exception:
            entry = None
    if entry is None:
        artifact = (
            await service.get_latest(db, incident_id)
            if not pinned
            else await service.get_version(db, incident_id, version or 0)
        )
        if artifact is None:
            raise ResourceNotFoundException("Public incident evidence not found")
        entry = {
            "payload": artifact.payload,
            "data_hash": artifact.data_hash,
            "version": artifact.version,
            "artifact_schema_version": artifact.artifact_schema_version,
            "methodology_version": artifact.methodology_version,
        }
        await safe_redis_setex(cache_key, ttl, json.dumps(entry))
    return Response(
        content=entry["payload"].encode("utf-8"),
        media_type="application/json",
        headers={
            "Cache-Control": f"public, max-age={ttl}",
            "ETag": f'"{entry["data_hash"]}"',
            "X-Reliastra-Evidence-Version": str(entry["version"]),
            "X-Reliastra-Artifact-Schema-Version": entry["artifact_schema_version"],
            "X-Reliastra-Methodology-Version": entry["methodology_version"],
        },
    )


@router.get("/{incident_id}/evidence")
async def get_public_incident_evidence(
    request: Request,
    incident_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    service: PublicIncidentEvidenceService = Depends(
        get_public_incident_evidence_service
    ),
) -> Response:
    """The incident's newest frozen evidence document, byte-for-byte.

    404 when the incident has no artifact yet (the freeze processor runs
    within seconds of a transition; absence is "not generated yet", a state
    the record's own page states) or the incident does not exist. The ETag
    is the document's content hash, so a re-serve after a new freeze is a
    different ETag, and a verifier can pin the exact bytes it audited via
    ``/evidence/versions/{n}``.
    """
    return await _read_evidence(request, db, service, incident_id, None)


@router.get("/{incident_id}/evidence/versions/{version}")
async def get_public_incident_evidence_version(
    request: Request,
    incident_id: uuid.UUID,
    version: int,
    db: AsyncSession = Depends(get_db),
    service: PublicIncidentEvidenceService = Depends(
        get_public_incident_evidence_service
    ),
) -> Response:
    """One pinned evidence version. Frozen artifacts never change, so this
    URL caches far longer than the moving ``latest`` one."""
    return await _read_evidence(request, db, service, incident_id, version)
