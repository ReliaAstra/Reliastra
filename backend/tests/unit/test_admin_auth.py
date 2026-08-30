"""Unit tests for the dedicated admin-console security boundary.

Runs without the Linux-only pgserver conftest DB. Covers:

* constant-time credential verification (and fail-closed when unconfigured);
* the isolated admin JWT family (audience + type) — user tokens must never
  be accepted as admin tokens and vice versa;
* the request guard rejecting anonymous, user-family, refresh, and API-key
  requests while accepting valid admin access tokens.
"""

from __future__ import annotations

import time
import uuid

import pytest

from app.config import settings
from app.core.security import (
    ADMIN_TOKEN_AUDIENCE,
    create_access_token,
    create_admin_access_token,
    create_refresh_token,
    decode_admin_token,
    verify_admin_credentials,
)


def make_request(
    path: str, method: str = "GET", headers=None, client=("203.0.113.9", 12345)
):
    from starlette.requests import Request

    raw_headers = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "headers": raw_headers,
        "query_string": b"",
        "client": client,
    }
    return Request(scope)


@pytest.fixture(autouse=True)
def admin_credentials_configured():
    original = (
        settings.ADMIN_USERNAME,
        settings.ADMIN_PASSWORD,
        settings.ADMIN_TOKEN_SECRET,
    )
    from pydantic import SecretStr

    settings.ADMIN_USERNAME = "test-admin"
    settings.ADMIN_PASSWORD = SecretStr("Test-Admin-Password-2026!")
    settings.ADMIN_TOKEN_SECRET = (
        "test-admin-token-secret-0123456789abcdef0123456789abcdef"
    )
    yield
    settings.ADMIN_USERNAME, settings.ADMIN_PASSWORD, settings.ADMIN_TOKEN_SECRET = (
        original
    )


# ---------------------------------------------------------------------------
# 1. Credential verification (constant-time, fail-closed)
# ---------------------------------------------------------------------------


def test_verify_admin_credentials_accepts_exact_pair():
    assert verify_admin_credentials("test-admin", "Test-Admin-Password-2026!") is True


def test_verify_admin_credentials_rejects_wrong_password():
    assert verify_admin_credentials("test-admin", "wrong-password") is False


def test_verify_admin_credentials_rejects_unknown_username():
    assert verify_admin_credentials("nobody", "Test-Admin-Password-2026!") is False


def test_verify_admin_credentials_fails_closed_when_disabled():
    from pydantic import SecretStr

    original = (
        settings.ADMIN_USERNAME,
        settings.ADMIN_PASSWORD,
        settings.ADMIN_TOKEN_SECRET,
    )
    try:
        settings.ADMIN_USERNAME = ""
        settings.ADMIN_PASSWORD = SecretStr("")
        settings.ADMIN_TOKEN_SECRET = ""
        assert verify_admin_credentials("", "") is False
        assert verify_admin_credentials("any", "anything") is False
        assert settings.admin_console_enabled is False
    finally:
        settings.ADMIN_USERNAME, settings.ADMIN_PASSWORD, settings.ADMIN_TOKEN_SECRET = (
            original
        )


# ---------------------------------------------------------------------------
# 2. Admin JWT family isolation
# ---------------------------------------------------------------------------


def test_admin_token_roundtrip_and_claims():
    token = create_admin_access_token("test-admin")
    payload = decode_admin_token(token)
    assert payload["type"] == "admin_access"
    assert payload["aud"] == ADMIN_TOKEN_AUDIENCE
    assert payload["username"] == "test-admin"
    assert payload["jti"]
    assert payload["exp"] > time.time()


def test_user_access_token_is_rejected_by_admin_decoder():
    token = create_access_token(str(uuid.uuid4()))
    from app.core.exceptions import UnauthorizedException

    with pytest.raises(UnauthorizedException):
        decode_admin_token(token)


def test_user_refresh_token_is_rejected_by_admin_decoder():
    token = create_refresh_token(str(uuid.uuid4()))
    from app.core.exceptions import UnauthorizedException

    with pytest.raises(UnauthorizedException):
        decode_admin_token(token)


def test_admin_refresh_token_has_distinct_type():
    from app.core.security import ADMIN_TOKEN_TYPE_REFRESH, create_admin_refresh_token

    payload = decode_admin_token(create_admin_refresh_token("test-admin"))
    assert payload["type"] == ADMIN_TOKEN_TYPE_REFRESH


def test_admin_token_is_rejected_by_user_decoder():
    """The families cannot cross-authenticate in either direction."""
    from app.core.exceptions import UnauthorizedException
    from app.core.security import decode_token

    token = create_admin_access_token("test-admin")
    with pytest.raises(UnauthorizedException):
        decode_token(token)


# ---------------------------------------------------------------------------
# 3. Request guard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_guard_rejects_missing_authorization(monkeypatch):
    from app.modules.admin.guards import require_system_admin

    from app.core.exceptions import UnauthorizedException

    with pytest.raises(UnauthorizedException):
        await require_system_admin(make_request("/v1/admin/overview"), db=None)


@pytest.mark.asyncio
async def test_guard_rejects_user_token(monkeypatch):
    from app.modules.admin.guards import require_system_admin

    from app.core.exceptions import UnauthorizedException

    token = create_access_token(str(uuid.uuid4()))
    with pytest.raises(UnauthorizedException):
        await require_system_admin(
            make_request("/v1/admin/overview", headers={"Authorization": f"Bearer {token}"}),
            db=None,
        )


@pytest.mark.asyncio
async def test_guard_rejects_admin_refresh_token(monkeypatch):
    from app.modules.admin.guards import require_system_admin

    from app.core.exceptions import UnauthorizedException
    from app.core.security import create_admin_refresh_token

    token = create_admin_refresh_token("test-admin")
    with pytest.raises(UnauthorizedException):
        await require_system_admin(
            make_request("/v1/admin/overview", headers={"Authorization": f"Bearer {token}"}),
            db=None,
        )


@pytest.mark.asyncio
async def test_guard_rejects_api_key(monkeypatch):
    from app.modules.admin.guards import require_system_admin

    from app.core.exceptions import UnauthorizedException

    with pytest.raises(UnauthorizedException):
        await require_system_admin(
            make_request(
                "/v1/admin/overview",
                headers={"x-api-key": "rel_" + "a" * 40},
            ),
            db=None,
        )


@pytest.mark.asyncio
async def test_guard_accepts_admin_access_token(monkeypatch):
    from app.modules.admin.guards import require_system_admin

    # The guard resolves the service-account anchor via the repository; stub
    # it out for this unit test (integration tests cover the real DB row).
    import app.modules.admin.guards as guards_mod

    async def fake_get_by_email(session, email):
        return type(
            "User",
            (),
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000042"),
                "email": email,
                "full_name": "System Administrator",
                "is_system_admin": True,
            },
        )()

    monkeypatch.setattr(
        guards_mod.UserRepository, "get_by_email", staticmethod(fake_get_by_email)
    )

    token = create_admin_access_token("test-admin")
    user = await require_system_admin(
        make_request("/v1/admin/overview", headers={"Authorization": f"Bearer {token}"}),
        db=None,
    )
    assert user.email == settings.admin_service_email
    assert user.full_name == "System Administrator"


# ---------------------------------------------------------------------------
# 4. Config validation
# ---------------------------------------------------------------------------


def test_admin_credentials_must_be_set_together():
    from pydantic import SecretStr

    original = (
        settings.ADMIN_USERNAME,
        settings.ADMIN_PASSWORD,
        settings.ADMIN_TOKEN_SECRET,
    )
    try:
        settings.ADMIN_USERNAME = "admin"
        settings.ADMIN_PASSWORD = SecretStr("")
        settings.ADMIN_TOKEN_SECRET = ""
        # The runtime property mirrors the validators' fail-closed policy.
        assert settings.admin_console_enabled is False
    finally:
        settings.ADMIN_USERNAME, settings.ADMIN_PASSWORD, settings.ADMIN_TOKEN_SECRET = (
            original
        )
