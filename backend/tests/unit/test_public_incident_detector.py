"""Public incident detection state machine.

Table-driven sequences fed through the REAL service and the REAL shared
detection policy; only persistence is mocked. This is what makes the
publication gate auditable: exactly which observation run opens a record,
which run resolves it, and what the published claim says.
"""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.modules.incidents.public_models import ATTRIBUTION_OBSERVED
from app.modules.incidents.public_service import (
    PublicIncidentService,
    _classify_failure_kind,
    _observation_is_up,
)
from app.modules.observations.repository import ObservationRepository

BASE = datetime(2026, 9, 25, 12, 0, 0, tzinfo=timezone.utc)


def _obs(minutes: int, *, ok: bool, status: int | None = 200, error: str | None = None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        timestamp=BASE + timedelta(minutes=minutes),
        region="us-east",
        status_code=status if ok or status is not None else None,
        error_type=None if ok else "probe_failed",
        error_message=error if not ok else None,
    )


def _obs_fail(minutes: int, status: int | None, error: str):
    return _obs(minutes, ok=False, status=status, error=error)


@pytest.fixture
def endpoint():
    return SimpleNamespace(
        id=uuid.uuid4(),
        endpoint_url="https://status.example.com",
        name="Official status page",
    )


@pytest.fixture
def vendor():
    return SimpleNamespace(id=uuid.uuid4(), display_name="Example Vendor")


@pytest.fixture
def repo():
    repository = MagicMock()
    repository.get_open_for_endpoint = AsyncMock(return_value=None)
    repository.create = AsyncMock(side_effect=lambda session, incident: incident)
    return repository


@pytest.fixture
def service(repo):
    return PublicIncidentService(repository=repo)


async def _apply(
    service,
    monkeypatch,
    stored_newest_first,
    observation,
    endpoint,
    vendor,
    session=None,
):
    monkeypatch.setattr(
        ObservationRepository,
        "list_for_endpoints",
        AsyncMock(return_value=list(stored_newest_first)),
    )
    if session is None:
        session = AsyncMock()
    return await service.apply_vendor_observation(
        session,
        endpoint=endpoint,
        vendor=vendor,
        observation=observation,
        region="us-east",
    )


@pytest.mark.asyncio
async def test_success_then_single_failure_opens_nothing(service, repo, endpoint, vendor, monkeypatch):
    ok1 = _obs(0, ok=True)
    fail1 = _obs_fail(5, 503, "HTTP 503")
    result = await _apply(service, monkeypatch, [ok1], fail1, endpoint, vendor)
    assert result is None
    repo.create.assert_not_called()


@pytest.mark.asyncio
async def test_two_consecutive_failures_open_confirmed_incident(service, repo, endpoint, vendor, monkeypatch):
    ok1 = _obs(0, ok=True)
    fail1 = _obs_fail(5, 503, "HTTP 503")
    fail2 = _obs_fail(10, 503, "HTTP 503")

    created = await _apply(service, monkeypatch, [fail1, ok1], fail2, endpoint, vendor)

    assert created is not None
    assert created.status == "open"
    # The window starts at the first failure of the run, not the run's end.
    assert created.started_at == fail1.timestamp
    assert created.detected_at == fail2.timestamp
    assert created.failure_count == 2
    assert created.observation_count == 2
    assert created.failure_kind == "http_5xx"
    assert created.status_codes == [503]
    assert created.first_observation_id == str(fail1.id)
    assert created.last_observation_id == str(fail2.id)
    assert created.attribution_status == ATTRIBUTION_OBSERVED
    assert created.methodology_version == "v1.0"
    # The claim is a measurement statement, endpoint scoped, region named.
    assert "consecutive failed observations" in created.description
    assert "us-east" in created.description
    assert "status.example.com" in created.description
    assert "down" not in created.description.lower()


@pytest.mark.asyncio
async def test_open_incident_is_not_reopened_by_more_failures(service, repo, endpoint, vendor, monkeypatch):
    # Fully specified record: the resolution path now also stamps the
    # confirming observation id and enqueues an evidence freeze for it.
    open_incident = SimpleNamespace(
        id=uuid.uuid4(), status="open", resolved_at=None
    )
    repo.get_open_for_endpoint = AsyncMock(return_value=open_incident)
    fail1 = _obs_fail(0, 503, "HTTP 503")
    fail2 = _obs_fail(5, 503, "HTTP 503")

    result = await _apply(service, monkeypatch, [fail1], fail2, endpoint, vendor)

    repo.create.assert_not_called()
    assert result is None


@pytest.mark.asyncio
async def test_recovery_requires_consecutive_successes(service, repo, endpoint, vendor, monkeypatch):
    # Fully specified record: the resolution path now also stamps the
    # confirming observation id and enqueues an evidence freeze for it.
    open_incident = SimpleNamespace(
        id=uuid.uuid4(), status="open", resolved_at=None
    )
    repo.get_open_for_endpoint = AsyncMock(return_value=open_incident)
    fail1 = _obs_fail(0, 503, "HTTP 503")
    fail2 = _obs_fail(5, 503, "HTTP 503")
    ok1 = _obs(10, ok=True)
    ok2 = _obs(15, ok=True)

    # One success is recovery noise, not resolution.
    result = await _apply(service, monkeypatch, [fail2, fail1], ok1, endpoint, vendor)
    assert result is None
    assert open_incident.status == "open"
    assert open_incident.resolved_at is None

    # The second consecutive success resolves, stamped at the recovery run.
    result = await _apply(service, monkeypatch, [ok1, fail2, fail1], ok2, endpoint, vendor)
    assert result is open_incident
    assert open_incident.status == "resolved"
    assert open_incident.resolved_at == ok1.timestamp


@pytest.mark.asyncio
async def test_recovery_with_no_open_incident_does_nothing(service, repo, endpoint, vendor, monkeypatch):
    ok1 = _obs(0, ok=True)
    ok2 = _obs(5, ok=True)
    result = await _apply(service, monkeypatch, [ok1], ok2, endpoint, vendor)
    assert result is None
    repo.create.assert_not_called()


def test_up_predicate_matches_catalog_semantics():
    assert _observation_is_up(_obs(0, ok=True)) is True
    assert _observation_is_up(_obs_fail(1, 503, "HTTP 503")) is False
    assert _observation_is_up(_obs_fail(2, None, "timeout")) is False


def test_failure_kind_classification():
    assert _classify_failure_kind([_obs_fail(0, 503, "boom")]) == "http_5xx"
    assert _classify_failure_kind([_obs_fail(0, 404, "boom")]) == "http_4xx"
    assert _classify_failure_kind([_obs_fail(0, None, "request timeout")]) == "timeout"
    assert _classify_failure_kind([_obs_fail(0, None, "DNS failure")]) == "transport"
    assert (
        _classify_failure_kind(
            [_obs_fail(0, 503, "boom"), _obs_fail(1, None, "timeout")]
        )
        == "mixed"
    )
    assert _classify_failure_kind([]) == "unknown"


# ---------------------------------------------------------------------------
# Evidence freeze fan-out (phase 5): the transition transaction also leaves a
# durable outbox event behind, so evidence generation can never lose a
# transition that committed.
# ---------------------------------------------------------------------------


def _outbox_events(mock_session):
    from app.modules.observations.models import OutboxEvent

    return [
        call.args[0]
        for call in mock_session.add.call_args_list
        if isinstance(call.args[0], OutboxEvent)
    ]


@pytest.mark.asyncio
async def test_opening_incident_enqueues_evidence_freeze(service, repo, endpoint, vendor, monkeypatch):
    ok1 = _obs(0, ok=True)
    fail1 = _obs_fail(5, 503, "HTTP 503")
    fail2 = _obs_fail(10, 503, "HTTP 503")
    session = AsyncMock()
    monkeypatch.setattr(
        ObservationRepository,
        "list_for_endpoints",
        AsyncMock(return_value=[fail1, ok1]),
    )

    opened = await service.apply_vendor_observation(
        session,
        endpoint=endpoint,
        vendor=vendor,
        observation=fail2,
        region="us-east",
    )

    assert opened is not None
    events = _outbox_events(session)
    assert len(events) == 1
    assert events[0].event_type == "public_incident_evidence_requested"
    import json as _json

    assert _json.loads(events[0].payload) == {"incident_id": str(opened.id)}


@pytest.mark.asyncio
async def test_resolution_enqueues_evidence_freeze_and_stamps_confirming_probe(
    service, repo, endpoint, vendor, monkeypatch
):
    open_incident = SimpleNamespace(
        id=uuid.uuid4(), status="open", resolved_at=None
    )
    repo.get_open_for_endpoint = AsyncMock(return_value=open_incident)
    ok1 = _obs(10, ok=True)
    ok2 = _obs(15, ok=True)
    session = AsyncMock()

    result = await _apply(
        service, monkeypatch, [ok1], ok2, endpoint, vendor, session=session
    )

    assert result is open_incident
    # The recovery run's confirming probe is stamped as the evidence
    # window's upper bound: a fact of the record, not of generation time.
    assert open_incident.resolution_observation_id == str(ok2.id)
    events = _outbox_events(session)
    assert len(events) == 1
    assert events[0].event_type == "public_incident_evidence_requested"


@pytest.mark.asyncio
async def test_non_transitioning_observation_enqueues_nothing(service, repo, endpoint, vendor, monkeypatch):
    ok1 = _obs(0, ok=True)
    ok2 = _obs(5, ok=True)
    session = AsyncMock()

    await _apply(service, monkeypatch, [ok1], ok2, endpoint, vendor, session=session)

    assert _outbox_events(session) == []
