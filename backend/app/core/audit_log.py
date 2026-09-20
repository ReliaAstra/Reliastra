"""app.core.audit_log — backward-compatibility alias.

Canonical home: ``app.platform.observability.audit``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.observability.audit import (  # noqa: F401
    Any,
    AsyncSession,
    AuditLog,
    AuditLogService,
    Base,
    JSON,
    Mapped,
    String,
    TimestampMixin,
    UUIDMixin,
    logger,
    logging,
    mapped_column,
    select,
    uuid,
)

__all__ = [
    "Any",
    "AsyncSession",
    "AuditLog",
    "AuditLogService",
    "Base",
    "JSON",
    "Mapped",
    "String",
    "TimestampMixin",
    "UUIDMixin",
    "logger",
    "logging",
    "mapped_column",
    "select",
    "uuid",

]
