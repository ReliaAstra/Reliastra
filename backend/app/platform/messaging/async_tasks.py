"""Shared helpers for running async coroutines from synchronous Celery tasks.

Celery 5.x tasks are synchronous while the service layer is async
(SQLAlchemy async). The bridge must respect one hard constraint: asyncpg
connections are bound to the event loop that created them, and the engine
connection pool outlives individual tasks. Creating a fresh loop per task
(e.g. ``asyncio.run`` per call) therefore breaks on the *second* task that
reuses a pooled connection.

This module guarantees loop affinity in both execution contexts:

* **No running loop** (normal Celery prefork worker): every task runs on ONE
  process-cached event loop. One loop per process, so pooled connections
  never cross loops and memory stays flat.

* **A loop is already running** (eager task execution in tests/dev): all
  coroutines are handed to a single dedicated worker thread that owns one
  long-lived loop AND its own SQLAlchemy engine. The worker's engine is
  separate from the caller's, so its pooled connections are created on the
  worker's loop and never collide with the caller's loop.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)

# Process-cached loop for the "no running loop" (Celery worker) context.
_process_loop: asyncio.AbstractEventLoop | None = None
_process_loop_lock = threading.Lock()

# Single worker thread (with its own loop + engine) for in-loop callers.
_worker: _LoopWorker | None = None
_worker_lock = threading.Lock()


class _LoopWorker:
    """One background thread owning one loop and one DB engine forever."""

    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._session_maker: Any = None
        self._failure: BaseException | None = None
        self._ready = threading.Event()
        self._thread = threading.Thread(
            target=self._run_loop, name="reliastra-async-worker", daemon=True
        )
        self._thread.start()
        if not self._ready.wait(timeout=10):
            raise RuntimeError(
                "reliastra-async-worker did not become ready within 10s"
            )
        if self._failure is not None:
            raise RuntimeError(
                "reliastra-async-worker failed to start"
            ) from self._failure
        if self._loop is None:
            raise RuntimeError(
                "reliastra-async-worker loop never started"
            ) from self._failure

    def _run_loop(self) -> None:
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            self._loop = loop

            # The worker owns its engine so asyncpg connections are always
            # created (and reused) on THIS loop.
            from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

            from app.platform.persistence.session import build_engine

            self._session_maker = async_sessionmaker(
                build_engine(),
                class_=AsyncSession,
                expire_on_commit=False,
                autoflush=False,
            )
        except BaseException as exc:
            self._failure = exc
            # Callers must never block on readiness of a worker that failed
            # to construct its engine: set the event even on failure so
            # __init__ returns promptly and run*() raise the recorded cause.
            self._ready.set()
            return
        self._ready.set()
        self._loop.run_forever()

    def _assert_postable(self) -> None:
        """Refuse a post that cannot be served - fail fast, never deadlock.

        Two failure modes historically ate whole CI runs in silence:

        * *Self-re-entry*: an eager Celery task executed inline inside an
        ``after_commit`` hook on THIS worker's loop thread re-enters
        ``async_task_body`` and would block the loop thread on a future that
        only this very loop can resolve - a permanent circular wait.
        * *Dead worker*: a future posted to a loop whose thread already died
        would hang forever in ``result()`` because nothing will ever run it.
        """
        if threading.current_thread() is self._thread:
            raise RuntimeError(
                "async task re-entered on reliastra-async-worker's own event "
                "loop thread (inline/eager Celery execution inside an "
                "after_commit hook). Blocking on this loop from itself is a "
                "guaranteed deadlock; the side effect is abandoned and must "
                "be reconciled out of band."
            )
        self._assert_ready()

    def _assert_ready(self) -> None:
        if self._failure is not None:
            raise RuntimeError(
                "reliastra-async-worker failed to start"
            ) from self._failure
        if self._loop is None:
            raise RuntimeError(
                "reliastra-async-worker loop never started"
            ) from self._failure
        if self._thread is None or not self._thread.is_alive():
            raise RuntimeError("reliastra-async-worker thread is not running")

    def run(self, coro: Any) -> Any:
        self._assert_postable()
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result()

    def run_with_session(self, coro_factory: Any) -> Any:
        """Run ``await coro_factory(session)`` inside a worker-owned session.

        The coroutine is created on the worker's loop so the loop-bound
        asyncpg pool of the worker engine is used consistently.
        """
        self._assert_postable()

        async def _run() -> Any:
            async with self._session_maker() as session:
                coro = coro_factory(session)
                try:
                    result = await coro
                    await session.commit()
                    return result
                except Exception:
                    await session.rollback()
                    raise

        future = asyncio.run_coroutine_threadsafe(_run(), self._loop)
        return future.result()


def _get_worker() -> _LoopWorker:
    global _worker
    with _worker_lock:
        if _worker is None:
            _worker = _LoopWorker()
        return _worker


def _get_process_loop() -> asyncio.AbstractEventLoop:
    """Return the process-cached event loop used by Celery tasks."""
    global _process_loop
    with _process_loop_lock:
        if _process_loop is None or _process_loop.is_closed():
            _process_loop = asyncio.new_event_loop()
        return _process_loop


def _reset_for_fork() -> None:
    """Clear cached loops/engines after a Celery prefork (Proof 6).

    Celery's prefork pool forks the parent process. The child inherits the
    parent's globals but only the forking thread survives - a cached
    ``_process_loop`` created in the parent is bound to the parent's loop
    and its asyncpg pool is broken (``Task got Future attached to a different
    loop`` → ``schedule_checks`` silently returns 0). The parent's
    ``_LoopWorker`` thread also does not survive the fork.

    Called from ``celery.signals.worker_process_init`` so each child starts
    with fresh loop affinity.
    """
    global _process_loop, _worker
    with _process_loop_lock:
        if _process_loop is not None:
            try:
                if not _process_loop.is_closed():
                    _process_loop.close()
            except Exception:
                logger.debug("closing stale process loop after fork failed", exc_info=True)
            _process_loop = None
    with _worker_lock:
        # Parent's worker thread is dead in the child; drop it so a fresh
        # one is created on demand if eager execution is ever used there.
        _worker = None


def is_running_loop() -> bool:
    """True when called from inside a running event loop."""
    try:
        asyncio.get_running_loop()
        return True
    except RuntimeError:
        return False


def run_async(coro: Any) -> Any:
    """Run *coro* to completion from synchronous code.

    * Outside a running loop → process-cached loop (Celery worker path).
    * Inside a running loop → shared single-thread loop worker (bounded
      memory; the caller is responsible for loop-affine resources).
    """
    if is_running_loop():
        return _get_worker().run(coro)
    return _get_process_loop().run_until_complete(coro)


def _run_managed_session(coro_factory: Any) -> Any:
    """Run ``coro_factory(session)`` with a self-managed session + commit."""

    async def _managed() -> Any:
        from app.platform.persistence.session import get_session_maker

        session_maker = get_session_maker()
        async with session_maker() as session:
            coro = coro_factory(session)
            try:
                result = await coro
                await session.commit()
                return result
            except Exception:
                await session.rollback()
                raise

    return _get_process_loop().run_until_complete(_managed())


def async_task_body(coro_factory: Any) -> Any:
    """Bridge helper for Celery task bodies.

    ``coro_factory`` is a sync callable ``(session) -> coroutine`` performing
    the task's work. Session lifecycle (commit/rollback) is handled here.

    * Inside a running loop (eager tests/dev): the body runs on the shared
      worker thread whose loop owns a dedicated engine - loop affinity for
      asyncpg connections is preserved.
    * Outside a loop (Celery workers): the body runs on the process-cached
      loop using the global engine.
    """
    if is_running_loop():
        return _get_worker().run_with_session(coro_factory)
    return _run_managed_session(coro_factory)
