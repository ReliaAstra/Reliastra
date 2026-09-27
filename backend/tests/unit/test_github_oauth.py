"""GitHub OAuth service tests.

The provider boundary is fully mocked (httpx + repositories + session
issuer): these tests pin the account-resolution rules - link, create,
gate - not GitHub's API. Real HTTP to github.com never happens here.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.config import settings
from app.core.exceptions import (
    ForbiddenException,
    ResourceNotFoundException,
    UnauthorizedException,
)
from app.modules.auth.oauth import GitHubOAuthService
from app.modules.auth.schemas import TokenResponse


def _service(monkeypatch=None, **settings_overrides):
    return GitHubOAuthService(
        user_repository=MagicMock(),
        org_repository=MagicMock(),
    )


def _enable(monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "Ov23testclientid")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "test-secret")
    monkeypatch.setattr(
        settings, "GITHUB_REDIRECT_URI", "https://reliastra.com/auth/github/callback"
    )


def _github_http(monkeypatch, *, user=None, emails=None, token_ok=True):
    """Fake the three provider calls: token swap, /user, /user/emails."""
    user = user if user is not None else {
        "id": 123456,
        "login": "octocat",
        "name": "Octo Cat",
        "avatar_url": "https://avatars.example/u/123456",
    }
    emails = emails if emails is not None else [
        {"email": "octo@example.com", "primary": True, "verified": True}
    ]

    token_response = MagicMock()
    token_response.status_code = 200 if token_ok else 400
    token_response.headers = {"content-type": "application/json"}
    token_response.json = MagicMock(
        return_value={"access_token": "gho_test"} if token_ok else {"error": "bad_code"}
    )
    user_response = MagicMock()
    user_response.status_code = 200
    user_response.json = MagicMock(return_value=user)
    emails_response = MagicMock()
    emails_response.status_code = 200
    emails_response.json = MagicMock(return_value=emails)

    client = MagicMock()
    client.post = AsyncMock(return_value=token_response)
    client.get = AsyncMock(side_effect=[user_response, emails_response])
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)

    factory = MagicMock(return_value=client)
    monkeypatch.setattr("app.modules.auth.oauth.httpx.AsyncClient", factory)
    return client


def _issue_tokens(monkeypatch):
    tokens = TokenResponse(
        access_token="access",
        refresh_token="refresh",
        token_type="bearer",
        expires_in=900,
    )
    issue = AsyncMock(return_value=tokens)
    monkeypatch.setattr("app.modules.auth.service.auth_service", MagicMock(issue_session=issue))
    return issue


def _user(**over):
    base = dict(
        id=uuid.uuid4(),
        email="octo@example.com",
        full_name="Octo Cat",
        is_active=True,
    )
    base.update(over)
    return MagicMock(**base)


@pytest.mark.asyncio
async def test_disabled_provider_is_absent_not_broken(monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_AUTH_ENABLED", False)
    service = GitHubOAuthService(
        user_repository=MagicMock(), org_repository=MagicMock()
    )
    assert service.public_config()["enabled"] is False
    with pytest.raises(ResourceNotFoundException):
        await service.authenticate(AsyncMock(), "any-code")


@pytest.mark.asyncio
async def test_bad_code_is_one_401_for_all_cases(monkeypatch):
    _enable(monkeypatch)
    _github_http(monkeypatch, token_ok=False)
    service = GitHubOAuthService(
        user_repository=MagicMock(), org_repository=MagicMock()
    )
    with pytest.raises(UnauthorizedException, match="expired"):
        await service.authenticate(AsyncMock(), "bad-code")


@pytest.mark.asyncio
async def test_unverified_email_cannot_mint_a_session(monkeypatch):
    _enable(monkeypatch)
    _github_http(
        monkeypatch,
        emails=[{"email": "octo@example.com", "primary": True, "verified": False}],
    )
    service = GitHubOAuthService(
        user_repository=MagicMock(), org_repository=MagicMock()
    )
    with pytest.raises(ForbiddenException, match="no verified email"):
        await service.authenticate(AsyncMock(), "code")


@pytest.mark.asyncio
async def test_existing_github_user_signs_in(monkeypatch):
    _enable(monkeypatch)
    _github_http(monkeypatch)
    issue = _issue_tokens(monkeypatch)
    user_repo = MagicMock()
    user_repo.get_by_github_id = AsyncMock(return_value=_user())
    service = GitHubOAuthService(
        user_repository=user_repo, org_repository=MagicMock()
    )
    result = await service.authenticate(AsyncMock(), "code")
    assert result.is_new_user is False
    assert result.email == "octo@example.com"
    assert result.access_token == "access"
    issue.assert_awaited_once()
    user_repo.create.assert_not_called()


@pytest.mark.asyncio
async def test_existing_email_links_and_keeps_password(monkeypatch):
    _enable(monkeypatch)
    _github_http(monkeypatch)
    _issue_tokens(monkeypatch)
    existing = _user(password_hash="keep-me", auth_provider="email")
    user_repo = MagicMock()
    user_repo.get_by_github_id = AsyncMock(return_value=None)
    user_repo.get_by_email = AsyncMock(return_value=existing)
    user_repo.update = AsyncMock(return_value=existing)
    service = GitHubOAuthService(
        user_repository=user_repo, org_repository=MagicMock()
    )
    result = await service.authenticate(AsyncMock(), "code")
    assert result.is_new_user is False
    user_repo.update.assert_awaited_once()
    _, kwargs = user_repo.update.call_args
    assert kwargs["github_id"] == "123456"
    assert kwargs["is_email_verified"] is True
    # The password hash is untouched: both doors keep working.
    assert "password_hash" not in kwargs


@pytest.mark.asyncio
async def test_new_address_creates_verified_account_and_org(monkeypatch):
    _enable(monkeypatch)
    _github_http(monkeypatch)
    _issue_tokens(monkeypatch)
    monkeypatch.setattr(
        "app.modules.agencies.repository.AgencyRepository.create_application",
        AsyncMock(),
    )
    created = _user()
    user_repo = MagicMock()
    user_repo.get_by_github_id = AsyncMock(return_value=None)
    user_repo.get_by_email = AsyncMock(return_value=None)
    user_repo.create = AsyncMock(return_value=created)
    org_repo = MagicMock()
    org_repo.get_by_slug = AsyncMock(return_value=None)
    fake_org = MagicMock(id=uuid.uuid4(), slug="org-ab12cd34", plan="free")
    fake_org.name = "Octo Org"
    org_repo.create = AsyncMock(return_value=fake_org)
    org_repo.add_member = AsyncMock()
    service = GitHubOAuthService(user_repository=user_repo, org_repository=org_repo)

    result = await service.authenticate(AsyncMock(), "code")

    assert result.is_new_user is True
    _, create_kwargs = user_repo.create.call_args
    assert create_kwargs["is_email_verified"] is True
    assert create_kwargs["github_id"] == "123456"
    assert create_kwargs["auth_provider"] == "github"
    org_repo.create.assert_awaited_once()
    org_repo.add_member.assert_awaited_once()


@pytest.mark.asyncio
async def test_disabled_account_signs_in_nowhere(monkeypatch):
    _enable(monkeypatch)
    _github_http(monkeypatch)
    _issue_tokens(monkeypatch)
    user_repo = MagicMock()
    user_repo.get_by_github_id = AsyncMock(return_value=_user(is_active=False))
    service = GitHubOAuthService(
        user_repository=user_repo, org_repository=MagicMock()
    )
    with pytest.raises(UnauthorizedException, match="disabled"):
        await service.authenticate(AsyncMock(), "code")
