import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.modules.vendors.registry import REGISTRY
from app.modules.vendors.service import VendorService
from app.modules.vendors.taxonomy import CATEGORIES


def _existing_vendor(**overrides):
    vendor = MagicMock()
    vendor.id = uuid.uuid4()
    vendor.vendor_name = "stripe"
    vendor.display_name = "Stripe"
    vendor.endpoint_url = "https://status.stripe.com"
    vendor.category = "payments"
    vendor.is_public = True
    vendor.last_check_at = None
    return vendor


def _category_row(slug: str):
    row = MagicMock()
    row.id = uuid.uuid4()
    row.slug = slug
    return row


@pytest.mark.asyncio
async def test_seed_vendors_creates_full_registry():
    """First sync: every registry vendor and every taxonomy category is inserted."""
    repo = MagicMock()
    repo.get_category_by_slug = AsyncMock(return_value=None)
    repo.create_category = AsyncMock(side_effect=lambda s, *, slug, **kw: _category_row(slug))
    repo.get_by_name = AsyncMock(return_value=None)
    repo.create = AsyncMock(side_effect=lambda session=None, **kw: _existing_vendor())
    repo.get_vendor_endpoint_by_url = AsyncMock(return_value=None)
    repo.create_vendor_endpoint = AsyncMock()

    service = VendorService(repository=repo)
    session = AsyncMock()
    count = await service.seed_vendors(session)

    assert count == len(REGISTRY)
    assert repo.create.call_count == len(REGISTRY)
    assert repo.create_category.call_count == len(CATEGORIES)
    # Every registry target produced exactly one endpoint row.
    expected_targets = sum(len(v.targets) for v in REGISTRY)
    assert repo.create_vendor_endpoint.call_count == expected_targets


@pytest.mark.asyncio
async def test_seed_vendors_is_idempotent_and_non_destructive():
    """Second sync: no new rows, identity fields refreshed, ops state untouched."""
    repo = MagicMock()
    repo.get_category_by_slug = AsyncMock(side_effect=lambda s, slug: _category_row(slug))
    repo.create_category = AsyncMock()
    existing = _existing_vendor()
    repo.get_by_name = AsyncMock(return_value=existing)
    repo.create = AsyncMock()
    existing_endpoint = MagicMock()
    existing_endpoint.regions = ["us-east"]
    existing_endpoint.health_status = "operational"
    repo.get_vendor_endpoint_by_url = AsyncMock(return_value=existing_endpoint)
    repo.create_vendor_endpoint = AsyncMock()

    service = VendorService(repository=repo)
    session = AsyncMock()
    count = await service.seed_vendors(session)

    assert count == 0
    repo.create.assert_not_called()
    repo.create_category.assert_not_called()
    repo.create_vendor_endpoint.assert_not_called()
    # Probe managed state must not be rewritten by a registry sync.
    assert existing.is_public is True
    assert existing_endpoint.regions == ["us-east"]
    assert existing_endpoint.health_status == "operational"


@pytest.mark.asyncio
async def test_get_vendor_detail(mocker):
    repo = MagicMock()
    now = datetime.now(timezone.utc)
    fake_vendor = MagicMock()
    fake_vendor.id = uuid.uuid4()
    fake_vendor.vendor_name = "stripe"
    fake_vendor.display_name = "Stripe"
    fake_vendor.endpoint_url = "https://status.stripe.com"
    fake_vendor.category = "payments"
    fake_vendor.is_public = True
    fake_vendor.last_check_at = None
    fake_vendor.recent_status = 'unknown'
    fake_vendor.created_at = now
    fake_vendor.updated_at = now
    # Additive identity fields (0039+); unset columns read as NULL.
    fake_vendor.official_name = "Stripe, Inc."
    fake_vendor.description = None
    fake_vendor.website_url = "https://stripe.com"
    fake_vendor.documentation_url = "https://docs.stripe.com"
    fake_vendor.status_page_url = "https://status.stripe.com"
    fake_vendor.logo_url = None
    fake_vendor.country = "United States"
    fake_vendor.tags = ["payments"]

    repo.get_by_name = AsyncMock(return_value=fake_vendor)
    repo.list_vendor_endpoints = AsyncMock(return_value=[])
    mocker.patch(
        "app.modules.observations.repository.ObservationRepository.list_for_endpoints",
        new=AsyncMock(return_value=[]),
    )
    mocker.patch(
        "app.modules.checks.repository.CheckRepository.get_vendor_recent_status",
        new=AsyncMock(return_value=[MagicMock(is_up=True)]),
    )

    service = VendorService(repository=repo)
    session = AsyncMock()
    res = await service.get_vendor_detail(session, "stripe")

    assert res.vendor_name == "stripe"
    assert res.official_name == "Stripe, Inc."
    assert res.website_url == "https://stripe.com"
    # Customer measurements never imply a public endpoint observation.
    assert res.recent_status == "unknown"


def _vendor_record(slug: str, display_name: str, category: str):
    """A fully specified row VendorResponse can validate against."""
    from types import SimpleNamespace

    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=uuid.uuid4(),
        vendor_name=slug,
        display_name=display_name,
        endpoint_url=f"https://status.{slug}.example.com",
        category=category,
        is_public=True,
        last_check_at=None,
        created_at=now,
        updated_at=now,
        official_name=None,
        description=None,
        website_url=None,
        documentation_url=None,
        status_page_url=None,
        logo_url=None,
        country=None,
        tags=None,
    )


@pytest.mark.asyncio
async def test_get_category_detail(mocker):
    repo = MagicMock()
    category = MagicMock()
    category.slug = "payments"
    category.name = "Payments"
    category.description = "Payment processors and billing platforms."
    category.display_order = 20
    category.is_public = True
    repo.get_category_by_slug = AsyncMock(return_value=category)
    repo.list_public_by_category = AsyncMock(
        return_value=[
            _vendor_record("stripe", "Stripe", "payments"),
            _vendor_record("adyen", "Adyen", "payments"),
        ]
    )

    service = VendorService(repository=repo)
    # No observations recorded yet: the mock session's scalars() yields an
    # empty latest list, so every row falls back to the default "unknown".
    session = AsyncMock()
    session.scalars = AsyncMock(return_value=MagicMock(all=lambda: []))

    res = await service.get_category_detail(session, "payments")

    assert res.slug == "payments"
    assert res.vendor_count == 2
    assert [v.vendor_name for v in res.vendors] == ["stripe", "adyen"]
    assert all(v.recent_status == "unknown" for v in res.vendors)


@pytest.mark.asyncio
async def test_get_category_detail_missing_raises_404():
    from app.core.exceptions import ResourceNotFoundException

    repo = MagicMock()
    repo.get_category_by_slug = AsyncMock(return_value=None)

    service = VendorService(repository=repo)
    session = AsyncMock()

    with pytest.raises(ResourceNotFoundException):
        await service.get_category_detail(session, "nope")
