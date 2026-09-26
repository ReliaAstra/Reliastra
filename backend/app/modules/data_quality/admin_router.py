"""Data-quality ops HTTP surface.

``/v1/admin/data-quality/*`` - every route requires a dedicated
ADMIN-console session (``require_system_admin``). The Next.js admin proxy
forwards ``/api/admin/data-quality/*`` here with its CSRF marker.

Read-only by design: the scan derives findings from current rows and never
mutates vendor/endpoint state. Acting on a finding (deactivating a dead
target, fixing a registry URL) is a human decision through the registry
tools, not a side effect of viewing the report.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.admin.guards import require_system_admin
from app.modules.data_quality.service import (
    DEFAULT_MIN_ATTEMPTS,
    DEFAULT_WINDOW_DAYS,
    DataQualityReport,
    data_quality_service,
)

router = APIRouter(
    prefix="/v1/admin/data-quality",
    tags=["Admin - Data Quality"],
    dependencies=[Depends(require_system_admin)],
)


@router.get(
    "/report",
    response_model=DataQualityReport,
    summary="Derived data-quality report over the measurement registry",
)
async def get_report(
    window_days: int = Query(default=DEFAULT_WINDOW_DAYS, ge=1, le=365),
    min_attempts: int = Query(default=DEFAULT_MIN_ATTEMPTS, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> DataQualityReport:
    return await data_quality_service.scan(
        db, window_days=window_days, min_attempts=min_attempts
    )
