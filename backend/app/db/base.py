"""app.db.base — backward-compatibility alias.

Canonical home: ``app.platform.persistence.base``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.persistence.base import (  # noqa: F401
    Base,
    Boolean,
    DateTime,
    DeclarativeBase,
    Mapped,
    SoftDeleteMixin,
    TimestampMixin,
    UUID,
    UUIDMixin,
    datetime,
    import_all_models,
    mapped_column,
    timezone,
    uuid,
)

__all__ = [
    "Base",
    "Boolean",
    "DateTime",
    "DeclarativeBase",
    "Mapped",
    "SoftDeleteMixin",
    "TimestampMixin",
    "UUID",
    "UUIDMixin",
    "datetime",
    "import_all_models",
    "mapped_column",
    "timezone",
    "uuid",

]
