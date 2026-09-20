"""app.db.session — backward-compatibility alias.

Canonical home: ``app.platform.persistence.session``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.persistence.session import (  # noqa: F401
    Any,
    AsyncEngine,
    AsyncGenerator,
    AsyncSession,
    async_sessionmaker,
    asyncio,
    build_engine,
    create_async_engine,
    event,
    get_db,
    get_engine,
    get_session_maker,
    logger,
    logging,
    parse_qs,
    reset_engine,
    set_test_engine,
    settings,
    urlencode,
    urlparse,
    urlunparse,
    _WRITE_FLAG,
    _build_connect_args,
    _engine,
    _ensure_asyncpg_driver,
    _install_write_tracking,
    _needs_pooler_compat,
    _sessionmaker,
    _strip_sslmode_from_url,
)

__all__ = [
    "Any",
    "AsyncEngine",
    "AsyncGenerator",
    "AsyncSession",
    "async_sessionmaker",
    "asyncio",
    "build_engine",
    "create_async_engine",
    "event",
    "get_db",
    "get_engine",
    "get_session_maker",
    "logger",
    "logging",
    "parse_qs",
    "reset_engine",
    "set_test_engine",
    "settings",
    "urlencode",
    "urlparse",
    "urlunparse",

]
