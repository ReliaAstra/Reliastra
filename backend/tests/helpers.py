"""Shared test helpers.

Email verification is a hard gate (see ``app/modules/auth/otp_service.py``):
``POST /v1/auth/register`` issues no tokens, and ``POST /v1/auth/login``
refuses unverified accounts. Every test that needs an authenticated session
therefore has to walk the OTP flow — :func:`register_and_verify` does that in
one call.

The code is deterministic in tests because ``conftest`` patches
``generate_otp_code`` (autouse fixture ``otp_test_harness``).
"""

from __future__ import annotations

from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import create_admin_access_token

#: The value ``generate_otp_code`` is patched to return during tests.
TEST_OTP_CODE = "424242"


async def make_admin_headers(db: AsyncSession) -> dict[str, str]:
    """Mint a dedicated ADMIN-console session for integration tests.

    This intentionally does NOT create a login-able user and does not flip
    ``is_system_admin`` on one: it seeds the non-login-able service account
    anchor and signs an admin-family access token, exactly like the operator
    flow (``POST /v1/admin/auth/login`` → admin JWT).
    """
    if not settings.admin_console_enabled:
        # Test environments without ADMIN_* configured would otherwise fail
        # closed; configure a deterministic sandbox credential.
        from pydantic import SecretStr

        settings.ADMIN_USERNAME = "test-admin"
        settings.ADMIN_PASSWORD = SecretStr("Test-Admin-Password-2026!")
        settings.ADMIN_TOKEN_SECRET = (
            "test-admin-token-secret-0123456789abcdef0123456789abcdef"
        )

    from app.modules.admin.seed import ensure_admin_service_account

    seeded = await ensure_admin_service_account()
    assert seeded, "admin service account must be seeded for tests"
    token = create_admin_access_token(settings.ADMIN_USERNAME)
    return {"Authorization": f"Bearer {token}"}


async def register_and_verify(
    async_client: AsyncClient, payload: dict[str, Any]
) -> dict[str, Any]:
    """Register an account and clear the email-verification hard gate.

    Returns the ``/verify-otp`` body: ``{user, organization, tokens, ...}``,
    with ``organization`` backfilled from the registration response.
    """
    reg_res = await async_client.post("/v1/auth/register", json=payload)
    assert reg_res.status_code == 201, reg_res.text
    reg_body = reg_res.json()
    # The gate: registration must never hand out a session.
    assert reg_body["tokens"] is None, reg_body
    assert reg_body["verification_required"] is True

    verify_res = await async_client.post(
        "/v1/auth/verify-otp",
        json={"email": payload["email"], "code": TEST_OTP_CODE},
    )
    assert verify_res.status_code == 200, verify_res.text
    body = verify_res.json()
    if not body.get("organization"):
        body["organization"] = reg_body["organization"]
    return body
