"""Single-host routing contract: every probe task goes to the default queue.

The multi-region design (checks.{region} queues + per-region workers) is
correct for a fleet, but this deployment runs ONE worker consuming the
default queue. Any route to checks.{region} would pile tasks onto a queue
nothing consumes - invisible to the celery-queue depth probe, i.e. a total
monitoring blackout. Region stays a task-level label. These tests pin that:
no custom routes, everything lands on `celery`.
"""
from app.infrastructure.celery_app import celery_app
from app.config import settings


def test_no_custom_task_routes_on_single_host():
    assert not celery_app.conf.task_routes


def test_worker_queues_and_vendor_pipeline_registered():
    assert set(celery_app.amqp.queues) >= {'celery', f'checks.{settings.CHECK_WORKER_REGION}'}
    assert 'app.modules.vendors.tasks' in celery_app.conf.include
    assert celery_app.conf.beat_schedule['public-vendor-checks']['task'] == 'app.modules.vendors.tasks.schedule_vendor_checks'


def test_probe_tasks_publish_to_default_queue(monkeypatch):
    import uuid
    from app.modules.checks.tasks import execute_check
    from app.modules.vendors.tasks import execute_vendor_check
    monkeypatch.setattr(celery_app.conf, 'task_always_eager', False)
    with celery_app.connection_for_write('memory://') as connection:
        with celery_app.amqp.Producer(connection) as producer:
            execute_check.apply_async(args=[str(uuid.uuid4()), 'eu-west'], producer=producer, ignore_result=True)
            execute_vendor_check.apply_async(
                args=[str(uuid.uuid4()), '2026-01-01T00:00:00+00:00', 'eu-west'],
                producer=producer,
                ignore_result=True,
            )
        queue = connection.SimpleQueue('celery')
        for _ in range(2):
            message = queue.get(block=False)
            assert message.delivery_info['routing_key'] == 'celery'
            message.ack()
        queue.close()
