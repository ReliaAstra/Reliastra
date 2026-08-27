TOKEN_TYPE_BEARER: str = "bearer"
TOKEN_CLAIM_TYPE_ACCESS: str = "access"
TOKEN_CLAIM_TYPE_REFRESH: str = "refresh"

# ── Email verification OTP ──────────────────────────────────────────
#: Number of digits in a signup verification code.
OTP_LENGTH: int = 6
#: How long a code stays valid.
OTP_EXPIRE_MINUTES: int = 10
#: Wrong-code submissions allowed before the code is burned and the user
#: must request a new one. Stops online brute force of the 10^6 keyspace.
OTP_MAX_ATTEMPTS: int = 5
#: Minimum gap between two code sends for the same account. Stops the
#: resend button being used as an email bomb.
OTP_RESEND_COOLDOWN_SECONDS: int = 60

#: Machine-readable error code returned when an unverified account tries to
#: authenticate. The frontend keys its "enter your code" step off this.
EMAIL_NOT_VERIFIED_CODE: str = "EMAIL_NOT_VERIFIED"
