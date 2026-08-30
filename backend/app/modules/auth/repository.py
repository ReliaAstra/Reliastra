import hashlib
import hmac
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.auth.models import (
    EmailVerificationCode,
    EmailVerificationToken,
    PasswordResetToken,
    RefreshToken,
)


class AuthRepository:
    @staticmethod
    def _hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    # ── Refresh Token Methods ──────────────────────────────────────

    @staticmethod
    async def create_refresh_token(
        session: AsyncSession,
        user_id: uuid.UUID,
        token_str: str,
        expires_at: datetime,
        token_family: uuid.UUID | None = None,
        token_sequence: int = 1,
    ) -> RefreshToken:
        token_hash = AuthRepository._hash_token(token_str)
        rt = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            token_family=token_family or uuid.uuid4(),
            token_sequence=token_sequence,
            expires_at=expires_at,
            is_revoked=False,
        )
        session.add(rt)
        await session.flush()
        return rt

    @staticmethod
    async def get_refresh_token(
        session: AsyncSession, token_str: str
    ) -> RefreshToken | None:
        token_hash = AuthRepository._hash_token(token_str)
        query = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_latest_sequence(
        session: AsyncSession, token_family: uuid.UUID
    ) -> int:
        query = select(func.max(RefreshToken.token_sequence)).where(
            RefreshToken.token_family == token_family
        )
        result = await session.execute(query)
        return int(result.scalar() or 0)

    @staticmethod
    async def get_latest_refresh_token(
        session: AsyncSession, token_family: uuid.UUID
    ) -> RefreshToken | None:
        """Most recently issued token in a family (highest sequence)."""
        query = (
            select(RefreshToken)
            .where(RefreshToken.token_family == token_family)
            .order_by(RefreshToken.token_sequence.desc())
            .limit(1)
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def revoke_family(session: AsyncSession, token_family: uuid.UUID) -> int:
        """Revoke every token in a family (FIX 28 reuse detection)."""
        query = select(RefreshToken).where(RefreshToken.token_family == token_family)
        result = await session.execute(query)
        count = 0
        for rt in result.scalars():
            rt.is_revoked = True
            session.add(rt)
            count += 1
        await session.flush()
        return count

    @staticmethod
    async def revoke_refresh_token(session: AsyncSession, token_str: str) -> bool:
        rt = await AuthRepository.get_refresh_token(session, token_str)
        if rt:
            rt.is_revoked = True
            session.add(rt)
            await session.flush()
            return True
        return False

    @staticmethod
    async def revoke_all_for_user(session: AsyncSession, user_id: uuid.UUID) -> int:
        """Revoke every active refresh token for *user_id*.

        Called on password reset / password change so that stolen sessions
        (refresh tokens copied before the credential change) are killed
        instead of surviving until natural expiry.
        """
        query = select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            RefreshToken.is_revoked == False,  # noqa: E712
        )
        result = await session.execute(query)
        count = 0
        for rt in result.scalars():
            rt.is_revoked = True
            session.add(rt)
            count += 1
        await session.flush()
        return count

    # ── Email Verification Token Methods ────────────────────────────

    @staticmethod
    async def create_email_verification_token(
        session: AsyncSession,
        user_id: uuid.UUID,
        token_str: str,
        expires_at: datetime,
    ) -> EmailVerificationToken:
        token_hash = AuthRepository._hash_token(token_str)
        evt = EmailVerificationToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            is_used=False,
        )
        session.add(evt)
        await session.flush()
        return evt

    @staticmethod
    async def get_email_verification_token(
        session: AsyncSession, token_str: str
    ) -> EmailVerificationToken | None:
        token_hash = AuthRepository._hash_token(token_str)
        query = select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == token_hash
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def mark_email_verification_used(
        session: AsyncSession, token_str: str
    ) -> bool:
        evt = await AuthRepository.get_email_verification_token(session, token_str)
        if evt:
            evt.is_used = True
            session.add(evt)
            await session.flush()
            return True
        return False

    @staticmethod
    async def revoke_all_email_verification_tokens(
        session: AsyncSession, user_id: uuid.UUID
    ) -> None:
        """Mark all unused email verification tokens for a user as used."""
        query = select(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user_id,
            EmailVerificationToken.is_used == False,  # noqa: E712
        )
        result = await session.execute(query)
        for token in result.scalars():
            token.is_used = True
            session.add(token)
        await session.flush()

    # ── Email Verification OTP Methods ──────────────────────────────

    @staticmethod
    def _hash_code(user_id: uuid.UUID, code: str) -> str:
        """HMAC a verification code, salted by user id and SECRET_KEY.

        Salting by user id means an attacker who obtains the table cannot
        build one rainbow table for all 10^6 codes and match it against
        every row at once.
        """
        return hmac.new(
            settings.SECRET_KEY.encode("utf-8"),
            f"{user_id}:{code}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    @staticmethod
    async def create_email_verification_code(
        session: AsyncSession,
        user_id: uuid.UUID,
        code: str,
        expires_at: datetime,
    ) -> EmailVerificationCode:
        evc = EmailVerificationCode(
            user_id=user_id,
            code_hash=AuthRepository._hash_code(user_id, code),
            expires_at=expires_at,
            attempts=0,
            is_used=False,
        )
        session.add(evc)
        await session.flush()
        return evc

    @staticmethod
    async def get_active_email_verification_code(
        session: AsyncSession, user_id: uuid.UUID
    ) -> EmailVerificationCode | None:
        """Most recent unused code for a user, regardless of expiry.

        Expiry is checked by the caller so it can return a distinct
        "code expired" message instead of a generic "invalid code".
        """
        query = (
            select(EmailVerificationCode)
            .where(
                EmailVerificationCode.user_id == user_id,
                EmailVerificationCode.is_used == False,  # noqa: E712
            )
            .order_by(EmailVerificationCode.created_at.desc())
            .limit(1)
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_last_email_verification_code(
        session: AsyncSession, user_id: uuid.UUID
    ) -> EmailVerificationCode | None:
        """Most recent code of any state — used for the resend cooldown."""
        query = (
            select(EmailVerificationCode)
            .where(EmailVerificationCode.user_id == user_id)
            .order_by(EmailVerificationCode.created_at.desc())
            .limit(1)
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    def verify_code_hash(
        record: EmailVerificationCode, user_id: uuid.UUID, code: str
    ) -> bool:
        """Constant-time comparison of a submitted code against its hash."""
        return hmac.compare_digest(
            record.code_hash, AuthRepository._hash_code(user_id, code)
        )

    @staticmethod
    async def record_email_verification_attempt(
        session: AsyncSession, record: EmailVerificationCode
    ) -> EmailVerificationCode:
        record.attempts += 1
        session.add(record)
        await session.flush()
        return record

    @staticmethod
    async def mark_email_verification_code_used(
        session: AsyncSession, record: EmailVerificationCode
    ) -> None:
        record.is_used = True
        session.add(record)
        await session.flush()

    @staticmethod
    async def revoke_all_email_verification_codes(
        session: AsyncSession, user_id: uuid.UUID
    ) -> None:
        """Burn every outstanding code for a user (issue-one-at-a-time)."""
        query = select(EmailVerificationCode).where(
            EmailVerificationCode.user_id == user_id,
            EmailVerificationCode.is_used == False,  # noqa: E712
        )
        result = await session.execute(query)
        for record in result.scalars():
            record.is_used = True
            session.add(record)
        await session.flush()

    # ── Password Reset Token Methods ─────────────────────────────────
    @staticmethod
    async def create_password_reset_token(
        session: AsyncSession,
        user_id: uuid.UUID,
        token_str: str,
        expires_at: datetime,
    ) -> PasswordResetToken:
        token_hash = AuthRepository._hash_token(token_str)
        prt = PasswordResetToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            is_used=False,
        )
        session.add(prt)
        await session.flush()
        return prt

    @staticmethod
    async def get_password_reset_token(
        session: AsyncSession, token_str: str
    ) -> PasswordResetToken | None:
        token_hash = AuthRepository._hash_token(token_str)
        query = select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def mark_password_reset_used(session: AsyncSession, token_str: str) -> bool:
        prt = await AuthRepository.get_password_reset_token(session, token_str)
        if prt:
            prt.is_used = True
            session.add(prt)
            await session.flush()
            return True
        return False

    @staticmethod
    async def revoke_all_password_reset_tokens(
        session: AsyncSession, user_id: uuid.UUID
    ) -> None:
        """Mark all unused password reset tokens for a user as used."""
        query = select(PasswordResetToken).where(
            PasswordResetToken.user_id == user_id,
            PasswordResetToken.is_used == False,  # noqa: E712
        )
        result = await session.execute(query)
        for token in result.scalars():
            token.is_used = True
            session.add(token)
        await session.flush()
