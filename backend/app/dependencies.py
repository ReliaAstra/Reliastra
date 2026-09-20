"""app.dependencies — backward-compatibility alias.

Canonical home: ``app.api.deps``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.api.deps import (  # noqa: F401
    APIKeyHeader,
    Any,
    AsyncSession,
    Depends,
    ForbiddenException,
    HTTPAuthorizationCredentials,
    HTTPBearer,
    Request,
    ResourceNotFoundException,
    Role,
    TYPE_CHECKING,
    UnauthorizedException,
    annotations,
    decode_token,
    get_current_org,
    get_current_user,
    get_db,
    has_permission,
    logger,
    logging,
    require_admin,
    require_jwt_auth,
    require_member,
    require_owner,
    require_role,
    require_scope,
    require_viewer,
    security_api_key,
    security_bearer,
    uuid,
)

__all__ = [
    "APIKeyHeader",
    "Any",
    "AsyncSession",
    "Depends",
    "ForbiddenException",
    "HTTPAuthorizationCredentials",
    "HTTPBearer",
    "Request",
    "ResourceNotFoundException",
    "Role",
    "TYPE_CHECKING",
    "UnauthorizedException",
    "annotations",
    "decode_token",
    "get_current_org",
    "get_current_user",
    "get_db",
    "has_permission",
    "logger",
    "logging",
    "require_admin",
    "require_jwt_auth",
    "require_member",
    "require_owner",
    "require_role",
    "require_scope",
    "require_viewer",
    "security_api_key",
    "security_bearer",
    "uuid",

]
