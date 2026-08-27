from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import ResourceNotFoundException
from app.core.rate_limit import ip_limiter, enforce_rate_limit
from app.db.session import get_db
from app.modules.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    OrganizationLite,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    ResetPasswordResponse,
    SendOtpRequest,
    SendOtpResponse,
    SendVerificationRequest,
    RegisterResponse,
    TokenResponse,
    UserResponseLite,
    VerifyEmailRequest,
    VerifyEmailResponse,
    VerifyOtpRequest,
    VerifyOtpResponse,
)
from app.modules.auth.service import AuthService, auth_service
from app.modules.auth.email_service import (
    EmailAuthService,
    email_auth_service,
)
from app.modules.auth.otp_service import EmailOTPService, email_otp_service
from app.modules.organizations.repository import OrganizationRepository
from app.modules.users.repository import UserRepository

router = APIRouter(prefix="/v1/auth", tags=["Authentication"])


def get_auth_service() -> AuthService:
    return auth_service


def get_email_auth_service() -> EmailAuthService:
    return email_auth_service


def get_otp_service() -> EmailOTPService:
    return email_otp_service


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


# ── Email Verification (OTP — signup hard gate) ───────────────────


@router.post("/verify-otp", response_model=VerifyOtpResponse)
async def verify_otp(
    request: Request,
    body: VerifyOtpRequest,
    db: AsyncSession = Depends(get_db),
    otp: EmailOTPService = Depends(get_otp_service),
    service: AuthService = Depends(get_auth_service),
) -> VerifyOtpResponse:
    """Submit the 6-digit signup code.

    This is the only way an account created via ``/register`` becomes
    usable. On success the session is issued here, so the client does not
    need a second round trip to ``/login``.
    """
    await enforce_rate_limit(request, ip_limiter)
    user = await otp.verify_code(db, body.email, body.code)
    tokens = await service.issue_session(db, user.id)

    orgs = await OrganizationRepository.list_for_user(db, user.id)
    organization = (
        OrganizationLite(
            id=orgs[0].id,
            name=orgs[0].name,
            slug=orgs[0].slug,
            plan=orgs[0].plan,
        )
        if orgs
        else None
    )

    return VerifyOtpResponse(
        user=UserResponseLite(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            is_email_verified=True,
        ),
        organization=organization,
        tokens=tokens,
    )


@router.post("/resend-otp", response_model=SendOtpResponse)
async def resend_otp(
    request: Request,
    body: SendOtpRequest,
    db: AsyncSession = Depends(get_db),
    otp: EmailOTPService = Depends(get_otp_service),
) -> SendOtpResponse:
    """Issue a fresh signup code.

    Throttled per IP (router) and per account (60s cooldown). The response is
    identical for unknown, already-verified and real addresses so it cannot
    be used to enumerate accounts.
    """
    await enforce_rate_limit(request, ip_limiter)
    result = await otp.send_code_for_email(db, body.email)
    return SendOtpResponse(**result)


# ── Email Verification (magic link — legacy/alternative) ──────────


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
