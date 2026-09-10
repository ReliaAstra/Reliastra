"""The Celery wrapper's decision logic.

The service does the work; the task decides what a failure *means*. A plan
limitation must not be retried three times and reported as a crash, and a real
failure must propagate so Celery retries it. The task body is driven through a
stub of ``async_task_body`` so these branches are executed without a broker or
a worker - the bridge itself is covered by the integration suite.
"""

import uuid
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import pytest

from app.modules.evidence.service import (
    EvidenceGenerationError,
    EvidenceNotEntitledError,
)
from app.modules.evidence.tasks import (
    RETRY_SWEEP_BATCH_SIZE,
    STUCK_GENERATING_MINUTES,
    generate_evidence_report,
    retry_failed_evidence_generation,
)


@contextmanager
def run_task_body(session=None):
    """Execute the coroutine the task hands to ``async_task_body``."""
    captured: dict[str, object] = {}

    def fake_async_task_body(coro_factory):
        import asyncio

        async def _drive():
            return await coro_factory(session or AsyncMock())

        return asyncio.get_event_loop_policy().new_event_loop().run_until_complete(_drive())

    captured["body"] = fake_async_task_body
    with patch("app.modules.evidence.tasks.async_task_body", new=fake_async_task_body):
        yield captured


def test_a_plan_limitation_returns_normally_instead_of_retrying():
    """Three retries of a decision that cannot change are noise, not diligence."""
    with run_task_body(), patch(
        "app.modules.evidence.service.evidence_service.generate_for_incident",
        new=AsyncMock(
            side_effect=EvidenceNotEntitledError(
                "Evidence reports are not available on your current plan."
            )
        ),
    ):
        result = generate_evidence_report(str(uuid.uuid4()))

    assert result == {
        "status": "not_entitled",
        "incident_id": result["incident_id"],
    }


def test_a_successful_generation_reports_the_document_checksum():
    from types import SimpleNamespace

    report_id = uuid.uuid4()
    report = SimpleNamespace(id=report_id, checksum="pdf-bytes-hash", file_size_bytes=2048)

    with run_task_body(), patch(
        "app.modules.evidence.service.evidence_service.generate_for_incident",
        new=AsyncMock(return_value=report),
    ):
        result = generate_evidence_report(str(uuid.uuid4()))

    assert result["status"] == "available"
    assert result["report_id"] == str(report_id)
    # Labelled as what it is: the PDF checksum, not the evidence data_hash.
    assert result["report_checksum"] == "pdf-bytes-hash"
    assert "file_path" not in result  # no storage key leaves the service


def test_a_real_failure_propagates_so_celery_retries():
    with run_task_body(), patch(
        "app.modules.evidence.service.evidence_service.generate_for_incident",
        new=AsyncMock(side_effect=EvidenceGenerationError("renderer exploded")),
    ), pytest.raises(EvidenceGenerationError):
        generate_evidence_report(str(uuid.uuid4()))


def test_generate_task_is_configured_to_retry_bounded():
    assert generate_evidence_report.max_retries == 3
    assert generate_evidence_report.autoretry_for == (Exception,)
    # A render plus two uploads must finish well inside the hard limit.
    assert generate_evidence_report.soft_time_limit < generate_evidence_report.time_limit


def test_the_sweep_covers_abandoned_generating_attempts():
    """A publish that never reached the broker leaves no trace but the state."""
    assert STUCK_GENERATING_MINUTES * 60 > generate_evidence_report.time_limit
    assert RETRY_SWEEP_BATCH_SIZE > 0


@pytest.mark.asyncio
async def test_the_sweep_counts_outcomes_and_keeps_going():
    from types import SimpleNamespace

    incidents = [SimpleNamespace(id=uuid.uuid4()) for _ in range(3)]
    statuses = [
        None,  # succeeds
        EvidenceGenerationError("boom"),  # fails, must not stop the sweep
        EvidenceNotEntitledError("not on your plan"),  # counted separately
    ]
    calls: list[uuid.UUID] = []

    async def fake_generate(_session, incident_id):
        calls.append(incident_id)
        outcome = statuses[len(calls) - 1]
        if outcome is not None:
            raise outcome
        return SimpleNamespace(id=uuid.uuid4())

    captured = {}

    def fake_async_task_body(coro_factory):
        captured["factory"] = coro_factory

    with patch("app.modules.evidence.tasks.async_task_body", new=fake_async_task_body):
        retry_failed_evidence_generation()

    session = AsyncMock()
    with (
        patch(
            "app.modules.incidents.repository.IncidentRepository.list_evidence_retryable",
            new=AsyncMock(return_value=incidents),
        ),
        patch(
            "app.modules.evidence.service.evidence_service.generate_for_incident",
            new=AsyncMock(side_effect=fake_generate),
        ),
    ):
        results = await captured["factory"](session)

    assert results == {
        "attempted": 3,
        "available": 1,
        "not_entitled": 1,
        "failed": 1,
    }
    assert [str(i.id) for i in incidents] == [str(c) for c in calls]
