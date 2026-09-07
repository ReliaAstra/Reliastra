"""Liveness and health state for the check-execution pipeline.

The pipeline is: Celery Beat → ``schedule_checks`` → ``schedule_due_checks`` →
broker → Celery worker → ``execute_check`` → ``CheckResult``.

Every one of those hops can fail while the API keeps answering ``/health`` with
``200 ok``, and the customer-visible symptom is identical to "this vendor has
been perfectly quiet": an empty check history. This module exists so that state
is a queryable fact instead of an inference.

Redis is used for the heartbeats because Redis *is* the operational dependency
of the pipeline (broker and result backend). A heartbeat store that outlives a
Redis outage would report a healthy scheduler on a broker that cannot deliver
anything, which is worse than no heartbeat at all.

Three independent liveness signals are recorded, because they fail
independently:

``scheduler``
    Written by ``schedule_checks`` after a completed Beat cycle. Absent/stale
    means Beat is not running (or cannot reach the DB).
``worker``
    Written by a worker when it executes ``worker_heartbeat`` - a task Beat
    enqueues on the same interval. This is the only signal that proves the
    *whole* path Beat → broker → worker is flowing; Beat can be healthy while
    no worker consumes a thing.
``broker``
    A live reachability probe plus the depth of the queue list. A growing depth
    with a stale worker heartbeat is "tasks are queued and nobody is running
    them".
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.config import settings
from app.core.metrics import check_scheduler_cycles_total
from app.infrastructure.redis_client import (
    get_redis,
    safe_redis_get,
    safe_redis_ping,
    safe_redis_setex,
)

logger = logging.getLogger(__name__)

SCHEDULER_HEARTBEAT_KEY = "reliastra:checks:scheduler:last_heartbeat"
WORKER_HEARTBEAT_KEY = "reliastra:checks:worker:last_heartbeat"
DISPATCH_FAILURE_KEY_PREFIX = "reliastra:checks:dispatch_failure:"

#: TTL for the per-dependency "we tried to dispatch and could not" marker.
#: Long enough to survive several Beat cycles so the diagnostic endpoint can
#: still explain an empty history, short enough to self-heal once dispatch
#: recovers.
DISPATCH_FAILURE_TTL_SECONDS = 3600

#: Statuses shared by the scheduler and worker signals.
STATUS_HEALTHY = "healthy"
STATUS_STALE = "stale"
STATUS_NOT_OBSERVED = "not_observed"
STATUS_REDIS_UNAVAILABLE = "redis_unavailable"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _default_queue_name() -> str:
    """Celery queue name the checks tasks are published to.

    Read from the live Celery configuration when it is importable (the API
    process does not import Celery eagerly), falling back to Celery's own
    default so the queue-depth probe never reports on the wrong list.
    """
    try:  # pragma: no cover - import cost only
        from app.infrastructure.celery_app import celery_app

        return str(celery_app.conf.task_default_queue or "celery")
    except Exception:  # pragma: no cover - never break a health probe
        return "celery"


def sanitize_broker_url(url: str) -> str:
    """Strip credentials from a broker/result-backend URL.

    Health output is read by dashboards, on-call engineers and sometimes
    customers. ``redis://:password@host:6379/0`` must never leave the process.
    """
    if not url:
        return ""
    try:
        from urllib.parse import urlsplit, urlunsplit

        parts = urlsplit(url)
        if not parts.username and not parts.password:
            return url
        host = parts.hostname or ""
        if parts.port:
            host = f"{host}:{parts.port}"
        return urlunsplit((parts.scheme, host, parts.path, parts.query, parts.fragment))
    except Exception:  # pragma: no cover - defensive: never leak on a parse error
        return "<redacted>"


async def _write_heartbeat(key: str, label: str) -> bool:
    """Write one heartbeat with a TTL derived from the scheduling interval."""
    ttl = settings.check_heartbeat_ttl_seconds
    ok = await safe_redis_setex(key, ttl, _utcnow().isoformat())
    if not ok:
        # A heartbeat that cannot be written is itself an incident: the
        # pipeline may be running fine while becoming invisible.
        logger.warning(
            "Could not write %s heartbeat to Redis (key=%s ttl=%ss) - "
            "scheduler health will read as unavailable",
            label,
            key,
            ttl,
        )
    return ok


async def record_scheduler_heartbeat() -> bool:
    """Record that one Beat scheduling cycle completed.

    Called at the end of every successful ``schedule_checks`` run.
    """
    return await _write_heartbeat(SCHEDULER_HEARTBEAT_KEY, "scheduler")


async def record_worker_heartbeat() -> bool:
    """Record that a worker consumed a task from the broker.

    Written by the ``worker_heartbeat`` task, which Beat enqueues on the same
    interval as ``schedule_checks``.
    """
    return await _write_heartbeat(WORKER_HEARTBEAT_KEY, "worker")


def record_scheduler_cycle(result: str) -> None:
    """Count a Beat cycle outcome for Prometheus (``ok`` / ``redis_unavailable``)."""
    try:
        check_scheduler_cycles_total.labels(result=result).inc()
    except Exception:  # pragma: no cover - metrics must never break scheduling
        logger.debug("could not record scheduler cycle metric", exc_info=True)


async def record_dispatch_failure(
    dependency_id: Any,
    region: str,
    reason: str,
    detail: str,
) -> bool:
    """Remember that dispatch failed for one dependency.

    This is what lets the diagnostic endpoint tell an operator "RELIASTRA tried
    to probe this and could not" apart from "this has never been probed".
    Only non-sensitive context is stored: ids, region, exception type and the
    exception's own message (never request headers or credentials).
    """
    import json

    payload = json.dumps(
        {
            "dependency_id": str(dependency_id),
            "region": region,
            "reason": reason,
            "detail": detail[:200],
            "at": _utcnow().isoformat(),
            "next_check_at_advanced": False,
        }
    )
    key = f"{DISPATCH_FAILURE_KEY_PREFIX}{dependency_id}"
    return await safe_redis_setex(key, DISPATCH_FAILURE_TTL_SECONDS, payload)


async def read_dispatch_failure(dependency_id: Any) -> dict[str, Any] | None:
    """Return the last recorded dispatch failure for a dependency, if any."""
    import json

    raw = await safe_redis_get(f"{DISPATCH_FAILURE_KEY_PREFIX}{dependency_id}")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:  # pragma: no cover - malformed marker is not worth raising
        logger.debug("malformed dispatch-failure marker", exc_info=True)
        return None


async def _read_signal(key: str, label: str) -> dict[str, Any]:
    """Read one heartbeat and classify it."""
    interval = float(settings.CHECK_SCHEDULE_SECONDS)
    ttl = settings.check_heartbeat_ttl_seconds
    base: dict[str, Any] = {
        "status": STATUS_NOT_OBSERVED,
        "last_heartbeat": None,
        "age_seconds": None,
        "interval_seconds": interval,
        "stale_after_seconds": ttl,
    }

    raw = await safe_redis_get(key)
    if raw is None:
        # Distinguish "Redis is down" from "nobody has ever written this key":
        # they have completely different remediations.
        if not await safe_redis_ping():
            base["status"] = STATUS_REDIS_UNAVAILABLE
        return base

    try:
        last = datetime.fromisoformat(raw)
    except ValueError:  # pragma: no cover - corrupt marker
        base["status"] = STATUS_NOT_OBSERVED
        return base
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)

    age = (_utcnow() - last).total_seconds()
    base["last_heartbeat"] = last.isoformat()
    base["age_seconds"] = round(max(age, 0.0), 1)
    base["status"] = STATUS_HEALTHY if age <= ttl else STATUS_STALE
    logger.debug("%s heartbeat age=%.1fs ttl=%ss", label, age, ttl)
    return base


async def _read_broker() -> dict[str, Any]:
    """Probe broker reachability and queue depth."""
    reachable = await safe_redis_ping()
    # The broker URL is deliberately NOT part of this payload: it is
    # infrastructure topology (and may carry credentials) that a health
    # consumer has no use for. ``sanitize_broker_url`` exists for log lines.
    info: dict[str, Any] = {
        "status": STATUS_HEALTHY if reachable else STATUS_REDIS_UNAVAILABLE,
        "queue": _default_queue_name(),
        "queue_depth": None,
    }
    if not reachable:
        return info
    try:
        import asyncio

        depth = await asyncio.wait_for(
            get_redis().llen(info["queue"]), timeout=2.0
        )
        info["queue_depth"] = int(depth)
    except Exception as exc:  # pragma: no cover - depth is best-effort
        logger.debug("could not read queue depth: %s", exc)
    return info


async def read_pipeline_health() -> dict[str, Any]:
    """Full check-pipeline health snapshot for the diagnostic endpoint.

    ``status`` is ``healthy`` only when the scheduler, the worker and the
    broker are all healthy. ``unavailable`` means the pipeline cannot dispatch
    at all; ``degraded`` means something in it is not currently proven alive.
    """
    scheduler = await _read_signal(SCHEDULER_HEARTBEAT_KEY, "scheduler")
    worker = await _read_signal(WORKER_HEARTBEAT_KEY, "worker")
    broker = await _read_broker()

    statuses = {scheduler["status"], worker["status"], broker["status"]}
    if STATUS_REDIS_UNAVAILABLE in statuses or broker["status"] != STATUS_HEALTHY:
        overall = "unavailable"
    elif statuses == {STATUS_HEALTHY}:
        overall = STATUS_HEALTHY
    else:
        overall = "degraded"

    return {
        "status": overall,
        "scheduler": scheduler,
        "worker": worker,
        "broker": broker,
        "config": {
            "check_schedule_seconds": float(settings.CHECK_SCHEDULE_SECONDS),
            "heartbeat_ttl_seconds": settings.check_heartbeat_ttl_seconds,
            "scheduler": "celery-beat",
            "task": "app.modules.checks.tasks.schedule_checks",
        },
    }


# ── Per-dependency pipeline position ────────────────────────────────────────
# Two short-lived markers answer "where is this dependency's probe right now?".
# Both are strictly best-effort: a marker that cannot be written costs some
# diagnostic precision and must never affect scheduling or the probe itself.
DISPATCHED_KEY_PREFIX = "reliastra:checks:dispatched:"
EXECUTING_KEY_PREFIX = "reliastra:checks:executing:"


def _marker_ttl_seconds() -> int:
    """A dispatched-but-unconsumed marker must outlive one scheduling cycle.

    Bounded below so a very short ``CHECK_SCHEDULE_SECONDS`` cannot expire the
    marker before a worker has had a chance to pick the task up.
    """
    return max(int(settings.CHECK_SCHEDULE_SECONDS * 4), 300)


async def _write_marker(prefix: str, dependency_id: Any, payload: dict[str, Any], ttl: int) -> bool:
    import json

    return await safe_redis_setex(
        f"{prefix}{dependency_id}", ttl, json.dumps(payload)
    )


async def record_check_dispatched(dependency_id: Any, region: str) -> bool:
    """Mark that a probe task for *dependency_id* was published to the broker."""
    return await _write_marker(
        DISPATCHED_KEY_PREFIX,
        dependency_id,
        {"region": region, "at": _utcnow().isoformat()},
        _marker_ttl_seconds(),
    )


async def record_check_executing(dependency_id: Any, region: str) -> bool:
    """Mark that a worker has started the probe.

    TTL is the task's hard time limit: if the worker dies mid-probe the marker
    expires instead of claiming "executing" forever.
    """
    return await _write_marker(
        EXECUTING_KEY_PREFIX,
        dependency_id,
        {"region": region, "at": _utcnow().isoformat()},
        max(int(settings.CELERY_TASK_TIME_LIMIT), 60),
    )


async def clear_check_executing(dependency_id: Any) -> bool:
    """Drop the executing marker once the probe has produced a result."""
    from app.infrastructure.redis_client import safe_redis_delete

    return await safe_redis_delete(f"{EXECUTING_KEY_PREFIX}{dependency_id}")


async def is_check_dispatched(dependency_id: Any) -> bool:
    """True when a probe task for *dependency_id* is still in flight.

    The marker is written when ``execute_check`` is published to the broker and
    cleared when the probe finishes, with a TTL as a backstop for a worker that
    dies without clearing it.

    This is what stops the queue from growing without bound while no worker is
    consuming. ``task_acks_late`` and ``task_reject_on_worker_lost`` mean an
    unconsumed task stays queued and *will* run once a worker returns, so
    republishing it on every Beat cycle would pile up duplicates of work that
    is already guaranteed to happen. The scheduler therefore skips a dependency
    whose previous task has not completed yet and leaves it due.

    A Redis read failure returns False (dispatch normally) rather than silently
    freezing every dependency - the queue-depth signal in ``/health/checks``
    still reports the underlying outage.
    """
    from app.infrastructure.redis_client import safe_redis_exists

    return bool(await safe_redis_exists(f"{DISPATCHED_KEY_PREFIX}{dependency_id}"))


async def clear_check_dispatched(dependency_id: Any) -> bool:
    """Drop the in-flight marker once the probe has completed."""
    from app.infrastructure.redis_client import safe_redis_delete

    return await safe_redis_delete(f"{DISPATCHED_KEY_PREFIX}{dependency_id}")


async def _read_marker(prefix: str, dependency_id: Any) -> dict[str, Any] | None:
    import json

    raw = await safe_redis_get(f"{prefix}{dependency_id}")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:  # pragma: no cover - a corrupt marker is not worth raising
        return None


async def read_check_markers(dependency_id: Any) -> dict[str, Any]:
    """Return the dispatched/executing markers for one dependency."""
    return {
        "dispatched": await _read_marker(DISPATCHED_KEY_PREFIX, dependency_id),
        "executing": await _read_marker(EXECUTING_KEY_PREFIX, dependency_id),
    }
