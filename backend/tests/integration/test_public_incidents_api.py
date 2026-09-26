"""Public incident intelligence against a real migrated database.

Covers the whole Phase 4 path: detector opens/resolves from observation
runs, the vendor incidents endpoint reports them, the global search filters
and paginates, the detail endpoint carries provenance, and nothing leaks
across vendors.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest


def _ts(minutes_ago: int = 0) -> datetime:
    return datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)


async def _seed(db_session):
    from sqlalchemy import select

    from app.modules.vendors.models import VendorEndpoint, VendorTracking
    from app.modules.vendors.service import vendor_service

    await vendor_service.seed_vendors(db_session)
    await db_session.commit()
    vendor = (
        await db_session.execute(
            select(VendorTracking).where(VendorTracking.vendor_name == "stripe")
        )
    ).scalar_one()
    endpoint = (
        await db_session.execute(
            select(VendorEndpoint).where(VendorEndpoint.vendor_id == vendor.id)
        )
    ).scalars().first()
    return vendor, endpoint


async def _record(db_session, endpoint, minutes_ago: int, *, ok: bool, status: int | None):
    from app.modules.observations.schemas import ObservationCreateDTO
    from app.modules.observations.service import observation_service

    return await observation_service.record_observation(
        db_session,
        ObservationCreateDTO(
            timestamp=_ts(minutes_ago),
            source_type="vendor_probe",
            source_id=endpoint.id,
            region="us-east",
            endpoint_url=endpoint.endpoint_url,
            latency_ms=120.0 if ok else 0.0,
            status_code=status,
            error_type=None if ok else "probe_failed",
            error_message=None if ok else "HTTP failure",
            metadata={"is_up": ok},
        ),
    )


async def _apply(db_session, endpoint, vendor, observation):
    from app.modules.incidents.public_service import public_incident_service

    return await public_incident_service.apply_vendor_observation(
        db_session,
        endpoint=endpoint,
        vendor=vendor,
        observation=observation,
        region="us-east",
    )


@pytest.mark.asyncio
async def test_detector_opens_and_resolves_from_observation_runs(async_client, db_session):
    vendor, endpoint = await _seed(db_session)

    # Recording and detection run interleaved, like the probe task: only
    # observations that already happened exist when each decision is made.
    ok0 = await _record(db_session, endpoint, 30, ok=True, status=200)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, ok0) is None

    fail1 = await _record(db_session, endpoint, 25, ok=False, status=503)
    await db_session.commit()
    # Single failure: the gate holds, nothing published yet.
    assert await _apply(db_session, endpoint, vendor, fail1) is None

    fail2 = await _record(db_session, endpoint, 20, ok=False, status=503)
    await db_session.commit()
    opened = await _apply(db_session, endpoint, vendor, fail2)
    await db_session.commit()
    assert opened is not None
    assert opened.status == "open"
    assert opened.vendor_id == vendor.id
    assert opened.failure_kind == "http_5xx"

    # Vendor-scoped endpoint returns it.
    res = await async_client.get("/v1/vendors/stripe/incidents")
    assert res.status_code == 200, res.text
    incidents = res.json()["incidents"]
    assert len(incidents) == 1
    assert incidents[0]["incident_id"] == str(opened.id)
    assert incidents[0]["status"] == "open"
    assert incidents[0]["dependency_name"] == "Official status page"

    # Global search sees it without filters.
    res = await async_client.get("/v1/public/incidents")
    assert res.status_code == 200, res.text
    ids = [i["incident_id"] for i in res.json()["items"]]
    assert str(opened.id) in ids

    # Filters: vendor match and non-match, category, status.
    assert [i["incident_id"] for i in (await async_client.get("/v1/public/incidents?vendor=stripe")).json()["items"]]
    assert (await async_client.get("/v1/public/incidents?vendor=twilio")).json()["items"] == []
    assert (await async_client.get("/v1/public/incidents?category=payments")).json()["items"]
    assert (await async_client.get("/v1/public/incidents?category=identity")).json()["items"] == []
    assert (await async_client.get("/v1/public/incidents?status=resolved")).json()["items"] == []
    assert (await async_client.get("/v1/public/incidents?status=nonsense")).status_code in (400, 422)

    # Detail carries the full provenance.
    detail = (await async_client.get(f"/v1/public/incidents/{opened.id}")).json()
    assert detail["failure_kind"] == "http_5xx"
    assert detail["status_codes"] == [503]
    assert detail["detection_rule"]
    assert detail["region"] == "us-east"
    assert detail["attribution_status"] == "observed"
    assert "consecutive failed observations" in detail["description"]
    assert detail["vendor_name"] == "stripe"

    # Two consecutive recoveries resolve it, recorded stepwise as before.
    ok1 = await _record(db_session, endpoint, 10, ok=True, status=200)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, ok1) is None
    ok2 = await _record(db_session, endpoint, 5, ok=True, status=200)
    await db_session.commit()
    resolved = await _apply(db_session, endpoint, vendor, ok2)
    await db_session.commit()
    assert resolved is not None
    assert resolved.status == "resolved"
    assert resolved.resolved_at is not None

    # The pre-resolution `?status=resolved` query above cached an empty page;
    # the vendor=stripe variant was never queried, so it reads live data.
    resolved_list = (await async_client.get("/v1/public/incidents?status=resolved&vendor=stripe")).json()["items"]
    assert str(opened.id) in [i["incident_id"] for i in resolved_list]
    assert resolved_list[0]["duration_seconds"] is not None

    # Unknown id: a clean 404, nothing else.
    assert (await async_client.get(f"/v1/public/incidents/{uuid.uuid4()}")).status_code == 404
    # Malformed cursor is a 400, not a 500 and not silently ignored.
    assert (await async_client.get("/v1/public/incidents?cursor=garbage")).status_code in (400, 422)
