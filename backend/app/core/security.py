"""app.core.security — backward-compatibility alias.

Canonical home: ``app.platform.security.passwords``, ``app.platform.security.tokens``, ``app.platform.security.api_keys``, ``app.platform.security.field_encryption``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.security.passwords import (  # noqa: F401
    bcrypt,
    get_password_hash,
    verify_password,
)
from app.platform.security.tokens import (  # noqa: F401
    ADMIN_TOKEN_AUDIENCE,
    ADMIN_TOKEN_TYPE_ACCESS,
    ADMIN_TOKEN_TYPE_REFRESH,
    Any,
    UnauthorizedException,
    create_access_token,
    create_admin_access_token,
    create_admin_refresh_token,
    create_refresh_token,
    datetime,
    decode_admin_token,
    decode_token,
    hashlib,
    hmac,
    jwt,
    secrets,
    settings,
    timedelta,
    timezone,
    verify_admin_credentials,
)
from app.platform.security.api_keys import (  # noqa: F401
    generate_api_key,
    hash_api_key,
    verify_api_key,
)
from app.platform.security.field_encryption import (  # noqa: F401
    Fernet,
    decrypt_jsonb,
    encrypt_jsonb,
    get_fernet,
    json,
)

__all__ = [
    "ADMIN_TOKEN_AUDIENCE",
    "ADMIN_TOKEN_TYPE_ACCESS",
    "ADMIN_TOKEN_TYPE_REFRESH",
    "Any",
    "Fernet",
    "UnauthorizedException",
    "bcrypt",
    "create_access_token",
    "create_admin_access_token",
    "create_admin_refresh_token",
    "create_refresh_token",
    "datetime",
    "decode_admin_token",
    "decode_token",
    "decrypt_jsonb",
    "encrypt_jsonb",
    "generate_api_key",
    "get_fernet",
    "get_password_hash",
    "hash_api_key",
    "hashlib",
    "hmac",
    "json",
    "jwt",
    "secrets",
    "settings",
    "timedelta",
    "timezone",
    "verify_admin_credentials",
    "verify_api_key",
    "verify_password",

]
