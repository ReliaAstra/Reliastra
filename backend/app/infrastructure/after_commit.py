"""app.infrastructure.after_commit — backward-compatibility alias.

Canonical home: ``app.platform.persistence.after_commit``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.persistence.after_commit import (  # noqa: F401
    AsyncSession,
    Callable,
    annotations,
    dispatch_after_commit,
    event,
    logger,
    logging,
)

__all__ = [
    "AsyncSession",
    "Callable",
    "annotations",
    "dispatch_after_commit",
    "event",
    "logger",
    "logging",

]
