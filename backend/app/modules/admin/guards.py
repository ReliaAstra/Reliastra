from __future__ import annotations

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import (
    ForbiddenException,
    ServiceUnavailableException,
    UnauthorizedException,
)
from app.core.security import (
    ADMIN_TOKEN_TYPE_ACCESS,
    decode_admin_token,
)
from app.db.session import get_db
from app.modules.users.models import User
from app.modules.users.repository import UserRepository


async def _admin_service_account(db: AsyncSession) -> User | None:
    """The non-login-able service account anchoring admin-created records."""
    return await UserRepository.get_by_email(db, settings.admin_service_email)


async def require_system_admin(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Require a dedicated ADMIN-console session.

    Only tokens from the admin JWT family are accepted:

    * ``aud = reliastra-admin``
    * ``type = admin_access``
    * signed with ``ADMIN_TOKEN_SECRET``

    Customer/partner access tokens, Supabase tokens, refresh tokens, and API
    keys are all rejected (an admin token is signed by a different secret, so
    a normal ``decode_token`` call also fails on it — the two families cannot
    cross-authenticate). The returned ``User`` is the service account seeded
    from ``ADMIN_SERVICE_EMAIL``; it exists only for FK integrity and can
    never be signed into (random password, blocked).
    """
    if not settings.admin_console_enabled:
        raise ForbiddenException("Admin console is disabled")

    auth_header = request.headers.get("authorization", "")
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise UnauthorizedException("Admin authentication required")

    payload = decode_admin_token(token.strip())
    if payload.get("type") != ADMIN_TOKEN_TYPE_ACCESS:
        raise UnauthorizedException("Admin access token required")

    user = await _admin_service_account(db)
    if user is None:
        raise ServiceUnavailableException(
            "Admin console is not initialized"
        )
    return user
