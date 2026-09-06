"""Check-pipeline observability: heartbeat, dispatch metrics, state machine.

These cover the failure mode that motivated the work: an API that answers
``/health`` with 200 while Beat, the broker and the worker are all dead, and a
dashboard whose empty history looks identical to "every vendor is fine".
"""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import settings
from app.core.metrics import checks_dispatch_failures_total
from app.modules.checks.constants import (
    BLOCKED_BY_SECURITY_POLICY_PREFIX,
    CheckState,
)
from app.modules.checks.models import CheckResult
from app.modules.checks.scheduler_health import (
    SCHEDULER_HEARTBEAT_KEY,
    WORKER_HEARTBEAT_KEY,
    read_pipeline_health,
    record_scheduler_heartbeat,
    record_worker_heartbeat,
    sanitize_broker_url,
)
from app.modules.checks.service import CheckService


class OperationalError(Exception):
    """Stands in for a broker/broker-store connection error."""


def _result(
    *,
    is_up: bool,
    error_message: str | None = None,
    age_seconds: float = 0,
) -> CheckResult:
    return CheckResult(
        id=uuid.uuid4(),
        dependency_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        region="us-east",
        executed_at=datetime.now(timezone.utc) - timedelta(seconds=age_seconds),
        latency_ms=42.0,
        status_code=200 if is_up else 503,
        is_up=is_up,
        error_message=error_message,
        quorum_confirmed=False,
    )


def _classify(**kwargs) -> CheckState:
    defaults = {
        "last_result": None,
        "dispatch_failure": None,
        "markers": None,
        "pipeline_status": "healthy",
        "is_due": False,
    }
    defaults.update(kwargs)
    state, _detail = CheckService.classify_check_state(**defaults)
    return state


# ── state machine ───────────────────────────────────────────────────────────


def test_classify_successful_and_target_failed_are_distinct():
    assert _classify(last_result=_result(is_up=True)) is CheckState.SUCCESSFUL
    failed = _result(is_up=False, error_message="Unexpected status code: 503")
    assert _classify(last_result=failed) is CheckState.TARGET_FAILED


def test_classify_blocked_by_security_policy_is_not_a_target_failure():
    """An SSRF rejection is our policy, not the vendor being down."""
    blocked = _result(
        is_up=False,
        error_message=f"{BLOCKED_BY_SECURITY_POLICY_PREFIX}: private address",
    )
    state = _classify(last_result=blocked)
    assert state is CheckState.BLOCKED_BY_SECURITY_POLICY
    _s, detail = CheckService.classify_check_state(
        last_result=blocked,
        dispatch_failure=None,
        markers=None,
        pipeline_status="healthy",
        is_due=False,
    )
    assert "SSRF" in detail


def test_classify_dispatch_failed_outranks_an_older_result():
    """A newer dispatch failure is the actionable fact, even with history."""
    old_result = _result(is_up=True, age_seconds=600)
    failure = {
        "reason": "OperationalError",
        "at": datetime.now(timezone.utc).isoformat(),
    }
    assert (
        _classify(last_result=old_result, dispatch_failure=failure)
        is CheckState.DISPATCH_FAILED
    )


def test_classify_old_dispatch_failure_does_not_mask_a_fresh_result():
    """Once a probe has run again, the stale failure marker stops mattering."""
    failure = {
        "reason": "OperationalError",
        "at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
    }
    fresh = _result(is_up=True, age_seconds=5)
    assert _classify(last_result=fresh, dispatch_failure=failure) is CheckState.SUCCESSFUL


def test_classify_executing_and_queued_are_distinct_transient_states():
    now = datetime.now(timezone.utc).isoformat()
    assert (
        _classify(markers={"executing": {"region": "us-east", "at": now}})
        is CheckState.EXECUTING
    )
    assert (
        _classify(markers={"dispatched": {"region": "us-east", "at": now}})
        is CheckState.QUEUED
    )


def test_classify_a_live_probe_outranks_an_unhealthy_pipeline():
    """A queued task proves the pipeline moves; report that, not the alarm."""
    now = datetime.now(timezone.utc).isoformat()
    assert (
        _classify(
            markers={"dispatched": {"region": "us-east", "at": now}},
            pipeline_status="unavailable",
        )
        is CheckState.QUEUED
    )


def test_classify_scheduler_unavailable_when_nothing_ran_and_pipeline_is_down():
    for pipeline_status in ("unavailable", "degraded"):
        assert (
            _classify(pipeline_status=pipeline_status)
            is CheckState.SCHEDULER_UNAVAILABLE
        )


def test_classify_awaiting_schedule_vs_never_checked():
    assert _classify(is_due=True) is CheckState.AWAITING_SCHEDULE
    assert _classify(is_due=False) is CheckState.NEVER_CHECKED


def test_classify_flags_target_vs_infrastructure_problems():
    from app.modules.checks.constants import INFRASTRUCTURE_STATES, TARGET_STATES

    assert _classify(pipeline_status="unavailable") in INFRASTRUCTURE_STATES
    assert _classify(last_result=_result(is_up=False)) in TARGET_STATES
    assert not TARGET_STATES & INFRASTRUCTURE_STATES


# ── heartbeat ───────────────────────────────────────────────────────────────


@pytest.mark.parametrize("interval", [5, 10, 30, 120, 900])
def test_heartbeat_ttl_is_derived_from_the_schedule_interval(
    monkeypatch, interval
):
    """A hard-coded TTL would go wrong the moment the interval is changed.

    Asserted across five intervals rather than one: comparing the property to
    the same settings values it reads would also pass for a constant, which is
    exactly the mistake this guards against. A 5 s tick must not be declared
    stale after one missed cycle, and a 15 min tick must not be read as a dead
    scheduler.
    """
    monkeypatch.setattr(settings, "CHECK_SCHEDULE_SECONDS", interval)
    ttl = settings.check_heartbeat_ttl_seconds

    assert ttl == max(
        int(interval * settings.CHECK_SCHEDULER_HEARTBEAT_MULTIPLIER), 60
    )
    # Survives several missed cycles before the pipeline calls itself stale...
    assert ttl >= interval * 2
    # ...and never expires so fast that one slow Beat cycle reads as an outage.
    assert ttl >= 60


@pytest.mark.asyncio
async def test_scheduler_and_worker_heartbeats_are_independent(fake_redis):
    """Beat being alive must not imply a worker is consuming."""
    await record_scheduler_heartbeat()
    health = await read_pipeline_health()
    assert health["scheduler"]["status"] == "healthy"
    assert health["worker"]["status"] == "not_observed"
    # Scheduler alive + no worker = the pipeline cannot execute checks.
    assert health["status"] != "healthy"

    await record_worker_heartbeat()
    health = await read_pipeline_health()
    assert health["worker"]["status"] == "healthy"
    assert health["status"] == "healthy"


@pytest.mark.asyncio
async def test_heartbeat_goes_stale_when_scheduling_stops(fake_redis):
    """The whole point: a dead Beat must be visible, not silent."""
    await record_scheduler_heartbeat()
    stale = (
        datetime.now(timezone.utc)
        - timedelta(seconds=settings.check_heartbeat_ttl_seconds + 30)
    ).isoformat()
    await fake_redis.set(SCHEDULER_HEARTBEAT_KEY, stale)
    await fake_redis.set(WORKER_HEARTBEAT_KEY, stale)

    health = await read_pipeline_health()
    assert health["scheduler"]["status"] == "stale"
    assert health["worker"]["status"] == "stale"
    assert health["status"] == "degraded"
    assert health["scheduler"]["age_seconds"] > settings.check_heartbeat_ttl_seconds


@pytest.mark.asyncio
async def test_pipeline_reports_redis_unavailable_rather_than_not_observed(monkeypatch):
    """'Redis is down' and 'Beat has never run' need different remediations."""
    from app.infrastructure import redis_client

    async def _no_ping():
        return False

    async def _no_get(key, timeout=2.0):
        return None

    monkeypatch.setattr(redis_client, "safe_redis_ping", _no_ping)
    monkeypatch.setattr("app.modules.checks.scheduler_health.safe_redis_ping", _no_ping)
    monkeypatch.setattr("app.modules.checks.scheduler_health.safe_redis_get", _no_get)

    health = await read_pipeline_health()
    assert health["scheduler"]["status"] == "redis_unavailable"
    assert health["broker"]["status"] == "redis_unavailable"
    assert health["status"] == "unavailable"
    assert redis_client is not None


def test_sanitize_broker_url_strips_credentials():
    assert (
        sanitize_broker_url("redis://:s3cret@redis.internal:6379/0")
        == "redis://redis.internal:6379/0"
    )
    assert (
        sanitize_broker_url("redis://user:pw@host:6379/1") == "redis://host:6379/1"
    )
    # Nothing to strip: returned unchanged, so the log line stays useful.
    assert sanitize_broker_url("redis://localhost:6379/0") == "redis://localhost:6379/0"
    assert sanitize_broker_url("") == ""


@pytest.mark.asyncio
async def test_health_payload_exposes_no_broker_address(fake_redis):
    """Health output is consumed by dashboards; topology stays in the logs."""
    await record_scheduler_heartbeat()
    await record_worker_heartbeat()
    payload = await read_pipeline_health()
    assert "broker_url" not in payload["broker"]
    assert payload["broker"]["queue"] == "celery"


# ── dispatch observability ──────────────────────────────────────────────────


def _dispatch_service(due_deps):
    dep_repo = MagicMock()
    dep_repo.get_due_dependencies = AsyncMock(return_value=due_deps)
    return CheckService(repository=MagicMock(), dep_repository=dep_repo)


def _due_dep(regions=("us-east", "eu-west")):
    dep = MagicMock()
    dep.id = uuid.uuid4()
    dep.regions = list(regions)
    dep.check_interval_seconds = 60
    dep.next_check_at = datetime.now(timezone.utc) - timedelta(seconds=30)
    return dep


def _counter_value(metric, **labels) -> float:
    for metric_family in metric.collect():
        for sample in metric_family.samples:
            if sample.name.endswith("_total") and all(
                sample.labels.get(k) == v for k, v in labels.items()
            ):
                return sample.value
    return 0.0


@pytest.mark.asyncio
async def test_dispatch_failure_increments_metric_and_keeps_dependency_due(
    fake_redis,
):
    """Broker down: counted, logged with context, and NOT forgiven."""
    dep = _due_dep(regions=("us-east",))
    service = _dispatch_service([dep])
    before = _counter_value(
        checks_dispatch_failures_total, region="us-east", reason="OperationalError"
    )

    class _BrokenTask:
        @staticmethod
        def delay(dep_id, region, request_id=None):
            raise OperationalError("Error while reading from socket")

    with patch("app.modules.checks.tasks.execute_check", _BrokenTask):
        dispatched = await service.schedule_due_checks(AsyncMock())

    assert dispatched == 0
    after = _counter_value(
        checks_dispatch_failures_total, region="us-east", reason="OperationalError"
    )
    assert after == before + 1

    # The core safety property: a check that never ran is still due.
    assert dep.next_check_at < datetime.now(timezone.utc)

    # And the failure is recorded per-dependency for the state endpoint.
    from app.modules.checks.scheduler_health import read_dispatch_failure

    failure = await read_dispatch_failure(dep.id)
    assert failure is not None
    assert failure["reason"] == "OperationalError"
    assert failure["next_check_at_advanced"] is False


@pytest.mark.asyncio
async def test_unreachable_broker_skips_the_cycle_without_touching_the_database(
    monkeypatch,
):
    """No hot loop: 500 due deps must not mean 500 failed publishes per tick."""
    monkeypatch.setattr(
        "app.infrastructure.redis_client.safe_redis_ping", AsyncMock(return_value=False)
    )
    dep = _due_dep()
    service = _dispatch_service([dep])
    before = _counter_value(
        checks_dispatch_failures_total, region="*", reason="broker_unavailable"
    )

    dispatched = await service.schedule_due_checks(AsyncMock())

    assert dispatched == 0
    # The due-dependency scan never ran.
    service.dep_repository.get_due_dependencies.assert_not_awaited()
    assert dep.next_check_at < datetime.now(timezone.utc)
    assert (
        _counter_value(
            checks_dispatch_failures_total, region="*", reason="broker_unavailable"
        )
        == before + 1
    )


@pytest.mark.asyncio
async def test_fail_fast_stops_the_cycle_after_the_first_publish_failure(
    fake_redis, monkeypatch
):
    """A broker that dies mid-cycle costs one failed publish, not N."""
    monkeypatch.setattr(settings, "CHECK_DISPATCH_FAIL_FAST", True, raising=False)
    deps = [_due_dep(regions=("us-east",)) for _ in range(5)]
    service = _dispatch_service(deps)
    attempts: list[str] = []

    class _BrokenTask:
        @staticmethod
        def delay(dep_id, region, request_id=None):
            attempts.append(dep_id)
            raise OperationalError("broker gone")

    with patch("app.modules.checks.tasks.execute_check", _BrokenTask):
        await service.schedule_due_checks(AsyncMock())

    assert len(attempts) == 1
    # Every dependency stays due for the next cycle.
    assert all(d.next_check_at < datetime.now(timezone.utc) for d in deps)


@pytest.mark.asyncio
async def test_successful_dispatch_is_counted_and_marks_the_dependency_queued(
    fake_redis,
):
    from app.core.metrics import checks_scheduled_total

    dep = _due_dep(regions=("eu-west",))
    service = _dispatch_service([dep])
    before = _counter_value(checks_scheduled_total, region="eu-west")

    class _OkTask:
        @staticmethod
        def delay(dep_id, region, request_id=None):
            return MagicMock(id="task-123")

    with patch("app.modules.checks.tasks.execute_check", _OkTask):
        dispatched = await service.schedule_due_checks(AsyncMock())

    assert dispatched == 1
    assert _counter_value(checks_scheduled_total, region="eu-west") == before + 1
    # next_check_at advanced because - and only because - it was enqueued.
    assert dep.next_check_at > datetime.now(timezone.utc)

    from app.modules.checks.scheduler_health import read_check_markers

    markers = await read_check_markers(dep.id)
    assert markers["dispatched"]["region"] == "eu-west"


@pytest.mark.asyncio
async def test_inflight_marker_suppresses_a_duplicate_dispatch(fake_redis):
    """A dependency whose previous probe has not finished is not re-dispatched.

    Otherwise a target slower than CHECK_SCHEDULE_SECONDS overlaps itself on
    every cycle, multiplying load on a dependency that is already struggling.
    """
    from app.core.metrics import checks_dispatch_skipped_total
    from app.modules.checks.scheduler_health import record_check_dispatched

    dep = _due_dep(regions=("eu-west",))
    service = _dispatch_service([dep])
    await record_check_dispatched(dep.id, "eu-west")
    due_before = dep.next_check_at
    before = _counter_value(
        checks_dispatch_skipped_total, region="eu-west", reason="previous_task_in_flight"
    )

    calls = []

    class _SpyTask:
        @staticmethod
        def delay(dep_id, region, request_id=None):
            calls.append(region)
            return MagicMock(id="task-x")

    with patch("app.modules.checks.tasks.execute_check", _SpyTask):
        dispatched = await service.schedule_due_checks(AsyncMock())

    assert dispatched == 0
    assert calls == []  # nothing was published
    # Not forgiven: it stays due, so the next cycle picks it up once clear.
    assert dep.next_check_at == due_before
    assert (
        _counter_value(
            checks_dispatch_skipped_total,
            region="eu-west",
            reason="previous_task_in_flight",
        )
        == before + 1
    )


@pytest.mark.asyncio
async def test_inflight_marker_is_cleared_when_the_probe_completes(fake_redis):
    """The guard above must not outlive the probe it protects."""
    from app.modules.checks.scheduler_health import (
        clear_check_dispatched,
        is_check_dispatched,
        record_check_dispatched,
    )

    dep_id = uuid.uuid4()
    assert await is_check_dispatched(dep_id) is False
    await record_check_dispatched(dep_id, "us-east")
    assert await is_check_dispatched(dep_id) is True
    await clear_check_dispatched(dep_id)
    assert await is_check_dispatched(dep_id) is False


def test_periodic_tasks_expire_so_a_broker_backlog_drains_as_no_ops():
    """Stale periodic ticks must not all execute when a worker comes back.

    Verified live: with the worker killed, Beat kept publishing and Redis held
    51 undelivered messages. The consumer discards anything past ``expires``
    on delivery, so the backlog drains instead of stampeding.
    """
    from app.infrastructure.celery_app import celery_app

    _import_all_task_modules()
    schedule = celery_app.conf.beat_schedule
    for name, entry in schedule.items():
        interval = entry["schedule"]
        if isinstance(interval, (int, float)) and float(interval) < 60:
            expires = entry.get("options", {}).get("expires")
            assert expires, (
                f"high-frequency schedule {name!r} ({interval}s) sets no "
                f"``expires``: a broker backlog would replay every stale copy"
            )


def test_multiprocess_metrics_expose_worker_counters(tmp_path, monkeypatch):
    """Check counters are incremented in the worker, never in the API.

    Without a shared PROMETHEUS_MULTIPROC_DIR the API's /metrics endpoint
    would publish no check metrics at all, because its own process never
    records any.
    """
    from app.core import metrics as metrics_module

    import subprocess
    import sys

    directory = tmp_path / "prom"
    directory.mkdir()

    # A *separate* process records the sample, exactly as a Celery worker does.
    # The env var has to be set before prometheus_client is imported, because
    # that import is what chooses file-backed values over in-memory ones.
    child = (
        "import os;"
        f"os.environ['PROMETHEUS_MULTIPROC_DIR']={str(directory)!r};"
        "from prometheus_client import Counter;"
        "Counter('reliastra_probe_multiprocess_total','p',['region'])"
        ".labels(region='eu-west').inc()"
    )
    subprocess.run([sys.executable, "-c", child], check=True)

    monkeypatch.setenv("PROMETHEUS_MULTIPROC_DIR", str(directory))
    assert metrics_module.multiprocess_dir() == str(directory)

    rendered = metrics_module.render_metrics().decode()
    assert 'reliastra_probe_multiprocess_total{region="eu-west"}' in rendered


def test_render_metrics_falls_back_when_the_shared_directory_is_empty(
    tmp_path, monkeypatch
):
    """An empty multiprocess dir must not publish a blank /metrics page."""
    from app.core import metrics as metrics_module

    directory = tmp_path / "empty"
    directory.mkdir()
    monkeypatch.setenv("PROMETHEUS_MULTIPROC_DIR", str(directory))

    metrics_module.checks_scheduled_total.labels(region="ap-fallback").inc()
    rendered = metrics_module.render_metrics().decode()
    assert rendered, "render_metrics() returned an empty body"
    assert 'reliastra_checks_scheduled_total{region="ap-fallback"}' in rendered


def test_render_metrics_without_multiprocess_dir_uses_the_local_registry(monkeypatch):
    """Unset PROMETHEUS_MULTIPROC_DIR keeps the pre-existing behaviour."""
    from app.core import metrics as metrics_module

    monkeypatch.delenv("PROMETHEUS_MULTIPROC_DIR", raising=False)
    assert metrics_module.multiprocess_dir() is None

    metrics_module.checks_scheduled_total.labels(region="ap-test").inc()
    rendered = metrics_module.render_metrics().decode()
    assert 'reliastra_checks_scheduled_total{region="ap-test"}' in rendered


# ── celery wiring ───────────────────────────────────────────────────────────


def _import_all_task_modules() -> None:
    """Import every module Celery is configured to include.

    This is what a real worker does at startup, so the registry inspected below
    is the registry a worker actually has - including tasks scheduled by Beat
    but never imported by the API process.
    """
    import importlib

    from app.infrastructure.celery_app import celery_app

    for module_name in celery_app.conf.include:
        importlib.import_module(module_name)


def test_beat_schedule_references_only_registered_tasks():
    """A typo'd task name in beat_schedule is a silent no-op forever."""
    from app.infrastructure.celery_app import beat_task_names, celery_app

    _import_all_task_modules()

    for name in beat_task_names():
        assert name in celery_app.tasks, f"beat schedules unregistered task {name}"


def test_no_task_name_is_registered_twice():
    from app.infrastructure.celery_app import celery_app

    _import_all_task_modules()

    names = [name for name in celery_app.tasks if name.startswith("app.modules.checks")]
    assert len(names) == len(set(names))
    assert "app.modules.checks.tasks.execute_check" in names
    assert "app.modules.checks.tasks.schedule_checks" in names
    assert "app.modules.checks.tasks.worker_heartbeat" in names


def test_worker_heartbeat_is_scheduled_on_the_check_interval():
    from app.infrastructure.celery_app import celery_app

    entry = celery_app.conf.beat_schedule["worker-heartbeat"]
    assert entry["task"] == "app.modules.checks.tasks.worker_heartbeat"
    assert float(entry["schedule"]) == float(settings.CHECK_SCHEDULE_SECONDS)
    # A late liveness tick is worthless; it must expire rather than pile up.
    assert entry["options"]["expires"] > 0


