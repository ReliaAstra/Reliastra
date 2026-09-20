"""JWT session tokens (user + admin-console families).

Canonical home (moved from ``app.core.security`` during the platform
redesign). Import from here in new code; ``app.core.security`` re-exports
these names for backward compatibility.
"""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
import jwt
from app.config import settings
from app.platform.web.errors import UnauthorizedException



def _base_token_payload(subject: str, expire: datetime, token_type: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "sub": subject,
        "iat": now,
        "nbf": now,
        "exp": expire,
        "type": token_type,
        "jti": secrets.token_hex(16),
    }


def create_access_token(
    subject: str, additional_claims: dict[str, Any] | None = None
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode = _base_token_payload(subject, expire, "access")
    if additional_claims:
        to_encode.update(additional_claims)
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")


def create_refresh_token(
    subject: str, additional_claims: dict[str, Any] | None = None
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    to_encode = _base_token_payload(subject, expire, "refresh")
    if additional_claims:
        to_encode.update(additional_claims)
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")


# ── Admin-console tokens ───────────────────────────────────────────────────
# Admin access is a SEPARATE credential family from user/partner sessions.
# Tokens minted here carry type=admin_access / admin_refresh and
# aud=reliastra-admin; they are accepted ONLY by require_system_admin and can
# never be used as a user/partner token (get_current_user requires type ==
# "access" and never sees the admin audience).

ADMIN_TOKEN_AUDIENCE = "reliastra-admin"
ADMIN_TOKEN_TYPE_ACCESS = "admin_access"
ADMIN_TOKEN_TYPE_REFRESH = "admin_refresh"


def _admin_token_secret() -> str:
    """Signing key for the admin-console token family.

    A dedicated secret (ADMIN_TOKEN_SECRET) keeps the admin JWT family fully
    independent from customer/partner sessions: a token minted with SECRET_KEY
    (or forged with it) is rejected by the admin guard, and vice versa.
    """
    if not settings.ADMIN_TOKEN_SECRET:
        raise UnauthorizedException("Admin console is not configured")
    return settings.ADMIN_TOKEN_SECRET


def verify_admin_credentials(username: str, password: str) -> bool:
    """Constant-time check of the dedicated admin credentials.

    SHA-256 digests are compared with ``compare_digest`` so neither the
    credentials' length nor prefix leaks through timing, and the same work is
    done for every attempt. Unknown usernames cost the same as correct ones.
    """
    expected_user = settings.ADMIN_USERNAME
    expected_password = (
        settings.ADMIN_PASSWORD.get_secret_value()
        if settings.ADMIN_PASSWORD
        else ""
    )
    if not expected_user or not expected_password:
        return False
    user_match = hmac.compare_digest(
        hashlib.sha256(username.encode("utf-8")).digest(),
        hashlib.sha256(expected_user.encode("utf-8")).digest(),
    )
    pass_match = hmac.compare_digest(
        hashlib.sha256(password.encode("utf-8")).digest(),
        hashlib.sha256(expected_password.encode("utf-8")).digest(),
    )
    return user_match and pass_match


def create_admin_access_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode = _base_token_payload(
        f"admin:{username}", expire, ADMIN_TOKEN_TYPE_ACCESS
    )
    to_encode.update({"aud": ADMIN_TOKEN_AUDIENCE, "username": username})
    return jwt.encode(to_encode, _admin_token_secret(), algorithm="HS256")


def create_admin_refresh_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.ADMIN_REFRESH_TOKEN_EXPIRE_DAYS
    )
    to_encode = _base_token_payload(
        f"admin:{username}", expire, ADMIN_TOKEN_TYPE_REFRESH
    )
    to_encode.update({"aud": ADMIN_TOKEN_AUDIENCE, "username": username})
    return jwt.encode(to_encode, _admin_token_secret(), algorithm="HS256")


def decode_admin_token(token: str) -> dict[str, Any]:
    """Verify an admin-console JWT (signature, audience, admin token type).

    Raises :class:`UnauthorizedException` for any failure. The returned
    payload always contains ``username`` and a ``jti`` suitable for
    single-use refresh rotation.
    """
    try:
        payload = jwt.decode(
            token,
            _admin_token_secret(),
            algorithms=["HS256"],
            audience=ADMIN_TOKEN_AUDIENCE,
            options={"require": ["exp", "sub", "jti", "username"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedException("Admin session has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedException("Invalid admin token") from exc

    if payload.get("type") not in {
        ADMIN_TOKEN_TYPE_ACCESS,
        ADMIN_TOKEN_TYPE_REFRESH,
    }:
        raise UnauthorizedException("Invalid admin token")
    return payload


def decode_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=["HS256"]
        )
        return payload
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedException("Token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedException("Invalid token") from exc

