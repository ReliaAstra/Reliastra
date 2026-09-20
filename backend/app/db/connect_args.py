"""app.db.connect_args — backward-compatibility alias.

Canonical home: ``app.platform.persistence.connect_args``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.persistence.connect_args import (  # noqa: F401
    Any,
    SUPPORTED_SSL_MODES,
    build_ssl_connect_args,
    logger,
    logging,
)

__all__ = [
    "Any",
    "SUPPORTED_SSL_MODES",
    "build_ssl_connect_args",
    "logger",
    "logging",

]
