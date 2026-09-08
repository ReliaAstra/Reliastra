from app.infrastructure.celery_app import route_check, celery_app
from app.config import settings


def test_checks_are_routed_to_the_requested_region():
    assert route_check('app.modules.checks.tasks.execute_check', ('id', 'eu-west'), {}, {}) == {'queue': 'checks.eu-west'}
    assert route_check('app.modules.vendors.tasks.execute_vendor_check', ('id', 'time', 'us-east'), {}, {}) == {'queue': 'checks.us-east'}


def test_worker_only_subscribes_to_its_region_and_control_queue():
    assert set(celery_app.amqp.queues) >= {'celery', f'checks.{settings.CHECK_WORKER_REGION}'}
    assert 'app.modules.vendors.tasks' in celery_app.conf.include
    assert celery_app.conf.beat_schedule['public-vendor-checks']['task'] == 'app.modules.vendors.tasks.schedule_vendor_checks'


def test_actual_task_message_serialization_with_expiration(monkeypatch):
    import uuid
    from app.modules.checks.tasks import execute_check
    monkeypatch.setattr(celery_app.conf, 'task_always_eager', False)
    with celery_app.connection_for_write('memory://') as connection:
        with celery_app.amqp.Producer(connection) as producer:
            execute_check.apply_async(args=[str(uuid.uuid4()), 'us-east'], producer=producer, ignore_result=True)
        queue = connection.SimpleQueue('checks.us-east')
        message = queue.get(block=False)
        assert message.headers['expires']
        assert message.delivery_info['routing_key'] == 'checks.us-east'
        message.ack()
        queue.close()
