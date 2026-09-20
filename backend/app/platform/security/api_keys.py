"""Programmatic API-key generation and verification.

Canonical home (moved from ``app.core.security`` during the platform
redesign). Import from here in new code; ``app.core.security`` re-exports
these names for backward compatibility.
"""

import hashlib
import hmac
import secrets
import bcrypt



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

    * ``$2b$...``  - bcrypt (all new keys)
    * 64 hex chars - legacy SHA-256 (checked in constant time)
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

