import uuid

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import enforce_rate_limit, public_vendor_limiter
from app.db.session import get_db
from app.dependencies import get_current_org, require_admin
from app.modules.agencies.schemas import (
    ApplicationCreateRequest,
    ApplicationResponse,
    ClientCreateRequest,
    ClientResponse,
    PortfolioResponse,
)
from app.modules.agencies.service import AgencyService, agency_service
from app.modules.organizations.models import Organization

router = APIRouter(prefix="/v1", tags=["Agency"])


def get_agency_service() -> AgencyService:
    return agency_service


@router.get("/clients", response_model=list[ClientResponse])
async def list_clients(
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: AgencyService = Depends(get_agency_service),
) -> list[ClientResponse]:
    return await service.list_clients(db, current_org.id)


@router.post(
    "/clients",
    response_model=ClientResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_client(
    request: ClientCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: AgencyService = Depends(get_agency_service),
) -> ClientResponse:
    return await service.create_client(db, current_org.id, request)


@router.get(
    "/clients/{client_id}/applications",
    response_model=list[ApplicationResponse],
)
async def list_applications(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: AgencyService = Depends(get_agency_service),
) -> list[ApplicationResponse]:
    return await service.list_applications(db, current_org.id, client_id)


@router.post(
    "/clients/{client_id}/applications",
    response_model=ApplicationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_application(
    client_id: uuid.UUID,
    request: ApplicationCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: AgencyService = Depends(get_agency_service),
) -> ApplicationResponse:
    return await service.create_application(db, current_org.id, client_id, request)


# ── Agency portfolio / client-facing SLA portal ──────────────────────────────


@router.get("/agency/portfolio", response_model=PortfolioResponse)
async def get_agency_portfolio(
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    _admin_guard=Depends(require_admin),
) -> PortfolioResponse:
    """Rolled-up SLA posture for every client — the $199 artifact."""
    return await agency_service.get_portfolio(db, current_org.id)


@router.get(
    "/public/agency-portfolio/{token}",
    response_model=PortfolioResponse,
    tags=["Public"],
)
async def get_public_agency_portfolio(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> PortfolioResponse:
    """Unauthenticated, HMAC-verified share link for the client portal page.

    The payload only ever contains display data (names, uptime, incident
    counts), never endpoints or secrets.
    """
    await enforce_rate_limit(request, public_vendor_limiter)
    org_id = AgencyService.verify_portfolio_share_token(token)
    return await agency_service.get_portfolio(db, org_id)
