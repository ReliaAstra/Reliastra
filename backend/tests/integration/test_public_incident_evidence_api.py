"""Public incident evidence against a real migrated database.

Exercises the whole phase 5 pipeline the way production runs it: the probe
path records observations and applies detection interleaved and
chronologically, the outbox processor (the real one) drains the freeze
events, and the API serves the frozen bytes. Hash verification is executed
literally, the way a third party would.
"""

import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest


def _ts(minutes_ago: int) -> datetime:
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


async def _record(db_session, endpoint, minutes_ago: int, *, ok: bool, status: int):
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


async def _drain_outbox(db_session):
    from app.modules.observations.outbox import process_outbox_batch

    return await process_outbox_batch(db_session, limit=100)


def _verify_document_bytes(body: bytes) -> dict:
    """The published verification recipe, executed end to end."""
    document = json.loads(body)
    core = {k: v for k, v in document.items() if k != "verification"}
    recomputed = hashlib.sha256(
        json.dumps(core, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    assert document["verification"]["algorithm"] == "sha256"
    assert document["verification"]["payload_sha256"] == recomputed
    return document


@pytest.mark.asyncio
async def test_evidence_lifecycle_from_probe_to_served_bytes(async_client, db_session, fake_redis):
    vendor, endpoint = await _seed(db_session)

    # Chronological record/detection interleave: only the past exists when
    # each decision is made.
    ok0 = await _record(db_session, endpoint, 40, ok=True, status=200)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, ok0) is None

    fail1 = await _record(db_session, endpoint, 30, ok=False, status=503)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, fail1) is None

    fail2 = await _record(db_session, endpoint, 25, ok=False, status=503)
    await db_session.commit()
    opened = await _apply(db_session, endpoint, vendor, fail2)
    await db_session.commit()
    assert opened is not None
    assert opened is not None and opened.status == "open"

    # No artifact until the outbox drains: the read path never generates.
    res = await async_client.get(f"/v1/public/incidents/{opened.id}/evidence")
    assert res.status_code == 404

    assert await _drain_outbox(db_session) >= 1
    await db_session.commit()

    # The served body is the stored bytes; the published recipe verifies.
    res = await async_client.get(f"/v1/public/incidents/{opened.id}/evidence")
    assert res.status_code == 200, res.text
    document = _verify_document_bytes(res.content)
    assert document["artifact"]["evidence_version"] == 1
    assert document["artifact"]["supersedes_version"] is None
    assert document["incident"]["id"] == str(opened.id)
    assert document["incident"]["vendor"] == "stripe"
    assert document["incident"]["region"] == "us-east"
    assert document["incident"]["status"] == "open"
    assert document["methodology"]["attribution"] == "observed"
    # The claim text in the artifact is the incident's stored claim, word
    # for word - no second narrative version exists.
    assert document["methodology"]["claim"] == opened.description
    # The window rows are real observations, oldest first.
    rows = document["observations"]["rows"]
    assert len(rows) >= 3
    timestamps = [row["timestamp"] for row in rows]
    assert timestamps == sorted(timestamps)
    assert all(row["id"] for row in rows)
    assert document["observations"]["truncated"] is False

    # Headers carry what a verifier needs without parsing the body.
    assert res.headers["etag"] == f'"{document["verification"]["payload_sha256"]}"'
    assert res.headers["x-reliastra-evidence-version"] == "1"
    assert res.headers["x-reliastra-methodology-version"] == "v1.0"

    # Detail response carries the descriptor pointing at those bytes.
    detail = (await async_client.get(f"/v1/public/incidents/{opened.id}")).json()
    assert detail["evidence"] is not None
    assert detail["evidence"]["version"] == 1
    assert detail["evidence"]["data_hash"] == document["verification"]["payload_sha256"]
    assert detail["evidence"]["observation_count"] == document["observations"]["count"]

    # Reproducibility: the builder rerun over the same stored facts produces
    # the same hash (determinism is a property of stored data, not luck).
    from app.modules.incidents.public_evidence import (
        PublicIncidentEvidenceRepository,
        build_evidence_document,
        finalize_document,
    )
    from app.modules.observations.repository import ObservationRepository

    stored = await PublicIncidentEvidenceRepository.latest_for_incident(
        db_session, opened.id
    )
    assert stored is not None
    rows_models = await ObservationRepository.list_for_endpoints(
        db_session,
        [opened.endpoint_url],
        limit=1000,
    )
    rebuilt = finalize_document(
        build_evidence_document(
            opened,
            vendor,
            list(reversed(rows_models)),
            version=1,
            supersedes_version=None,
            truncated=False,
        )
    )
    assert json.loads(stored.payload) == rebuilt

    # Resolution: two consecutive recoveries, stepwise.
    ok1 = await _record(db_session, endpoint, 10, ok=True, status=200)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, ok1) is None
    ok2 = await _record(db_session, endpoint, 5, ok=True, status=200)
    await db_session.commit()
    resolved = await _apply(db_session, endpoint, vendor, ok2)
    await db_session.commit()
    assert resolved is not None and resolved.status == "resolved"
    assert resolved.resolution_observation_id == str(ok2.id)

    assert await _drain_outbox(db_session) >= 1
    await db_session.commit()

    # Latest now serves the resolution freeze; the pinned version still
    # serves the open one, unchanged. The 60s latest cache is per-URL, so
    # the pre-resolution read is flushed here the way the documented test
    # doctrine requires before asserting the post-transition state.
    await fake_redis.flushdb()
    latest = (await async_client.get(f"/v1/public/incidents/{opened.id}/evidence"))
    latest_document = _verify_document_bytes(latest.content)
    assert latest_document["artifact"]["evidence_version"] == 2
    assert latest_document["artifact"]["supersedes_version"] == 1
    assert latest_document["incident"]["status"] == "resolved"
    assert latest_document["incident"]["duration_ms"] is not None

    pinned = await async_client.get(
        f"/v1/public/incidents/{opened.id}/evidence/versions/1"
    )
    assert pinned.status_code == 200
    pinned_document = json.loads(pinned.content)
    assert pinned_document["incident"]["status"] == "open"
    assert pinned.content == stored.payload.encode("utf-8")

    assert (
        await async_client.get(
            f"/v1/public/incidents/{opened.id}/evidence/versions/999"
        )
    ).status_code == 404
    # Unknown incident: the evidence URL 404s like the record URL does.
    assert (
        await async_client.get(f"/v1/public/incidents/{uuid.uuid4()}/evidence")
    ).status_code == 404

    # Immutability, enforced by flush: an edited artifact refuses to save.
    from sqlalchemy import update

    from app.modules.incidents.public_evidence_models import PublicIncidentEvidence

    with pytest.raises(ValueError, match="immutable"):
        await db_session.execute(
            update(PublicIncidentEvidence)
            .where(PublicIncidentEvidence.id == stored.id)
            .values(payload="{}")
        )
        # ORM-event guards fire on unit-of-work flush; force the flush path.
        obj = await db_session.get(PublicIncidentEvidence, stored.id)
        obj.payload = "{}"
        await db_session.flush()


@pytest.mark.asyncio
async def test_reconciliation_freezes_what_the_outbox_missed(async_client, db_session):
    from app.modules.incidents.public_evidence import (
        public_incident_evidence_service,
    )

    vendor, endpoint = await _seed(db_session)

    ok0 = await _record(db_session, endpoint, 40, ok=True, status=200)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, ok0) is None
    fail1 = await _record(db_session, endpoint, 30, ok=False, status=503)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, fail1) is None
    fail2 = await _record(db_session, endpoint, 25, ok=False, status=503)
    await db_session.commit()
    opened = await _apply(db_session, endpoint, vendor, fail2)
    await db_session.commit()
    assert opened is not None
    ok1 = await _record(db_session, endpoint, 10, ok=True, status=200)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, ok1) is None
    ok2 = await _record(db_session, endpoint, 5, ok=True, status=200)
    await db_session.commit()
    resolved = await _apply(db_session, endpoint, vendor, ok2)
    await db_session.commit()

    # Simulate a processor outage: the events stay queued, nothing frozen.
    created = await public_incident_evidence_service.reconcile(db_session, 200)
    await db_session.commit()
    assert created >= 1

    res = await async_client.get(f"/v1/public/incidents/{resolved.id}/evidence")
    assert res.status_code == 200
    document = json.loads(res.content)
    # The sweep froze the incident's CURRENT state in one step: a resolved
    # artifact, no stale open freeze ahead of it.
    assert document["incident"]["status"] == "resolved"
    assert document["artifact"]["evidence_version"] == 1

    # Re-running the sweep is a no-op: idempotent by freeze rule.
    assert await public_incident_evidence_service.reconcile(db_session, 200) == 0
