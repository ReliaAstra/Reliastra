"""app.core.tenant — backward-compatibility alias.

Canonical home: ``app.platform.tenancy.middleware``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.tenancy.middleware import (  # noqa: F401
    BaseHTTPMiddleware,
    JSONResponse,
    ORG_HEADER_CANDIDATES,
    Request,
    RequestResponseEndpoint,
    Response,
    TenantContextMiddleware,
    annotations,
    error_payload,
    extract_organization_id,
    uuid,
)

__all__ = [
    "BaseHTTPMiddleware",
    "JSONResponse",
    "ORG_HEADER_CANDIDATES",
    "Request",
    "RequestResponseEndpoint",
    "Response",
    "TenantContextMiddleware",
    "annotations",
    "error_payload",
    "extract_organization_id",
    "uuid",

]
