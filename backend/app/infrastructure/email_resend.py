"""app.infrastructure.email_resend — backward-compatibility alias.

Canonical home: ``app.platform.integrations.email_resend``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.integrations.email_resend import (  # noqa: F401
    Any,
    LIMITS,
    RESEND_API_URL,
    TIMEOUT,
    annotations,
    close_resend_client,
    httpx,
    logger,
    logging,
    send_via_resend,
    send_via_resend_sync,
    settings,
    _api_key,
    _build_payload,
    _client,
    _client_get,
    _from_for_category,
    _reply_to_for_category,
)

__all__ = [
    "Any",
    "LIMITS",
    "RESEND_API_URL",
    "TIMEOUT",
    "annotations",
    "close_resend_client",
    "httpx",
    "logger",
    "logging",
    "send_via_resend",
    "send_via_resend_sync",
    "settings",

]
