"""Welcome email on signup.

With email-verification enforcement, registration itself only issues the OTP
code; the *welcome* email fires at the moment the address is successfully
verified — via the OTP code (``EmailOTPService.verify_code``) or the legacy
magic link (``EmailAuthService.verify_email``) — exactly once, and a broken
SMTP layer can never block signup or verification.
"""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.modules.auth.email_service import EmailAuthService
from app.modules.auth.otp_service import EmailOTPService
from app.modules.auth.schemas import RegisterRequest
from app.modules.auth.service import AuthService


# ── Helpers ──────────────────────────────────────────────────────────


def _org_named(name: str) -> MagicMock:
    org = MagicMock()
    org.name = name
    return org


def _register_repos() -> tuple[MagicMock, MagicMock, MagicMock]:
    auth_repo = MagicMock()
    user_repo = MagicMock()
    org_repo = MagicMock()

    user_repo.get_by_email = AsyncMock(return_value=None)
    fake_user = MagicMock(
        id=uuid.uuid4(),
        email="new@reliastra.com",
        password_hash="hash",
        is_active=True,
        is_email_verified=False,
        full_name="New User",
    )
    user_repo.create = AsyncMock(return_value=fake_user)

    fake_org = MagicMock(id=uuid.uuid4(), slug="new-org", plan="free")
    fake_org.name = "New Org"
    org_repo.get_by_slug = AsyncMock(return_value=None)
    org_repo.create = AsyncMock(return_value=fake_org)
    org_repo.add_member = AsyncMock()
    return auth_repo, user_repo, org_repo


def _verified_otp_service() -> tuple[EmailOTPService, MagicMock, MagicMock]:
    """OTP service + mocks wired so verify_code(email, code) succeeds."""
    user_repo = MagicMock()
    auth_repo = MagicMock()

    user = MagicMock(
        id=uuid.uuid4(),
        email="ada@acme.io",
        full_name="Ada Lovelace",
        is_active=True,
        is_email_verified=False,
    )
    user_repo.get_by_email = AsyncMock(return_value=user)
    user_repo.update = AsyncMock()

    record = MagicMock(
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        attempts=0,
    )
    auth_repo.get_active_email_verification_code = AsyncMock(return_value=record)
    auth_repo.verify_code_hash = MagicMock(return_value=True)
    auth_repo.mark_email_verification_code_used = AsyncMock()
    auth_repo.revoke_all_email_verification_tokens = AsyncMock()

    return EmailOTPService(user_repository=user_repo, auth_repository=auth_repo), user_repo, auth_repo


# ── Registration: OTP is the gate, welcome must NOT fire here ───────


@pytest.mark.asyncio
async def test_register_issues_otp_but_not_welcome_email(mocker):
    auth_repo, user_repo, org_repo = _register_repos()
    mocker.patch(
        "app.modules.agencies.repository.AgencyRepository.create_application",
        new=AsyncMock(),
    )
    issue = mocker.patch(
        "app.modules.auth.otp_service.email_otp_service.issue_code",
        new=AsyncMock(),
    )
    welcome = mocker.patch(
        "app.modules.auth.email_service.email_auth_service.send_welcome_email",
        new=AsyncMock(return_value=True),
    )

    service = AuthService(
        auth_repository=auth_repo, user_repository=user_repo, org_repository=org_repo
    )
    result = await service.register(
        AsyncMock(),
        RegisterRequest(
            email="new@reliastra.com", password="Password123!", full_name="New User"
        ),
    )

    assert result.verification_required is True or getattr(result, "tokens", None) is None
    issue.assert_awaited_once()
    welcome.assert_not_called()


# ── OTP verification: welcome fires ─────────────────────────────────


@pytest.mark.asyncio
async def test_otp_verification_sends_welcome_email(mocker):
    service, _, _ = _verified_otp_service()
    mocker.patch(
        "app.modules.organizations.repository.OrganizationRepository.list_for_user",
        new=AsyncMock(return_value=[_org_named("Acme")]),
    )
    welcome = mocker.patch(
        "app.modules.auth.email_service.email_auth_service.send_welcome_email",
        new=AsyncMock(return_value=True),
    )

    user_repo_update = service.user_repository.update
    user = await service.verify_code(AsyncMock(), "ada@acme.io", "123456")

    assert user.email == "ada@acme.io"
    user_repo_update.assert_awaited_once()
    assert user_repo_update.await_args.kwargs["is_email_verified"] is True
    welcome.assert_awaited_once()
    kwargs = welcome.await_args.kwargs
    assert kwargs["email"] == "ada@acme.io"
    assert kwargs["full_name"] == "Ada Lovelace"
    assert kwargs["org_name"] == "Acme"


@pytest.mark.asyncio
async def test_otp_verification_succeeds_when_welcome_email_fails(mocker):
    service, _, _ = _verified_otp_service()
    mocker.patch(
        "app.modules.organizations.repository.OrganizationRepository.list_for_user",
        new=AsyncMock(return_value=[_org_named("Acme")]),
    )
    mocker.patch(
        "app.modules.auth.email_service.email_auth_service.send_welcome_email",
        new=AsyncMock(side_effect=RuntimeError("smtp exploded")),
    )

    user_repo_update = service.user_repository.update
    user = await service.verify_code(AsyncMock(), "ada@acme.io", "123456")

    assert user.email == "ada@acme.io"
    assert user_repo_update.await_args.kwargs["is_email_verified"] is True


# ── Magic-link verification: welcome fires once, on transition ───────


@pytest.mark.asyncio
async def test_link_verification_sends_welcome_email(mocker):
    user_repo = MagicMock()
    auth_repo = MagicMock()

    user = MagicMock(
        id=uuid.uuid4(),
        email="ada@acme.io",
        full_name="Ada Lovelace",
        is_email_verified=False,
    )
    user_repo.get_by_id = AsyncMock(return_value=user)
    user_repo.update = AsyncMock()

    stored = MagicMock(is_used=False, user_id=user.id)
    stored.expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    auth_repo.get_email_verification_token = AsyncMock(return_value=stored)
    auth_repo.mark_email_verification_used = AsyncMock()

    mocker.patch(
        "app.modules.organizations.repository.OrganizationRepository.list_for_user",
        new=AsyncMock(return_value=[]),
    )
    welcome = mocker.patch(
        "app.modules.auth.email_service.EmailAuthService.send_welcome_email",
        new=AsyncMock(return_value=True),
    )

    service = EmailAuthService(user_repository=user_repo, auth_repository=auth_repo)
    result = await service.verify_email(AsyncMock(), "token-abc")

    assert result["is_email_verified"] is True
    welcome.assert_awaited_once()
    kwargs = welcome.await_args.kwargs
    assert kwargs["email"] == "ada@acme.io"
    assert kwargs["org_name"] is None


@pytest.mark.asyncio
async def test_link_verification_already_verified_does_not_welcome(mocker):
    user_repo = MagicMock()
    auth_repo = MagicMock()

    user = MagicMock(
        id=uuid.uuid4(),
        email="ada@acme.io",
        full_name="Ada Lovelace",
        is_email_verified=True,  # already verified — no second welcome
    )
    user_repo.get_by_id = AsyncMock(return_value=user)
    user_repo.update = AsyncMock()

    stored = MagicMock(is_used=False, user_id=user.id)
    stored.expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    auth_repo.get_email_verification_token = AsyncMock(return_value=stored)
    auth_repo.mark_email_verification_used = AsyncMock()

    welcome = mocker.patch(
        "app.modules.auth.email_service.EmailAuthService.send_welcome_email",
        new=AsyncMock(return_value=True),
    )

    service = EmailAuthService(user_repository=user_repo, auth_repository=auth_repo)
    result = await service.verify_email(AsyncMock(), "token-abc")

    assert result["is_email_verified"] is True
    welcome.assert_not_called()


# ── Sender behaviour (SMTP layer) ────────────────────────────────────


@pytest.mark.asyncio
async def test_send_welcome_email_delivers_via_smtp(mocker):
    send = mocker.patch(
        "app.modules.auth.email_service.email_client.send_email", return_value=True
    )

    service = EmailAuthService()
    ok = await service.send_welcome_email(
        email="ada@acme.io", full_name="Ada Lovelace", org_name="Acme"
    )

    assert ok is True
    send.assert_called_once()
    kwargs = send.call_args.kwargs
    assert kwargs["to_email"] == "ada@acme.io"
    assert "Welcome" in kwargs["subject"]
    assert "Ada Lovelace" in kwargs["body"]
    assert "Acme" in kwargs["body"]
    assert "Ada Lovelace" in kwargs["html_body"]
    assert "Acme" in kwargs["html_body"]


@pytest.mark.asyncio
async def test_send_welcome_email_without_org_name(mocker):
    send = mocker.patch(
        "app.modules.auth.email_service.email_client.send_email", return_value=True
    )

    service = EmailAuthService()
    ok = await service.send_welcome_email(email="ada@acme.io", full_name="Ada Lovelace")

    assert ok is True
    kwargs = send.call_args.kwargs
    assert "Your workspace has been created" in kwargs["body"]


@pytest.mark.asyncio
async def test_send_welcome_email_smtp_failure_returns_false(mocker):
    mocker.patch(
        "app.modules.auth.email_service.email_client.send_email", return_value=False
    )

    service = EmailAuthService()
    ok = await service.send_welcome_email(
        email="ada@acme.io", full_name="Ada Lovelace", org_name="Acme"
    )

    assert ok is False


@pytest.mark.asyncio
async def test_send_welcome_email_smtp_exception_never_raises(mocker):
    mocker.patch(
        "app.modules.auth.email_service.email_client.send_email",
        side_effect=ConnectionError("connection refused"),
    )

    service = EmailAuthService()
    ok = await service.send_welcome_email(
        email="ada@acme.io", full_name="Ada Lovelace", org_name="Acme"
    )

    assert ok is False


@pytest.mark.asyncio
async def test_send_welcome_email_falls_back_to_email_handle(mocker):
    send = mocker.patch(
        "app.modules.auth.email_service.email_client.send_email", return_value=True
    )

    service = EmailAuthService()
    await service.send_welcome_email(email="ada@acme.io", full_name=None, org_name="Acme")

    kwargs = send.call_args.kwargs
    assert "ada" in kwargs["body"]
