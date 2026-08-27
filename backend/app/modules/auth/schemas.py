import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator
from app.modules.acquisition.schemas import AcquisitionAttributionInput
from app.modules.auth.constants import OTP_LENGTH, TOKEN_TYPE_BEARER


class RegisterRequest(BaseModel):
    email: EmailStr
    # FIX 33: minimum password length is enforced at the schema level so
    # OpenAPI advertises it and short passwords are rejected before hashing.
    password: str = Field(min_length=8, max_length=128)
    full_name: str
    org_name: str | None = None
    #: Referral code captured from ``https://reliastra.com/r/{code}`` and
    #: replayed at signup. Links the new account to the referring partner.
    ref_code: str | None = Field(default=None, max_length=32)
    #: First-party marketing attribution captured from the visitor's
    #: arriving URL (UTM parameters). Optional - signup must succeed
    #: without it, and every value is normalized server-side before use.
    acquisition: AcquisitionAttributionInput | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = TOKEN_TYPE_BEARER
    expires_in: int


class RegisterResponse(BaseModel):
    """Signup payload.

    Email verification is a **hard gate**: registration creates the account
    and its default organization but issues NO tokens. ``tokens`` stays
    ``null`` until the 6-digit code emailed to the address is submitted to
    ``POST /v1/auth/verify-otp``.
    """

    user: "UserResponseLite"
    organization: "OrganizationLite"
    tokens: TokenResponse | None = None
    verification_required: bool = True
    message: str = (
        "Account created. Enter the 6-digit code we emailed you to activate it."
    )


class UserResponseLite(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    is_active: bool = True
    is_email_verified: bool = False


class OrganizationLite(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    plan: str


class GoogleAuthUrlResponse(BaseModel):
    authorization_url: str
    state: str


class GoogleAuthRequest(BaseModel):
    code: str
    state: str | None = None


class GitHubAuthUrlResponse(BaseModel):
    authorization_url: str
    state: str


class GitHubAuthRequest(BaseModel):
    code: str
    state: str | None = None


class OAuthAuthResponse(TokenResponse):
    """Shared response for both Google and GitHub OAuth."""

    is_new_user: bool = False
    user_id: uuid.UUID
    email: str
    full_name: str


# Aliases so existing Google code still works
GoogleAuthResponse = OAuthAuthResponse
GitHubAuthResponse = OAuthAuthResponse


# ── Email Verification ─────────────────────────────────────────────


class SendVerificationRequest(BaseModel):
    email: EmailStr


class VerifyEmailRequest(BaseModel):
    token: str


class VerifyEmailResponse(BaseModel):
    message: str
    is_email_verified: bool


# ── Email Verification OTP (signup hard gate) ──────────────────────


class SendOtpRequest(BaseModel):
    email: EmailStr


class SendOtpResponse(BaseModel):
    message: str
    expires_in_minutes: int


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    #: Exactly ``OTP_LENGTH`` digits. Validated here so malformed input never
    #: consumes one of the account's attempt budget.
    code: str = Field(min_length=OTP_LENGTH, max_length=OTP_LENGTH)

    @field_validator("code")
    @classmethod
    def _digits_only(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped.isdigit():
            raise ValueError("Verification code must be numeric")
        return stripped


class VerifyOtpResponse(BaseModel):
    """Successful verification logs the user in — tokens are issued here."""

    message: str = "Email verified. Welcome to Reliastra."
    is_email_verified: bool = True
    user: "UserResponseLite"
    organization: "OrganizationLite | None" = None
    tokens: TokenResponse


# ── Password Reset ─────────────────────────────────────────────────


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    # FIX 33: minimum password length enforced at the schema level.
    new_password: str = Field(min_length=8, max_length=128)


class ResetPasswordResponse(BaseModel):
    message: str
