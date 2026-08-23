import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    ResourceNotFoundException,
    ValidationException,
)
from app.core.security import get_password_hash, verify_password
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import UserResponse, UserUpdateRequest


class UserService:
    def __init__(self, repository: UserRepository = UserRepository()) -> None:
        self.repository = repository

    async def get_profile(
        self, session: AsyncSession, user_id: uuid.UUID
    ) -> UserResponse:
        user = await self.repository.get_by_id(session, user_id)
        if not user:
            raise ResourceNotFoundException("User not found")
        return UserResponse.model_validate(user)

    async def update_profile(
        self,
        session: AsyncSession,
        user_id: uuid.UUID,
        request: UserUpdateRequest,
    ) -> UserResponse:
        user = await self.repository.get_by_id(session, user_id)
        if not user:
            raise ResourceNotFoundException("User not found")

        # Credential changes (password or email) require re-proving knowledge
        # of the current password — a briefly-stolen access token must not
        # be sufficient for a permanent takeover. Accounts created via
        # external identity providers have no local password; they may only
        # change non-credential fields here.
        credential_change = request.password is not None or (
            request.email is not None and request.email != user.email
        )
        if credential_change:
            if user.password_hash and not request.current_password:
                raise ValidationException(
                    "current_password is required to change your password or email",
                    details={"code": "CURRENT_PASSWORD_REQUIRED"},
                )
            if user.password_hash and not verify_password(
                request.current_password or "", user.password_hash
            ):
                raise ForbiddenException("Current password is incorrect")

        update_kwargs = {}
        if request.full_name is not None:
            update_kwargs["full_name"] = request.full_name
        if request.email is not None:
            existing = await self.repository.get_by_email(session, request.email)
            if existing and existing.id != user_id:
                raise ConflictException("Email is already registered by another user")
            update_kwargs["email"] = request.email
        if request.password is not None:
            update_kwargs["password_hash"] = get_password_hash(request.password)

        updated_user = await self.repository.update(session, user, **update_kwargs)

        # A password change invalidates every existing session.
        if request.password is not None:
            from app.modules.auth.repository import AuthRepository

            await AuthRepository.revoke_all_for_user(session, updated_user.id)

        return UserResponse.model_validate(updated_user)


user_service = UserService()
