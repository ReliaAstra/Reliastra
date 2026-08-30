"""Dedicated admin-console authentication (separate from user sign-in).

The admin control plane is NOT reached through customer/partner sign-in and
there is no "sign in as the only admin" path anymore. Access requires the
operator-supplied credentials from ``ADMIN_USERNAME`` / ``ADMIN_PASSWORD``,
verified in constant time, which mint an isolated JWT family
(``aud=reliastra-admin``, ``type=admin_access|admin_refresh``) signed with
``ADMIN_TOKEN_SECRET``:

* ``require_system_admin`` accepts ONLY that family — a customer/partner
  access token, Supabase token, refresh token, or API key is rejected;
* admin refresh tokens are short-lived and single-use (Redis-claimed jti);
* login is rate-limited per client IP.

Routes:

    POST /v1/admin/auth/login     -> admin session (access + refresh)
    POST /v1/admin/auth/refresh   -> rotate the admin refresh token
    POST /v1/admin/auth/logout    -> revoke the admin refresh token
    GET  /v1/admin/auth/me        -> admin identity (require_system_admin)
"""

from __future__ import annotations

import logging
import time
import uuid

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import (
    ForbiddenException,
    ServiceUnavailableException,
    UnauthorizedException,
)
from app.core.rate_limit import SlidingWindowRateLimiter, enforce_rate_limit
from app.core.security import (
    ADMIN_TOKEN_TYPE_ACCESS,
    ADMIN_TOKEN_TYPE_REFRESH,
    create_admin_access_token,
    create_admin_refresh_token,
    decode_admin_token,
    verify_admin_credentials,
)
from app.db.session import get_db
from app.infrastructure.redis_client import safe_redis_claim, safe_redis_setex
from app.modules.admin.guards import require_system_admin
from app.modules.admin.repository import AdminAuditRepository
from app.modules.users.models import User

logger = logging.getLogger(__name__)

admin_auth_router = APIRouter(
    prefix="/v1/admin/auth",
    tags=["Admin — Authentication"],
)

# Brute-force throttle: 10 attempts / 15 minutes per client IP, regardless of
# the username submitted. Fail-open when Redis is unavailable, matching every
# other limiter in the stack (constant-time comparison still applies).
admin_login_limiter = SlidingWindowRateLimiter(
    limit=10, window_seconds=900, key_prefix="rl_admin_login"
)

_REFRESH_CLAIM_PREFIX = "admin_refresh_used:"


class AdminLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class AdminRefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class AdminLogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class AdminIdentity(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    full_name: str
    is_system_admin: bool = True


class AdminTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    admin: AdminIdentity


class AdminMeResponse(AdminIdentity):
    pass


async def _service_account_user(db: AsyncSession) -> User:
    """Return the FK-anchored service account for admin actions.

    The admin credential is NOT a user account and can never be signed into;
    the row below exists purely so ``created_by`` / ``changed_by`` /
    ``admin_user_id`` / ``sender_id`` foreign keys keep pointing at a real
    ``users.id``. ``ensure_admin_service_account`` (startup seed) must have
    created it; otherwise the console fails closed.
    """
    user = await _get_service_account(db)
    if user is None:
        raise ServiceUnavailableException(
            "Admin console is not initialized"
        )
    return user


async def _get_service_account(db: AsyncSession) -> User | None:
    from app.modules.users.repository import UserRepository

    return await UserRepository.get_by_email(db, settings.admin_service_email)


def _remaining_ttl_seconds(payload: dict) -> int:
    return max(1, int(payload["exp"] - time.time()))


def _identity(user: User, username: str) -> AdminIdentity:
    return AdminIdentity(
        id=user.id,
        username=username,
        email=user.email,
        full_name=user.full_name,
        is_system_admin=True,
    )


async def _audit_login(
    db: AsyncSession,
    user: User,
    request: Request,
    *,
    failed: bool,
) -> None:
    """Record admin login outcome on the dedicated admin audit trail.

    Fire-and-forget semantics are NOT used here: the caller commits the
    session and the row is best-effort. Failures never surface as a login
    error (an audit DB problem must not lock the operator out).
    """
    action = "admin_login" if not failed else "admin_login_failed"
    ip = request.client.host if request.client else None
    try:
        entry = await AdminAuditRepository.log(
            db,
            admin_user_id=user.id,
            admin_email=user.email,
            action=action,
            entity_type="admin_session",
            entity_id=str(user.id),
            details={"username": user.email, "failed": failed},
            ip_address=ip,
            user_agent=request.headers.get("user-agent"),
        )
        db.add(entry)
        await db.flush()
    except Exception as exc:  # pragma: no cover - never block login
        logger.warning("Failed to write admin login audit: %s", exc)
        await db.rollback()


@admin_auth_router.post("/login", response_model=AdminTokenResponse)
async def admin_login(
    request: Request,
    body: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> AdminTokenResponse:
    """Exchange the dedicated admin credentials for an isolated session."""
    await enforce_rate_limit(request, admin_login_limiter)

    if not settings.admin_console_enabled:
        raise ForbiddenException("Admin console is disabled")

    ok = verify_admin_credentials(body.username, body.password)
    # Resolve the identity anchor regardless so failed logins are audited with
    # the same row (availability of the audit row must not leak success).
    user = await _get_service_account(db)
    if user is None:
        # Fail closed: the console is not initialized.
        raise ServiceUnavailableException(
            "Admin console is not initialized"
        )

    if not ok:
        if user is not None:
            await _audit_login(db, user, request, failed=True)
            await db.commit()
        # Same status/message for unknown username and wrong password.
        raise UnauthorizedException("Invalid admin credentials")

    await _audit_login(db, user, request, failed=False)

    username = body.username
    access_token = create_admin_access_token(username)
    refresh_token = create_admin_refresh_token(username)
    await db.commit()

    return AdminTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        admin=_identity(user, username),
    )


@admin_auth_router.post("/refresh", response_model=AdminTokenResponse)
async def admin_refresh(
    request: Request,
    body: AdminRefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> AdminTokenResponse:
    """Rotate an admin refresh token (single-use)."""
    await enforce_rate_limit(request, admin_login_limiter)

    payload = decode_admin_token(body.refresh_token)
    if payload.get("type") != ADMIN_TOKEN_TYPE_REFRESH:
        raise UnauthorizedException("Admin refresh token required")

    jti = payload["jti"]
    claimed = await safe_redis_claim(
        f"{_REFRESH_CLAIM_PREFIX}{jti}",
        "1",
        ex=_remaining_ttl_seconds(payload),
    )
    if claimed is False:
        # Replay of an already-rotated (or logged-out) refresh token.
        raise UnauthorizedException("Admin session has been revoked")
    if claimed is None:
        # Redis unreachable: fail open so a cache outage cannot lock the
        # operator out; the short refresh lifetime bounds the exposure.
        logger.warning(
            "Redis unavailable while claiming admin refresh jti=%s", jti
        )

    username = payload["username"]
    user = await _get_service_account(db)
    if user is None:
        raise ServiceUnavailableException(
            "Admin console is not initialized"
        )

    access_token = create_admin_access_token(username)
    refresh_token = create_admin_refresh_token(username)
    return AdminTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        admin=_identity(user, username),
    )


@admin_auth_router.post("/logout", status_code=204)
async def admin_logout(
    request: Request,
    body: AdminLogoutRequest,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoke the admin refresh token (best-effort)."""
    await enforce_rate_limit(request, admin_login_limiter)
    try:
        payload = decode_admin_token(body.refresh_token)
        if payload.get("type") == ADMIN_TOKEN_TYPE_REFRESH:
            await safe_redis_setex(
                f"{_REFRESH_CLAIM_PREFIX}{payload['jti']}",
                _remaining_ttl_seconds(payload),
                "1",
            )
    except UnauthorizedException:
        # Already invalid/expired — nothing to revoke.
        pass
    db.rollback()


@admin_auth_router.get("/me", response_model=AdminMeResponse)
async def admin_me(
    request: Request,
    admin_user: User = Depends(require_system_admin),
) -> AdminMeResponse:
    """Current admin identity (requires a valid admin access token)."""
    auth_header = request.headers.get("authorization", "")
    token = auth_header.removeprefix("Bearer ").removeprefix("bearer ").strip()
    payload = decode_admin_token(token)
    return AdminMeResponse(
        **_identity(admin_user, payload.get("username", "")).model_dump()
    )
