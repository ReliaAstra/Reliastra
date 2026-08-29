import asyncio
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ValidationException,
)
from app.core.security import get_password_hash
from app.infrastructure.email import email_client
from app.infrastructure.email_layout import (
    escape,
    frontend_url,
    render_email,
)
from app.modules.auth.repository import AuthRepository
from app.modules.users.repository import UserRepository

logger = logging.getLogger(__name__)

# Token lifetimes
EMAIL_VERIFICATION_EXPIRE_MINUTES = 60
PASSWORD_RESET_EXPIRE_MINUTES = 15


class EmailAuthService:
    """Handles email verification and password reset flows."""

    def __init__(
        self,
        user_repository: UserRepository = UserRepository(),
        auth_repository: AuthRepository = AuthRepository(),
    ) -> None:
        self.user_repository = user_repository
        self.auth_repository = auth_repository

    def _build_verification_url(self, token: str) -> str:
        """Build the frontend verification URL."""
        return f"{frontend_url('/verify-email')}?token={token}"

    def _build_reset_url(self, token: str) -> str:
        """Build the frontend password reset URL."""
        return f"{frontend_url('/reset-password')}?token={token}"

    def _render_verification_email(
        self, user_name: str, verification_url: str
    ) -> tuple[str, str]:
        """Returns (plain_text, html_body) for verification email."""
        name = escape(user_name)
        expiry = (
            f"This link expires in {EMAIL_VERIFICATION_EXPIRE_MINUTES} minutes. "
            "If you did not create an account, you can safely ignore this email."
        )
        body_text = f"""
Hello {user_name},

Thank you for signing up with Reliastra. Please verify your email address by clicking the link below:

{verification_url}

This link expires in {EMAIL_VERIFICATION_EXPIRE_MINUTES} minutes.

If you did not create an account, please ignore this email.

Best regards,
The Reliastra Team
        """.strip()
        body_html = (
            f"<p>Hello <strong>{name}</strong>,</p>"
            "<p>Thank you for signing up. Please verify your email address to get started:</p>"
            f'<p style="text-align: center;"><a href="{verification_url}" class="button">Verify Email Address</a></p>'
            f'<p class="note">{expiry}</p>'
        )
        return render_email(
            heading="Verify your email",
            body_html=body_html,
            body_text=body_text,
            preheader="Verify your Reliastra email address",
        )

    def _render_reset_email(self, user_name: str, reset_url: str) -> tuple[str, str]:
        """Returns (plain_text, html_body) for password reset email."""
        name = escape(user_name)
        # Security-critical instruction stays in the body — deliberately above
        # and outside the shared support footer.
        security_html = (
            f'<p class="note">This link expires in {PASSWORD_RESET_EXPIRE_MINUTES} '
            "minutes. If you did not request a password reset, you can safely ignore "
            "this email — your password will not change. Reliastra support will never "
            "ask you for your password.</p>"
        )
        security_text = (
            f"This link expires in {PASSWORD_RESET_EXPIRE_MINUTES} minutes.\n\n"
            "If you did not request a password reset, please ignore this email — your "
            "password will remain unchanged. Reliastra support will never ask you for "
            "your password."
        )
        body_text = f"""
Hello {user_name},

We received a request to reset your Reliastra password. Click the link below to set a new password:

{reset_url}

{security_text}

Best regards,
The Reliastra Team
        """.strip()
        body_html = (
            f"<p>Hello <strong>{name}</strong>,</p>"
            "<p>We received a request to reset your password. Click the button below to choose a new one:</p>"
            f'<p style="text-align: center;"><a href="{reset_url}" class="button" style="background:#e63946;">Reset Password</a></p>'
            + security_html
        )
        return render_email(
            heading="Reset your password",
            body_html=body_html,
            body_text=body_text,
            preheader="Password reset requested for your Reliastra account",
        )


    # ── Welcome Email ───────────────────────────────────────────────

    @staticmethod
    async def _first_org_name(session: AsyncSession, user_id) -> str | None:
        """Name of the user's first (ownership) workspace, for the greeting."""
        try:
            from app.modules.organizations.repository import OrganizationRepository

            orgs = await OrganizationRepository.list_for_user(session, user_id)
            return orgs[0].name if orgs else None
        except Exception:
            logger.debug("welcome email: org lookup failed", exc_info=True)
            return None

    def _render_welcome_email(
        self, user_name: str, org_name: str | None, dashboard_url: str
    ) -> tuple[str, str]:
        """Returns (plain_text, html_body) for the post-signup welcome email."""
        if org_name:
            workspace_line = f'Your workspace "{org_name}" has been created on the free plan.'
            workspace_html = (
                f"Your workspace <strong>{escape(org_name)}</strong> has been created "
                "on the free plan."
            )
        else:
            workspace_line = "Your workspace has been created on the free plan."
            workspace_html = "Your workspace has been created on the free plan."
        body_text = f"""
Hello {user_name},

Welcome to Reliastra — your account is ready.

{workspace_line} Reliastra watches the third-party APIs and vendors your product depends on, correlates outages with your incidents, and generates verifiable SLA evidence.

Get started in two minutes:
1. Open your dashboard: {dashboard_url}
2. Add your first dependency (Stripe, AWS, OpenAI, ...).
3. Reliastra starts monitoring and attributing blame automatically.

If you did not create this account, please ignore this email.

Best regards,
The Reliastra Team
        """.strip()
        body_html = (
            f"<p>Hello <strong>{escape(user_name)}</strong>,</p>"
            f"<p>Your account is ready. {workspace_html}</p>"
            "<p>Reliastra watches the third-party APIs and vendors your product depends on, correlates outages with your incidents, and generates verifiable SLA evidence.</p>"
            "<div class=\"panel\"><strong>Get started in two minutes:</strong>"
            "<ol style=\"margin: 8px 0 0; padding-left: 18px;\">"
            "<li>Open your dashboard</li>"
            "<li>Add your first dependency (Stripe, AWS, OpenAI, ...)</li>"
            "<li>We start monitoring and attributing blame automatically</li>"
            "</ol></div>"
            f'<p style="text-align: center;"><a href="{dashboard_url}" class="button">Open your dashboard</a></p>'
            '<p class="note">If you did not create this account, you can safely ignore this email.</p>'
        )
        return render_email(
            heading="Welcome to Reliastra",
            body_html=body_html,
            body_text=body_text,
            preheader="Your workspace is ready",
        )


    async def send_welcome_email(
        self, email: str, full_name: str | None, org_name: str | None = None
    ) -> bool:
        """Send the post-signup welcome email. Returns True if delivered.

        Never raises: SMTP failures are logged and reported as False so the
        caller (registration / verification) is never blocked by email delivery.
        """
        display_name = (full_name or "").strip() or email.split("@")[0]
        dashboard_url = frontend_url("/dashboard")
        plain, html = self._render_welcome_email(display_name, org_name, dashboard_url)
        try:
            # EmailClient.send_email is sync SMTP — run it off the event loop
            # exactly as its docstring instructs.
            sent = await asyncio.to_thread(
                email_client.send_email,
                to_email=email,
                subject="Welcome to Reliastra — your workspace is ready",
                body=plain,
                html_body=html,
            )
        except Exception:
            logger.warning("Welcome email to %s failed to send", email, exc_info=True)
            return False
        if not sent:
            logger.warning("Welcome email to %s was not delivered (SMTP error)", email)
        else:
            logger.info("Welcome email sent to %s", email)
        return bool(sent)

    # ── Email Verification ──────────────────────────────────────────

    async def send_verification_email(
        self, session: AsyncSession, email: str
    ) -> dict[str, Any]:
        """Generate a verification token and send the email.

        The response is deliberately uniform for unknown addresses, already
        verified addresses and real sends — this is an unauthenticated
        endpoint and must not leak which emails are registered or verified.
        """
        user = await self.user_repository.get_by_email(session, email)
        if not user:
            logger.info("Verification requested for unknown email (no action taken)")
            return self._neutral_verification_response()

        if user.is_email_verified:
            logger.info(
                "Verification requested for already-verified email (no action taken)"
            )
            return self._neutral_verification_response()

        # Invalidate any existing verification tokens
        await self.auth_repository.revoke_all_email_verification_tokens(
            session, user.id
        )

        # Generate new token
        token = secrets.token_urlsafe(48)
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=EMAIL_VERIFICATION_EXPIRE_MINUTES
        )
        await self.auth_repository.create_email_verification_token(
            session, user.id, token, expires_at
        )

        # Send email — blocking SMTP must never run on the event loop.
        verification_url = self._build_verification_url(token)
        plain, html = self._render_verification_email(user.full_name, verification_url)
        await asyncio.to_thread(
            email_client.send_email,
            to_email=email,
            subject="Verify your Reliastra email",
            body=plain,
            html_body=html,
        )

        logger.info("Verification email sent to %s", email)

        return self._neutral_verification_response()

    @staticmethod
    def _neutral_verification_response() -> dict[str, Any]:
        """Identical response for all send-verification outcomes."""
        return {
            "message": "If that email address needs verification, a "
            "verification email has been sent. Check your inbox.",
        }

    async def verify_email(self, session: AsyncSession, token: str) -> dict[str, Any]:
        """Verify a user's email using the token."""
        stored = await self.auth_repository.get_email_verification_token(session, token)

        if not stored:
            raise ValidationException(
                "Invalid verification token",
                details={"code": "INVALID_TOKEN"},
            )

        if stored.is_used:
            raise ValidationException(
                "This verification link has already been used",
                details={"code": "TOKEN_ALREADY_USED"},
            )

        if stored.expires_at < datetime.now(timezone.utc):
            raise ValidationException(
                "Verification link has expired. Please request a new one.",
                details={"code": "TOKEN_EXPIRED"},
            )

        # Mark token as used
        await self.auth_repository.mark_email_verification_used(session, token)

        # Mark user's email as verified
        user = await self.user_repository.get_by_id(session, stored.user_id)
        if user:
            was_unverified = not user.is_email_verified
            await self.user_repository.update(session, user, is_email_verified=True)
            logger.info("Email verified for user %s", user.id)
            if was_unverified:
                # Magic-link verification is an alternate completion of the
                # same signup — welcome exactly once, only on the transition.
                # Failure-isolated: email must never fail verification.
                try:
                    org_name = await self._first_org_name(session, user.id)
                    await self.send_welcome_email(
                        email=user.email,
                        full_name=user.full_name,
                        org_name=org_name,
                    )
                except Exception:
                    logger.exception(
                        "Welcome email failed after link verification for user %s",
                        user.id,
                    )

        return {
            "message": "Email verified successfully.",
            "is_email_verified": True,
        }

    # ── Password Reset ─────────────────────────────────────────────

    async def send_password_reset_email(
        self, session: AsyncSession, email: str
    ) -> dict[str, Any]:
        """Generate a password reset token and send the email."""
        user = await self.user_repository.get_by_email(session, email)

        # Always return the same message to prevent email enumeration
        if not user:
            return {
                "message": "If an account with this email exists, a password reset link has been sent.",
            }

        # Invalidate any existing reset tokens
        await self.auth_repository.revoke_all_password_reset_tokens(session, user.id)

        # Generate new token
        token = secrets.token_urlsafe(48)
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=PASSWORD_RESET_EXPIRE_MINUTES
        )
        await self.auth_repository.create_password_reset_token(
            session, user.id, token, expires_at
        )

        # Send email (off the event loop — see the note above).
        reset_url = self._build_reset_url(token)
        plain, html = self._render_reset_email(user.full_name, reset_url)
        await asyncio.to_thread(
            email_client.send_email,
            to_email=email,
            subject="Reset your Reliastra password",
            body=plain,
            html_body=html,
        )

        logger.info("Password reset email sent to %s", email)

        return {
            "message": "If an account with this email exists, a password reset link has been sent.",
        }

    async def reset_password(
        self, session: AsyncSession, token: str, new_password: str
    ) -> dict[str, Any]:
        """Reset a user's password using the token."""
        stored = await self.auth_repository.get_password_reset_token(session, token)

        if not stored:
            raise ValidationException(
                "Invalid password reset token",
                details={"code": "INVALID_TOKEN"},
            )

        if stored.is_used:
            raise ValidationException(
                "This reset link has already been used. Please request a new one.",
                details={"code": "TOKEN_ALREADY_USED"},
            )

        if stored.expires_at < datetime.now(timezone.utc):
            raise ValidationException(
                "Password reset link has expired. Please request a new one.",
                details={"code": "TOKEN_EXPIRED"},
            )

        # Mark token as used
        await self.auth_repository.mark_password_reset_used(session, token)

        # Update user's password
        password_hash = get_password_hash(new_password)
        user = await self.user_repository.get_by_id(session, stored.user_id)
        if user:
            await self.user_repository.update(
                session, user, password_hash=password_hash
            )
            # Revoke all refresh tokens (force re-login on all devices) so a
            # refresh token copied before the reset cannot outlive it.
            revoked = await self.auth_repository.revoke_all_for_user(session, user.id)
            logger.info(
                "Password reset completed for user %s — revoked %s refresh session(s)",
                user.id,
                revoked,
            )

        return {
            "message": "Password has been reset successfully. You can now log in with your new password.",
        }


email_auth_service = EmailAuthService()
