import logging
from celery import Celery
from kombu import Queue
from celery.schedules import crontab
from celery.signals import (
    task_postrun,
    task_prerun,
    task_failure,
    worker_process_init,
)
from app.config import settings
from app.core.logging import configure_logging

configure_logging()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Import EVERY model module so the SQLAlchemy metadata (and FK graph) is
# complete inside the worker process.  Without this, any ORM flush that
# touches a cross-module FK fails with
# ``NoReferencedTableError: could not find table 'applications'`` - the
# worker's ``schedule_checks`` task would fail for every due dependency.
# The API process happens to work only because uvicorn's app import pulls in
# all routers (and therefore all models) transitively.
# ---------------------------------------------------------------------------
from app.modules import (  # noqa: F401
    admin,
    agencies,
    ai_integration,
    api_keys,
    attribution,
    auth,
    badges,
    billing,
    checks,
    dashboard,
    dependencies,
    evidence,
    evidence_gate,
    incidents,
    notifications,
    observations,
    organizations,
    partners,
    referrals,
    status_pages,
    timeline_share,
    users,
    vendor_submissions,
    vendors,
    webhooks,
)
from app.modules.admin import models as _admin_models  # noqa: F401
from app.modules.agencies import models as _agency_models  # noqa: F401
from app.modules.api_keys import models as _apikey_models  # noqa: F401
from app.modules.attribution import models as _attribution_models  # noqa: F401
from app.modules.auth import models as _auth_models  # noqa: F401
from app.modules.badges import models as _badge_models  # noqa: F401
from app.modules.billing import models as _billing_models  # noqa: F401
from app.modules.checks import models as _check_models  # noqa: F401
from app.modules.dependencies import models as _dep_models  # noqa: F401
from app.modules.evidence import models as _evidence_models  # noqa: F401
from app.modules.evidence_gate import models as _gate_models  # noqa: F401
from app.modules.incidents import models as _incident_models  # noqa: F401
from app.modules.notifications import models as _notif_models  # noqa: F401
from app.modules.observations import models as _obs_models  # noqa: F401
from app.modules.organizations import models as _org_models  # noqa: F401
from app.modules.partners import models as _partner_models  # noqa: F401
from app.modules.referrals import models as _referral_models  # noqa: F401
from app.modules.status_pages import models as _status_models  # noqa: F401
from app.modules.timeline_share import models as _timeline_models  # noqa: F401
from app.modules.users import models as _user_models  # noqa: F401
from app.modules.vendor_submissions import models as _submission_models  # noqa: F401
from app.modules.vendors import models as _vendor_models  # noqa: F401
from app.modules.webhooks import models as _webhook_models  # noqa: F401

celery_app = Celery(
    "reliastra",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.modules.checks.tasks",
        "app.modules.vendors.tasks",
        "app.modules.incidents.tasks",
        "app.modules.evidence.tasks",
        "app.modules.notifications.tasks",
        "app.modules.observations.tasks",
        "app.modules.api_keys.tasks",
        "app.modules.billing.tasks",
        "app.modules.partners.tasks",
        "app.modules.email_events.tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_always_eager=False,  # Can be set to True in tests
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_soft_time_limit=settings.CELERY_TASK_SOFT_TIME_LIMIT,
    task_time_limit=settings.CELERY_TASK_TIME_LIMIT,
    # ── Explicit queue + broker behaviour ───────────────────────────────────
    # The queue name is part of the observability contract (the health probe
    # reports its depth), so it is pinned rather than inherited from a default.
    # Real kombu Queue objects with distinct routing keys keep regional jobs
    # off the control queue on multi-host fleets (workers there consume only
    # their physical region via -Q).
    #
    # SINGLE-HOST NOTE: there is deliberately NO task_routes table. The
    # all-in-one deployment runs one worker consuming the default queue; any
    # route to checks.{region} would pile tasks onto a queue nothing consumes
    # (invisible to the celery-queue depth probe) - a total monitoring
    # blackout. Region stays a task-level label. Reintroduce routing only
    # together with per-region workers (-Q) and a multi-queue health probe.
    task_default_queue="celery",
    task_queues=(Queue('celery', routing_key='celery'), Queue(f'checks.{settings.CHECK_WORKER_REGION}', routing_key=f'checks.{settings.CHECK_WORKER_REGION}')),
    task_create_missing_queues=True,
    # ``acks_late`` plus this: a worker killed mid-probe returns the task to
    # the queue instead of losing it. Re-execution is idempotent by
    # construction - each probe writes one CheckResult row keyed on its own
    # uuid, so a duplicate is a duplicate observation, not corruption.
    task_reject_on_worker_lost=True,
    # Broker connection handling: bounded and fast. Celery's defaults retry a
    # dead broker for minutes inside a Beat tick, which is exactly the window
    # in which the pipeline looks alive while doing nothing.
    broker_connection_retry=True,
    broker_connection_max_retries=3,
    broker_connection_timeout=5,
    broker_transport_options={
        "visibility_timeout": max(int(settings.CELERY_TASK_TIME_LIMIT * 2), 300),
        "socket_connect_timeout": 5,
        "socket_timeout": 5,
    },
    result_backend_transport_options={
        "socket_connect_timeout": 5,
        "socket_timeout": 5,
        "retry_on_timeout": True,
    },
    # Check results are persisted in Postgres, so broker-stored task results
    # are only useful for immediate inspection.
    result_expires=3600,
    # Recycle prefork children so a leaked httpx/asyncpg connection cannot
    # accumulate forever in a long-lived worker.
    worker_max_tasks_per_child=1000,
    worker_send_task_events=True,
    task_send_sent_event=True,
    beat_schedule={
        'public-vendor-checks': {
            'task': 'app.modules.vendors.tasks.schedule_vendor_checks',
            'schedule': float(settings.CHECK_SCHEDULE_SECONDS),
            'options': {'expires': 60},
        },
        # Interval is env-configurable (CHECK_SCHEDULE_SECONDS).
        "schedule-checks-periodic": {
            "task": "app.modules.checks.tasks.schedule_checks",
            "schedule": float(settings.CHECK_SCHEDULE_SECONDS),
            # A scheduling tick that runs late is worthless: it would describe
            # the world as of a moment that has already passed, and a backlog
            # of them would stampede the broker when it recovers.
            "options": {"expires": max(int(settings.CHECK_SCHEDULE_SECONDS * 2), 60)},
        },
        # Worker liveness. Published on the same interval as the scheduler so
        # "Beat is alive" and "a worker consumes" are separately observable.
        "worker-heartbeat": {
            "task": "app.modules.checks.tasks.worker_heartbeat",
            "schedule": float(settings.CHECK_SCHEDULE_SECONDS),
            "options": {"expires": max(int(settings.CHECK_SCHEDULE_SECONDS * 2), 60)},
        },
        "observation-outbox-process": {
            "task": "app.modules.observations.tasks.process_outbox",
            "schedule": 10.0,
            # Same reasoning as the two above: a backlog of identical outbox
            # drains is pure waste, and the newest one processes everything
            # the older ones would have.
            "options": {"expires": 60},
        },
        # Evidence generation is published from an ``after_commit`` hook, so a
        # broker outage at the moment an incident resolves means the task was
        # never enqueued and nothing records that. This sweep is the recovery
        # path: it retries incidents stuck in ``failed``/``pending`` and any
        # ``generating`` attempt older than the task's own time limit.
        # Idempotent generation makes the sweep safe to run blindly.
        "evidence-generation-retry": {
            "task": "app.modules.evidence.tasks.retry_failed_evidence_generation",
            "schedule": 300.0,
            "options": {"expires": 240},
        },
        "retention-cleanup-monthly": {
            "task": "app.modules.observations.tasks.retention_cleanup",
            "schedule": crontab(minute=0, hour=3, day_of_month=1),
        },
        "aggregate-observation-daily": {
            "task": "app.modules.observations.tasks.daily_aggregation",
            "schedule": crontab(minute=0, hour=4),
        },
        # Proof 7: was monthly (day 1 only). If Beat misses that single run,
        # inserts fall into the DEFAULT partition and pruning degrades. Run
        # daily - CREATE IF NOT EXISTS is cheap and idempotent; the task
        # ensures 12 months ahead so a single missed day is harmless.
        "ensure-check-partitions-monthly": {
            "task": "app.modules.checks.tasks.ensure_check_result_partitions",
            "schedule": crontab(minute=0, hour=2),
        },
        "flush-api-key-last-used": {
            "task": "app.modules.api_keys.tasks.flush_api_key_last_used",
            "schedule": 300.0,
        },
        # ── Partner referral ─────────────────────────────────────────
        # Promote pending -> payable once the hold period has elapsed.
        "partner-commission-hold-release": {
            "task": "app.modules.partners.tasks.commission_hold_release",
            "schedule": crontab(minute=15, hour=1),
        },
        # ── Trial lifecycle ─────────────────────────────────────────
        # One email per organization whose 14-day trial has ended
        # (idempotent via Redis SET NX; see billing.tasks).
        "trial-expiration-notify": {
            "task": "app.modules.billing.tasks.notify_trial_expirations",
            "schedule": crontab(minute=30, hour=2),
        },
        # Advance notice 3 days before the full-access evaluation ends, so
        # the customer can decide before capabilities pause.
        "trial-ending-reminder": {
            "task": "app.modules.billing.tasks.notify_trial_ending_soon",
            "schedule": crontab(minute=35, hour=2),
        },
        # Renewal notice for active paid subscriptions: date + the exact
        # amount and currency that will be charged.
        "billing-renewal-reminder": {
            "task": "app.modules.billing.tasks.notify_upcoming_renewals",
            "schedule": crontab(minute=40, hour=2),
        },
    },
)


# ---------------------------------------------------------------------------
# Distributed tracing + Prometheus instrumentation for every Celery task.
# ---------------------------------------------------------------------------

@task_prerun.connect
def _on_task_prerun(task_id=None, task=None, args=None, kwargs=None, **extra):
    request_id = (kwargs or {}).get("request_id")
    logger.info(
        "Celery task starting: name=%s id=%s request_id=%s",
        task.name if task else "unknown",
        task_id,
        request_id or "-",
    )


@task_postrun.connect
def _on_task_postrun(task_id=None, task=None, state=None, **extra):
    try:
        from app.core.metrics import celery_tasks_total

        celery_tasks_total.labels(
            task=task.name if task else "unknown", status=state or "unknown"
        ).inc()
    except Exception:  # pragma: no cover - metrics must never break tasks
        pass


@task_failure.connect
def _on_task_failure(task_id=None, task=None, exception=None, **extra):
    try:
        from app.core.metrics import celery_tasks_total

        celery_tasks_total.labels(
            task=task.name if task else "unknown", status="failure"
        ).inc()
    except Exception:  # pragma: no cover - metrics must never break tasks
        pass
    logger.warning(
        "Celery task failed: name=%s id=%s error=%s",
        task.name if task else "unknown",
        task_id,
        exception,
    )


# ---------------------------------------------------------------------------
# Proof 6 - Fork safety: Celery prefork forks child processes after the parent
# may have created a global engine / process-cached loop. asyncpg connections
# are bound to the loop that created them, so the child must drop any
# inherited pool and loop. Without this, schedule_checks silently returns 0:
# "Task got Future attached to a different loop".
# ---------------------------------------------------------------------------
@worker_process_init.connect
def _on_worker_process_init(**kwargs):
    logger.info("Celery worker process init: resetting DB engine and async loop for fork safety")
    try:
        from app.db.session import reset_engine

        reset_engine()
    except Exception as exc:  # pragma: no cover - never break worker startup
        logger.debug("reset_engine during worker_process_init failed: %s", exc, exc_info=True)
    try:
        from app.infrastructure import async_tasks

        async_tasks._reset_for_fork()
    except Exception as exc:  # pragma: no cover
        logger.debug("_reset_for_fork failed: %s", exc, exc_info=True)


# ---------------------------------------------------------------------------
# Bounded broker probe.
#
# Used at API startup and by the check-health diagnostics so "the broker is
# down" is a fact the process knows about, rather than something discovered
# three scheduling cycles later from an empty dashboard. Deliberately bounded:
# kombu's default retry behaviour would block a startup hook for minutes
# against an unreachable Redis.
# ---------------------------------------------------------------------------
def probe_broker(timeout: float = 5.0) -> tuple[bool, str]:
    """Return ``(reachable, detail)`` for the configured broker.

    Never raises. ``detail`` carries only an exception type and message - no
    broker URL, which may contain credentials.
    """
    conn = None
    try:
        conn = celery_app.connection_for_write()
        conn.ensure_connection(max_retries=0, timeout=timeout)
        return True, "ok"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {str(exc)[:200]}"
    finally:
        if conn is not None:
            try:
                conn.release()
            except Exception:  # pragma: no cover - release must not raise
                pass


def beat_task_names() -> list[str]:
    """Task names referenced by the Beat schedule."""
    return [entry["task"] for entry in celery_app.conf.beat_schedule.values()]
