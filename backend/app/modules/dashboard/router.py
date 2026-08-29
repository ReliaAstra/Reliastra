import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.pagination import CursorPagination
from app.dependencies import get_current_org
from app.db.session import get_db
from app.modules.dashboard.schemas import (
    DashboardSummaryResponse,
    DependencyHealthResponse,
    LatencyPointResponse,
    SLADegradationResponse,
)
from app.modules.dashboard.service import DashboardService, dashboard_service
from app.modules.incidents.schemas import IncidentDetailResponse
from app.modules.organizations.models import Organization
from app.modules.vendors.schemas import VendorDetailResponse

router = APIRouter(prefix="/v1/dashboard", tags=["Dashboard"])


def get_dash_service() -> DashboardService:
    return dashboard_service


@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: DashboardService = Depends(get_dash_service),
) -> DashboardSummaryResponse:
    return await service.get_summary(db, current_org.id)


@router.get("/latency", response_model=list[LatencyPointResponse])
async def get_latency_timeseries(
    hours: int = Query(default=24, ge=1, le=2160),
    dependency_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
) -> list[LatencyPointResponse]:
    """Customer latency series for charting.

    Reads ``check_results`` — the authoritative, synchronously-written record
    of every customer check. (Observations feed the public vendor network and
    are drained asynchronously; they must never be the source for a customer's
    own latency chart.)
    """
    from sqlalchemy import select

    from app.modules.checks.models import CheckResult
    from app.modules.dependencies.models import Dependency

    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    query = (
        select(
            CheckResult.executed_at,
            CheckResult.region,
            CheckResult.latency_ms,
            CheckResult.dependency_id,
        )
        .join(Dependency, CheckResult.dependency_id == Dependency.id)
        .where(
            CheckResult.org_id == current_org.id,
            CheckResult.executed_at >= since,
            Dependency.is_deleted == False,  # noqa: E712
        )
        .order_by(CheckResult.executed_at.asc())
        .limit(2000)
    )
    if dependency_id is not None:
        query = query.where(CheckResult.dependency_id == dependency_id)
    res = await db.execute(query)
    return [
        LatencyPointResponse(
            timestamp=row.executed_at,
            region=row.region,
            latency_ms=float(row.latency_ms),
            dependency_id=row.dependency_id,
        )
        for row in res
    ]


@router.get("/sla-degradation", response_model=SLADegradationResponse)
async def get_sla_degradation(
    period_days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
) -> SLADegradationResponse:
    """Aggregate observed degradation per dependency for the requested period."""
    from app.modules.observations.repository import ObservationRepository

    stats = await ObservationRepository.get_sla_degradation(
        db, current_org.id, period_days
    )
    return SLADegradationResponse(
        total_degradation_pct=stats["total_degradation_pct"],
        affected_services=stats["affected_services"],
        period=f"{period_days}d",
    )


@router.get("/dependency-health", response_model=list[DependencyHealthResponse])
async def get_dependency_health(
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: DashboardService = Depends(get_dash_service),
) -> list[DependencyHealthResponse]:
    return await service.get_dependency_health(db, current_org.id)


@router.get(
    "/incident-timeline",
    response_model=CursorPagination[IncidentDetailResponse],
)
async def get_incident_timeline(
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: DashboardService = Depends(get_dash_service),
    cursor: uuid.UUID | None = Query(
        default=None, description="Incident id of the last item on the previous page"
    ),
    limit: int = Query(default=20, ge=1, le=100),
) -> CursorPagination[IncidentDetailResponse]:
    """FIX 17: cursor-paginated incident timeline."""
    rows = await service.get_incident_timeline(
        db, current_org.id, limit=limit + 1, cursor=cursor
    )
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = str(items[-1].id) if has_more and items else None
    return CursorPagination(
        items=items, next_cursor=next_cursor, has_more=has_more
    )


@router.get("/vendor-status", response_model=list[VendorDetailResponse])
async def get_vendor_status(
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: DashboardService = Depends(get_dash_service),
) -> list[VendorDetailResponse]:
    return await service.get_vendor_status(db, current_org.id)
