"""app.core.supabase — backward-compatibility alias.

Canonical home: ``app.platform.security.supabase``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.security.supabase import (  # noqa: F401
    Any,
    annotations,
    json,
    logger,
    logging,
    map_supabase_user,
    time,
    verify_supabase_token,
    _decode_jwt_payload,
    _fetch_jwks,
    _jwks_cache,
)

__all__ = [
    "Any",
    "annotations",
    "json",
    "logger",
    "logging",
    "map_supabase_user",
    "time",
    "verify_supabase_token",

]
