"""The acceptance path, end to end, against a dependency that really fails.

A vendor goes down. RELIASTRA notices, opens exactly one incident, keeps
observing, sees the recovery, resolves it, and produces an evidence artifact
computed from the checks inside that incident's own window. The artifact is
stored, linked to the incident, visible in the console without a manual step,
and verifiable against the exact bytes that were written.

Everything here is real except two things, both of which are infrastructure
rather than behaviour: the loopback HTTP server standing in for the vendor, and
the in-memory object store standing in for S3. The checks are issued over
HTTP, the detection rule runs for real, the evidence is rendered to a real PDF,
and the Celery publish goes through the real canvas API.
"""

import hashlib
import http.server
import json
import threading
import uuid
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import select

from app.modules.checks.models import CheckResult
from app.modules.checks.service import check_service
from app.modules.evidence.service import evidence_service
from app.modules.incidents.constants import EvidenceStatus, IncidentStatus
from app.modules.incidents.models import Incident


class _Vendor:
    """A dependency that can be told to fail, and then to come back."""

    def __init__(self) -> None:
        self.failing = True
        self.requests = 0


_VENDOR = _Vendor()


class _VendorHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        _VENDOR.requests += 1
        if _VENDOR.failing:
            self.send_response(503)
            self.end_headers()
            self.wfile.write(b"503 Service Unavailable - simulated vendor outage")
            return
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, format: str, *args: object) -> None:
        pass


@pytest.fixture(scope="module")
def vendor_url():
    _VENDOR.failing = True
    _VENDOR.requests = 0
    server = http.server.HTTPServer(("127.0.0.1", 0), _VendorHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
    server.server_close()


@pytest.fixture
def probe_targets(mocker, vendor_url):
    """Point the probe at the loopback vendor.

    Only the SSRF resolution step is bypassed, and only because the target is
    deliberately a loopback address; production SSRF protection is untouched.
    """
    from app.core.ssrf_protection import PinnedTarget

    mocker.patch(
        "app.modules.checks.http_probe.resolve_pinned_target_async",
        new=AsyncMock(
            return_value=PinnedTarget(
                url=vendor_url,
                hostname="127.0.0.1",
                port=int(vendor_url.rsplit(":", 1)[1]),
                ips=["127.0.0.1"],
            )
        ),
    )
    mocker.patch(
        "app.modules.checks.http_probe.pinned_transport_for",
        return_value=httpx.AsyncHTTPTransport(),
    )


async def _open_incidents(db_session, dependency_id):
    result = await db_session.execute(
        select(Incident).where(
            Incident.dependency_id == uuid.UUID(dependency_id),
            Incident.status == IncidentStatus.OPEN.value,
        )
    )
    return list(result.scalars().all())


async def _all_incidents(db_session, dependency_id):
    result = await db_session.execute(
        select(Incident).where(Incident.dependency_id == uuid.UUID(dependency_id))
    )
    return list(result.scalars().all())


async def _checks(db_session, dependency_id):
    result = await db_session.execute(
        select(CheckResult)
        .where(CheckResult.dependency_id == uuid.UUID(dependency_id))
        .order_by(CheckResult.executed_at.asc())
    )
    return list(result.scalars().all())


@pytest.mark.asyncio
async def test_outage_to_verifiable_evidence(
    async_client, auth_data, db_session, vendor_url, probe_targets, evidence_storage
):
    # ── 1. a real dependency, pointed at a vendor that is failing ─────────
    # A freshly registered organization is inside its 14-day full-access
    # evaluation, so evidence generation is entitled without a paid plan.
    headers = auth_data["headers"]

    created = await async_client.post(
        "/v1/dependencies",
        headers=headers,
        json={"name": "Payments Vendor", "endpoint_url": f"{vendor_url}/health"},
    )
    assert created.status_code == 201, created.text
    dependency_id = created.json()["id"]

    # ── 2. deterministic detection: one incident, opened by the rule ──────
    first = await check_service.execute_check(db_session, uuid.UUID(dependency_id), "us-east")
    await db_session.commit()
    assert first.is_up is False
    assert first.status_code == 503
    # One failed check is recorded, not declared: the debounce holds.
    assert len(await _open_incidents(db_session, dependency_id)) == 0

    second = await check_service.execute_check(db_session, uuid.UUID(dependency_id), "us-east")
    await db_session.commit()
    assert second.quorum_confirmed is True  # the detector-confirmation flag

    open_incidents = await _open_incidents(db_session, dependency_id)
    assert len(open_incidents) == 1, "one confirmed failure opens exactly one incident"
    incident = open_incidents[0]
    assert incident.detection_rule == "single.consecutive_failures"
    assert incident.detection_metadata["confirmed"] is True
    assert incident.detection_metadata["required"] == 2
    assert "consecutive failed checks" in incident.detection_metadata["reason"]

    # ── 3. the outage continues: no duplicate incidents ───────────────────
    for _ in range(3):
        await check_service.execute_check(db_session, uuid.UUID(dependency_id), "us-east")
    await db_session.commit()
    assert len(await _open_incidents(db_session, dependency_id)) == 1
    assert len(await _all_incidents(db_session, dependency_id)) == 1

    checks_after_outage = await _checks(db_session, dependency_id)
    assert len(checks_after_outage) == 5
    assert all(not check.is_up for check in checks_after_outage)

    # ── 4. the vendor recovers; the incident resolves ─────────────────────
    _VENDOR.failing = False
    recovered = await check_service.execute_check(db_session, uuid.UUID(dependency_id), "us-east")
    await db_session.commit()
    assert recovered.is_up is True
    assert len(await _open_incidents(db_session, dependency_id)) == 1  # one success: not yet

    await check_service.execute_check(db_session, uuid.UUID(dependency_id), "us-east")
    await db_session.commit()

    await db_session.refresh(incident)
    assert incident.status == IncidentStatus.RESOLVED.value
    assert incident.resolved_at is not None

    # ── 5. resolution requested generation, after commit ──────────────────
    assert incident.evidence_status == EvidenceStatus.GENERATING.value
    assert incident.evidence_report_id is None

    # ── 6. the worker's step: build the artifact ──────────────────────────
    report = await evidence_service.generate_for_incident(db_session, incident.id)
    await db_session.commit()
    await db_session.refresh(incident)

    assert incident.evidence_status == EvidenceStatus.AVAILABLE.value
    assert incident.evidence_report_id == report.id
    assert report.file_size_bytes > 0

    pdf_names = [name for name in evidence_storage.objects if name.endswith(".pdf")]
    json_names = [name for name in evidence_storage.objects if name.endswith(".json")]
    assert len(pdf_names) == 1 and len(json_names) == 1
    pdf_bytes = evidence_storage.objects[pdf_names[0]]
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) == report.file_size_bytes

    # ── 7. the numbers describe the incident window, not the last 24 hours ─
    all_checks = await _checks(db_session, dependency_id)
    in_window = [
        check
        for check in all_checks
        if incident.started_at <= check.executed_at <= incident.resolved_at
    ]
    up_in_window = sum(1 for check in in_window if check.is_up)

    # The window opens at the FIRST failure of the run, not at the check that
    # crossed the threshold - otherwise the artifact would under-report the
    # outage by one check interval.
    assert incident.started_at == all_checks[0].executed_at
    # It closes at resolution, so the two checks that proved recovery are part
    # of the record: an SLA document cannot quietly drop the evidence that the
    # vendor came back.
    assert len(in_window) == 7
    assert up_in_window == 2

    payload = json.loads(evidence_storage.objects[json_names[0]])
    metrics = payload["window_metrics"]
    assert metrics["total_checks"] == len(in_window)
    assert metrics["up_checks"] == up_in_window
    assert metrics["down_checks"] == 5
    assert metrics["availability_pct"] == pytest.approx(2 / 7 * 100, abs=1e-4)
    assert metrics["longest_failure_run"] == 5
    assert payload["sla_impact"]["impact_pct"] == pytest.approx(5 / 7 * 100, abs=1e-4)
    assert payload["detection"]["rule"] == "single.consecutive_failures"
    # The chart is drawn from these same observations: the two recovery checks
    # carry latency, and every failed check is marked rather than smoothed away.
    chart = payload["chart"]
    assert chart["rendered"] is True
    assert chart["observations_available"] == len(in_window)
    assert chart["failed_marks"] == 5
    assert payload["observations_truncated"] is False

    # The document says what it is: one observation point, no regional vote.
    for banned in ("Multi-Region", "Quorum Confirmed", "Verification Regions"):
        assert banned not in json.dumps(payload)

    # ── 8. the console shows it without a manual step ─────────────────────
    listed = await async_client.get("/v1/incidents", headers=headers)
    assert listed.status_code == 200
    row = next(item for item in listed.json()["data"] if item["id"] == str(incident.id))
    assert row["evidence_status"] == EvidenceStatus.AVAILABLE.value
    assert row["evidence_report_id"] == str(report.id)

    fetched = await async_client.get(f"/v1/incidents/{incident.id}/evidence", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["id"] == str(report.id)

    # ── 9. verification runs against the exact stored bytes ───────────────
    from app.modules.evidence.repository import EvidenceSnapshotRepository

    snapshot = await EvidenceSnapshotRepository.get_latest_for_incident(
        db_session, incident.id
    )
    assert snapshot is not None
    verification = await async_client.get(f"/v1/verify/{snapshot.verification_id}")
    assert verification.status_code == 200
    assert verification.json()["found"] is True
    assert verification.json()["data_hash"] == snapshot.data_hash
    assert hashlib.sha256(pdf_bytes).hexdigest() == snapshot.report_checksum
    assert snapshot.data_hash != snapshot.report_checksum

    # ── 10. a repeated attempt changes nothing ────────────────────────────
    again = await evidence_service.generate_for_incident(db_session, incident.id)
    await db_session.commit()
    assert again.id == report.id
    assert len([n for n in evidence_storage.objects if n.endswith(".pdf")]) == 1
