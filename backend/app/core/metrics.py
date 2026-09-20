"""app.core.metrics — backward-compatibility alias.

Canonical home: ``app.platform.observability.metrics``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.observability.metrics import (  # noqa: F401
    CONTENT_TYPE_LATEST,
    Counter,
    Histogram,
    ai_generation_latency,
    ai_generation_total,
    annotations,
    celery_tasks_total,
    check_latency,
    check_scheduler_cycles_total,
    checks_dispatch_failures_total,
    checks_dispatch_skipped_total,
    checks_scheduled_total,
    checks_total,
    email_events_total,
    generate_latest,
    http_requests_total,
    http_request_duration_seconds,
    incidents_total,
    logger,
    logging,
    metrics_content_type,
    multiprocess_dir,
    os,
    render_metrics,
)

__all__ = [
    "CONTENT_TYPE_LATEST",
    "Counter",
    "Histogram",
    "ai_generation_latency",
    "ai_generation_total",
    "annotations",
    "celery_tasks_total",
    "check_latency",
    "check_scheduler_cycles_total",
    "checks_dispatch_failures_total",
    "checks_dispatch_skipped_total",
    "checks_scheduled_total",
    "checks_total",
    "email_events_total",
    "generate_latest",
    "http_requests_total",
    "http_request_duration_seconds",
    "incidents_total",
    "logger",
    "logging",
    "metrics_content_type",
    "multiprocess_dir",
    "os",
    "render_metrics",

]
