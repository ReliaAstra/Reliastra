#!/usr/bin/env python3
"""Create a system-admin user and print a valid access token for local
verification of the admin console. Dev-only helper.
"""
from __future__ import annotations

import asyncio
import os
import sys

# Allow running as `python scripts/create_admin.py` from the backend dir.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


async def main() -> None:
    import pgserver
    from sqlalchemy import select

    pgdata = pgserver.get_server(pgdata="/tmp/reliastra-pgdata", cleanup_mode="stop")
    uri = pgdata.get_uri("postgres").replace("postgresql://", "postgresql+asyncpg://", 1)
    os.environ["DATABASE_URL"] = uri
    os.environ["DATABASE_SSL_MODE"] = ""

    from app.core.security import create_access_token, get_password_hash
    from app.db.session import get_session_maker
    from app.modules.users.models import User

    session_maker = get_session_maker()
    email = "admin@reliastra.com"
    async with session_maker() as session:
        existing = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if existing:
            existing.is_system_admin = True
            existing.is_active = True
            await session.commit()
            user_id = existing.id
            print(f"[create_admin] existing user promoted: {existing.id}", file=sys.stderr)
        else:
            user = User(
                email=email,
                password_hash=get_password_hash("reliastra-dev-password"),
                full_name="Reliastra Admin",
                is_active=True,
                is_email_verified=True,
                is_system_admin=True,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
            user_id = user.id
            print(f"[create_admin] created system admin: {user.id}", file=sys.stderr)

    token = create_access_token(str(user_id))
    print(token)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
