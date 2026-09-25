"""Registry sync against a real migrated database.

What this proves that mocks cannot: the 0039 schema accepts the taxonomy
and registry, seeding is idempotent against real unique constraints, and
the public category endpoints answer from canonical data.
"""
import pytest

from app.modules.vendors.registry import REGISTRY
from app.modules.vendors.taxonomy import CATEGORIES


@pytest.mark.asyncio
async def test_registry_sync_is_idempotent(async_client, db_session):
    from sqlalchemy import func, select

    from app.modules.vendors.models import (
        VendorCategory,
        VendorEndpoint,
        VendorTracking,
    )
    from app.modules.vendors.service import vendor_service

    created_first = await vendor_service.seed_vendors(db_session)
    await db_session.commit()
    assert created_first == len(REGISTRY)

    vendor_count = (
        await db_session.scalar(select(func.count()).select_from(VendorTracking))
    )
    category_count = (
        await db_session.scalar(select(func.count()).select_from(VendorCategory))
    )
    endpoint_count = (
        await db_session.scalar(select(func.count()).select_from(VendorEndpoint))
    )
    assert vendor_count == len(REGISTRY)
    assert category_count == len(CATEGORIES)
    assert endpoint_count == sum(len(v.targets) for v in REGISTRY)

    # Second run is a no-op: no new rows, no constraint violations.
    created_second = await vendor_service.seed_vendors(db_session)
    await db_session.commit()
    assert created_second == 0
    assert (
        await db_session.scalar(select(func.count()).select_from(VendorTracking))
    ) == len(REGISTRY)
    assert (
        await db_session.scalar(select(func.count()).select_from(VendorEndpoint))
    ) == sum(len(v.targets) for v in REGISTRY)

    # Identity metadata landed on the row and the category FK resolves.
    stripe = (
        await db_session.execute(
            select(VendorTracking).where(VendorTracking.vendor_name == "stripe")
        )
    ).scalar_one()
    assert stripe.category == "payments"
    assert stripe.status_page_url == "https://status.stripe.com"
    assert stripe.website_url == "https://stripe.com"
    assert stripe.category_id is not None

    # Targets carry their stable identity.
    endpoints = (
        await db_session.execute(
            select(VendorEndpoint).where(VendorEndpoint.vendor_id == stripe.id)
        )
    ).scalars().all()
    assert endpoints[0].slug == "status"
    assert endpoints[0].kind == "status_page"
    assert endpoints[0].methodology_version == "v1.0"


@pytest.mark.asyncio
async def test_category_public_api(async_client, db_session):
    from app.modules.vendors.service import vendor_service

    await vendor_service.seed_vendors(db_session)
    await db_session.commit()

    list_res = await async_client.get("/v1/vendors/categories")
    assert list_res.status_code == 200, list_res.text
    categories = list_res.json()["categories"]
    assert {c["slug"] for c in categories} == {c.slug for c in CATEGORIES}
    for c in categories:
        assert c["vendor_count"] >= 1

    detail_res = await async_client.get("/v1/vendors/categories/payments")
    assert detail_res.status_code == 200, detail_res.text
    detail = detail_res.json()
    assert detail["slug"] == "payments"
    assert detail["vendor_count"] == 5
    slugs = {v["vendor_name"] for v in detail["vendors"]}
    assert slugs == {"stripe", "paypal", "adyen", "paddle", "braintree"}
    # Additive identity fields are present in the public payload.
    assert detail["vendors"][0]["website_url"]

    # A category that does not exist is a clean 404, not a crash and not
    # an empty catalogue.
    missing = await async_client.get("/v1/vendors/categories/nonexistent")
    assert missing.status_code == 404

    # The literal segment is not captured as a vendor slug.
    assert (await async_client.get("/v1/vendors/categories")).status_code == 200
