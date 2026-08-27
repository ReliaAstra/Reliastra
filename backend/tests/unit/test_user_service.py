import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    ResourceNotFoundException,
    ValidationException,
)
from app.modules.users.schemas import UserUpdateRequest
from app.modules.users.service import UserService


@pytest.mark.asyncio
async def test_get_profile_success():
    repo = MagicMock()
    user_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    fake_user = MagicMock(
        id=user_id,
        email="test@reliastra.com",
        full_name="Test User",
        is_active=True,
        is_superuser=False,
        avatar_url=None,
        auth_provider=None,
        created_at=now,
        updated_at=now,
    )
    repo.get_by_id = AsyncMock(return_value=fake_user)

    service = UserService(repository=repo)
    session = AsyncMock()
    result = await service.get_profile(session, user_id)

    assert result.id == user_id
    assert result.email == "test@reliastra.com"


@pytest.mark.asyncio
async def test_get_profile_not_found():
    repo = MagicMock()
    repo.get_by_id = AsyncMock(return_value=None)

    service = UserService(repository=repo)
    session = AsyncMock()

    with pytest.raises(ResourceNotFoundException):
        await service.get_profile(session, uuid.uuid4())


@pytest.mark.asyncio
async def test_update_profile_success():
    repo = MagicMock()
    user_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    fake_user = MagicMock(
        id=user_id,
        email="test@reliastra.com",
        full_name="Old Name",
        # Changing an email is a credential change, so the account must have
        # a password to re-prove.
        password_hash="$2b$12$existinghash",
        is_active=True,
        is_superuser=False,
        avatar_url=None,
        auth_provider=None,
        created_at=now,
        updated_at=now,
    )
    repo.get_by_id = AsyncMock(return_value=fake_user)
    repo.get_by_email = AsyncMock(return_value=None)
    updated_user = MagicMock(
        id=user_id,
        email="newemail@reliastra.com",
        full_name="New Name",
        is_active=True,
        avatar_url=None,
        auth_provider=None,
        is_superuser=False,
        created_at=now,
        updated_at=now,
    )
    repo.update = AsyncMock(return_value=updated_user)

    service = UserService(repository=repo)
    session = AsyncMock()
    req = UserUpdateRequest(
        full_name="New Name",
        email="newemail@reliastra.com",
        # Email changes now require re-proving the current password.
        current_password="CorrectHorse1",
    )
    with patch(
        "app.modules.users.service.verify_password", return_value=True
    ):
        result = await service.update_profile(session, user_id, req)

    assert result.full_name == "New Name"
    assert result.email == "newemail@reliastra.com"


# ── Regression: credential changes require the current password ───────────
#
# A stolen access token must not be enough to take over an account, so
# changing a password or email re-proves knowledge of the current password.


def _profile_fixtures():
    repo = MagicMock()
    user_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    fake_user = MagicMock(
        id=user_id,
        email="victim@reliastra.com",
        full_name="Victim",
        password_hash="$2b$12$existinghash",
        is_active=True,
        is_superuser=False,
        avatar_url=None,
        auth_provider=None,
        created_at=now,
        updated_at=now,
    )
    repo.get_by_id = AsyncMock(return_value=fake_user)
    repo.get_by_email = AsyncMock(return_value=None)
    return repo, user_id


@pytest.mark.asyncio
async def test_email_change_without_current_password_is_rejected():
    repo, user_id = _profile_fixtures()
    service = UserService(repository=repo)
    req = UserUpdateRequest(email="attacker@evil.com")

    with pytest.raises(ValidationException):
        await service.update_profile(AsyncMock(), user_id, req)


@pytest.mark.asyncio
async def test_email_change_with_wrong_password_is_forbidden():
    repo, user_id = _profile_fixtures()
    service = UserService(repository=repo)
    req = UserUpdateRequest(
        email="attacker@evil.com", current_password="WrongGuess1"
    )

    with patch(
        "app.modules.users.service.verify_password", return_value=False
    ), pytest.raises(ForbiddenException):
        await service.update_profile(AsyncMock(), user_id, req)


@pytest.mark.asyncio
async def test_non_credential_update_needs_no_password():
    """Renaming yourself must not be blocked by the credential guard."""
    repo, user_id = _profile_fixtures()
    repo.update = AsyncMock(
        return_value=MagicMock(
            id=user_id,
            email="victim@reliastra.com",
            full_name="New Name",
            is_active=True,
            is_superuser=False,
            avatar_url=None,
            auth_provider=None,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
    )
    service = UserService(repository=repo)
    result = await service.update_profile(
        AsyncMock(), user_id, UserUpdateRequest(full_name="New Name")
    )
    assert result.full_name == "New Name"
