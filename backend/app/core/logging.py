"""app.core.logging — backward-compatibility alias.

Canonical home: ``app.platform.observability.logging``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.observability.logging import (  # noqa: F401
    Any,
    JsonFormatter,
    RedactingFormatter,
    SecretURLFilter,
    annotations,
    configure_logging,
    datetime,
    get_request_id,
    get_user_id,
    json,
    logging,
    re,
    redact_secrets,
    sys,
    timezone,
    _should_use_json,
)

__all__ = [
    "Any",
    "JsonFormatter",
    "RedactingFormatter",
    "SecretURLFilter",
    "annotations",
    "configure_logging",
    "datetime",
    "get_request_id",
    "get_user_id",
    "json",
    "logging",
    "re",
    "redact_secrets",
    "sys",
    "timezone",

]
