import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
import bcrypt
import jwt
from cryptography.fernet import Fernet
from app.config import settings
from app.core.exceptions import UnauthorizedException


def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except Exception:
        return False


def _base_token_payload(subject: str, expire: datetime, token_type: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "sub": subject,
        "iat": now,
        "nbf": now,
        "exp": expire,
        "type": token_type,
        "jti": secrets.token_hex(16),
    }


def create_access_token(
    subject: str, additional_claims: dict[str, Any] | None = None
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode = _base_token_payload(subject, expire, "access")
    if additional_claims:
        to_encode.update(additional_claims)
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")


def create_refresh_token(
    subject: str, additional_claims: dict[str, Any] | None = None
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    to_encode = _base_token_payload(subject, expire, "refresh")
    if additional_claims:
        to_encode.update(additional_claims)
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")


# ── Admin-console tokens ───────────────────────────────────────────────────
# Admin access is a SEPARATE credential family from user/partner sessions.
# Tokens minted here carry type=admin_access / admin_refresh and
# aud=reliastra-admin; they are accepted ONLY by require_system_admin and can
# never be used as a user/partner token (get_current_user requires type ==
# "access" and never sees the admin audience).

ADMIN_TOKEN_AUDIENCE = "reliastra-admin"
ADMIN_TOKEN_TYPE_ACCESS = "admin_access"
ADMIN_TOKEN_TYPE_REFRESH = "admin_refresh"


def _admin_token_secret() -> str:
    """Signing key for the admin-console token family.

    A dedicated secret (ADMIN_TOKEN_SECRET) keeps the admin JWT family fully
    independent from customer/partner sessions: a token minted with SECRET_KEY
    (or forged with it) is rejected by the admin guard, and vice versa.
    """
    if not settings.ADMIN_TOKEN_SECRET:
        raise UnauthorizedException("Admin console is not configured")
    return settings.ADMIN_TOKEN_SECRET


def verify_admin_credentials(username: str, password: str) -> bool:
    """Constant-time check of the dedicated admin credentials.

    SHA-256 digests are compared with ``compare_digest`` so neither the
    credentials' length nor prefix leaks through timing, and the same work is
    done for every attempt. Unknown usernames cost the same as correct ones.
    """
    expected_user = settings.ADMIN_USERNAME
    expected_password = (
        settings.ADMIN_PASSWORD.get_secret_value()
        if settings.ADMIN_PASSWORD
        else ""
    )
    if not expected_user or not expected_password:
        return False
    user_match = hmac.compare_digest(
        hashlib.sha256(username.encode("utf-8")).digest(),
        hashlib.sha256(expected_user.encode("utf-8")).digest(),
    )
    pass_match = hmac.compare_digest(
        hashlib.sha256(password.encode("utf-8")).digest(),
        hashlib.sha256(expected_password.encode("utf-8")).digest(),
    )
    return user_match and pass_match


def create_admin_access_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode = _base_token_payload(
        f"admin:{username}", expire, ADMIN_TOKEN_TYPE_ACCESS
    )
    to_encode.update({"aud": ADMIN_TOKEN_AUDIENCE, "username": username})
    return jwt.encode(to_encode, _admin_token_secret(), algorithm="HS256")


def create_admin_refresh_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.ADMIN_REFRESH_TOKEN_EXPIRE_DAYS
    )
    to_encode = _base_token_payload(
        f"admin:{username}", expire, ADMIN_TOKEN_TYPE_REFRESH
    )
    to_encode.update({"aud": ADMIN_TOKEN_AUDIENCE, "username": username})
    return jwt.encode(to_encode, _admin_token_secret(), algorithm="HS256")


def decode_admin_token(token: str) -> dict[str, Any]:
    """Verify an admin-console JWT (signature, audience, admin token type).

    Raises :class:`UnauthorizedException` for any failure. The returned
    payload always contains ``username`` and a ``jti`` suitable for
    single-use refresh rotation.
    """
    try:
        payload = jwt.decode(
            token,
            _admin_token_secret(),
            algorithms=["HS256"],
            audience=ADMIN_TOKEN_AUDIENCE,
            options={"require": ["exp", "sub", "jti", "username"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedException("Admin session has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedException("Invalid admin token") from exc

    if payload.get("type") not in {
        ADMIN_TOKEN_TYPE_ACCESS,
        ADMIN_TOKEN_TYPE_REFRESH,
    }:
        raise UnauthorizedException("Invalid admin token")
    return payload


def decode_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=["HS256"]
        )
        return payload
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedException("Token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedException("Invalid token") from exc


def generate_api_key() -> tuple[str, str, str]:
    """
    Generate a secure programmatic access key.
    Returns (full_key, prefix, hashed_key).
    """
    token_part = secrets.token_hex(20)
    full_key = f"rel_{token_part}"
    prefix = full_key[:8]
    hashed_key = hash_api_key(full_key)
    return full_key, prefix, hashed_key


def hash_api_key(key: str) -> str:
    """Return a bcrypt hash of the API key.

    bcrypt is GPU-brute-force resistant (unlike raw SHA-256), which matters
    because API keys carry enough entropy to be valuable if the database
    leaks. Keys are short (< 72 bytes), so bcrypt's input limit is a non-issue.
    """
    return bcrypt.hashpw(
        key.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")


def verify_api_key(raw_key: str, stored_hash: str) -> bool:
    """Verify *raw_key* against *stored_hash*.

    Supports both hash formats so pre-existing rows keep working:

    * ``$2b$...``  — bcrypt (all new keys)
    * 64 hex chars — legacy SHA-256 (checked in constant time)
    """
    if stored_hash.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            return bcrypt.checkpw(
                raw_key.encode("utf-8"), stored_hash.encode("utf-8")
            )
        except (ValueError, TypeError):
            return False
    legacy_sha256 = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    return hmac.compare_digest(legacy_sha256, stored_hash)


def get_fernet() -> Fernet:
    return Fernet(settings.fernet_key)


def encrypt_jsonb(data: dict[str, Any] | None) -> str | None:
    if data is None:
        return None
    fernet = get_fernet()
    json_bytes = json.dumps(data).encode("utf-8")
    encrypted = fernet.encrypt(json_bytes)
    return encrypted.decode("utf-8")


def decrypt_jsonb(encrypted_str: str | None) -> dict[str, Any] | None:
    if encrypted_str is None:
        return None
    fernet = get_fernet()
    try:
        decrypted_bytes = fernet.decrypt(encrypted_str.encode("utf-8"))
        return json.loads(decrypted_bytes.decode("utf-8"))
    except Exception as exc:
        # Log the decryption failure so it isn't silently swallowed;
        # returning empty dict as a safe default for callers.
        import logging
        logging.getLogger(__name__).warning(
            "Failed to decrypt JSONB data — possibly rotated SECRET_KEY: %s", exc
        )
        return {}
