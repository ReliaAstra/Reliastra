from fastapi import APIRouter, Query, Request, Response

from app.config import settings
from app.core.rate_limit import enforce_rate_limit, ip_limiter
from app.infrastructure.ipgeo import hash_ip, resolve_country
from app.modules.analytics.exclusions import (
    DECISION_HEADER,
    should_exclude_visit,
)
from app.modules.analytics.service import analytics_service

public_analytics_router = APIRouter(prefix="/v1/public/analytics", tags=["Analytics"])


@public_analytics_router.post("/visit", status_code=204)
async def track_visit(
    request: Request,
    path: str | None = Query(default=None, max_length=200),
) -> Response:
    """Privacy-light page beacon: no cookies, no PII - hashed IP + country.

    Called once per marketing/dashboard mount from the frontend. Rate limited
    per IP so a single visitor cannot inflate counters by refreshing.

    Internal traffic is dropped before anything is written, so the admin
    numbers measure acquisition instead of the team's own browsing: excluded
    IPs/CIDRs, opted-out browsers, internal path prefixes and (when no proxy
    is in front) non-public client addresses. See
    ``app.modules.analytics.exclusions`` for the precedence and the reasoning
    behind each filter.
    """
    await enforce_rate_limit(request, ip_limiter)

    from app.core.rate_limit import client_ip_from_request

    # The socket peer is the load balancer behind a proxy, so the hardened XFF
    # parser is the only correct source for the visitor's address - it falls
    # back to the peer itself when no header is present.
    ip = client_ip_from_request(request)
    behind_proxy = bool(request.headers.get("x-forwarded-for"))

    decision = should_exclude_visit(
        ip,
        path=path,
        headers=request.headers,
        behind_proxy=behind_proxy,
    )
    if decision.excluded:
        await analytics_service.record_excluded(decision.reason)
        return Response(
            status_code=204, headers={DECISION_HEADER: decision.header_value()}
        )

    visitor_hash = hash_ip(ip, (request.headers.get("user-agent") or "")[:120])
    country = await resolve_country(
        ip,
        headers=request.headers,
        ipinfo_token=settings.IPINFO_TOKEN,
    )
    await analytics_service.record_visit(visitor_hash, country, path)
    return Response(status_code=204, headers={DECISION_HEADER: decision.header_value()})
