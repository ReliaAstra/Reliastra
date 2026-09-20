"""app.infrastructure.celery_app — backward-compatibility alias.

Canonical home: ``app.platform.messaging.celery_app``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.messaging.celery_app import (  # noqa: F401
    Celery,
    Queue,
    beat_task_names,
    celery_app,
    import_all_models,
    configure_logging,
    crontab,
    logger,
    logging,
    probe_broker,
    settings,
    task_failure,
    task_postrun,
    task_prerun,
    worker_process_init,
    _on_task_failure,
    _on_task_postrun,
    _on_task_prerun,
    _on_worker_process_init,
)

__all__ = [
    "Celery",
    "Queue",
    "beat_task_names",
    "celery_app",
    "import_all_models",
    "configure_logging",
    "crontab",
    "logger",
    "logging",
    "probe_broker",
    "settings",
    "task_failure",
    "task_postrun",
    "task_prerun",
    "worker_process_init",

]
