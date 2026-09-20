"""Fernet field-level encryption for JSONB columns.

Canonical home (moved from ``app.core.security`` during the platform
redesign). Import from here in new code; ``app.core.security`` re-exports
these names for backward compatibility.
"""

import json
from typing import Any
from cryptography.fernet import Fernet
from app.config import settings



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
            "Failed to decrypt JSONB data - possibly rotated SECRET_KEY: %s", exc
        )
        return {}
