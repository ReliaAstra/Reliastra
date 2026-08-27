"""Signup email verification via one-time passcode (OTP).

Hard gate: an account created through ``POST /v1/auth/register`` receives no
tokens. The caller must prove control of the email address by submitting the
6-digit code sent to it. Only then are access/refresh tokens issued, and only
then will ``POST /v1/auth/login`` succeed.

Security properties:

* Codes are generated with :mod:`secrets` (CSPRNG), never :mod:`random`.
* Only an HMAC of the code — salted by user id and ``SECRET_KEY`` — is stored.
* Comparison is constant time (:func:`hmac.compare_digest`).
* At most one live code per user; issuing a new one burns the previous.
* ``OTP_MAX_ATTEMPTS`` wrong guesses burn the code (bounds online brute force
  of the 10^6 keyspace to ~5 tries per emailed code).
* Resends are throttled per account by ``OTP_RESEND_COOLDOWN_SECONDS``, on top
  of the per-IP limiter applied at the router.
* Responses to unauthenticated callers are uniform, so the endpoints cannot be
  used to enumerate which addresses are registered.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    RateLimitExceededException,
    ValidationException,
)
from app.infrastructure.email import email_client
from app.modules.auth.constants import (
    OTP_EXPIRE_MINUTES,
    OTP_LENGTH,
    OTP_MAX_ATTEMPTS,
    OTP_RESEND_COOLDOWN_SECONDS,
)
from app.modules.auth.repository import AuthRepository
from app.modules.users.repository import UserRepository

if TYPE_CHECKING:  # pragma: no cover - import cycle guard
    from app.modules.users.models import User

logger = logging.getLogger(__name__)


def generate_otp_code(length: int = OTP_LENGTH) -> str:
    """Return a cryptographically random numeric code of *length* digits.

    Leading zeros are preserved, so the full 10^length keyspace is used.
    """
    return "".join(secrets.choice("0123456789") for _ in range(length))


def _render_otp_email(user_name: str, code: str) -> tuple[str, str]:
    """Returns (plain_text, html_body) for the verification code email."""
    spaced = " ".join(code)
    plain = f"""
Hello {user_name},

Your Reliastra verification code is:

    {code}

Enter it on the verification screen to activate your account. The code
expires in {OTP_EXPIRE_MINUTES} minutes.

If you did not create a Reliastra account, you can safely ignore this email —
no account can be used until this code is entered.

Best regards,
The Reliastra Team
    """.strip()

    html = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }}
    .container {{ max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }}
    .header {{ background: #1a1a2e; color: white; padding: 24px; text-align: center; }}
    .header h1 {{ margin: 0; font-size: 22px; }}
    .body {{ padding: 32px; }}
    .body p {{ color: #333; line-height: 1.6; margin: 0 0 16px; }}
    .code {{ display: inline-block; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 32px; font-weight: 700; letter-spacing: 10px; color: #1a1a2e; background: #f1f3f9; border-radius: 10px; padding: 16px 24px; margin: 8px 0 16px; }}
    .footer {{ padding: 20px 32px; background: #f9f9f9; text-align: center; font-size: 13px; color: #888; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Verify your email</h1>
    </div>
    <div class="body">
      <p>Hello <strong>{user_name}</strong>,</p>
      <p>Use this code to finish creating your Reliastra account:</p>
      <p style="text-align: center;">
        <span class="code">{spaced}</span>
      </p>
      <p style="font-size: 13px; color: #888;">
        This code expires in {OTP_EXPIRE_MINUTES} minutes and can only be used once.
        If you did not create an account, you can safely ignore this email.
      </p>
    </div>
    <div class="footer">
      <p>Reliastra — External Dependency Intelligence</p>
    </div>
  </div>
</body>
</html>
    """.strip()

    return plain, html


class EmailOTPService:
    """Issues and validates signup verification codes."""

    def __init__(
        self,
        user_repository: UserRepository = UserRepository(),
        auth_repository: AuthRepository = AuthRepository(),
    ) -> None:
        self.user_repository = user_repository
        self.auth_repository = auth_repository

    # ── Issuing ──────────────────────────────────────────────────────

    async def issue_code(
        self,
        session: AsyncSession,
        user: "User",
        *,
        enforce_cooldown: bool = True,
    ) -> None:
        """Generate, persist and email a fresh code for *user*.

        Raises :class:`RateLimitExceededException` when called again inside
        the cooldown window and *enforce_cooldown* is set.
        """
        if enforce_cooldown:
            last = await self.auth_repository.get_last_email_verification_code(
                session, user.id
            )
            if last is not None:
                created = last.created_at
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                elapsed = (datetime.now(timezone.utc) - created).total_seconds()
                if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
                    wait = int(OTP_RESEND_COOLDOWN_SECONDS - elapsed) or 1
                    raise RateLimitExceededException(
                        f"A code was just sent. Please wait {wait}s before "
                        "requesting another.",
                        details={"retry_after_seconds": str(wait)},
                    )

        # One live code per user.
        await self.auth_repository.revoke_all_email_verification_codes(
            session, user.id
        )

        code = generate_otp_code()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)
        await self.auth_repository.create_email_verification_code(
            session, user.id, code, expires_at
        )

        plain, html = _render_otp_email(user.full_name, code)
        # ``send_email`` is blocking SMTP; never run it on the event loop.
        try:
            await asyncio.to_thread(
                email_client.send_email,
                to_email=user.email,
                subject=f"{code} is your Reliastra verification code",
                body=plain,
                html_body=html,
            )
        except Exception:
            # The code is already persisted. A transient SMTP failure must not
            # roll back registration — the user can hit "Resend code".
            logger.exception("Failed to send verification code to user %s", user.id)

        logger.info("Issued email verification code for user %s", user.id)

    async def send_code_for_email(
        self, session: AsyncSession, email: str
    ) -> dict[str, Any]:
        """Resend endpoint body: uniform response, never leaks account state."""
        user = await self.user_repository.get_by_email(session, email)
        if user is None or user.is_email_verified or not user.is_active:
            logger.info(
                "Verification code requested for unknown/verified/disabled "
                "address (no action taken)"
            )
            return self.neutral_response()

        await self.issue_code(session, user)
        return self.neutral_response()

    @staticmethod
    def neutral_response() -> dict[str, Any]:
        return {
            "message": (
                "If that account exists and still needs verification, a "
                "6-digit code is on its way. Check your inbox."
            ),
            "expires_in_minutes": OTP_EXPIRE_MINUTES,
        }

    # ── Verifying ────────────────────────────────────────────────────

    @staticmethod
    async def _persist(session: AsyncSession) -> None:
        """Commit attempt/burn bookkeeping before raising.

        ``get_db`` rolls the request transaction back on any exception, so a
        failed verification would otherwise un-count its own attempt and the
        brute-force budget would never decrease. These writes are the only
        pending changes on this code path, so committing them here is safe.
        """
        await session.commit()

    async def verify_code(
        self, session: AsyncSession, email: str, code: str
    ) -> "User":
        """Validate *code* for *email* and mark the address verified.

        Returns the verified :class:`User`. Raises
        :class:`ValidationException` on every failure path, with a
        machine-readable ``code`` in the details.
        """
        invalid = ValidationException(
            "That code is not valid. Request a new one and try again.",
            details={"code": "INVALID_CODE"},
        )

        user = await self.user_repository.get_by_email(session, email)
        if user is None or not user.is_active:
            # Uniform failure: do not reveal whether the address is registered.
            raise invalid

        if user.is_email_verified:
            # NOT a success path. The router mints a session from whatever
            # this returns, so short-circuiting here would let anyone POST
            # {email, "000000"} for any already-verified account and be
            # handed tokens — a full authentication bypass. Registration
            # already discloses "address is taken" via 409, so naming the
            # state here leaks nothing new.
            raise ValidationException(
                "This email is already verified. Please sign in instead.",
                details={"code": "ALREADY_VERIFIED"},
            )

        record = await self.auth_repository.get_active_email_verification_code(
            session, user.id
        )
        if record is None:
            raise ValidationException(
                "No verification code is outstanding. Request a new one.",
                details={"code": "NO_ACTIVE_CODE"},
            )

        expires_at = record.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            await self.auth_repository.mark_email_verification_code_used(
                session, record
            )
            await self._persist(session)
            raise ValidationException(
                "That code has expired. Request a new one.",
                details={"code": "CODE_EXPIRED"},
            )

        if record.attempts >= OTP_MAX_ATTEMPTS:
            await self.auth_repository.mark_email_verification_code_used(
                session, record
            )
            await self._persist(session)
            raise ValidationException(
                "Too many incorrect attempts. Request a new code.",
                details={"code": "TOO_MANY_ATTEMPTS"},
            )

        if not self.auth_repository.verify_code_hash(record, user.id, code):
            await self.auth_repository.record_email_verification_attempt(
                session, record
            )
            remaining = max(OTP_MAX_ATTEMPTS - record.attempts, 0)
            if remaining == 0:
                await self.auth_repository.mark_email_verification_code_used(
                    session, record
                )
                await self._persist(session)
                raise ValidationException(
                    "Too many incorrect attempts. Request a new code.",
                    details={"code": "TOO_MANY_ATTEMPTS"},
                )
            await self._persist(session)
            raise ValidationException(
                f"Incorrect code. {remaining} attempt(s) remaining.",
                details={
                    "code": "INVALID_CODE",
                    "attempts_remaining": str(remaining),
                },
            )

        await self.auth_repository.mark_email_verification_code_used(session, record)
        # Any outstanding magic-link tokens are redundant once verified.
        await self.auth_repository.revoke_all_email_verification_tokens(
            session, user.id
        )
        await self.user_repository.update(session, user, is_email_verified=True)
        logger.info("Email verified via OTP for user %s", user.id)
        return user


email_otp_service = EmailOTPService()
