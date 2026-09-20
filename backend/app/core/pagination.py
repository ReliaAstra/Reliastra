"""app.core.pagination — backward-compatibility alias.

Canonical home: ``app.platform.web.pagination``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.web.pagination import (  # noqa: F401
    Any,
    BaseModel,
    ConfigDict,
    CursorPagination,
    DEFAULT_PAGE_LIMIT,
    Field,
    Generic,
    MAX_PAGE_LIMIT,
    OffsetPagination,
    PaginatedResponse,
    PaginationMeta,
    T,
    TypeVar,
    computed_field,
    model_validator,
    paginated,
    slice_page,
)

__all__ = [
    "Any",
    "BaseModel",
    "ConfigDict",
    "CursorPagination",
    "DEFAULT_PAGE_LIMIT",
    "Field",
    "Generic",
    "MAX_PAGE_LIMIT",
    "OffsetPagination",
    "PaginatedResponse",
    "PaginationMeta",
    "T",
    "TypeVar",
    "computed_field",
    "model_validator",
    "paginated",
    "slice_page",

]
