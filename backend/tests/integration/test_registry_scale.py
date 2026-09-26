"""The registry at 250+ vendors: the whole public pipeline at scale.

The modularity bar for this project: adding the 51st vendor must be
configuration, not code. This suite proves the claim at five times that
bar - a synthetic registry of 260 vendors is written the way production
writes it (probe observations on the vendor-probe stream, detection
interleaved chronologically), and every derived surface is then exercised
against it: the data-quality scan, the public incident search, the dataset
tree derivation, and the weekly digest generation.

Time bounds are deliberately generous guards (tens of seconds), not
benchmarks: the assertion being made is architectural - nothing here is
O(vendors) in a way that breaks the product - not a performance number.
"""

import time
import uuid as uuid_mod
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import insert

SUCCESS_PREDICATE = "error_type IS NULL AND status_code IS NOT NULL"
SCALE_N = 260
DEAD_N = 10
OBS_PER_ENDPOINT = 12


def _ts(minutes_ago: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)


async def _bulk_registry(db_session):
    """260 synthetic vendors + endpoints (plus the planted stale rows)."""
    from app.modules.vendors.models import VendorEndpoint, VendorTracking

    now = _ts(0)
    vendors, endpoints = [], []
    for i in range(SCALE_N):
        vid = uuid_mod.uuid4()
        vendors.append(
            {
                "id": vid,
                "vendor_name": f"scale-vendor-{i:03d}",
                "display_name": f"Scale Vendor {i:03d}",
                "endpoint_url": f"https://scale{i:03d}.example.com/probe",
                "category": "payments",
                "is_public": True,
                "last_check_at": now - timedelta(minutes=2),
                "website_url": "https://scale.example.com",
                "status_page_url": (
                    "not-a-valid-url" if i < 2 else "https://status.scale.example.com"
                ),
                "created_at": now - timedelta(days=30),
                "updated_at": now,
            }
        )
        dead = i < DEAD_N
        endpoints.append(
            {
                "id": uuid_mod.uuid4(),
                "vendor_id": vid,
                "endpoint_url": f"https://scale{i:03d}.example.com/probe",
                "check_interval_seconds": 300,
                "regions": ["us-east"],
                "is_active": True,
                "health_status": "down" if dead else "operational",
                "last_check_at": now - timedelta(minutes=2),
                "slug": f"scale-{i:03d}-probe",
                "name": "Status page",
                "kind": "status_page",
                "product_name": None,
                "display_order": 100,
                "methodology_version": "v1.0",
                "created_at": now - timedelta(days=30),
                "updated_at": now,
            }
        )
    # Planted stale rows: two never-checked endpoints, one overdue endpoint,
    # one public vendor with no endpoints at all.
    orphan_vid = uuid_mod.uuid4()
    vendors.append(
        {
            "id": orphan_vid,
            "vendor_name": "scale-orphan",
            "display_name": "Scale Orphan",
            "endpoint_url": "https://orphan.example.com/probe",
            "category": "cloud",
            "is_public": True,
            "last_check_at": None,
            "created_at": now - timedelta(days=30),
            "updated_at": now,
        }
    )
    never_vid = uuid_mod.uuid4()
    never_eid = uuid_mod.uuid4()
    endpoints.append(
        {
            "id": never_eid,
            "vendor_id": never_vid,
            "endpoint_url": "https://never.example.com/probe",
            "check_interval_seconds": 300,
            "regions": ["us-east"],
            "is_active": True,
            "health_status": "unknown",
            "last_check_at": None,
            "slug": "scale-never-probe",
            "name": "Status page",
            "kind": "status_page",
            "product_name": None,
            "display_order": 100,
            "methodology_version": "v1.0",
            "created_at": now - timedelta(hours=48),
            "updated_at": now,
        }
    )
    vendors.append(
        {
            "id": never_vid,
            "vendor_name": "scale-never-checked",
            "display_name": "Scale Never Checked",
            "endpoint_url": "https://never.example.com/probe",
            "category": "cloud",
            "is_public": True,
            "last_check_at": None,
            "created_at": now - timedelta(days=30),
            "updated_at": now,
        }
    )
    overdue_eid = uuid_mod.uuid4()
    overdue_vid = uuid_mod.uuid4()
    endpoints.append(
        {
            "id": overdue_eid,
            "vendor_id": overdue_vid,
            "endpoint_url": "https://overdue.example.com/probe",
            "check_interval_seconds": 300,
            "regions": ["us-east"],
            "is_active": True,
            "health_status": "operational",
            "last_check_at": now - timedelta(hours=2),
            "slug": "scale-overdue-probe",
            "name": "Status page",
            "kind": "status_page",
            "product_name": None,
            "display_order": 100,
            "methodology_version": "v1.0",
            "created_at": now - timedelta(days=30),
            "updated_at": now,
        }
    )
    vendors.append(
        {
            "id": overdue_vid,
            "vendor_name": "scale-overdue",
            "display_name": "Scale Overdue",
            "endpoint_url": "https://overdue.example.com/probe",
            "category": "cloud",
            "is_public": True,
            "last_check_at": now - timedelta(hours=2),
            "created_at": now - timedelta(days=30),
            "updated_at": now,
        }
    )

    await db_session.execute(insert(VendorTracking), vendors)
    await db_session.execute(insert(VendorEndpoint), endpoints)
    await db_session.commit()
    return endpoints


async def _bulk_observations(db_session, endpoints):
    """12 probe observations per endpoint: all failing for the first
    DEAD_N vendors, all healthy for the rest."""
    from app.modules.observations.models import Observation

    now = datetime.now(timezone.utc)
    rows = []
    for i, ep in enumerate(endpoints[: SCALE_N]):
        dead = i < DEAD_N
        for k in range(OBS_PER_ENDPOINT):
            ts = now - timedelta(minutes=(OBS_PER_ENDPOINT - k) * 5)
            rows.append(
                {
                    "id": uuid_mod.uuid4(),
                    "timestamp": ts,
                    "source_type": "vendor_probe",
                    "source_id": ep["id"],
                    "region": "us-east",
                    "endpoint_url": ep["endpoint_url"],
                    "latency_ms": 0.0 if dead else 120.0,
                    "status_code": None if dead else 200,
                    "error_type": "probe_failed" if dead else None,
                    "error_message": "connection timeout" if dead else None,
                    "metadata": {"is_up": not dead},
                }
            )
    await db_session.execute(insert(Observation), rows)
    await db_session.commit()
    return rows


async def _detect_dead_incidents(db_session, endpoints):
    """Detection interleaved chronologically for the dead vendors - the
    production call path, so incidents carry real run provenance."""
    from sqlalchemy import select

    from app.modules.incidents.public_service import public_incident_service
    from app.modules.observations.models import Observation

    opened = []
    for ep in endpoints[:DEAD_N]:
        vendor = await db_session.get(
            __import__(
                "app.modules.vendors.models", fromlist=["VendorTracking"]
            ).VendorTracking,
            ep["vendor_id"],
        )
        rows = (
            await db_session.execute(
                select(Observation)
                .where(Observation.source_id == ep["id"])
                .order_by(Observation.timestamp.asc())
            )
        ).scalars().all()
        opened_here = None
        for obs in rows:
            result = await public_incident_service.apply_vendor_observation(
                db_session,
                endpoint=ep_row(ep),
                vendor=vendor,
                observation=obs,
                region="us-east",
            )
            if result is not None:
                opened_here = result
        await db_session.commit()
        if opened_here is not None:
            opened.append(opened_here)
    return opened


def ep_row(ep_dict):
    """A light endpoint view with the attributes detection reads."""
    from types import SimpleNamespace

    return SimpleNamespace(
        id=ep_dict["id"],
        endpoint_url=ep_dict["endpoint_url"],
        vendor_id=ep_dict["vendor_id"],
        regions=ep_dict["regions"],
        health_status=ep_dict["health_status"],
        is_active=ep_dict["is_active"],
        last_check_at=ep_dict["last_check_at"],
        name=ep_dict["name"],
        slug=ep_dict["slug"],
    )


@pytest.mark.asyncio
async def test_full_pipeline_at_260_vendors(async_client, db_session):
    from sqlalchemy import func, select

    from app.config import settings
    from app.modules.data_quality.service import data_quality_service
    from app.modules.dataset.builder import (
        build_dataset_tree,
        dataset_content_hash,
    )
    from app.modules.digest.models import KIND_WEEKLY_DIGEST
    from app.modules.digest.service import digest_draft_service, week_window
    from app.modules.incidents.public_models import PublicIncident
    from app.modules.incidents.public_service import public_incident_service

    # A little registry realism before the synthetic bulk: the curated 50.
    from app.modules.vendors.service import vendor_service

    await vendor_service.seed_vendors(db_session)
    await db_session.commit()

    endpoints = await _bulk_registry(db_session)
    await _bulk_observations(db_session, endpoints)
    opened = await _detect_dead_incidents(db_session, endpoints)
    assert len(opened) == DEAD_N, "one open incident per dead vendor"

    # --- data-quality scan at scale -------------------------------------
    started = time.perf_counter()
    report = await data_quality_service.scan(db_session, min_attempts=5)
    scan_seconds = time.perf_counter() - started
    await db_session.commit()

    dead_names = {f.vendor_name for f in report.dead_targets}
    assert dead_names == {f"scale-vendor-{i:03d}" for i in range(DEAD_N)}
    stale_reasons = {f.vendor_name: f.reason for f in report.stale_registry}
    assert stale_reasons.get("scale-never-checked") == "never_checked"
    assert stale_reasons.get("scale-overdue") == "check_overdue"
    assert stale_reasons.get("scale-orphan") == "no_active_endpoints"
    identity = {f.vendor_name for f in report.broken_identity}
    assert identity == {"scale-vendor-000", "scale-vendor-001"}
    # Generous architectural guard, not a benchmark.
    assert scan_seconds < 30, f"data-quality scan took {scan_seconds:.1f}s"

    # --- public search at scale ------------------------------------------
    started = time.perf_counter()
    rows = await public_incident_service.repository.search(db_session, limit=20)
    search_seconds = time.perf_counter() - started
    assert len(rows) == DEAD_N  # every dead vendor has exactly one open incident
    assert all(vendor.is_public for _, vendor in rows)
    assert search_seconds < 15, f"public search took {search_seconds:.1f}s"

    # --- dataset derivation at scale -------------------------------------
    started = time.perf_counter()
    incidents, vendors = [], []
    from app.modules.vendors.models import VendorTracking as VT

    incident_rows = (
        await db_session.execute(
            select(PublicIncident).order_by(PublicIncident.started_at.asc())
        )
    ).scalars().all()
    vendor_rows = (await db_session.execute(select(VT))).scalars().all()
    for incident in incident_rows:
        vendor = next(v for v in vendor_rows if v.id == incident.vendor_id)
        if vendor.is_public:
            incidents.append(public_incident_service._to_detail(incident, vendor))
            vendors.append(
                {
                    "vendor_name": vendor.vendor_name,
                    "display_name": vendor.display_name,
                    "category": vendor.category,
                    "website_url": vendor.website_url,
                    "status_page_url": vendor.status_page_url,
                    "is_public": vendor.is_public,
                }
            )
    tree = build_dataset_tree(
        vendors=sorted(vendors, key=lambda v: v["vendor_name"]),
        incidents=[i.model_dump(mode="json") for i in incidents],
        evidence={},
        methodology_version="v1.0",
        generator_version="1.0",
    )
    content_hash = dataset_content_hash(tree)
    dataset_seconds = time.perf_counter() - started
    assert content_hash
    assert len(tree) == len(incidents) + 3  # + README + catalog + index.jsonl
    assert "incidents/index.jsonl" in tree
    assert dataset_seconds < 30, f"dataset derivation took {dataset_seconds:.1f}s"

    # --- digest generation at scale --------------------------------------
    period_start, period_end = week_window(
        datetime.now(timezone.utc).date()
    )
    started = time.perf_counter()
    counts = await digest_draft_service.generate_pending(
        db_session, period_start, period_end, site_url=settings.SITE_URL
    )
    digest_seconds = time.perf_counter() - started
    await db_session.commit()
    assert counts[f"{KIND_WEEKLY_DIGEST}_drafted"] == 1
    assert counts["incident_social_drafted"] == DEAD_N
    assert digest_seconds < 45, f"digest generation took {digest_seconds:.1f}s"

    total_incidents = (
        await db_session.execute(select(func.count(PublicIncident.id)))
    ).scalar()
    assert total_incidents == DEAD_N
