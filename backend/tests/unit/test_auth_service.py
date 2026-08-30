import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
import pytest
from app.core.exceptions import ConflictException, UnauthorizedException
from app.modules.auth.schemas import LoginRequest, RegisterRequest
from app.modules.auth.service import AuthService


@pytest.mark.asyncio
async def test_register_success(mocker):
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

    fake_org = MagicMock(id=uuid.uuid4(), slug="my-org", plan="free")
    fake_org.name = "My Org"
    org_repo.get_by_slug = AsyncMock(return_value=None)
    org_repo.create = AsyncMock(return_value=fake_org)
    org_repo.add_member = AsyncMock()
    mocker.patch(
        "app.modules.agencies.repository.AgencyRepository.create_application",
        new=AsyncMock(),
    )

    auth_repo.create_refresh_token = AsyncMock()

    service = AuthService(
        auth_repository=auth_repo,
        user_repository=user_repo,
        org_repository=org_repo,
    )

    req = RegisterRequest(
        email="new@reliastra.com", password="Password123!", full_name="New User"
    )
    session = AsyncMock()
    result = await service.register(session, req)

    # HARD GATE: registration creates the account but issues no session.
    # Tokens only exist after the emailed OTP is verified.
    assert result.tokens is None
    assert result.verification_required is True
    assert result.user.is_email_verified is False
    auth_repo.create_refresh_token.assert_not_called()
    assert result.organization.id == fake_org.id
    assert result.user.email == "new@reliastra.com"
    user_repo.create.assert_called_once()
    org_repo.create.assert_called_once()


@pytest.mark.asyncio
async def test_register_conflict(mocker):
    auth_repo = MagicMock()
    user_repo = MagicMock()
    org_repo = MagicMock()

    user_repo.get_by_email = AsyncMock(
        return_value=MagicMock(id=uuid.uuid4())
    )

    service = AuthService(
        auth_repository=auth_repo,
        user_repository=user_repo,
        org_repository=org_repo,
    )

    req = RegisterRequest(
        email="existing@reliastra.com",
        password="Password123!",
        full_name="New User",
    )
    session = AsyncMock()

    with pytest.raises(ConflictException):
        await service.register(session, req)


@pytest.mark.asyncio
async def test_login_success(mocker):
    auth_repo = MagicMock()
    user_repo = MagicMock()
    org_repo = MagicMock()

    from app.core.security import get_password_hash
    pwd_hash = get_password_hash("Password123!")

    fake_user = MagicMock(
        id=uuid.uuid4(), email="user@reliastra.com", password_hash=pwd_hash, is_active=True
    )
    user_repo.get_by_email = AsyncMock(return_value=fake_user)
    auth_repo.create_refresh_token = AsyncMock()

    service = AuthService(
        auth_repository=auth_repo,
        user_repository=user_repo,
        org_repository=org_repo,
    )

    req = LoginRequest(email="user@reliastra.com", password="Password123!")
    session = AsyncMock()
    result = await service.login(session, req)

    assert result.access_token is not None
    assert result.refresh_token is not None


@pytest.mark.asyncio
async def test_login_invalid_password(mocker):
    auth_repo = MagicMock()
    user_repo = MagicMock()
    org_repo = MagicMock()

    from app.core.security import get_password_hash
    pwd_hash = get_password_hash("CorrectPassword!")

    fake_user = MagicMock(
        id=uuid.uuid4(), email="user@reliastra.com", password_hash=pwd_hash, is_active=True
    )
    user_repo.get_by_email = AsyncMock(return_value=fake_user)

    service = AuthService(
        auth_repository=auth_repo,
        user_repository=user_repo,
        org_repository=org_repo,
    )

    req = LoginRequest(email="user@reliastra.com", password="WrongPassword!")
    session = AsyncMock()

    with pytest.raises(UnauthorizedException):
        await service.login(session, req)


@pytest.mark.asyncio
async def test_refresh_success(mocker):
    auth_repo = MagicMock()
    user_repo = MagicMock()
    org_repo = MagicMock()

    from app.core.security import create_refresh_token
    user_id = uuid.uuid4()
    rt_str = create_refresh_token(str(user_id))

    family = uuid.uuid4()
    auth_repo.get_refresh_token = AsyncMock(
        return_value=MagicMock(
            is_revoked=False, token_family=family, token_sequence=1
        )
    )
    auth_repo.get_latest_sequence = AsyncMock(return_value=1)
    auth_repo.create_refresh_token = AsyncMock()
    auth_repo.revoke_refresh_token = AsyncMock()
    user_repo.get_by_id = AsyncMock(return_value=MagicMock(id=user_id, is_active=True))

    service = AuthService(
        auth_repository=auth_repo,
        user_repository=user_repo,
        org_repository=org_repo,
    )
    session = AsyncMock()
    result = await service.refresh(session, rt_str)

    assert result.access_token is not None
    # FIX 28: the rotated token belongs to the same family with sequence + 1.
    args, kwargs = auth_repo.create_refresh_token.call_args
    assert kwargs["token_family"] == family
    assert kwargs["token_sequence"] == 2


@pytest.mark.asyncio
async def test_refresh_rejects_replayed_sequence(mocker):
    """A replay OUTSIDE the grace window (stale latest rotation) is theft."""
    auth_repo = MagicMock()
    user_repo = MagicMock()
    org_repo = MagicMock()

    from app.core.security import create_refresh_token
    user_id = uuid.uuid4()
    rt_str = create_refresh_token(str(user_id))

    family = uuid.uuid4()
    auth_repo.get_refresh_token = AsyncMock(
        return_value=MagicMock(
            is_revoked=False, token_family=family, token_sequence=1
        )
    )
    # The family has already advanced to sequence 2 → replay of sequence 1.
    auth_repo.get_latest_sequence = AsyncMock(return_value=2)
    # The latest rotation is older than the grace window, so this is a
    # genuine replay and must revoke the family.
    auth_repo.get_latest_refresh_token = AsyncMock(
        return_value=MagicMock(
            created_at=datetime.now(timezone.utc) - timedelta(minutes=5)
        )
    )
    auth_repo.revoke_family = AsyncMock()
    user_repo.get_by_id = AsyncMock(return_value=MagicMock(id=user_id, is_active=True))

    service = AuthService(
        auth_repository=auth_repo,
        user_repository=user_repo,
        org_repository=org_repo,
    )
    session = AsyncMock()
    session.commit = AsyncMock()

    with pytest.raises(UnauthorizedException):
        await service.refresh(session, rt_str)
    auth_repo.revoke_family.assert_awaited_once_with(session, family)
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_refresh_reuse_within_grace_does_not_revoke(mocker):
    """A replay INSIDE the grace window rotates without family revocation."""
    auth_repo = MagicMock()
    user_repo = MagicMock()
    org_repo = MagicMock()

    from app.core.security import create_refresh_token
    user_id = uuid.uuid4()
    rt_str = create_refresh_token(str(user_id))

    family = uuid.uuid4()
    auth_repo.get_refresh_token = AsyncMock(
        return_value=MagicMock(
            is_revoked=False, token_family=family, token_sequence=1
        )
    )
    auth_repo.get_latest_sequence = AsyncMock(return_value=2)
    # Rotation happened moments ago → benign parallel refresh.
    auth_repo.get_latest_refresh_token = AsyncMock(
        return_value=MagicMock(
            created_at=datetime.now(timezone.utc),
            token_sequence=2,
        )
    )
    auth_repo.revoke_family = AsyncMock()
    auth_repo.create_refresh_token = AsyncMock()
    auth_repo.revoke_refresh_token = AsyncMock()
    user_repo.get_by_id = AsyncMock(
        return_value=MagicMock(
            id=user_id, is_active=True, is_email_verified=True
        )
    )

    service = AuthService(
        auth_repository=auth_repo,
        user_repository=user_repo,
        org_repository=org_repo,
    )
    session = AsyncMock()
    session.commit = AsyncMock()

    result = await service.refresh(session, rt_str)
    assert result.access_token is not None
    auth_repo.revoke_family.assert_not_awaited()
    # sequence = max(1, 2) + 1 = 3 — no parallel sequence is minted.
    args, kwargs = auth_repo.create_refresh_token.call_args
    assert kwargs["token_sequence"] == 3


@pytest.mark.asyncio
async def test_logout_success(mocker):
    auth_repo = MagicMock()
    auth_repo.revoke_refresh_token = AsyncMock(return_value=True)

    service = AuthService(auth_repository=auth_repo)
    session = AsyncMock()
    await service.logout(session, "fake_token")

    auth_repo.revoke_refresh_token.assert_called_once_with(session, "fake_token")
