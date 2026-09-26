"""Contract, persistence, detection, metrics and API regression together."""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
import socket
import ssl
import httpx
import pytest
from sqlalchemy import event
from app.modules.checks.http_probe import observe_http
from app.modules.checks.detection import CheckOutcome, DetectionPolicy, evaluate_detection
from app.modules.observations.schemas import ObservationCreateDTO
from app.modules.observations.service import observation_service
from app.modules.observations.repository import ObservationRepository
from app.modules.incidents.public_service import _observation_is_up, _classify_failure_kind
from app.modules.vendors.repository import VendorRepository
from app.modules.vendors.service import vendor_service


CASES = [(code, None, 'http_response') for code in [200,201,204,301,302,403,404,429,500,502]] + [
    (None, httpx.ReadTimeout('timeout'), 'timeout'),
    (None, socket.gaierror('DNS failed'), 'dns_error'),
    (None, httpx.ConnectError('connection refused'), 'connection_error'),
    (None, ssl.SSLError('TLS failed'), 'tls_error'),
]


@pytest.mark.parametrize('code,error,transport', CASES)
async def test_probe_to_storage_metrics_and_incident(db_session, mocker, code, error, transport):
    mocker.patch('app.modules.checks.http_probe.resolve_pinned_target_async', new=AsyncMock())
    mocker.patch('app.modules.checks.http_probe.pinned_transport_for')
    client = AsyncMock()
    client.request.side_effect = error
    client.request.return_value = httpx.Response(code or 200)
    client.__aenter__.return_value = client
    mocker.patch('app.modules.checks.http_probe.build_client', return_value=client)
    result = await observe_http('https://example.com')
    facts = result.semantics
    assert facts['reachable'] == (code is not None)
    assert facts['response_received'] == (code is not None)
    assert facts['http_status'] == code
    assert facts['transport_status'] == transport
    assert facts['response_class'] == (f'{code // 100}xx' if code else 'no_http_response')
    assert facts['evaluation'] == ('expected' if code == 200 else 'unexpected')
    now = datetime.now(timezone.utc)
    row = await observation_service.record_observation(db_session, ObservationCreateDTO(
        timestamp=now, region='us-east', endpoint_url='https://example.com',
        latency_ms=result.latency_ms, status_code=code, error_type=result.error_type,
        error_message=result.error_message, source_type='vendor_probe',
        metadata={'observation': facts},
    ))
    assert row.model_dump()['response_received'] == (code is not None)
    assert row.evaluation == facts['evaluation']
    up = _observation_is_up(row)
    assert up == (code == 200)
    outcome = CheckOutcome(up, 'us-east', now)
    decision = evaluate_detection(policy=DetectionPolicy(), current=outcome,
        history=[CheckOutcome(up, 'us-east', now-timedelta(minutes=5))], has_open_incident=False)
    assert decision.open_incident == (not up)
    recovery = evaluate_detection(policy=DetectionPolicy(), current=outcome,
        history=[outcome], has_open_incident=True)
    assert recovery.resolve_incident == up
    stats = await ObservationRepository.get_endpoint_stats(db_session, ['https://example.com'], 24)
    assert stats['uptime_percentage'] == (100 if up else 0)
    if code == 403:
        assert row.response_received and row.transport_status == 'http_response'
        assert _classify_failure_kind([row]) == 'http_4xx'


@pytest.mark.parametrize('size', [50,100,500,1001])
async def test_catalog_regions_constant_query_count(db_session, size):
    for index in range(size):
        await VendorRepository.create(db_session, f'v{index}', f'Vendor {index}', f'https://v{index}.example', 'ai')
    queries = []
    engine = db_session.bind.sync_engine
    def count(*args):
        queries.append(args[2])
    event.listen(engine, 'before_cursor_execute', count)
    try:
        vendors = await VendorRepository.list_public(db_session, limit=size)
        rows = await vendor_service._with_recent_status(db_session, vendors)
    finally:
        event.remove(engine, 'before_cursor_execute', count)
    assert len(queries) == 3
    assert len(rows) == size
    assert all(row.region_state == 'configured' and row.regions for row in rows)


async def test_explicit_403_policy(mocker):
    mocker.patch('app.modules.checks.http_probe.resolve_pinned_target_async', new=AsyncMock())
    mocker.patch('app.modules.checks.http_probe.pinned_transport_for')
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.request.return_value = httpx.Response(403)
    mocker.patch('app.modules.checks.http_probe.build_client', return_value=client)
    result = await observe_http('https://example.com', expected_codes=[200,403])
    assert result.is_up and result.semantics['evaluation'] == 'expected'
    assert result.semantics['response_received']


async def test_catalog_and_timeline_api_403(async_client, db_session):
    vendor = await VendorRepository.create(db_session, 'regression403', '403 target', 'https://403.example', 'ai')
    endpoints = await VendorRepository.list_vendor_endpoints(db_session, vendor.vendor_name)
    await observation_service.record_observation(db_session, ObservationCreateDTO(
        region='us-east', endpoint_url=vendor.endpoint_url, source_id=endpoints[0].id,
        source_type='vendor_probe', latency_ms=30, status_code=403,
        error_type='probe_failed', error_message='Unexpected status code: 403',
    ))
    await db_session.commit()
    catalog = (await async_client.get('/v1/vendors')).json()
    row = next(row for row in catalog['items'] if row['vendor_name'] == vendor.vendor_name)
    assert row['response_received'] and row['http_status'] == 403
    assert row['evaluation'] == 'unexpected'
    assert row['regions'] and row['region_state'] == 'configured'
    detail_response = await async_client.get('/v1/vendors/regression403')
    assert detail_response.status_code == 200
    assert detail_response.json()['response_received']
    timeline_response = await async_client.get('/v1/vendors/regression403/timeline')
    assert timeline_response.status_code == 200
    current = timeline_response.json()['current']
    assert current['response_received'] and current['transport_status'] == 'http_response'
    assert current['is_up'] is False
    bucket = timeline_response.json()['points'][-1]
    assert bucket['response_received_count'] == 1
    assert bucket['expected_count'] == 0
