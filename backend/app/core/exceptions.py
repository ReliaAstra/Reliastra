"""app.core.exceptions — backward-compatibility alias.

Canonical home: ``app.platform.web.errors``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.web.errors import (  # noqa: F401
    Any,
    AppException,
    ArtifactMissingException,
    ConflictException,
    FastAPI,
    ForbiddenException,
    JSONResponse,
    RateLimitExceededException,
    Request,
    RequestValidationError,
    ResourceNotFoundException,
    ServiceUnavailableException,
    StarletteHTTPException,
    UnauthorizedException,
    ValidationException,
    error_payload,
    get_request_id,
    logger,
    logging,
    setup_exception_handlers,
    status,
)

__all__ = [
    "Any",
    "AppException",
    "ArtifactMissingException",
    "ConflictException",
    "FastAPI",
    "ForbiddenException",
    "JSONResponse",
    "RateLimitExceededException",
    "Request",
    "RequestValidationError",
    "ResourceNotFoundException",
    "ServiceUnavailableException",
    "StarletteHTTPException",
    "UnauthorizedException",
    "ValidationException",
    "error_payload",
    "get_request_id",
    "logger",
    "logging",
    "setup_exception_handlers",
    "status",

]
