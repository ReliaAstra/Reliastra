from __future__ import annotations

import logging
import secrets

from app.config import settings
from app.core.security import get_password_hash

logger = logging.getLogger(__name__)


async def ensure_admin_service_account() -> bool:
    """Seed the non-login-able service account that anchors admin records.

    The dedicated admin credentials (``ADMIN_USERNAME``/``ADMIN_PASSWORD``)
    are NOT a user account: they are verified in constant time against the
    environment and mint an isolated admin JWT. The row created here exists
    only so admin-created ``created_by``/``changed_by``/``admin_user_id``
    foreign keys and the admin audit trail point at a real ``users.id``.

    The account can never be signed into:

    * ``password_hash`` is a random bcrypt hash that is generated once and
      never stored anywhere else;
    * ``is_email_verified`` / ``is_active`` remain False;
    * it has no OAuth/Supabase mapping.

    Returns True when the account exists after the call.
    """
    if not settings.admin_console_enabled:
        logger.info(
            "ADMIN_USERNAME/ADMIN_PASSWORD not configured — admin console "
            "disabled"
        )
        return False

    from app.db.session import get_session_maker
    from app.modules.users.repository import UserRepository

    email = settings.admin_service_email
    session_maker = get_session_maker()
    async with session_maker() as session:
        try:
            user = await UserRepository.get_by_email(session, email)
            if user is not None:
                return True

            # Random, unguessable, unrecoverable password. No code path ever
            # reads this hash back; login as this account is impossible.
            # Random, unguessable, unrecoverable password. No code path ever
            # reads this hash back; login as this account is impossible.
            random_password = secrets.token_urlsafe(48)
            user = await UserRepository.create(
                session,
                email=email,
                password_hash=get_password_hash(random_password),
                full_name="System Administrator",
                is_active=False,
                is_email_verified=False,
                is_superuser=False,
                auth_provider=None,
            )
            # The repo does not expose ``source`` as a create kwarg; the column
            # default ("email", see models.py) is irrelevant for this anchor.
            # Stamp it explicitly so the row is self-describing in the admin
            # customer view and can never be mistaken for a real sign-up.
            user.source = "admin_service_account"
            await session.commit()
            logger.info(
                "Seeded admin service account %s (non login-able)", email
            )
            return True
        except Exception as exc:
            logger.error(
                "Failed to seed admin service account: %s", exc
            )
            await session.rollback()
            return False
