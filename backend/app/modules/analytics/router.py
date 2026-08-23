from fastapi import APIRouter, Query, Request

from app.config import settings
from app.core.rate_limit import enforce_rate_limit, ip_limiter
from app.infrastructure.ipgeo import hash_ip, resolve_country
from app.modules.analytics.service import analytics_service

public_analytics_router = APIRouter(prefix="/v1/public/analytics", tags=["Analytics"])


@public_analytics_router.post("/visit", status_code=204)
async def track_visit(
    request: Request,
    path: str | None = Query(default=None, max_length=200),
) -> None:
    """Privacy-light page beacon: no cookies, no PII - hashed IP + country.

    Called once per marketing/dashboard mount from the frontend. Rate limited
    per IP so a single visitor cannot inflate counters by refreshing.
    """
    await enforce_rate_limit(request, ip_limiter)

    client = request.client
    ip = client.host if client else ""
    # Behind a proxy the socket peer is the LB; reuse the hardened XFF parser.
    if not ip or ip in {"127.0.0.1", "testclient"}:
        from app.core.rate_limit import client_ip_from_request

        ip = client_ip_from_request(request)

    visitor_hash = hash_ip(ip, (request.headers.get("user-agent") or "")[:120])
    country = await resolve_country(
        ip,
        headers=request.headers,
        ipinfo_token=settings.IPINFO_TOKEN,
    )
    await analytics_service.record_visit(visitor_hash, country, path)
