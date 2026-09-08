from datetime import datetime, timedelta, timezone
import uuid
import pytest
from app.modules.observations.repository import ObservationRepository
from app.modules.observations.schemas import ObservationCreateDTO
from app.modules.observations.service import observation_service


@pytest.mark.asyncio
async def test_public_queries_exclude_customer_measurements(db_session):
    url = f'https://example.com/{uuid.uuid4()}'
    # Fixture observations exercise source isolation; live QA uses actual workers.
    await observation_service.record_observation(db_session, ObservationCreateDTO(source_type='customer_check', region='us-east', endpoint_url=url, latency_ms=123, status_code=200))
    assert await ObservationRepository.list_for_endpoints(db_session, [url]) == []
    assert await ObservationRepository.get_latest_observation(db_session, [url]) is None
    assert (await ObservationRepository.get_endpoint_stats(db_session, [url], 24))['total'] == 0
    await observation_service.record_observation(db_session, ObservationCreateDTO(source_type='vendor_probe', region='us-east', endpoint_url=url, latency_ms=42, status_code=200))
    rows = await ObservationRepository.list_for_endpoints(db_session, [url])
    assert len(rows) == 1 and rows[0].latency_ms == 42
    assert (await ObservationRepository.get_endpoint_stats(db_session, [url], 24))['total'] == 1
