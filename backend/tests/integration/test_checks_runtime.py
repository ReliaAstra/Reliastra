"""Runtime tests for the check-execution pipeline.

These exercise the real code paths rather than mocks of them: the real Celery
task wrapper, the real repository writes against embedded Postgres, the real
router, and the real SSRF policy. Only the network hop is faked (no egress in
CI), and the broker hop is covered by ``backend/scripts/dev-stack.sh`` plus the
end-to-end run documented in ``docs/operations/checks-scheduling.md``.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.infrastructure.celery_app import celery_app
from app.modules.checks.constants import (
    BLOCKED_BY_SECURITY_POLICY_PREFIX,
    CheckState,
)
from app.modules.checks.scheduler_health import (
    record_scheduler_heartbeat,
    record_worker_heartbeat,
)


class _FakePinnedTransport(httpx.AsyncBaseTransport):
    """Stands in for the pinned httpcore transport (no real network in CI)."""

    def __init__(self, status_code: int = 200):
        self.status_code = status_code

    async def handle_async_request(self, request):
        return httpx.Response(status_code=self.status_code, request=request)


def _public_target():
    return MagicMock(
        url="https://api.example.com/health",
        hostname="api.example.com",
        port=443,
        ips=["93.184.216.34"],
    )


async def _create_dependency(async_client, headers, **overrides):
    payload = {
        "name": "Vendor API",
        "endpoint_url": "https://api.example.com/health",
        "method": "GET",
        "check_interval_seconds": 60,
        **overrides,
    }
    res = await async_client.post("/v1/dependencies", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


# ── pipeline health endpoint ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health_checks_is_503_until_beat_and_a_worker_report_in(
    async_client,
):
    """A deployment where checks have silently stopped must not probe green."""
    res = await async_client.get("/health/checks")
    assert res.status_code == 503
    body = res.json()
    assert body["status"] != "healthy"
    # The two signals are reported separately: Beat alive != worker consuming.
    assert body["scheduler"]["status"] == "not_observed"
    assert body["worker"]["status"] == "not_observed"
    assert body["scheduler"]["interval_seconds"] > 0
    # No infrastructure address or credential in the payload.
    assert "broker_url" not in body["broker"]

    await record_scheduler_heartbeat()
    await record_worker_heartbeat()

    res = await async_client.get("/health/checks")
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_health_reports_a_worker_gap_while_beat_is_alive(async_client):
    """The classic silent failure: Beat publishes, nobody consumes."""
    await record_scheduler_heartbeat()
    res = await async_client.get("/health/checks")
    assert res.status_code == 503
    body = res.json()
    assert body["scheduler"]["status"] == "healthy"
    assert body["worker"]["status"] == "not_observed"
    assert body["status"] == "degraded"


@pytest.mark.asyncio
async def test_root_health_exposes_check_pipeline_without_failing_readiness(
    async_client,
):
    """/health answers 'can the API serve', not 'can the pipeline probe'.

    Restarting the API does not revive a dead Beat, so conflating the two would
    make orchestrators restart-loop the API for an unrelated outage. The
    pipeline is surfaced here for visibility and fails on /health/checks.
    """
    res = await async_client.get("/health")
    body = res.json()
    assert body["checks"]["check_pipeline"] in {
        "healthy",
        "degraded",
        "unavailable",
    }
    assert "check_scheduler" in body["checks"]
    assert "check_worker" in body["checks"]


# ── check state endpoint ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_state_endpoint_separates_our_pipeline_from_the_target(
    async_client, auth_data
):
    headers = auth_data["headers"]
    dep = await _create_dependency(async_client, headers)

    res = await async_client.get(f"/v1/checks/state/{dep['id']}", headers=headers)
    assert res.status_code == 200, res.text
    state = res.json()
    # Nothing has probed it and the pipeline is not proven alive, so the honest
    # answer is an infrastructure state - never "successful".
    assert state["state"] != CheckState.SUCCESSFUL.value
    assert state["last_result"] is None
    assert state["is_target_problem"] is False
    assert state["pipeline"]["status"] != "healthy"
    assert state["detail"]


@pytest.mark.asyncio
async def test_state_endpoint_reports_a_blocked_target_as_our_policy_not_an_outage(
    async_client, auth_data, monkeypatch
):
    """SSRF rejection must never read as 'the vendor is down'."""
    headers = auth_data["headers"]
    dep = await _create_dependency(
        async_client,
        headers,
        name="Local thing",
        endpoint_url="http://127.0.0.1:9/nope",
    )

    monkeypatch.setattr(celery_app.conf, "task_always_eager", True)
    from app.modules.checks.tasks import execute_check

    execute_check.apply(args=[dep["id"], "us-east"]).get()

    res = await async_client.get(f"/v1/checks/state/{dep['id']}", headers=headers)
    assert res.status_code == 200, res.text
    state = res.json()
    assert state["state"] == CheckState.BLOCKED_BY_SECURITY_POLICY.value
    assert state["last_result"]["is_up"] is False
    assert state["last_result"]["error_message"].startswith(
        BLOCKED_BY_SECURITY_POLICY_PREFIX
    )
    # A policy rejection is not the vendor's fault and not a pipeline fault.
    assert state["is_target_problem"] is False
    assert state["is_infrastructure_problem"] is False


# ── real task execution → CheckResult ───────────────────────────────────────


@pytest.mark.asyncio
async def test_worker_task_execution_writes_a_check_result(
    async_client, auth_data, monkeypatch, db_session
):
    """The actual Celery task, through the real wrapper, produces a row.

    This is the step that unit tests cannot cover: ``execute_check.delay()`` →
    ``async_task_body`` → service → repository → Postgres.
    """
    from sqlalchemy import select

    from app.modules.checks.models import CheckResult

    headers = auth_data["headers"]
    dep = await _create_dependency(async_client, headers)

    monkeypatch.setattr(celery_app.conf, "task_always_eager", True)
    from app.modules.checks.tasks import execute_check

    with patch(
        "app.modules.checks.service.resolve_pinned_target_async",
        new=AsyncMock(return_value=_public_target()),
    ), patch(
        "app.modules.checks.service.pinned_transport_for",
        return_value=_FakePinnedTransport(status_code=200),
    ):
        result = execute_check.apply(args=[dep["id"], "us-east"]).get()

    assert result is not None
    assert result["is_up"] is True
    assert result["dependency_id"] == dep["id"]

    rows = (
        await db_session.execute(
            select(CheckResult).where(
                CheckResult.dependency_id == uuid.UUID(dep["id"])
            )
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].is_up is True
    assert rows[0].status_code == 200
    assert rows[0].latency_ms >= 0.0

    # And it is visible through the customer-facing history endpoint.
    history = await async_client.get(
        f"/v1/dependencies/{dep['id']}/results", headers=headers
    )
    assert history.status_code == 200
    assert len(history.json()["data"]) == 1


@pytest.mark.asyncio
async def test_state_after_a_real_probe_reports_the_target(async_client, auth_data, monkeypatch):
    headers = auth_data["headers"]
    dep = await _create_dependency(async_client, headers)

    monkeypatch.setattr(celery_app.conf, "task_always_eager", True)
    from app.modules.checks.tasks import execute_check

    await record_scheduler_heartbeat()
    await record_worker_heartbeat()
    with patch(
        "app.modules.checks.service.resolve_pinned_target_async",
        new=AsyncMock(return_value=_public_target()),
    ), patch(
        "app.modules.checks.service.pinned_transport_for",
        return_value=_FakePinnedTransport(status_code=200),
    ):
        execute_check.apply(args=[dep["id"], "us-east"]).get()

    state = (
        await async_client.get(f"/v1/checks/state/{dep['id']}", headers=headers)
    ).json()
    assert state["state"] == CheckState.SUCCESSFUL.value
    assert state["is_target_problem"] is True
    assert state["is_infrastructure_problem"] is False


# ── manual trigger ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_manual_trigger_enqueues_the_same_task_the_scheduler_uses(
    async_client, auth_data
):
    """Diagnostic parity: no second probe implementation, no Celery bypass."""
    headers = auth_data["headers"]
    dep = await _create_dependency(async_client, headers)

    delayed: list[tuple[str, str]] = []
    sentinel = MagicMock()
    sentinel.id = "task-abc"
    sentinel.state = "PENDING"

    class _RecordingTask:
        @staticmethod
        def delay(dep_id, region, request_id=None):
            delayed.append((dep_id, region))
            return sentinel

    with patch("app.modules.checks.tasks.execute_check", _RecordingTask):
        res = await async_client.post(
            "/v1/checks/run",
            headers=headers,
            json={"dependency_id": dep["id"], "region": "us-east"},
        )

    assert res.status_code == 202, res.text
    body = res.json()
    assert body["dependency_id"] == dep["id"]
    assert body["regions"] == ["us-east"]
    assert body["queued"][0]["task_id"] == "task-abc"
    # The exact production task, with the exact production arguments.
    assert delayed == [(dep["id"], "us-east")]

    # Triggering is a diagnostic: it must not move the Beat schedule.
    detail = (
        await async_client.get(f"/v1/dependencies/{dep['id']}", headers=headers)
    ).json()
    assert detail["next_check_at"] is not None


@pytest.mark.asyncio
async def test_manual_trigger_defaults_to_every_configured_region(
    async_client, auth_data
):
    headers = auth_data["headers"]
    dep = await _create_dependency(async_client, headers)
    delayed: list[str] = []

    class _RecordingTask:
        @staticmethod
        def delay(dep_id, region, request_id=None):
            delayed.append(region)
            return MagicMock(id="t", state="PENDING")

    with patch("app.modules.checks.tasks.execute_check", _RecordingTask):
        res = await async_client.post(
            "/v1/checks/run", headers=headers, json={"dependency_id": dep["id"]}
        )
    assert res.status_code == 202, res.text
    assert delayed == res.json()["regions"]
    assert len(delayed) >= 1


@pytest.mark.asyncio
async def test_manual_trigger_reports_503_when_the_broker_is_down(
    async_client, auth_data
):
    """Broker down is reported as an infrastructure failure, not swallowed."""
    headers = auth_data["headers"]
    dep = await _create_dependency(async_client, headers)

    class _BrokenTask:
        @staticmethod
        def delay(dep_id, region, request_id=None):
            raise OperationalError("Error while reading from socket")

    with patch("app.modules.checks.tasks.execute_check", _BrokenTask):
        res = await async_client.post(
            "/v1/checks/run",
            headers=headers,
            json={"dependency_id": dep["id"], "region": "us-east"},
        )

    assert res.status_code == 503, res.text
    body = res.json()["error"]
    assert body["code"] == "SERVICE_UNAVAILABLE"
    assert "broker" in body["message"].lower()
    # No broker URL, no credentials.
    assert "://" not in str(body)

    # And the failure is visible on the state endpoint.
    state = (
        await async_client.get(f"/v1/checks/state/{dep['id']}", headers=headers)
    ).json()
    assert state["state"] == CheckState.DISPATCH_FAILED.value
    assert state["is_infrastructure_problem"] is True


@pytest.mark.asyncio
async def test_manual_trigger_validates_region_and_ownership(async_client, auth_data):
    headers = auth_data["headers"]
    dep = await _create_dependency(async_client, headers)

    bad_region = await async_client.post(
        "/v1/checks/run",
        headers=headers,
        json={"dependency_id": dep["id"], "region": "mars-north"},
    )
    assert bad_region.status_code == 422

    unknown = await async_client.post(
        "/v1/checks/run",
        headers=headers,
        json={"dependency_id": str(uuid.uuid4())},
    )
    assert unknown.status_code == 404


@pytest.mark.asyncio
async def test_manual_trigger_requires_authentication(async_client, auth_data):
    dep = await _create_dependency(async_client, auth_data["headers"])
    res = await async_client.post(
        "/v1/checks/run", json={"dependency_id": dep["id"]}
    )
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_manual_trigger_is_rate_limited_per_organization(
    async_client, auth_data
):
    """A diagnostic must not be usable to drive probe traffic at a target."""
    from app.core.rate_limit import check_trigger_limiter

    headers = auth_data["headers"]
    dep = await _create_dependency(async_client, headers)
    limit = check_trigger_limiter.limit

    class _RecordingTask:
        @staticmethod
        def delay(dep_id, region, request_id=None):
            return MagicMock(id="t", state="PENDING")

    with patch("app.modules.checks.tasks.execute_check", _RecordingTask):
        for _ in range(limit):
            res = await async_client.post(
                "/v1/checks/run",
                headers=headers,
                json={"dependency_id": dep["id"], "region": "us-east"},
            )
            assert res.status_code == 202, res.text
        over = await async_client.post(
            "/v1/checks/run",
            headers=headers,
            json={"dependency_id": dep["id"], "region": "us-east"},
        )
    assert over.status_code == 429


class OperationalError(Exception):
    """Stands in for a broker connection error."""
