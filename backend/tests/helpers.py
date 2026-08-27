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

#: The value ``generate_otp_code`` is patched to return during tests.
TEST_OTP_CODE = "424242"


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
