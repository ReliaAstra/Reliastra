"""app.infrastructure.storage — backward-compatibility alias.

Canonical home: ``app.platform.integrations.storage``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.integrations.storage import (  # noqa: F401
    Any,
    StorageClient,
    StorageError,
    StorageObjectMissing,
    logger,
    logging,
    settings,
    storage_client,
)

__all__ = [
    "Any",
    "StorageClient",
    "StorageError",
    "StorageObjectMissing",
    "logger",
    "logging",
    "settings",
    "storage_client",

]
