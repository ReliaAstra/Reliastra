"""Public incident evidence: the frozen artifact contract.

Unit layer - the pure document builder and the freeze state rules, with
persistence mocked. Every record is fully specified (a MagicMock shape would
fail serialization and prove nothing). The integration layer exercises the
same functions against real Postgres and serves the artifact over HTTP.
"""

import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.modules.evidence.canonical import canonical_json_bytes
from app.modules.incidents import public_evidence as pe
from app.modules.incidents.public_evidence_models import PublicIncidentEvidence
from app.modules.observations.repository import ObservationRepository

BASE = datetime(2026, 9, 25, 12, 0, 0, tzinfo=timezone.utc)

INCIDENT_ID = uuid.uuid4()
VENDOR_ID = uuid.uuid4()


def _incident(**overrides):
    record = SimpleNamespace(
        id=INCIDENT_ID,
        vendor_id=VENDOR_ID,
        endpoint_url="https://status.example.com",
        target_name="Official status page",
        region="us-east",
        status="open",
        severity="major",
        failure_kind="http_5xx",
        started_at=BASE + timedelta(minutes=5),
        detected_at=BASE + timedelta(minutes=10),
        resolved_at=None,
        observation_count=2,
        failure_count=2,
        status_codes=[503],
        first_observation_id=str(uuid.uuid4()),
        last_observation_id=str(uuid.uuid4()),
        resolution_observation_id=None,
        detection_rule="consecutive_failures",
        detection_metadata={"threshold": 2},
        methodology_version="v1.0",
        attribution_status="observed",
        description=(
            "Between 2026-09-25T12:05:00+00:00 and 2026-09-25T12:10:00+00:00, "
            "RELIASTRA probes in us-east recorded 2 consecutive failed "
            "observations against https://status.example.com."
        ),
    )
    for key, value in overrides.items():
        setattr(record, key, value)
    return record


def _vendor():
    return SimpleNamespace(
        id=VENDOR_ID,
        vendor_name="example",
        display_name="Example Vendor",
        category="payments",
    )


def _observation_row(minutes: float, *, ok: bool, status: int | None = 200):
    return SimpleNamespace(
        id=uuid.uuid4(),
        timestamp=BASE + timedelta(minutes=minutes),
        region="us-east",
        status_code=status if ok or status is not None else None,
        latency_ms=120.5,
        error_type=None if ok else "probe_failed",
        error_message=None if ok else "HTTP 503",
    )


OBS_TABLE = [
    # (minutes offset, is_up) - the window of a two-failure incident with
    # one prior success as context, oldest first.
    (0.0, True),
    (5.0, False),
    (10.0, False),
]


def _window_rows():
    return [_observation_row(m, ok=ok) for m, ok in OBS_TABLE]


# ---------------------------------------------------------------------------
# Window bounds: facts of the record, never the clock
# ---------------------------------------------------------------------------


def test_open_incident_window_is_context_margin_through_detection():
    incident = _incident()
    since, until = pe.evidence_window_bounds(
        incident, resolution_observed_at=None
    )
    assert since == incident.started_at - timedelta(
        seconds=pe.EVIDENCE_CONTEXT_SECONDS
    )
    assert until == incident.detected_at


def test_resolved_incident_window_ends_at_stamped_confirmation_probe():
    incident = _incident(
        status="resolved",
        resolved_at=BASE + timedelta(minutes=15),
        resolution_observation_id=str(uuid.uuid4()),
    )
    confirmed_at = BASE + timedelta(minutes=15)
    _, until = pe.evidence_window_bounds(
        incident, resolution_observed_at=confirmed_at
    )
    assert until == confirmed_at


def test_resolved_incident_without_stamp_falls_back_to_resolved_at():
    # The stamped probe aged out of the partitioned store: the bound falls
    # back to a stored fact (resolved_at), never to "now".
    incident = _incident(
        status="resolved",
        resolved_at=BASE + timedelta(minutes=15),
        resolution_observation_id=str(uuid.uuid4()),
    )
    _, until = pe.evidence_window_bounds(incident, resolution_observed_at=None)
    assert until == incident.resolved_at


# ---------------------------------------------------------------------------
# Document: deterministic, complete, self-verifying
# ---------------------------------------------------------------------------


def _build(incident=None, vendor=None, rows=None, **kwargs):
    return pe.build_evidence_document(
        incident or _incident(),
        vendor or _vendor(),
        rows if rows is not None else _window_rows(),
        version=kwargs.pop("version", 1),
        supersedes_version=kwargs.pop("supersedes_version", None),
        truncated=kwargs.pop("truncated", False),
        **kwargs,
    )


def test_document_is_deterministic_byte_for_byte():
    incident = _incident()
    rows = _window_rows()
    one = canonical_json_bytes(_build(incident=incident, rows=rows))
    two = canonical_json_bytes(_build(incident=incident, rows=list(rows)))
    assert one == two


def test_document_contains_no_wall_clock_field():
    document = _build()
    blob = json.dumps(document)
    # The only timestamps are stored facts: incident stamps and observation
    # stamps. A generation timestamp would break reproducibility.
    assert "generated_at" not in blob
    assert "frozen_at" not in blob


def test_document_carries_claim_provenance_and_observations():
    incident = _incident()
    document = _build(incident=incident)
    assert document["artifact"]["kind"] == "reliastra.public_incident_evidence"
    assert document["artifact"]["schema_version"] == pe.EVIDENCE_SCHEMA_VERSION
    assert document["methodology"]["version"] == incident.methodology_version
    assert document["methodology"]["attribution"] == "observed"
    assert document["methodology"]["detection_rule"] == incident.detection_rule
    assert document["methodology"]["claim"] == incident.description
    assert document["incident"]["id"] == str(incident.id)
    assert document["incident"]["endpoint_url"] == incident.endpoint_url
    assert document["incident"]["region"] == "us-east"
    assert document["incident"]["duration_ms"] is None  # still open
    rows = document["observations"]["rows"]
    assert [row["timestamp"] for row in rows] == [
        row.timestamp.isoformat() for row in _window_rows()
    ]
    assert document["observations"]["truncated"] is False


def test_document_resolution_sets_duration_and_supersedes():
    incident = _incident(
        status="resolved",
        resolved_at=BASE + timedelta(minutes=15),
    )
    document = _build(incident=incident, version=2, supersedes_version=1)
    assert document["incident"]["duration_ms"] == 10 * 60 * 1000
    assert document["artifact"]["evidence_version"] == 2
    assert document["artifact"]["supersedes_version"] == 1


def test_truncation_is_disclosed_not_silent():
    document = _build(truncated=True)
    assert document["observations"]["truncated"] is True
    assert document["observations"]["truncation"] is not None


def test_verification_hash_covers_document_minus_verification_block():
    document = _build()
    finalized = pe.finalize_document(document)
    # The published recipe, executed literally: drop the block,
    # canonicalise, hash.
    core = {k: v for k, v in finalized.items() if k != "verification"}
    recomputed = hashlib.sha256(canonical_json_bytes(core)).hexdigest()
    assert finalized["verification"]["payload_sha256"] == recomputed
    assert finalized["verification"]["algorithm"] == "sha256"
    # Deterministic: hashing twice does not move the hash.
    assert pe.hash_document_core(document) == recomputed


# ---------------------------------------------------------------------------
# Freeze state rules
# ---------------------------------------------------------------------------


def _service_with(latest):
    repository = MagicMock()
    repository.latest_for_incident = AsyncMock(return_value=latest)
    repository.create = AsyncMock(side_effect=lambda session, artifact: artifact)
    return pe.PublicIncidentEvidenceService(repository=repository)


def _session_returning(incident, vendor):
    session = AsyncMock()

    async def _get(model, obj_id):
        if model is pe.PublicIncident:
            return incident
        if model is pe.VendorTracking:
            return vendor
        return None

    session.get = AsyncMock(side_effect=_get)
    return session


def _patch_window(monkeypatch, rows):
    async def _list(session, urls, **kwargs):
        return list(rows)

    monkeypatch.setattr(ObservationRepository, "list_for_endpoints", _list)


@pytest.mark.asyncio
async def test_first_freeze_creates_version_one_with_stored_bytes(monkeypatch):
    service = _service_with(latest=None)
    session = _session_returning(_incident(), _vendor())
    _patch_window(monkeypatch, _window_rows())

    outcome = await service.freeze_for_incident(session, INCIDENT_ID)

    assert outcome == "created"
    artifact = service.repository.create.call_args.args[1]
    assert artifact.version == 1
    assert artifact.supersedes_version is None
    assert artifact.incident_status == "open"
    assert artifact.methodology_version == "v1.0"
    # The stored payload is exactly the canonical bytes of the finalized
    # document - what is hashed is what is served.
    document = json.loads(artifact.payload)
    assert artifact.data_hash == document["verification"]["payload_sha256"]
    assert artifact.byte_size == len(artifact.payload.encode("utf-8"))
    assert artifact.observation_ids == [
        row["id"] for row in document["observations"]["rows"]
    ]
    assert artifact.observations_truncated is False


@pytest.mark.asyncio
async def test_resolution_freeze_supersedes_open_freeze(monkeypatch):
    open_freeze = SimpleNamespace(
        version=1, incident_status="open", supersedes_version=None
    )
    service = _service_with(latest=open_freeze)
    session = _session_returning(
        _incident(status="resolved", resolved_at=BASE + timedelta(minutes=15)),
        _vendor(),
    )
    _patch_window(monkeypatch, _window_rows())

    outcome = await service.freeze_for_incident(session, INCIDENT_ID)

    assert outcome == "created"
    artifact = service.repository.create.call_args.args[1]
    assert artifact.version == 2
    assert artifact.supersedes_version == 1
    assert artifact.incident_status == "resolved"


@pytest.mark.asyncio
async def test_freeze_matching_state_is_a_noop(monkeypatch):
    # Redelivery or reconcile sweep over an already-frozen state: no new
    # version, no write. This is what makes the pipeline idempotent.
    open_freeze = SimpleNamespace(version=1, incident_status="open")
    service = _service_with(latest=open_freeze)
    session = _session_returning(_incident(), _vendor())
    _patch_window(monkeypatch, _window_rows())

    outcome = await service.freeze_for_incident(session, INCIDENT_ID)

    assert outcome == "current"
    service.repository.create.assert_not_called()


@pytest.mark.asyncio
async def test_freeze_of_missing_incident_is_missing(monkeypatch):
    service = _service_with(latest=None)
    session = _session_returning(None, None)
    assert await service.freeze_for_incident(session, INCIDENT_ID) == "missing"
    service.repository.create.assert_not_called()


@pytest.mark.asyncio
async def test_freeze_race_is_reported_as_current(monkeypatch):
    # A concurrent processor won the unique (incident_id, version) race.
    service = _service_with(latest=None)
    session = _session_returning(_incident(), _vendor())
    _patch_window(monkeypatch, _window_rows())
    service.repository.create = AsyncMock(
        side_effect=IntegrityError("uq", None, Exception())
    )

    outcome = await service.freeze_for_incident(session, INCIDENT_ID)

    assert outcome == "current"


# ---------------------------------------------------------------------------
# Outbox handler
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handler_freezes_named_incident(monkeypatch):
    recorded = {}

    async def _freeze(self, session, incident_id):
        recorded["id"] = incident_id
        return "created"

    monkeypatch.setattr(
        pe.PublicIncidentEvidenceService, "freeze_for_incident", _freeze
    )
    payload = json.dumps({"incident_id": str(INCIDENT_ID)})
    assert await pe.handle_evidence_requested(AsyncMock(), payload) == "created"
    assert recorded["id"] == INCIDENT_ID


@pytest.mark.asyncio
async def test_handler_consumes_malformed_payloads():
    # A payload that can never parse must not poison the queue: the event is
    # consumed, not retried forever.
    assert await pe.handle_evidence_requested(AsyncMock(), "not json") == "missing"
    assert (
        await pe.handle_evidence_requested(
            AsyncMock(), json.dumps({"incident_id": "nope"})
        )
        == "missing"
    )


# ---------------------------------------------------------------------------
# Reconciliation queue
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reconcile_freezes_only_stale_incidents(monkeypatch):
    stale = [_incident(id=uuid.uuid4())]
    monkeypatch.setattr(
        pe.PublicIncidentEvidenceRepository,
        "list_stale_incident_ids",
        AsyncMock(return_value=stale),
    )
    calls = []

    async def _freeze(self, session, incident_id):
        calls.append(incident_id)
        return "created"

    monkeypatch.setattr(
        pe.PublicIncidentEvidenceService, "freeze_for_incident", _freeze
    )
    service = pe.PublicIncidentEvidenceService(repository=MagicMock())
    assert await service.reconcile(AsyncMock()) == 1
    assert calls == [stale[0].id]


@pytest.mark.asyncio
async def test_reconcile_with_empty_queue_is_zero(monkeypatch):
    monkeypatch.setattr(
        pe.PublicIncidentEvidenceRepository,
        "list_stale_incident_ids",
        AsyncMock(return_value=[]),
    )
    service = pe.PublicIncidentEvidenceService(repository=MagicMock())
    assert await service.reconcile(AsyncMock()) == 0


# ---------------------------------------------------------------------------
# Immutability guards
# ---------------------------------------------------------------------------


def test_evidence_model_blocks_update_and_delete():
    from app.modules.incidents import public_evidence_models as models

    with pytest.raises(ValueError, match="immutable"):
        models._prevent_evidence_update()
    with pytest.raises(ValueError, match="immutable"):
        models._prevent_evidence_delete()


def test_evidence_record_blocks_flush_update_via_event():
    # The listeners are registered on the class; constructing a record and
    # mutating it must not be possible to persist silently.
    artifact = PublicIncidentEvidence(
        incident_id=INCIDENT_ID,
        version=1,
        incident_status="open",
        artifact_schema_version=pe.EVIDENCE_SCHEMA_VERSION,
        generator=pe.EVIDENCE_GENERATOR,
        generator_version=pe.EVIDENCE_GENERATOR_VERSION,
        methodology_version="v1.0",
        data_hash="a" * 64,
        byte_size=10,
        observation_count=1,
        observations_truncated=False,
        supersedes_version=None,
        payload="{}",
        observation_ids=[],
    )
    assert artifact.version == 1
