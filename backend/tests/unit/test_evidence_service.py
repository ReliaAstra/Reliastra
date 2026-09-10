"""Evidence service behaviour, with the database boundary mocked.

These tests cover the decisions the service makes around generation: what it
claims when it has no measurements, how it links an artifact, that a second run
over the same facts reuses the artifact, how a plan limitation is recorded, and
that a storage problem is a failure rather than a silent success. The real
database path is exercised in ``tests/integration/test_evidence_lifecycle.py``.
"""

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.modules.evidence.service import (
    EvidenceGenerationError,
    EvidenceNotEntitledError,
    EvidenceService,
)
from app.modules.incidents.constants import EvidenceStatus

T0 = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)


def check_row(minute: int, *, is_up: bool = True, latency_ms: float | None = 100.0):
    return SimpleNamespace(
        id=uuid.uuid4(),
        executed_at=T0 + timedelta(minutes=minute),
        is_up=is_up,
        latency_ms=latency_ms,
        status_code=200 if is_up else 500,
        error_message=None if is_up else "500 Internal Server Error",
        region="primary",
        # Historical column name; the value is the detector-confirmation flag.
        quorum_confirmed=not is_up,
    )


def build_service():
    """A service whose repositories are mocks, wired the way production wires them."""
    incident_id = uuid.uuid4()
    org_id = uuid.uuid4()
    dependency_id = uuid.uuid4()

    incident = SimpleNamespace(
        id=incident_id,
        org_id=org_id,
        dependency_id=dependency_id,
        started_at=T0,
        resolved_at=T0 + timedelta(minutes=30),
        severity="critical",
        status="resolved",
        root_cause="unknown",
        detection_rule="single.consecutive_failures",
        detection_metadata={
            "rule": "single.consecutive_failures",
            "reason": "3 consecutive failed checks (3 required)",
            "confirmed": True,
            "consecutive_failures": 3,
            "required": 3,
            "agreeing_observation_points": [],
        },
        evidence_report_id=None,
    )
    dependency = SimpleNamespace(
        id=dependency_id,
        name="Payment API",
        endpoint_url="https://api.example.com",
        regions=["primary"],
        alert_threshold_ms=250,
    )
    report_id = uuid.uuid4()
    report = SimpleNamespace(
        id=report_id,
        org_id=org_id,
        incident_id=incident_id,
        file_size_bytes=2048,
        checksum="pdf-checksum",
        generated_at=T0,
        expires_at=None,
        created_at=T0,
        updated_at=T0,
    )

    service = EvidenceService(
        repository=MagicMock(),
        inc_repository=MagicMock(),
        snapshot_repository=MagicMock(),
    )
    service.inc_repository.get_by_id = AsyncMock(return_value=incident)
    service.inc_repository.get_correlations = AsyncMock(return_value=[])
    service.inc_repository.set_evidence_state = AsyncMock(return_value=incident)
    service.repository.create = AsyncMock(return_value=report)
    service.repository.get_by_file_path = AsyncMock(return_value=None)
    service.snapshot_repository.create = AsyncMock(return_value=MagicMock(id=uuid.uuid4()))
    service.snapshot_repository.get_latest_for_incident = AsyncMock(return_value=None)

    # Spy on the real renderer: it still produces the document (so template
    # errors surface), and the exact context is available for assertions.
    service.captured_context = {}
    real_render = service._render_html

    def spy(context):
        service.captured_context = context
        return real_render(context)

    service._render_html = spy

    return service, incident, dependency, report


class FakeStorage:
    """An in-memory bucket that behaves like the real client.

    ``stat_object`` reports the size that was actually written, so the
    service's post-upload verification is exercised for real rather than
    satisfied by a stub that always agrees.
    """

    def __init__(self, *, size_override: int | None = None):
        self.objects: dict[str, bytes] = {}
        self.size_override = size_override

    def upload_bytes(self, data: bytes, name: str, content_type: str):
        self.objects[name] = data
        return name

    def stat_object(self, name: str):
        from app.infrastructure.storage import StorageObjectMissing

        if name not in self.objects:
            raise StorageObjectMissing(name)
        size = self.size_override if self.size_override is not None else len(self.objects[name])
        return {"size_bytes": size, "etag": "etag"}


def patches(dependency, rows, *, rolling=None, org_plan="pro", storage=None):
    """Patch every collaborator except the service under test."""
    org = SimpleNamespace(plan=org_plan, evaluation_ends_at=None, evaluation_started_at=None)
    bucket = storage or FakeStorage()
    return [
        patch(
            "app.modules.organizations.repository.OrganizationRepository.get_by_id",
            new=AsyncMock(return_value=org),
        ),
        patch(
            "app.modules.dependencies.repository.DependencyRepository.get_by_id",
            new=AsyncMock(return_value=dependency),
        ),
        patch(
            "app.modules.checks.repository.CheckRepository.list_for_dependency_window",
            new=AsyncMock(return_value=list(rows)),
        ),
        patch(
            "app.modules.checks.repository.CheckRepository.count_for_dependency_window",
            new=AsyncMock(return_value=len(rows)),
        ),
        patch(
            "app.modules.checks.repository.CheckRepository.get_aggregated_stats",
            new=AsyncMock(
                return_value=rolling
                or {
                    "uptime_percentage": 99.9,
                    "avg_latency_ms": 120.0,
                    "total_checks": 1440,
                }
            ),
        ),
        patch(
            "app.modules.attribution.repository.AttributionRepository.get_by_incident",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.modules.ai_integration.service.ai_service.generate_explanation",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.modules.evidence.service.storage_client.upload_bytes",
            new=bucket.upload_bytes,
        ),
        patch(
            "app.modules.evidence.service.storage_client.stat_object",
            new=bucket.stat_object,
        ),
        patch("app.modules.evidence.service.AuditLogService.log_event", new=AsyncMock()),
        patch(
            "app.modules.notifications.service.notification_service.dispatch_alert",
            new=AsyncMock(return_value=0),
        ),
    ]


@pytest.mark.asyncio
async def test_generation_links_the_artifact_to_the_incident():
    service, incident, dependency, report = build_service()
    rows = [check_row(i) for i in range(10)]

    with _exit_stack(patches(dependency, rows)):
        result = await service.generate_for_incident(AsyncMock(), incident.id)

    assert result.id == report.id
    kwargs = service.inc_repository.set_evidence_state.await_args.kwargs
    assert kwargs["status"] == EvidenceStatus.AVAILABLE.value
    assert kwargs["report_id"] == report.id
    assert kwargs["error"] is None
    service.snapshot_repository.create.assert_awaited_once()


@pytest.mark.asyncio
async def test_a_window_with_no_measurements_does_not_claim_uptime():
    """The old behaviour defaulted this to 100% and printed it as measured."""
    service, incident, dependency, _ = build_service()

    with _exit_stack(patches(dependency, [])):
        await service.generate_for_incident(AsyncMock(), incident.id)

    context = service.captured_context
    assert context["metrics"].availability_pct is None
    assert context["metrics"].insufficient_data is True
    assert context["impact"].impact_pct is None
    assert context["metrics"].data_note
    # The rolling figure is still available, but as labelled context.
    assert context["rolling"]["uptime_percentage"] == 99.9


@pytest.mark.asyncio
async def test_metrics_come_from_the_incident_window_not_the_rolling_24h():
    service, incident, dependency, _ = build_service()
    rows = [check_row(i) for i in range(8)] + [
        check_row(8, is_up=False, latency_ms=None),
        check_row(9, is_up=False, latency_ms=None),
    ]

    with _exit_stack(patches(dependency, rows, rolling={"uptime_percentage": 99.9})):
        await service.generate_for_incident(AsyncMock(), incident.id)

    context = service.captured_context
    assert context["metrics"].availability_pct == pytest.approx(80.0)
    assert context["impact"].impact_pct == pytest.approx(20.0)
    assert context["rolling"]["uptime_percentage"] == 99.9


@pytest.mark.asyncio
async def test_a_second_run_over_the_same_facts_reuses_the_artifact():
    service, incident, dependency, report = build_service()
    rows = [check_row(i) for i in range(6)]
    snapshot = MagicMock()
    snapshot.report_file_path = "evidence/x/y.pdf"

    async def first_run_then_snapshot(*_args, **_kwargs):
        return None

    service.snapshot_repository.get_latest_for_incident = AsyncMock(
        side_effect=[None, snapshot]
    )
    service.repository.get_by_file_path = AsyncMock(return_value=report)
    session = AsyncMock()

    with _exit_stack(patches(dependency, rows, rolling={"uptime_percentage": 99.9})):
        first = await service.generate_for_incident(session, incident.id)
        recorded_hash = service.snapshot_repository.create.await_args.kwargs["data_hash"]
        snapshot.data_hash = recorded_hash
        # A retry minutes later sees different rolling context. The hash must
        # not have moved, or the retry would mint a duplicate artifact.
        second = await service.generate_for_incident(
            session,
            incident.id,
        )

    assert first.id == second.id == report.id
    service.repository.create.assert_awaited_once()


@pytest.mark.asyncio
async def test_data_hash_excludes_the_rolling_context_metric():
    service, incident, dependency, _ = build_service()
    rows = [check_row(i) for i in range(6)]
    session = AsyncMock()
    hashes = []

    async def capture(_session, **kwargs):
        hashes.append(kwargs["data_hash"])
        return MagicMock(id=uuid.uuid4())

    service.snapshot_repository.create = AsyncMock(side_effect=capture)

    with _exit_stack(patches(dependency, rows, rolling={"uptime_percentage": 99.9})):
        await service.generate_for_incident(session, incident.id)
    with _exit_stack(patches(dependency, rows, rolling={"uptime_percentage": 42.0})):
        await service.generate_for_incident(session, incident.id)

    assert len(hashes) == 2
    assert hashes[0] == hashes[1]


@pytest.mark.asyncio
async def test_a_plan_without_evidence_records_a_deliberate_state():
    service, incident, dependency, _ = build_service()

    with (
        _exit_stack(patches(dependency, [check_row(0)], org_plan="free")),
        pytest.raises(EvidenceNotEntitledError),
    ):
        await service.generate_for_incident(AsyncMock(), incident.id)

    kwargs = service.inc_repository.set_evidence_state.await_args.kwargs
    assert kwargs["status"] == EvidenceStatus.NOT_ENTITLED.value
    assert "plan" in kwargs["error"].lower()
    service.repository.create.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_stored_object_of_the_wrong_size_is_a_failure_not_a_success():
    service, incident, dependency, _ = build_service()
    rows = [check_row(i) for i in range(4)]
    # The bucket lies about what it holds: a truncated or replaced object.
    stack = patches(dependency, rows, storage=FakeStorage(size_override=17))

    with _exit_stack(stack), pytest.raises(EvidenceGenerationError):
        await service.generate_for_incident(AsyncMock(), incident.id)

    kwargs = service.inc_repository.set_evidence_state.await_args.kwargs
    assert kwargs["status"] == EvidenceStatus.FAILED.value
    assert "does not match" in kwargs["error"]
    service.repository.create.assert_not_awaited()


@pytest.mark.asyncio
async def test_single_topology_wording_never_claims_independent_confirmation():
    service, incident, dependency, _ = build_service()
    rows = [check_row(i) for i in range(5)]

    with _exit_stack(patches(dependency, rows)):
        await service.generate_for_incident(AsyncMock(), incident.id)

    context = service.captured_context
    topology = context["topology"]
    assert topology["topology"] == "single"
    assert topology["independent_confirmation"] is False
    assert "persistence of failure" in topology["topology_statement"]


@pytest.mark.asyncio
async def test_a_legacy_incident_without_detection_provenance_is_not_guessed_at():
    service, incident, dependency, _ = build_service()
    incident.detection_rule = None
    incident.detection_metadata = None

    with _exit_stack(patches(dependency, [check_row(0)])):
        await service.generate_for_incident(AsyncMock(), incident.id)

    detection = service.captured_context["detection"]
    assert detection["recorded"] is False
    assert detection["rule_label"] == "not recorded"
    assert detection["confirmed"] is None


class _exit_stack:
    """Enter a list of patchers as one context manager."""

    def __init__(self, items):
        self.items = items

    def __enter__(self):
        self.entered = [item.start() for item in self.items]
        return self.entered

    def __exit__(self, *exc):
        for item in reversed(self.items):
            item.stop()
        return False
