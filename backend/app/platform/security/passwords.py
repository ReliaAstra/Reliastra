"""Password hashing (bcrypt).

Canonical home (moved from ``app.core.security`` during the platform
redesign). Import from here in new code; ``app.core.security`` re-exports
these names for backward compatibility.
"""

import bcrypt




def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except Exception:
        return False

