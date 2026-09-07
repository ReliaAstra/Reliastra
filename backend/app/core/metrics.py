"""Prometheus metrics for Reliastra self-observability.

Exposed at ``GET /metrics`` (see ``app/main.py``). All instruments are
process-local counters/histograms; Prometheus scrapes every instance.

Metrics:
* ``reliastra_checks_total{region,status}``      - probe outcomes
  (``status`` is ``up`` / ``down`` / ``blocked``; this is the
  "checks_executed_total" / "checks_failed_total" pair - ``down`` and
  ``blocked`` are the failure states, and they are deliberately separate so an
  SSRF rejection is never counted as an endpoint outage)
* ``reliastra_check_latency_seconds{region}``    - probe latency
* ``reliastra_checks_scheduled_total{region}``   - probes handed to the broker
* ``reliastra_checks_dispatch_failures_total{region,reason}`` - probes the
  scheduler could NOT hand to the broker (broker down, serialization, ...).
  A non-zero rate here means checks are silently not running.
* ``reliastra_check_scheduler_cycles_total{result}`` - Beat scheduling cycles
* ``reliastra_incidents_total{action}``          - incidents opened/resolved
* ``reliastra_celery_tasks_total{task,status}``  - Celery task completions
* ``reliastra_http_requests_total{method,status}``- inbound HTTP requests
* ``reliastra_ai_generation_total{provider_type,status}`` - AI explanation attempts
* ``reliastra_ai_generation_latency_seconds{provider_type}`` - AI latency
"""

from __future__ import annotations

import logging
import os

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Histogram,
    generate_latest,
)

logger = logging.getLogger(__name__)

checks_total = Counter(
    "reliastra_checks_total",
    "Total dependency checks executed",
    ["region", "status"],
)

check_latency = Histogram(
    "reliastra_check_latency_seconds",
    "Dependency check latency in seconds",
    ["region"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0),
)

# ── Check pipeline observability ────────────────────────────────────────────
# The gap these close: a dependency with no check history used to look exactly
# like "the vendor is fine and quiet". These three make the difference between
# "we probed it" and "we never managed to probe it" a scrapable number.
checks_scheduled_total = Counter(
    "reliastra_checks_scheduled_total",
    "Dependency checks successfully handed to the Celery broker",
    ["region"],
)

checks_dispatch_skipped_total = Counter(
    "reliastra_checks_dispatch_skipped_total",
    "Checks the scheduler deliberately did not publish",
    ["region", "reason"],
)
checks_dispatch_failures_total = Counter(
    "reliastra_checks_dispatch_failures_total",
    "Dependency checks the scheduler failed to enqueue on the broker",
    ["region", "reason"],
)

check_scheduler_cycles_total = Counter(
    "reliastra_check_scheduler_cycles_total",
    "Celery Beat scheduling cycles, by outcome",
    ["result"],
)

incidents_total = Counter(
    "reliastra_incidents_total",
    "Total incidents opened and resolved",
    ["action"],
)

celery_tasks_total = Counter(
    "reliastra_celery_tasks_total",
    "Total Celery task completions",
    ["task", "status"],
)

http_requests_total = Counter(
    "reliastra_http_requests_total",
    "Total inbound HTTP requests",
    ["method", "status"],
)

ai_generation_total = Counter(
    "reliastra_ai_generation_total",
    "Total AI explanation generation attempts",
    ["provider_type", "status"],
)

ai_generation_latency = Histogram(
    "reliastra_ai_generation_latency_seconds",
    "AI explanation generation latency in seconds",
    ["provider_type"],
    buckets=(0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0),
)

email_events_total = Counter(
    "reliastra_email_events_total",
    "Total email webhook events processed",
    ["event_type", "status"],
)


def multiprocess_dir() -> str | None:
    """``PROMETHEUS_MULTIPROC_DIR`` when multiprocess collection is in use."""
    return os.environ.get("PROMETHEUS_MULTIPROC_DIR") or None


def render_metrics() -> bytes:
    """Render the current Prometheus exposition text.

    Check-pipeline counters are incremented inside Celery workers, never in
    the API process - ``schedule_due_checks`` and ``execute_check`` both run in
    a worker. Without multiprocess collection the API's ``/metrics`` would
    therefore publish an empty set of check metrics forever, and a counter
    nobody can scrape is not observability.

    When ``PROMETHEUS_MULTIPROC_DIR`` is set (worker, Beat and API all point at
    the same directory), every process writes its samples there and any one of
    them can serve the aggregate - so the existing ``/metrics`` endpoint on the
    API reports the whole fleet with no extra port. When it is unset the
    process-local registry is used, exactly as before.
    """
    directory = multiprocess_dir()
    if not directory:
        return generate_latest()
    try:
        from prometheus_client import CollectorRegistry, multiprocess

        registry = CollectorRegistry()
        multiprocess.MultiProcessCollector(registry, directory)
        rendered = generate_latest(registry)
        if rendered:
            return rendered
        # Nothing has been written to the directory yet (or this process
        # imported prometheus_client before the variable was set, in which
        # case it records into memory rather than into files). Publishing an
        # empty page would look identical to "no metrics collected"; fall back
        # to this process's own registry so /metrics is never silently blank.
        logger.debug("multiprocess metrics directory %s is empty", directory)
    except Exception as exc:  # pragma: no cover - metrics must never 500
        logger.warning("multiprocess metrics collection failed: %s", exc)
    return generate_latest()


def metrics_content_type() -> str:
    """Return the correct Content-Type for the /metrics endpoint."""
    return CONTENT_TYPE_LATEST
