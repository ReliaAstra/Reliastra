"""Organization membership roles and the role hierarchy.

Canonical home (moved from ``app.core.permissions``). Roles answer 'who
may act'; plan limits and pricing live in
``app.modules.billing.entitlements``.
"""

from enum import Enum
from app.platform.web.errors import ForbiddenException



class Role(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


ROLE_HIERARCHY: dict[str, int] = {
    Role.OWNER.value: 40,
    Role.ADMIN.value: 30,
    Role.MEMBER.value: 20,
    Role.VIEWER.value: 10,
}


def get_role_level(role: str) -> int:
    return ROLE_HIERARCHY.get(role.lower(), 0)


def has_permission(user_role: str, required_role: str) -> bool:
    """
    Check if user_role satisfies required_role based on hierarchy:
    owner > admin > member > viewer.
    """
    return get_role_level(user_role) >= get_role_level(required_role)


def require_permission(user_role: str, required_role: str) -> None:
    if not has_permission(user_role, required_role):
        raise ForbiddenException(
            f"Action requires at least '{required_role}' role, but user has '{user_role}' role."
        )
