"""Tests for FIX 6: bounded run_async bridging sync Celery tasks to async."""

import asyncio
import threading

import pytest

from app.infrastructure import async_tasks


def test_run_async_outside_loop():
    async def coro():
        return 42

    assert async_tasks.run_async(coro()) == 42


def test_run_async_inside_loop_uses_shared_worker():
    """Calls made from a running loop must reuse ONE worker thread/loop."""
    observed: list[tuple[int, int]] = []

    async def probe():
        observed.append(
            (threading.get_ident(), id(asyncio.get_running_loop()))
        )
        return "ok"

    async def main():
        # run_async is invoked SYNCHRONOUSLY while this loop is running,
        # which is exactly how eager Celery tasks execute inside tests/dev.
        first = async_tasks.run_async(probe())
        second = async_tasks.run_async(probe())
        return first, second

    first, second = asyncio.run(main())
    assert first == second == "ok"
    # Both probes ran on the same worker thread AND the same event loop -
    # no per-call thread/loop churn (the old ThreadPoolExecutor-per-call bug).
    assert len(observed) == 2
    assert observed[0] == observed[1]
    assert observed[0][0] != threading.get_ident()


def test_run_async_worker_thread_is_bounded():
    """The worker must be a single shared daemon thread."""
    worker = async_tasks._get_worker()
    again = async_tasks._get_worker()
    assert worker is again
    assert worker._thread.daemon is True


def test_run_raises_instead_of_deadlocking_on_self_reentry():
    """A post from the worker's OWN loop thread must fail fast.

    This is the CI hang shape: an eager Celery task executed inline inside
    an after_commit hook on the worker loop thread re-enters the bridge
    and blocks on a future only that same loop could resolve.
    """
    worker = _detached_worker()
    worker._thread = threading.current_thread()
    worker._loop = asyncio.new_event_loop()
    worker._ready.set()
    with pytest.raises(RuntimeError, match="deadlock"):
        worker.run(_noop_coro())
    with pytest.raises(RuntimeError, match="deadlock"):
        worker.run_with_session(lambda session: _noop_coro())


def test_worker_ready_failure_raises_instead_of_hanging(monkeypatch):
    """A worker whose engine construction fails must fail construction - a
    future silently posted to a loop whose thread died hangs forever."""
    from app.platform.persistence import session as persistence_session

    def _broken_engine():
        raise RuntimeError("engine construction failed (simulated)")

    monkeypatch.setattr(persistence_session, "build_engine", _broken_engine)
    with pytest.raises(RuntimeError, match="failed to start"):
        async_tasks._LoopWorker()


def test_post_to_dead_worker_thread_raises():
    """A future on a closed/never-running loop must raise, not hang."""
    worker = _detached_worker()
    worker._ready.set()

    worker._loop = None
    worker._failure = RuntimeError("worker died (simulated)")
    with pytest.raises(RuntimeError, match="failed to start"):
        worker._assert_ready()

    worker._failure = None
    with pytest.raises(RuntimeError, match="never started"):
        worker._assert_ready()

    worker._loop = asyncio.new_event_loop()
    worker._failure = None
    worker._thread = threading.Thread(target=lambda: None, daemon=True)
    worker._thread.start()
    worker._thread.join()
    with pytest.raises(RuntimeError, match="not running"):
        worker._assert_ready()


def _detached_worker() -> async_tasks._LoopWorker:
    """A _LoopWorker instance not wired to any real thread or loop.

    ``__new__`` skips ``__init__`` (which starts the shared singleton
    thread), so all attributes are initialised here.
    """
    worker = async_tasks._LoopWorker.__new__(async_tasks._LoopWorker)
    worker._loop = None
    worker._session_maker = None
    worker._failure = None
    worker._ready = threading.Event()
    worker._thread = None
    return worker


def _noop_coro():
    async def _inner():
        return "ok"

    return _inner()
