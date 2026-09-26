"""Persistence for public incident records."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.modules.incidents.public_models import PublicIncident
from app.modules.vendors.models import VendorTracking


class PublicIncidentRepository:
    @staticmethod
    async def get_open_for_endpoint(
        session: AsyncSession, endpoint_id: uuid.UUID
    ) -> PublicIncident | None:
        result = await session.execute(
            select(PublicIncident).where(
                PublicIncident.endpoint_id == endpoint_id,
                PublicIncident.status == "open",
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def create(
        session: AsyncSession, incident: PublicIncident
    ) -> PublicIncident:
        session.add(incident)
        await session.flush()
        return incident

    @staticmethod
    async def list_for_vendor(
        session: AsyncSession, vendor_id: uuid.UUID, limit: int = 50
    ) -> list[PublicIncident]:
        result = await session.execute(
            select(PublicIncident)
            .where(PublicIncident.vendor_id == vendor_id)
            .order_by(PublicIncident.started_at.desc(), PublicIncident.id.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(
        session: AsyncSession, incident_id: uuid.UUID
    ) -> PublicIncident | None:
        result = await session.execute(
            select(PublicIncident).where(PublicIncident.id == incident_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def search(
        session: AsyncSession,
        *,
        vendor_name: str | None = None,
        category: str | None = None,
        region: str | None = None,
        status: str | None = None,
        failure_kind: str | None = None,
        started_before: datetime | None = None,
        started_after: datetime | None = None,
        cursor_started_at: datetime | None = None,
        cursor_id: uuid.UUID | None = None,
        limit: int = 20,
    ) -> list[tuple[PublicIncident, VendorTracking]]:
        """Filtered, cursor paginated incident search, vendor fields joined.

        Ordering is (started_at desc, id desc): the stable pair that also
        keys the cursor, so pagination cannot skip or duplicate rows between
        pages.
        """
        vendor = aliased(VendorTracking)
        query = (
            select(PublicIncident, vendor)
            .join(vendor, PublicIncident.vendor_id == vendor.id)
            .where(vendor.is_public.is_(True))
            .order_by(PublicIncident.started_at.desc(), PublicIncident.id.desc())
        )
        if vendor_name:
            query = query.where(vendor.vendor_name == vendor_name.lower())
        if category:
            query = query.where(vendor.category == category.lower())
        if region:
            query = query.where(PublicIncident.region == region)
        if status:
            query = query.where(PublicIncident.status == status)
        if failure_kind:
            query = query.where(PublicIncident.failure_kind == failure_kind)
        if started_after is not None:
            query = query.where(PublicIncident.started_at >= started_after)
        if started_before is not None:
            query = query.where(PublicIncident.started_at <= started_before)
        if cursor_started_at is not None and cursor_id is not None:
            query = query.where(
                (PublicIncident.started_at < cursor_started_at)
                | (
                    (PublicIncident.started_at == cursor_started_at)
                    & (PublicIncident.id < cursor_id)
                )
            )
        result = await session.execute(query.limit(limit))
        return [(row[0], row[1]) for row in result.all()]
