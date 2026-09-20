"""app.infrastructure.async_tasks — backward-compatibility alias.

Canonical home: ``app.platform.messaging.async_tasks``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.messaging.async_tasks import (  # noqa: F401
    Any,
    annotations,
    async_task_body,
    asyncio,
    is_running_loop,
    logger,
    logging,
    run_async,
    threading,
    _LoopWorker,
    _get_process_loop,
    _get_worker,
    _process_loop,
    _process_loop_lock,
    _reset_for_fork,
    _run_managed_session,
    _worker,
    _worker_lock,
)

__all__ = [
    "Any",
    "annotations",
    "async_task_body",
    "asyncio",
    "is_running_loop",
    "logger",
    "logging",
    "run_async",
    "threading",

]
