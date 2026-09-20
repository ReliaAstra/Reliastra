"""Celery trace propagation (checks pipeline exemplar).

The scheduler dispatches probes that join its trace; a worker executing an
old message (no trace kwargs) still runs under a fresh trace instead of
crashing. Other pipelines follow the same three lines; this file locks the
contract for the exemplar.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.platform.observability.tracing import (
    TRACE_KWARG,
    get_trace_context,
    new_trace,
    parse_traceparent,
    reset_trace_context,
    set_trace_context,
)


@pytest.mark.asyncio
async def test_schedule_dispatch_passes_trace_kwargs_to_delay():
    """schedule_due_checks publishes execute_check with trace context."""
    import uuid

    from app.modules.checks import dispatch as dispatch_module
    from app.modules.checks import service as service_module

    token = set_trace_context(new_trace())
    try:
        parent_trace = get_trace_context().trace_id
        dep = MagicMock()
        dep.id = uuid.uuid4()
        dep.regions = ["us-east"]
        dep.check_interval_seconds = 60

        svc = service_module.CheckService(
            repository=MagicMock(), dep_repository=MagicMock()
        )
        svc.dep_repository.get_due_dependencies = AsyncMock(return_value=[dep])

        with (
            patch.object(
                dispatch_module.circuit_breaker,
                "should_dispatch",
                new=AsyncMock(return_value=True),
            ),
            patch(
                "app.modules.checks.scheduler_health.is_check_dispatched",
                new=AsyncMock(return_value=False),
            ),
            patch(
                "app.modules.checks.scheduler_health.record_check_dispatched",
                new=AsyncMock(),
            ),
            patch(
                "app.modules.checks.scheduler_health.record_dispatch_failure",
                new=AsyncMock(),
            ),
            patch(
                "app.modules.checks.tasks.execute_check"
            ) as execute_check_task,
        ):
            await svc.schedule_due_checks(AsyncMock())

        assert execute_check_task.delay.called
        _, kwargs = execute_check_task.delay.call_args
        assert TRACE_KWARG in kwargs
        assert parse_traceparent(kwargs[TRACE_KWARG]).trace_id == parent_trace
    finally:
        reset_trace_context(token)


def test_execute_check_joins_the_dispatched_trace():
    """The worker restores the scheduler's trace before doing anything."""
    from app.modules.checks import tasks as tasks_module

    scheduler_trace = new_trace()
    child = scheduler_trace.child()
    with patch.object(
        tasks_module, "async_task_body", return_value={"ok": True}
    ) as body:
        tasks_module.execute_check(
            dependency_id="00000000-0000-0000-0000-000000000000",
            region="us-east",
            request_id="req-dispatch",
            _traceparent=(
                f"00-{child.trace_id}-{child.span_id}-01"
            ),
        )
    assert body.called
    # restore_task_context ran in this thread before the bridge was entered.
    from app.platform.observability.context import get_request_id

    assert get_trace_context().trace_id == scheduler_trace.trace_id
    assert get_request_id() == "req-dispatch"
    set_trace_context(None)


def test_execute_check_without_trace_kwargs_starts_fresh():
    """Backward compatibility: old/Beat messages carry no trace kwargs."""
    from app.modules.checks import tasks as tasks_module

    assert get_trace_context() is None
    with patch.object(
        tasks_module, "async_task_body", return_value=None
    ):
        tasks_module.execute_check(
            dependency_id="00000000-0000-0000-0000-000000000000",
            region="us-east",
        )
    assert get_trace_context() is not None
    set_trace_context(None)
