"""The evidence lifecycle against a real database.

These tests walk the path the product actually takes: an incident exists, it is
resolved, evidence is requested, an artifact is produced and verified in object
storage, it is linked to the incident, and the console can read it back. Every
assertion here is about something a customer would notice - a report that
exists, numbers that describe the incident rather than the last 24 hours, and a
failure that says what failed.

Storage is the in-memory bucket from ``tests/conftest.py``; everything else is
real: Postgres, the repositories, the renderer and the PDF bytes.
"""

import json
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest

from app.modules.checks.models import CheckResult
from app.modules.evidence.repository import EvidenceRepository, EvidenceSnapshotRepository
from app.modules.evidence.service import (
    EvidenceGenerationError,
    EvidenceNotEntitledError,
    evidence_service,
)
from app.modules.incidents.constants import EvidenceStatus, IncidentStatus
from app.modules.incidents.repository import IncidentRepository
from app.modules.incidents.service import incident_service

BANNED_CLAIMS = (
    "Multi-Region",
    "Quorum Confirmed",
    "Verification Regions",
    "Regions Observed",
    "Region of First Detection",
    "independent regional",
)


async def _dependency(async_client, headers, name="Lifecycle Vendor"):
    response = await async_client.post(
        "/v1/dependencies",
        headers=headers,
        json={"name": name, "endpoint_url": "https://vendor.example.com/health"},
    )
    assert response.status_code == 201, response.text
    return uuid.UUID(response.json()["id"])


async def _incident(db_session, org_id, dependency_id, *, started_at):
    """An open incident with a controlled start, so the window can be checked.

    Resolution is left to ``resolve_incident``, which stamps ``resolved_at``
    itself - that transition is part of what is under test.
    """
    incident = await IncidentRepository.create(
        db_session,
        org_id=org_id,
        dependency_id=dependency_id,
        severity="critical",
        description="lifecycle fixture",
    )
    incident.started_at = started_at
    incident.detection_rule = "single.consecutive_failures"
    incident.detection_metadata = {
        "rule": "single.consecutive_failures",
        "reason": "2 consecutive failed checks (2 required)",
        "confirmed": True,
        "consecutive_failures": 2,
        "required": 2,
        "agreeing_observation_points": [],
    }
    db_session.add(incident)
    await db_session.flush()
    return incident


def _check(db_session, *, dependency_id, org_id, executed_at, is_up, latency_ms):
    result = CheckResult(
        id=uuid.uuid4(),
        dependency_id=dependency_id,
        org_id=org_id,
        region="primary",
        executed_at=executed_at,
        latency_ms=latency_ms,
        status_code=200 if is_up else 503,
        error_message=None if is_up else "503 Service Unavailable",
        is_up=is_up,
        quorum_confirmed=False,
    )
    db_session.add(result)
    return result


def _seed_window(db_session, *, dependency_id, org_id, start, up, down):
    """``up`` healthy checks then ``down`` failures, one minute apart."""
    minute = 0
    for _ in range(up):
        _check(
            db_session,
            dependency_id=dependency_id,
            org_id=org_id,
            executed_at=start + timedelta(minutes=minute),
            is_up=True,
            latency_ms=120.0 + minute,
        )
        minute += 1
    for _ in range(down):
        _check(
            db_session,
            dependency_id=dependency_id,
            org_id=org_id,
            executed_at=start + timedelta(minutes=minute),
            is_up=False,
            latency_ms=0.0,
        )
        minute += 1


def _json_sidecar(evidence_storage):
    payload = next(
        data for name, data in evidence_storage.objects.items() if name.endswith(".json")
    )
    return json.loads(payload)


def _pdf_objects(evidence_storage):
    return [name for name in evidence_storage.objects if name.endswith(".pdf")]


@pytest.mark.asyncio
async def test_resolution_requests_generation_and_the_artifact_is_linked(
    async_client, auth_data, db_session, mocker, evidence_storage
):
    org_id = uuid.UUID(auth_data["org_id"])
    dependency_id = await _dependency(async_client, auth_data["headers"])
    start = datetime.now(timezone.utc) - timedelta(minutes=30)
    incident = await _incident(db_session, org_id, dependency_id, started_at=start)
    _seed_window(
        db_session, dependency_id=dependency_id, org_id=org_id, start=start, up=8, down=2
    )
    await db_session.commit()

    # Resolving asks for evidence; it does not generate it inline.
    mocker.patch("app.infrastructure.after_commit.dispatch_after_commit")
    await incident_service.resolve_incident(db_session, incident.id, org_id=org_id)
    await db_session.commit()
    await db_session.refresh(incident)
    assert incident.status == IncidentStatus.RESOLVED.value
    assert incident.evidence_status == EvidenceStatus.GENERATING.value
    assert incident.evidence_report_id is None

    # The worker's step, run against the same database.
    report = await evidence_service.generate_for_incident(db_session, incident.id)
    await db_session.commit()
    await db_session.refresh(incident)

    assert incident.evidence_status == EvidenceStatus.AVAILABLE.value
    assert incident.evidence_report_id == report.id
    assert incident.evidence_error is None
    assert incident.evidence_attempted_at is not None

    # The artifact is really in the bucket, and the row describes it.
    pdfs = _pdf_objects(evidence_storage)
    assert len(pdfs) == 1
    assert len(evidence_storage.objects[pdfs[0]]) == report.file_size_bytes
    assert evidence_storage.stat_object(pdfs[0])["size_bytes"] == report.file_size_bytes
    assert len(report.checksum) == 64

    # The console reads it back without any manual "check for evidence" step.
    listed = await async_client.get("/v1/evidence", headers=auth_data["headers"])
    assert listed.status_code == 200
    assert any(item["id"] == str(report.id) for item in listed.json())

    detail = await async_client.get(
        f"/v1/incidents/{incident.id}", headers=auth_data["headers"]
    )
    assert detail.status_code == 200
    assert detail.json()["evidence_status"] == EvidenceStatus.AVAILABLE.value


@pytest.mark.asyncio
async def test_repeated_generation_reuses_the_artifact(
    async_client, auth_data, db_session, evidence_storage
):
    org_id = uuid.UUID(auth_data["org_id"])
    dependency_id = await _dependency(async_client, auth_data["headers"], "Idempotent Vendor")
    start = datetime.now(timezone.utc) - timedelta(minutes=20)
    incident = await _incident(db_session, org_id, dependency_id, started_at=start)
    _seed_window(
        db_session, dependency_id=dependency_id, org_id=org_id, start=start, up=4, down=2
    )
    await db_session.commit()

    first = await evidence_service.generate_for_incident(db_session, incident.id)
    pdfs_after_first = len(_pdf_objects(evidence_storage))

    # A task retry, a duplicated resolve and a second worker all arrive here.
    second = await evidence_service.generate_for_incident(db_session, incident.id)
    await db_session.commit()

    assert second.id == first.id
    assert len(_pdf_objects(evidence_storage)) == pdfs_after_first == 1

    reports = await EvidenceRepository.list_for_org(db_session, org_id)
    assert [report.id for report in reports] == [first.id]


@pytest.mark.asyncio
async def test_a_failed_generation_is_recorded_and_a_retry_succeeds(
    async_client, auth_data, db_session, mocker, evidence_storage
):
    org_id = uuid.UUID(auth_data["org_id"])
    dependency_id = await _dependency(async_client, auth_data["headers"], "Flaky Renderer")
    start = datetime.now(timezone.utc) - timedelta(minutes=20)
    incident = await _incident(db_session, org_id, dependency_id, started_at=start)
    _seed_window(
        db_session, dependency_id=dependency_id, org_id=org_id, start=start, up=4, down=1
    )
    await db_session.commit()

    boom = mocker.patch.object(
        evidence_service,
        "_html_to_pdf",
        new=AsyncMock(side_effect=RuntimeError("renderer exploded")),
    )
    with pytest.raises(EvidenceGenerationError):
        await evidence_service.generate_for_incident(db_session, incident.id)

    await db_session.refresh(incident)
    assert incident.evidence_status == EvidenceStatus.FAILED.value
    assert "renderer exploded" in incident.evidence_error
    assert incident.evidence_report_id is None
    # No half-written record pointing at a nonexistent object.
    assert await EvidenceRepository.get_by_incident(db_session, incident.id) is None
    assert _pdf_objects(evidence_storage) == []

    # Restore rendering without touching the storage patches, which belong to
    # the ``evidence_storage`` fixture and must stay in place.
    boom.side_effect = None
    boom.return_value = b"%PDF-1.4 restored"
    report = await evidence_service.generate_for_incident(db_session, incident.id)
    await db_session.commit()
    await db_session.refresh(incident)

    assert incident.evidence_status == EvidenceStatus.AVAILABLE.value
    assert incident.evidence_report_id == report.id
    assert incident.evidence_error is None
    assert len(_pdf_objects(evidence_storage)) == 1


@pytest.mark.asyncio
async def test_metrics_describe_the_incident_window_not_the_rolling_24h(
    async_client, auth_data, db_session, evidence_storage
):
    org_id = uuid.UUID(auth_data["org_id"])
    dependency_id = await _dependency(async_client, auth_data["headers"], "Windowed Vendor")
    start = datetime.now(timezone.utc) - timedelta(minutes=40)
    resolved = start + timedelta(minutes=10)
    incident = await _incident(db_session, org_id, dependency_id, started_at=start)
    # Two hours of healthy history that must not dilute the incident.
    _seed_window(
        db_session,
        dependency_id=dependency_id,
        org_id=org_id,
        start=start - timedelta(hours=2),
        up=40,
        down=0,
    )
    # The incident itself: half of the measured checks failed.
    _seed_window(
        db_session, dependency_id=dependency_id, org_id=org_id, start=start, up=2, down=2
    )
    await db_session.commit()

    await incident_service.resolve_incident(db_session, incident.id, org_id=org_id)
    await db_session.commit()
    resolved = incident.resolved_at

    await evidence_service.generate_for_incident(db_session, incident.id)
    await db_session.commit()

    payload = _json_sidecar(evidence_storage)
    metrics = payload["window_metrics"]
    assert metrics["total_checks"] == 4
    assert metrics["availability_pct"] == pytest.approx(50.0)
    assert metrics["insufficient_data"] is False
    assert metrics["window_start"].startswith(start.isoformat()[:19])
    assert metrics["window_end"].startswith(resolved.isoformat()[:19])

    # The rolling figure is present, labelled, and demonstrably different.
    context = payload["context_metrics"]
    assert context["rolling_24h_total_checks"] == 44
    assert context["rolling_24h_uptime_pct"] > 90.0
    assert "not the incident measurement" in context["note"]

    assert payload["sla_impact"]["impact_pct"] == pytest.approx(50.0)


@pytest.mark.asyncio
async def test_the_artifact_makes_no_multi_point_claims(
    async_client, auth_data, db_session, mocker, evidence_storage
):
    org_id = uuid.UUID(auth_data["org_id"])
    dependency_id = await _dependency(async_client, auth_data["headers"], "Honest Vendor")
    start = datetime.now(timezone.utc) - timedelta(minutes=20)
    incident = await _incident(db_session, org_id, dependency_id, started_at=start)
    _seed_window(
        db_session, dependency_id=dependency_id, org_id=org_id, start=start, up=6, down=2
    )
    await db_session.commit()

    rendered: dict[str, str] = {}
    real_render = evidence_service._render_html

    def spy(context):
        html = real_render(context)
        rendered["html"] = html
        return html

    mocker.patch.object(evidence_service, "_render_html", new=spy)
    await evidence_service.generate_for_incident(db_session, incident.id)

    html = rendered["html"]
    assert html
    for claim in BANNED_CLAIMS:
        assert claim not in html, f"artifact still claims {claim!r}"
    # The rule that actually fired is stated instead.
    assert "single.consecutive_failures" in html
    assert "persistence of failure" in html


@pytest.mark.asyncio
async def test_a_missing_artifact_is_reported_as_a_failure(
    async_client, auth_data, db_session, evidence_storage
):
    org_id = uuid.UUID(auth_data["org_id"])
    dependency_id = await _dependency(async_client, auth_data["headers"], "Lost Artifact")
    start = datetime.now(timezone.utc) - timedelta(minutes=15)
    incident = await _incident(db_session, org_id, dependency_id, started_at=start)
    _seed_window(
        db_session, dependency_id=dependency_id, org_id=org_id, start=start, up=4, down=1
    )
    await db_session.commit()

    report = await evidence_service.generate_for_incident(db_session, incident.id)
    await db_session.commit()

    # Someone deleted the object behind the record's back. The response model
    # deliberately exposes no storage key, so the path comes from the bucket.
    pdf_name = _pdf_objects(evidence_storage)[0]
    evidence_storage.objects.pop(pdf_name)

    with pytest.raises(EvidenceGenerationError) as excinfo:
        await evidence_service.get_report_download(db_session, org_id, report.id)
    assert "missing from object storage" in str(excinfo.value)


@pytest.mark.asyncio
async def test_a_plan_without_evidence_is_a_deliberate_state(
    async_client, auth_data, db_session, mocker, evidence_storage
):
    from sqlalchemy import update

    from app.modules.organizations.models import Organization

    org_id = uuid.UUID(auth_data["org_id"])
    # A brand-new organization is inside its 14-day full-access evaluation, so
    # it legitimately has Pro features. Age the evaluation out to get an org
    # whose *effective* plan is Free.
    long_ago = datetime.now(timezone.utc) - timedelta(days=40)
    await db_session.execute(
        update(Organization)
        .where(Organization.id == org_id)
        .values(
            plan="free",
            created_at=long_ago,
            evaluation_started_at=long_ago,
            evaluation_expires_at=long_ago + timedelta(days=14),
        )
    )
    await db_session.commit()

    dependency_id = await _dependency(async_client, auth_data["headers"], "Free Plan Vendor")
    start = datetime.now(timezone.utc) - timedelta(minutes=15)
    incident = await _incident(db_session, org_id, dependency_id, started_at=start)
    _seed_window(
        db_session, dependency_id=dependency_id, org_id=org_id, start=start, up=4, down=1
    )
    await db_session.commit()

    dispatch = mocker.patch("app.infrastructure.after_commit.dispatch_after_commit")
    await incident_service.resolve_incident(db_session, incident.id, org_id=org_id)
    await db_session.commit()
    await db_session.refresh(incident)

    # Nothing is queued, so no job can retry and die three times.
    dispatch.assert_not_called()
    assert incident.evidence_status == EvidenceStatus.NOT_ENTITLED.value
    assert incident.status == IncidentStatus.RESOLVED.value

    with pytest.raises(EvidenceNotEntitledError):
        await evidence_service.generate_for_incident(db_session, incident.id)
    await db_session.refresh(incident)
    assert incident.evidence_status == EvidenceStatus.NOT_ENTITLED.value
    assert await EvidenceRepository.get_by_incident(db_session, incident.id) is None
    assert _pdf_objects(evidence_storage) == []


@pytest.mark.asyncio
async def test_verification_describes_the_persisted_artifact(
    async_client, auth_data, db_session, evidence_storage
):
    org_id = uuid.UUID(auth_data["org_id"])
    dependency_id = await _dependency(async_client, auth_data["headers"], "Verifiable Vendor")
    start = datetime.now(timezone.utc) - timedelta(minutes=12)
    incident = await _incident(db_session, org_id, dependency_id, started_at=start)
    _seed_window(
        db_session, dependency_id=dependency_id, org_id=org_id, start=start, up=5, down=2
    )
    await db_session.commit()

    report = await evidence_service.generate_for_incident(db_session, incident.id)
    await db_session.commit()

    snapshot = await EvidenceSnapshotRepository.get_latest_for_incident(
        db_session, incident.id
    )
    assert snapshot is not None
    assert snapshot.report_file_path in evidence_storage.objects

    response = await async_client.get(f"/v1/verify/{snapshot.verification_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    assert body["data_hash"] == snapshot.data_hash

    # The two hashes are different values describing different things.
    assert snapshot.data_hash != snapshot.report_checksum
    pdf_bytes = evidence_storage.objects[snapshot.report_file_path]
    import hashlib

    assert hashlib.sha256(pdf_bytes).hexdigest() == snapshot.report_checksum
    assert report.checksum == snapshot.report_checksum


@pytest.mark.asyncio
async def test_an_empty_window_never_certifies_uptime(
    async_client, auth_data, db_session, evidence_storage
):
    org_id = uuid.UUID(auth_data["org_id"])
    dependency_id = await _dependency(async_client, auth_data["headers"], "No Data Vendor")
    start = datetime.now(timezone.utc) - timedelta(minutes=10)
    incident = await _incident(db_session, org_id, dependency_id, started_at=start)
    await db_session.commit()

    await evidence_service.generate_for_incident(db_session, incident.id)
    await db_session.commit()

    payload = _json_sidecar(evidence_storage)
    assert payload["window_metrics"]["availability_pct"] is None
    assert payload["window_metrics"]["insufficient_data"] is True
    assert payload["sla_impact"]["impact_pct"] is None
    assert payload["chart"]["rendered"] is False
