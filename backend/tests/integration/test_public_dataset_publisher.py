"""Public dataset publisher against a real migrated database.

Runs the whole phase 8 pipeline the way production does: the probe path
records and detects interleaved, the real outbox processor drains the
evidence freeze AND the dataset refresh event it enqueues, and the publisher
derives the dataset from canonical rows, commits (GitHub boundary mocked at
the client seam), records the publication, and proves idempotency.
"""

import json
from datetime import datetime, timedelta, timezone

import pytest
from pydantic import SecretStr


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


def _configure_github(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "DATASET_GITHUB_TOKEN", SecretStr("test-token"))
    monkeypatch.setattr(settings, "DATASET_GITHUB_REPO", "owner/dataset")
    monkeypatch.setattr(settings, "DATASET_GITHUB_BRANCH", "main")


@pytest.fixture
def fake_commit(monkeypatch):
    """Mock the GitHub commit seam; capture the trees it was handed."""
    calls = []
    counter = {"n": 0}

    async def _commit(files, message, *, config):
        counter["n"] += 1
        n = counter["n"]
        calls.append({"files": dict(files), "message": message, "config": config})
        # Real GitHub shas are content+parent+time addressed: a new commit is
        # always a new sha. Mirroring that here keeps the publication rows
        # (unique on commit sha per target+branch) honest.
        return f"{n:040x}", f"{n + 1000:040x}"

    from app.modules.dataset import service as dataset_service

    monkeypatch.setattr(dataset_service, "commit_tree", _commit)
    return calls


@pytest.mark.asyncio
async def test_outbox_freeze_triggers_dataset_publication(
    async_client, db_session, monkeypatch, fake_commit
):
    from sqlalchemy import select

    from app.modules.dataset.models import DatasetPublication
    from app.modules.dataset.service import dataset_publication_service

    _configure_github(monkeypatch)
    vendor, endpoint = await _seed(db_session)

    # Interleaved record/detect, chronological: open the incident.
    ok0 = await _record(db_session, endpoint, 30, ok=True, status=200)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, ok0) is None
    fail1 = await _record(db_session, endpoint, 20, ok=False, status=503)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, fail1) is None
    fail2 = await _record(db_session, endpoint, 15, ok=False, status=503)
    await db_session.commit()
    opened = await _apply(db_session, endpoint, vendor, fail2)
    await db_session.commit()
    assert opened is not None

    # One drain: the evidence freeze runs, and the dataset refresh event it
    # enqueued lands in the SAME queue. Drain twice so the refresh event is
    # consumed too (events enqueued during a batch stay for the next one).
    assert await _drain_outbox(db_session) >= 1
    await db_session.commit()
    await db_session.flush()
    assert await _drain_outbox(db_session) >= 1
    await db_session.commit()

    # The publisher committed the dataset and recorded the publication.
    assert len(fake_commit) == 1
    files = fake_commit[0]["files"]
    assert "README.md" in files
    assert "catalog.json" in files
    assert "incidents/index.jsonl" in files
    assert f"incidents/{opened.id}.json" in files
    # The freeze in this drain cycle produced the evidence file; the dataset
    # mirror carries its verbatim bytes.
    evidence_path = f"evidence/{opened.id}.json"
    assert evidence_path in files
    latest_evidence = json.loads(files[evidence_path])
    assert latest_evidence["incident"]["id"] == str(opened.id)

    row = (
        await db_session.execute(select(DatasetPublication))
    ).scalars().one()
    assert row.target == "owner/dataset"
    assert row.branch == "main"
    assert row.incident_count == 1
    assert row.evidence_count == 1
    assert row.vendor_count >= 1
    assert row.trigger == "outbox"
    assert row.commit_sha == f'{1:040x}'

    # Idempotency: an immediate republish (scheduled this time) is a no-op.
    outcome = await dataset_publication_service.publish(db_session, "scheduled")
    await db_session.commit()
    assert outcome.outcome == "current"
    assert len(fake_commit) == 1


@pytest.mark.asyncio
async def test_scheduled_path_publishes_when_outbox_missed(
    async_client, db_session, monkeypatch, fake_commit
):
    _configure_github(monkeypatch)
    vendor, endpoint = await _seed(db_session)

    ok0 = await _record(db_session, endpoint, 30, ok=True, status=200)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, ok0) is None
    fail1 = await _record(db_session, endpoint, 20, ok=False, status=503)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, fail1) is None
    fail2 = await _record(db_session, endpoint, 15, ok=False, status=503)
    await db_session.commit()
    opened = await _apply(db_session, endpoint, vendor, fail2)
    await db_session.commit()

    # Simulate a processor outage: no drain at all. The scheduled task is
    # the guaranteed path: it re-derives everything and freezes what is
    # missing (the reconcile step), then publishes.
    from app.modules.dataset.service import dataset_publication_service
    from app.modules.incidents.public_evidence import (
        public_incident_evidence_service,
    )

    await public_incident_evidence_service.reconcile(db_session, 200)
    outcome = await dataset_publication_service.publish(db_session, "scheduled")
    await db_session.commit()

    assert outcome.outcome == "published"
    assert len(fake_commit) == 1
    files = fake_commit[0]["files"]
    assert f"evidence/{opened.id}.json" in files

    # Republish after a resolution freeze: content changed, one new commit.
    ok1 = await _record(db_session, endpoint, 10, ok=True, status=200)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, ok1) is None
    ok2 = await _record(db_session, endpoint, 5, ok=True, status=200)
    await db_session.commit()
    resolved = await _apply(db_session, endpoint, vendor, ok2)
    await db_session.commit()
    assert resolved is not None

    from app.modules.observations.outbox import process_outbox_batch

    assert await process_outbox_batch(db_session, limit=100) >= 1
    await db_session.commit()
    assert await process_outbox_batch(db_session, limit=100) >= 1
    await db_session.commit()

    # The outbox chain republished the resolved state on its own.
    assert len(fake_commit) == 2
    # The resolution freeze's artifact version is in the new tree.
    evidence_doc = json.loads(fake_commit[1]["files"][f"evidence/{opened.id}.json"])
    assert evidence_doc["incident"]["status"] == "resolved"

    # And a further scheduled publish now agrees: nothing new to commit.
    outcome2 = await dataset_publication_service.publish(db_session, "scheduled")
    await db_session.commit()
    assert outcome2.outcome == "current"
    assert len(fake_commit) == 2


@pytest.mark.asyncio
async def test_unconfigured_publisher_consumes_events_without_publishing(
    async_client, db_session, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "DATASET_GITHUB_TOKEN", None)
    monkeypatch.setattr(settings, "DATASET_GITHUB_REPO", None)
    vendor, endpoint = await _seed(db_session)

    ok0 = await _record(db_session, endpoint, 30, ok=True, status=200)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, ok0) is None
    fail1 = await _record(db_session, endpoint, 20, ok=False, status=503)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, fail1) is None
    fail2 = await _record(db_session, endpoint, 15, ok=False, status=503)
    await db_session.commit()
    assert await _apply(db_session, endpoint, vendor, fail2) is not None
    await db_session.commit()

    # Disabled publisher: the freeze still runs, its dataset refresh event is
    # consumed as disabled, and the measurement is untouched.
    assert await _drain_outbox(db_session) >= 1
    await db_session.commit()
    assert await _drain_outbox(db_session) >= 1
    await db_session.commit()

    from sqlalchemy import func, select

    from app.modules.dataset.models import DatasetPublication
    from app.modules.incidents.public_evidence_models import PublicIncidentEvidence

    evidence_count = (
        await db_session.execute(select(func.count(PublicIncidentEvidence.id)))
    ).scalar()
    assert evidence_count == 1
    assert (
        await db_session.execute(select(func.count(DatasetPublication.id)))
    ).scalar() == 0
