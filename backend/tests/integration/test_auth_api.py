import pytest

from tests.helpers import TEST_OTP_CODE, register_and_verify

EMAIL = "user@reliastra.com"
PASSWORD = "Secret123!"


@pytest.mark.asyncio
async def test_auth_endpoints(async_client):
    # Register — the hard gate means NO tokens are issued here.
    reg_res = await async_client.post(
        "/v1/auth/register",
        json={
            "email": EMAIL,
            "password": PASSWORD,
            "full_name": "Test Human",
            "org_name": "Reliastra MVP Org",
        },
    )
    assert reg_res.status_code == 201, reg_res.text
    reg_data = reg_res.json()
    assert reg_data["tokens"] is None
    assert reg_data["verification_required"] is True
    assert reg_data["user"]["is_email_verified"] is False
    assert "organization" in reg_data

    # Duplicate register -> 409
    dup_res = await async_client.post(
        "/v1/auth/register",
        json={
            "email": EMAIL,
            "password": PASSWORD,
            "full_name": "Test Human",
        },
    )
    assert dup_res.status_code == 409

    # Login before verification -> 403 EMAIL_NOT_VERIFIED
    blocked = await async_client.post(
        "/v1/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
    )
    assert blocked.status_code == 403, blocked.text
    assert blocked.json()["error"]["details"][0]["issue"] == "EMAIL_NOT_VERIFIED"

    # Verify the OTP -> session issued here
    verify_res = await async_client.post(
        "/v1/auth/verify-otp",
        json={"email": EMAIL, "code": TEST_OTP_CODE},
    )
    assert verify_res.status_code == 200, verify_res.text
    verify_data = verify_res.json()
    assert verify_data["is_email_verified"] is True
    assert verify_data["tokens"]["access_token"]
    assert verify_data["organization"]["id"]

    # Login now succeeds
    login_res = await async_client.post(
        "/v1/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
    )
    assert login_res.status_code == 200, login_res.text
    login_data = login_res.json()

    # Refresh
    refresh_res = await async_client.post(
        "/v1/auth/refresh",
        json={"refresh_token": login_data["refresh_token"]},
    )
    assert refresh_res.status_code == 200, refresh_res.text
    ref_data = refresh_res.json()

    # Logout
    logout_res = await async_client.post(
        "/v1/auth/logout",
        json={"refresh_token": ref_data["refresh_token"]},
    )
    assert logout_res.status_code == 204

    # Health endpoint
    health_res = await async_client.get("/health")
    assert health_res.status_code == 200
    assert health_res.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_registration_emails_a_six_digit_code(async_client, otp_test_harness):
    await async_client.post(
        "/v1/auth/register",
        json={
            "email": "codes@reliastra.com",
            "password": PASSWORD,
            "full_name": "Code Receiver",
        },
    )
    assert len(otp_test_harness) == 1
    message = otp_test_harness[0]
    assert message["to_email"] == "codes@reliastra.com"
    assert TEST_OTP_CODE in message["subject"]
    assert TEST_OTP_CODE in message["body"]


@pytest.mark.asyncio
async def test_wrong_code_is_rejected_and_burns_attempts(async_client):
    email = "attempts@reliastra.com"
    await async_client.post(
        "/v1/auth/register",
        json={"email": email, "password": PASSWORD, "full_name": "Brute Forcer"},
    )

    # 5 wrong guesses are allowed, the 5th burns the code.
    for expected_remaining in (4, 3, 2, 1, 0):
        res = await async_client.post(
            "/v1/auth/verify-otp",
            json={"email": email, "code": "000000"},
        )
        assert res.status_code == 422, res.text
        issues = {d["issue"] for d in res.json()["error"]["details"]}
        if expected_remaining:
            assert "INVALID_CODE" in issues
        else:
            assert "TOO_MANY_ATTEMPTS" in issues

    # The correct code no longer works — the record was burned.
    res = await async_client.post(
        "/v1/auth/verify-otp",
        json={"email": email, "code": TEST_OTP_CODE},
    )
    assert res.status_code == 422
    assert res.json()["error"]["details"][0]["issue"] == "NO_ACTIVE_CODE"

    # And the account is still locked out of login.
    login = await async_client.post(
        "/v1/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert login.status_code == 403


@pytest.mark.asyncio
async def test_expired_code_is_rejected(async_client, db_session):
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select

    from app.modules.auth.models import EmailVerificationCode

    email = "expiry@reliastra.com"
    await async_client.post(
        "/v1/auth/register",
        json={"email": email, "password": PASSWORD, "full_name": "Slow Human"},
    )

    record = (
        await db_session.execute(
            select(EmailVerificationCode).order_by(
                EmailVerificationCode.created_at.desc()
            )
        )
    ).scalars().first()
    record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.add(record)
    await db_session.commit()

    res = await async_client.post(
        "/v1/auth/verify-otp",
        json={"email": email, "code": TEST_OTP_CODE},
    )
    assert res.status_code == 422, res.text
    assert res.json()["error"]["details"][0]["issue"] == "CODE_EXPIRED"


@pytest.mark.asyncio
async def test_resend_is_throttled_and_does_not_enumerate(async_client):
    email = "resend@reliastra.com"
    await async_client.post(
        "/v1/auth/register",
        json={"email": email, "password": PASSWORD, "full_name": "Resender"},
    )

    # Immediately after signup the per-account cooldown is active. The
    # endpoint still answers with the same neutral 200 body.
    throttled = await async_client.post("/v1/auth/resend-otp", json={"email": email})
    assert throttled.status_code == 429, throttled.text

    # Unknown address: identical shape to a real send, no account leak.
    unknown = await async_client.post(
        "/v1/auth/resend-otp", json={"email": "nobody@reliastra.com"}
    )
    assert unknown.status_code == 200
    assert "expires_in_minutes" in unknown.json()


@pytest.mark.asyncio
async def test_unverified_token_cannot_reach_protected_routes(
    async_client, db_session
):
    """Defence in depth: a session minted before verification is rejected."""
    from app.core.security import create_access_token
    from sqlalchemy import select

    from app.modules.users.models import User

    email = "sneaky@reliastra.com"
    await async_client.post(
        "/v1/auth/register",
        json={"email": email, "password": PASSWORD, "full_name": "Sneaky"},
    )
    user = (
        await db_session.execute(select(User).where(User.email == email))
    ).scalar_one()

    forged = create_access_token(subject=str(user.id))
    res = await async_client.get(
        "/v1/users/me", headers={"Authorization": f"Bearer {forged}"}
    )
    assert res.status_code == 403, res.text
    assert res.json()["error"]["details"][0]["issue"] == "EMAIL_NOT_VERIFIED"


@pytest.mark.asyncio
async def test_verified_session_reaches_protected_routes(async_client):
    body = await register_and_verify(
        async_client,
        {
            "email": "verified@reliastra.com",
            "password": PASSWORD,
            "full_name": "Verified Human",
        },
    )
    res = await async_client.get(
        "/v1/users/me",
        headers={"Authorization": f"Bearer {body['tokens']['access_token']}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["is_email_verified"] is True


@pytest.mark.asyncio
async def test_verified_account_cannot_be_reverified_for_a_free_session(
    async_client,
):
    """Regression: /verify-otp must never mint a session for a bad code.

    An early-return for already-verified users meant any caller could POST
    {email, "000000"} for a verified account and be handed real tokens —
    an authentication bypass requiring only a known email address.
    """
    email = "bypass@reliastra.com"
    await register_and_verify(
        async_client,
        {"email": email, "password": PASSWORD, "full_name": "Already Verified"},
    )

    for attempt_code in ("000000", TEST_OTP_CODE):
        res = await async_client.post(
            "/v1/auth/verify-otp",
            json={"email": email, "code": attempt_code},
        )
        assert res.status_code == 422, res.text
        body = res.json()
        assert body["error"]["details"][0]["issue"] == "ALREADY_VERIFIED"
        assert "tokens" not in body
