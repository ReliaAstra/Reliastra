import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import CursorPagination
from app.db.session import get_db
from app.modules.vendors.schemas import (
    VendorCategoryDetailResponse,
    VendorCategoryListResponse,
    VendorDetailResponse,
    VendorDeveloperResponse,
    VendorHistoryResponse,
    VendorIncidentsResponse,
    VendorMetricsResponse,
    VendorResponse,
    VendorTimelineResponse,
)
from app.modules.vendors.service import VendorService, vendor_service
from app.platform.web.rate_limit import (
    SlidingWindowRateLimiter,
    enforce_public_read_limit,
    enforce_rate_limit,
)

router = APIRouter(prefix="/v1/vendors", tags=["Vendors"])

developer_limiter = SlidingWindowRateLimiter(
    limit=30, window_seconds=60, key_prefix="rl_developer"
)


def get_vnd_service() -> VendorService:
    return vendor_service


async def _rate_limit(request: Request) -> None:
    """Public-read budget: per client IP, except for the web app's own reader.

    Every public observatory page is rendered server-side by the web app, so
    without a reader identity all of those reads arrive from one socket address
    and share a single per-IP bucket with the browser calls the web app
    proxies. One crawler walking the observatory then exhausts it for the whole
    site - including the record pages the crawler came to read.
    ``enforce_public_read_limit`` gives an authenticated reader its own budget
    and leaves every other caller limited by IP.
    """
    await enforce_public_read_limit(request)


_PUBLIC_VENDORS_CACHE_TTL = 60


# Category routes must be declared before ``/{vendor_name}`` so the literal
# ``categories`` segment is not captured as a vendor slug.
_CATEGORIES_CACHE_TTL = 60


@router.get("/categories", response_model=VendorCategoryListResponse)
async def list_categories(
    request: Request,
    db: AsyncSession = Depends(get_db),
    service: VendorService = Depends(get_vnd_service),
) -> VendorCategoryListResponse:
    """The category taxonomy with per category public vendor counts."""
    await _rate_limit(request)
    from app.infrastructure.redis_client import safe_redis_get, safe_redis_setex

    cache_key = "public_vendor_categories"
    cached = await safe_redis_get(cache_key)
    if cached:
        try:
            return VendorCategoryListResponse.model_validate_json(cached)
        except Exception:
            pass
    response = await service.list_categories(db)
    await safe_redis_setex(cache_key, _CATEGORIES_CACHE_TTL, response.model_dump_json())
    return response


@router.get("/categories/{slug}", response_model=VendorCategoryDetailResponse)
async def get_category(
    request: Request,
    slug: str,
    db: AsyncSession = Depends(get_db),
    service: VendorService = Depends(get_vnd_service),
) -> VendorCategoryDetailResponse:
    """One category with its public vendors and their observed states."""
    await _rate_limit(request)
    from app.infrastructure.redis_client import safe_redis_get, safe_redis_setex

    cache_key = f"public_vendor_category:{slug.lower()}"
    cached = await safe_redis_get(cache_key)
    if cached:
        try:
            return VendorCategoryDetailResponse.model_validate_json(cached)
        except Exception:
            pass
    response = await service.get_category_detail(db, slug)
    await safe_redis_setex(cache_key, _CATEGORIES_CACHE_TTL, response.model_dump_json())
    return response


@router.get("", response_model=CursorPagination[VendorResponse])
async def list_public_vendors(
    request: Request,
    db: AsyncSession = Depends(get_db),
    service: VendorService = Depends(get_vnd_service),
    cursor: uuid.UUID | None = Query(
        default=None, description="Vendor id of the last item on the previous page"
    ),
    limit: int = Query(default=50, ge=1, le=100),
    public: bool = Query(default=True, description="Public catalog access"),
) -> CursorPagination[VendorResponse]:
    """FIX 17: cursor-paginated vendor listing, Redis-cached for 60s."""
    await _rate_limit(request)
    cache_key = f"public_vendors:{cursor or 'start'}:{limit}"
    from app.infrastructure.redis_client import safe_redis_get, safe_redis_setex

    cached = await safe_redis_get(cache_key)
    if cached:
        try:
            return CursorPagination[VendorResponse].model_validate_json(cached)
        except Exception:
            pass
    vendors = await service.list_public_vendors(db, limit=limit + 1, cursor=cursor)
    has_more = len(vendors) > limit
    items = vendors[:limit]
    next_cursor = str(items[-1].id) if has_more and items else None
    page = CursorPagination(
        items=items, next_cursor=next_cursor, has_more=has_more
    )
    await safe_redis_setex(cache_key, _PUBLIC_VENDORS_CACHE_TTL, page.model_dump_json())
    return page


@router.get("/{vendor_name}", response_model=VendorDetailResponse)
async def get_public_vendor(
    request: Request,
    vendor_name: str,
    db: AsyncSession = Depends(get_db),
    service: VendorService = Depends(get_vnd_service),
) -> VendorDetailResponse:
    await _rate_limit(request)
    return await service.get_vendor_detail(db, vendor_name)


@router.get("/{vendor_name}/history", response_model=VendorHistoryResponse)
async def get_public_vendor_history(
    request: Request,
    vendor_name: str,
    db: AsyncSession = Depends(get_db),
    service: VendorService = Depends(get_vnd_service),
) -> VendorHistoryResponse:
    await _rate_limit(request)
    return await service.get_vendor_history(db, vendor_name)


@router.get("/{vendor_name}/metrics", response_model=VendorMetricsResponse)
async def get_vendor_metrics(
    request: Request,
    vendor_name: str,
    window: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    service: VendorService = Depends(get_vnd_service),
) -> VendorMetricsResponse:
    await _rate_limit(request)
    return await service.get_vendor_metrics(db, vendor_name, window)


@router.get("/{vendor_name}/timeline", response_model=VendorTimelineResponse)
async def get_vendor_timeline(
    request: Request,
    vendor_name: str,
    window: str = Query(default="24h"),
    resolution: str = Query(default="auto"),
    region: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    service: VendorService = Depends(get_vnd_service),
) -> VendorTimelineResponse:
    await _rate_limit(request)
    return await service.get_vendor_timeline(
        db, vendor_name, window, resolution, region
    )


@router.get("/{vendor_name}/incidents", response_model=VendorIncidentsResponse)
async def get_vendor_incidents(
    request: Request,
    vendor_name: str,
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    service: VendorService = Depends(get_vnd_service),
) -> VendorIncidentsResponse:
    await _rate_limit(request)
    return await service.get_vendor_incidents(db, vendor_name, limit)


@router.get("/{vendor_name}/developer", response_model=VendorDeveloperResponse)
async def get_vendor_developer_info(
    request: Request,
    vendor_name: str,
    db: AsyncSession = Depends(get_db),
    service: VendorService = Depends(get_vnd_service),
) -> VendorDeveloperResponse:
    await enforce_rate_limit(request, developer_limiter)
    return await service.get_developer_info(db, vendor_name)
