"""Persisted channel validation, secrecy, and event controls (real Postgres)."""
import uuid
import pytest
from sqlalchemy import select
from app.modules.notifications.models import AlertConfig
from app.modules.notifications.configuration import unpack
from app.core.audit_log import AuditLog


@pytest.mark.asyncio
async def test_verified_member_email_encrypted_and_preferences_persist(async_client, auth_data, db_session):
    headers = auth_data['headers']
    response = await async_client.post('/v1/notifications/configs', headers=headers, json={
        'channel_type': 'email', 'config': {'email': auth_data['email']},
    })
    assert response.status_code == 201, response.text
    public = response.json()
    assert public['destination'] == auth_data['email']
    assert public['verification_required'] is False
    assert 'config' not in public
    row = await db_session.get(AlertConfig, uuid.UUID(public['id']))
    assert set(row.config) == {'_encrypted_data'}
    assert auth_data['email'] not in str(row.config)
    assert unpack(row.config)['email'] == auth_data['email']
    updated = await async_client.patch(f"/v1/notifications/configs/{public['id']}", headers=headers, json={
        'config': {'events': {'incident.detected': True, 'incident.resolved': False}},
    })
    assert updated.status_code == 200, updated.text
    read = await async_client.get(f"/v1/notifications/configs/{public['id']}", headers=headers)
    assert read.json()['events']['incident.resolved'] is False
    logs = (await db_session.scalars(select(AuditLog).where(AuditLog.resource_id == public['id']))).all()
    assert {row.event_type for row in logs} >= {'notification_channel_created', 'notification_channel_updated'}
    assert all('_encrypted_data' not in str(row.payload) for row in logs)


@pytest.mark.asyncio
@pytest.mark.parametrize('config', [
    {}, {'email': 'not-an-email'}, {'email': 'a@example.com', 'verified_at': '2026-01-01'},
    {'email': 'a@example.com', 'events': {'unknown': True}},
    {'email': 'a@example.com', 'events': {'incident.detected': 'yes'}},
])
async def test_invalid_email_configuration_rejected(async_client, auth_data, config):
    response = await async_client.post('/v1/notifications/configs', headers=auth_data['headers'], json={'channel_type': 'email', 'config': config})
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
@pytest.mark.parametrize('url', ['http://hooks.slack.com/services/a/b/c', 'https://evil.example/services/a/b/c', 'https://127.0.0.1/services/a/b/c', 'https://hooks.slack.com:invalid/services/a/b/c'])
async def test_slack_rejects_untrusted_destinations(async_client, auth_data, url):
    response = await async_client.post('/v1/notifications/configs', headers=auth_data['headers'], json={'channel_type': 'slack', 'config': {'webhook_url': url}})
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_unverified_destination_cannot_receive_alert_tests(async_client, auth_data, mocker):
    mocker.patch('app.infrastructure.email.email_client.send_email', return_value=True)
    response = await async_client.post('/v1/notifications/configs', headers=auth_data['headers'], json={'channel_type': 'email', 'config': {'email': 'unverified@example.com'}})
    assert response.status_code == 201, response.text
    assert response.json()['verification_required'] is True
    test = await async_client.post('/v1/notifications/test', headers=auth_data['headers'], json={'config_id': response.json()['id']})
    assert test.status_code == 422


@pytest.mark.asyncio
async def test_failed_verification_delivery_is_not_reported_as_sent(async_client, auth_data, mocker):
    mocker.patch('app.infrastructure.email.email_client.send_async', return_value=False)
    response = await async_client.post('/v1/notifications/configs', headers=auth_data['headers'], json={'channel_type': 'email', 'config': {'email': 'unreachable@example.com'}})
    assert response.status_code == 503
    assert 'Unable to send' in response.text
