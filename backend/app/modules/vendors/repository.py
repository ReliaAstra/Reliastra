import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.dependencies.models import Dependency
from app.modules.incidents.models import Incident
from app.modules.vendors.models import (
    VendorCategory,
    VendorEndpoint,
    VendorTracking,
)


class VendorRepository:
    @staticmethod
    async def list_public(
        session: AsyncSession,
        limit: int | None = None,
        cursor: uuid.UUID | None = None,
    ) -> list[VendorTracking]:
        """List public vendors ordered by display_name with optional
        cursor pagination (FIX 17). *cursor* is the vendor id of the last
        item on the previous page."""
        query = (
            select(VendorTracking)
            .where(VendorTracking.is_public.is_(True))
            .order_by(VendorTracking.display_name.asc(), VendorTracking.id.asc())
        )
        if cursor:
            cursor_vendor = await session.get(VendorTracking, cursor)
            if cursor_vendor is not None:
                query = query.where(
                    (VendorTracking.display_name > cursor_vendor.display_name)
                    | (
                        (VendorTracking.display_name == cursor_vendor.display_name)
                        & (VendorTracking.id > cursor_vendor.id)
                    )
                )
        if limit is not None:
            query = query.limit(limit)
        result = await session.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_by_name(
        session: AsyncSession, vendor_name: str
    ) -> VendorTracking | None:
        result = await session.execute(
            select(VendorTracking).where(
                VendorTracking.vendor_name == vendor_name.lower()
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def create(
        session: AsyncSession,
        vendor_name: str,
        display_name: str,
        endpoint_url: str,
        category: str,
        is_public: bool = True,
    ) -> VendorTracking:
        vendor = VendorTracking(
            vendor_name=vendor_name.lower(),
            display_name=display_name,
            endpoint_url=endpoint_url,
            category=category,
            is_public=is_public,
        )
        session.add(vendor)
        await session.flush()
        await VendorRepository.create_vendor_endpoint(
            session, vendor.id, endpoint_url
        )
        return vendor

    @staticmethod
    async def update_check_time(
        session: AsyncSession, vendor: VendorTracking
    ) -> None:
        vendor.last_check_at = datetime.now(timezone.utc)
        session.add(vendor)
        await session.flush()

    @staticmethod
    async def create_vendor_endpoint(
        session: AsyncSession,
        vendor_id,
        endpoint_url: str,
        *,
        slug: str | None = None,
        name: str | None = None,
        kind: str = "status_page",
        product_name: str | None = None,
        display_order: int = 100,
        methodology_version: str = "v1.0",
    ) -> VendorEndpoint:
        endpoint = VendorEndpoint(
            vendor_id=vendor_id,
            endpoint_url=endpoint_url,
            check_interval_seconds=300,
            regions=[settings.CHECK_WORKER_REGION],
            is_active=True,
            health_status="unknown",
            slug=slug,
            name=name,
            kind=kind,
            product_name=product_name,
            display_order=display_order,
            methodology_version=methodology_version,
        )
        session.add(endpoint)
        await session.flush()
        return endpoint

    @staticmethod
    async def get_vendor_endpoint_by_url(
        session: AsyncSession, vendor_id, endpoint_url: str
    ) -> VendorEndpoint | None:
        result = await session.execute(
            select(VendorEndpoint).where(
                VendorEndpoint.vendor_id == vendor_id,
                VendorEndpoint.endpoint_url == endpoint_url,
            )
        )
        return result.scalar_one_or_none()

    # ------------------------------------------------------------------
    # Categories
    # ------------------------------------------------------------------

    @staticmethod
    async def list_categories(
        session: AsyncSession, *, public_only: bool = True
    ) -> list[VendorCategory]:
        query = select(VendorCategory).order_by(
            VendorCategory.display_order.asc(), VendorCategory.slug.asc()
        )
        if public_only:
            query = query.where(VendorCategory.is_public.is_(True))
        result = await session.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_category_by_slug(
        session: AsyncSession, slug: str
    ) -> VendorCategory | None:
        result = await session.execute(
            select(VendorCategory).where(VendorCategory.slug == slug.lower())
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def create_category(
        session: AsyncSession,
        *,
        slug: str,
        name: str,
        description: str | None,
        display_order: int,
    ) -> VendorCategory:
        category = VendorCategory(
            slug=slug.lower(),
            name=name,
            description=description,
            display_order=display_order,
            is_public=True,
        )
        session.add(category)
        await session.flush()
        return category

    @staticmethod
    async def count_public_vendors_by_category(
        session: AsyncSession,
    ) -> dict[str, int]:
        result = await session.execute(
            select(VendorTracking.category, func.count(VendorTracking.id))
            .where(VendorTracking.is_public.is_(True))
            .group_by(VendorTracking.category)
        )
        return {row[0]: int(row[1] or 0) for row in result.all()}

    @staticmethod
    async def list_public_by_category(
        session: AsyncSession, category_slug: str
    ) -> list[VendorTracking]:
        result = await session.execute(
            select(VendorTracking)
            .where(
                VendorTracking.is_public.is_(True),
                VendorTracking.category == category_slug.lower(),
            )
            .order_by(VendorTracking.display_name.asc(), VendorTracking.id.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def list_vendor_endpoints(
        session: AsyncSession, vendor_name: str
    ) -> list[VendorEndpoint]:
        result = await session.execute(
            select(VendorEndpoint)
            .join(
                VendorTracking,
                VendorEndpoint.vendor_id == VendorTracking.id,
            )
            .where(VendorTracking.vendor_name == vendor_name.lower())
            .order_by(VendorEndpoint.endpoint_url.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def list_incidents_for_endpoints(
        session: AsyncSession,
        endpoint_urls: list[str],
        limit: int = 50,
    ) -> list[tuple[Incident, Dependency]]:
        if not endpoint_urls:
            return []
        result = await session.execute(
            select(Incident, Dependency)
            .join(Dependency, Incident.dependency_id == Dependency.id)
            .where(Dependency.endpoint_url.in_(endpoint_urls))
            .order_by(Incident.started_at.desc())
            .limit(limit)
        )
        return list(result.all())

    @staticmethod
    async def get_incidents_in_window(
        session: AsyncSession,
        endpoint_urls: list[str],
        window_start: datetime,
        window_end: datetime,
    ) -> list[tuple[uuid.UUID, datetime, datetime | None]]:
        """Return incidents whose active period overlaps the given window.

        Each row is ``(incident_id, started_at, resolved_at)`` for the
        timeline service to match buckets with incidents efficiently.

        Uses PostgreSQL ``tstzrange`` constructor + ``&&`` overlap operator.
        """
        if not endpoint_urls:
            return []
        now = datetime.now(timezone.utc)

        # Build range overlap: tstzrange(start, end) && tstzrange(start, end)
        # The && operator returns true when two ranges overlap.
        incident_range = func.tstzrange(
            Incident.started_at, func.coalesce(Incident.resolved_at, now)
        )
        query_range = func.tstzrange(window_start, window_end)

        result = await session.execute(
            select(
                Incident.id,
                Incident.started_at,
                Incident.resolved_at,
            )
            .join(Dependency, Incident.dependency_id == Dependency.id)
            .where(
                Dependency.endpoint_url.in_(endpoint_urls),
                incident_range.op("&&")(query_range),
            )
            .order_by(Incident.started_at.asc())
        )
        return [(row.id, row.started_at, row.resolved_at) for row in result.all()]
