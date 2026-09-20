"""app.core.request_context — backward-compatibility alias.

Canonical home: ``app.platform.observability.context``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.observability.context import (  # noqa: F401
    ContextVar,
    annotations,
    get_request_id,
    get_user_id,
    request_id_var,
    set_request_id,
    set_user_id,
    user_id_var,
)

__all__ = [
    "ContextVar",
    "annotations",
    "get_request_id",
    "get_user_id",
    "request_id_var",
    "set_request_id",
    "set_user_id",
    "user_id_var",

]
