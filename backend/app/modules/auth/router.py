from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import ResourceNotFoundException
from app.core.rate_limit import ip_limiter, enforce_rate_limit
from app.db.session import get_db
from app.modules.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    ResetPasswordResponse,
    SendVerificationRequest,
    RegisterResponse,
    TokenResponse,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from app.modules.auth.service import AuthService, auth_service
from app.modules.auth.email_service import (
    EmailAuthService,
    email_auth_service,
)
from app.modules.users.repository import UserRepository

router = APIRouter(prefix="/v1/auth", tags=["Authentication"])


def get_auth_service() -> AuthService:
    return auth_service


def get_email_auth_service() -> EmailAuthService:
    return email_auth_service


# ── Email Auth ──────────────────────────────────────────────


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
    service: AuthService = Depends(get_auth_service),
) -> RegisterResponse:
    await enforce_rate_limit(request, ip_limiter)
    return await service.register(db, body)


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    await enforce_rate_limit(request, ip_limiter)
    return await service.login(db, body)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    await enforce_rate_limit(request, ip_limiter)
    return await service.refresh(db, body.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    body: LogoutRequest,
    db: AsyncSession = Depends(get_db),
    service: AuthService = Depends(get_auth_service),
) -> None:
    await service.logout(db, body.refresh_token)


# ── Email Verification ────────────────────────────────────────


@router.post("/send-verification", status_code=status.HTTP_200_OK)
async def send_verification_email(
    request: Request,
    body: SendVerificationRequest,
    db: AsyncSession = Depends(get_db),
    service: EmailAuthService = Depends(get_email_auth_service),
) -> dict:
    """Send an email verification link to the user's email address."""
    await enforce_rate_limit(request, ip_limiter)
    return await service.send_verification_email(db, body.email)


@router.post("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(
    body: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db),
    service: EmailAuthService = Depends(get_email_auth_service),
) -> VerifyEmailResponse:
    """Verify a user's email using the token from the verification link."""
    result = await service.verify_email(db, body.token)
    return VerifyEmailResponse(**result)


# ── Password Reset ──────────────────────────────────────────────


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
    service: EmailAuthService = Depends(get_email_auth_service),
) -> dict:
    """
    Send a password reset link to the user's email.
    Always returns the same message to prevent email enumeration.
    """
    await enforce_rate_limit(request, ip_limiter)
    return await service.send_password_reset_email(db, body.email)


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    service: EmailAuthService = Depends(get_email_auth_service),
) -> ResetPasswordResponse:
    """Reset a user's password using the token from the reset email."""
    result = await service.reset_password(db, body.token, body.new_password)
    return ResetPasswordResponse(**result)
