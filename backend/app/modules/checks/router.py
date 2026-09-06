import uuid

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import check_trigger_limiter, enforce_rate_limit
from app.db.session import get_db
from app.dependencies import get_current_org
from app.modules.checks.schemas import (
    CheckPipelineHealth,
    CheckResultResponse,
    CheckStateResponse,
    ManualCheckRequest,
    ManualCheckResponse,
    QueuedCheck,
)
from app.modules.checks.service import CheckService, check_service
from app.modules.organizations.models import Organization

router = APIRouter(prefix="/v1/checks", tags=["Checks"])


def get_chk_service() -> CheckService:
    return check_service


@router.get("/recent", response_model=list[CheckResultResponse])
async def list_recent_check_results(
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: CheckService = Depends(get_chk_service),
) -> list[CheckResultResponse]:
    return await service.list_results_for_org(db, current_org.id, limit=limit)


# ── Pipeline diagnostics ────────────────────────────────────────────────────
#
# These endpoints exist because an empty check history is ambiguous on its own:
# it looks the same whether the vendor has been perfectly quiet or the
# scheduler, broker and worker are all dead. They make the difference a
# queryable fact, and they fail loudly (503) instead of returning a polite
# empty list.


@router.get("/health", response_model=CheckPipelineHealth)
async def check_pipeline_health() -> Response:
    """Liveness of the check-execution pipeline.

    ``status`` is ``healthy`` only when the Beat scheduler, a Celery worker and
    the broker are all proven alive. Returns **503** otherwise, so this can be
    used directly as an alerting probe: a deployment where checks have silently
    stopped will not report success here.

    Requires no organization context — it describes infrastructure, not tenant
    data — and exposes no credentials (the broker URL is sanitized).
    """
    from app.modules.checks.scheduler_health import read_pipeline_health

    health = CheckPipelineHealth.model_validate(await read_pipeline_health())
    # 503 on anything but a fully healthy pipeline: this endpoint is the
    # alerting probe, so "checks have silently stopped" must not read as ok.
    status_code = (
        status.HTTP_200_OK
        if health.status == "healthy"
        else status.HTTP_503_SERVICE_UNAVAILABLE
    )
    return Response(
        content=health.model_dump_json(),
        status_code=status_code,
        media_type="application/json",
    )


@router.get("/state/{dependency_id}", response_model=CheckStateResponse)
async def get_dependency_check_state(
    dependency_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: CheckService = Depends(get_chk_service),
) -> CheckStateResponse:
    """Where one dependency is in the check pipeline.

    Distinguishes ``successful`` / ``target_failed`` (the vendor's problem)
    from ``blocked_by_security_policy`` / ``dispatch_failed`` /
    ``scheduler_unavailable`` (RELIASTRA's problem), plus the transient
    ``queued`` / ``executing`` / ``awaiting_scheduled_execution`` states.
    """
    state = await service.get_check_state(db, dependency_id, current_org.id)
    return CheckStateResponse.model_validate(state)


@router.post(
    "/run",
    response_model=ManualCheckResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_check_now(
    request: Request,
    body: ManualCheckRequest,
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: CheckService = Depends(get_chk_service),
) -> ManualCheckResponse:
    """Queue one immediate probe of a dependency.

    Diagnostic path: it publishes exactly the task Beat publishes, through the
    same broker, to the same worker, which applies the same SSRF policy. It
    never probes inline and never bypasses Celery, so a success here is proof
    that API → broker → worker → probe works end to end.

    Returns **202** with the queued task ids — the probe has been accepted, not
    completed. A **503** means the broker could not accept it, which is the
    infrastructure failure being reported rather than hidden.
    """
    await enforce_rate_limit(
        request, check_trigger_limiter, identifier=str(current_org.id)
    )
    result = await service.trigger_manual_check(
        db, body.dependency_id, current_org.id, body.region
    )
    return ManualCheckResponse(
        dependency_id=uuid.UUID(result["dependency_id"]),
        queued=[QueuedCheck(**item) for item in result["queued"]],
        regions=result["regions"],
        note=result["note"],
    )
