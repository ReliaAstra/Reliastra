"""Data-quality scan: canonical rows in, typed findings out.

Everything here is a pure derivation over current data - the same
observations the incident detector reads (via ``source_id`` on the
vendor-probe stream) and the same vendor/endpoint rows the registry syncs.
The success predicate in SQL mirrors the incident detector's Python
predicate (``_observation_is_up``: no transport error and a status code
received); the scale suite exercises both paths on the same rows, so the
ops view and the detector cannot quietly diverge.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.observations.models import Observation
from app.modules.vendors.models import VendorEndpoint, VendorTracking
from app.modules.vendors.taxonomy import CATEGORY_SLUGS

logger = logging.getLogger(__name__)

DATA_QUALITY_GENERATOR = "reliastra-data-quality/1.0"

DEFAULT_WINDOW_DAYS = 30
DEFAULT_MIN_ATTEMPTS = 10
#: A freshly registered endpoint may simply not have been probed yet.
NEVER_CHECKED_GRACE = timedelta(hours=24)
#: An active endpoint should have been checked within this multiple of its
#: own interval before "overdue" is reported (scheduler jitter is normal).
OVERDUE_MULTIPLIER = 3


class DeadTargetFinding(BaseModel):
    vendor_name: str
    endpoint_id: UUID
    endpoint_url: str
    attempt_count: int
    last_attempt_at: datetime | None
    window_days: int
    note: str


class StaleRegistryFinding(BaseModel):
    vendor_name: str
    endpoint_id: UUID | None
    endpoint_url: str | None
    reason: str
    detail: str


class BrokenIdentityFinding(BaseModel):
    vendor_name: str
    field: str
    value: str | None
    problem: str


class DataQualityReport(BaseModel):
    generated_at: datetime
    generator: str
    window_days: int
    min_attempts: int
    dead_targets: list[DeadTargetFinding]
    stale_registry: list[StaleRegistryFinding]
    broken_identity: list[BrokenIdentityFinding]

    @property
    def finding_count(self) -> int:
        return (
            len(self.dead_targets)
            + len(self.stale_registry)
            + len(self.broken_identity)
        )


def url_problem(value: str) -> str | None:
    """Objective malformation checks for an identity link. Deliberately
    conservative: no domain-suffix matching, which would flag legitimate
    dedicated status domains (cloudflarestatus.com et al.) as broken."""
    try:
        parts = urlsplit(value.strip())
    except ValueError:
        return "unparseable_url"
    if parts.scheme not in ("http", "https"):
        return "scheme_not_http"
    if not parts.netloc:
        return "missing_host"
    return None


def identity_findings(vendor: VendorTracking) -> list[BrokenIdentityFinding]:
    """Broken-identity findings for one vendor row (pure function)."""
    found: list[BrokenIdentityFinding] = []
    name = vendor.vendor_name
    for field in ("website_url", "status_page_url", "documentation_url", "logo_url"):
        value = getattr(vendor, field, None)
        if value is None:
            continue
        problem = url_problem(value)
        if problem:
            found.append(
                BrokenIdentityFinding(
                    vendor_name=name, field=field, value=value, problem=problem
                )
            )
    endpoint_problem = url_problem(vendor.endpoint_url)
    if endpoint_problem == "unparseable_url" or endpoint_problem == "missing_host":
        found.append(
            BrokenIdentityFinding(
                vendor_name=name,
                field="endpoint_url",
                value=vendor.endpoint_url,
                problem=endpoint_problem,
            )
        )
    elif vendor.endpoint_url.startswith("http://"):
        found.append(
            BrokenIdentityFinding(
                vendor_name=name,
                field="endpoint_url",
                value=vendor.endpoint_url,
                problem="probe_target_not_https",
            )
        )
    if not (vendor.display_name or "").strip():
        found.append(
            BrokenIdentityFinding(
                vendor_name=name,
                field="display_name",
                value=vendor.display_name,
                problem="empty_display_name",
            )
        )
    if vendor.category not in CATEGORY_SLUGS:
        found.append(
            BrokenIdentityFinding(
                vendor_name=name,
                field="category",
                value=vendor.category,
                problem="category_not_in_taxonomy",
            )
        )
    return found


class DataQualityRepository:
    """Aggregate reads over the same tables the pipeline writes."""

    async def endpoint_attempt_stats(
        self, session: AsyncSession, window_start: datetime
    ) -> list:
        """Per-endpoint attempt/success aggregates for active public
        vendor endpoints over the window (inner-joined to vendors so the
        report only speaks about measured surfaces)."""
        # Mirrors the detector's _observation_is_up in SQL: no transport
        # error and a status code received.
        success = case(
            (
                and_(
                    Observation.error_type.is_(None),
                    Observation.status_code.is_not(None),
                ),
                1,
            ),
            else_=0,
        )
        query = (
            select(
                VendorEndpoint.id,
                VendorEndpoint.endpoint_url,
                VendorTracking.vendor_name,
                func.count(Observation.id).label("attempts"),
                func.sum(success).label("successes"),
                func.max(Observation.timestamp).label("last_attempt_at"),
            )
            .select_from(VendorEndpoint)
            .join(VendorTracking, VendorEndpoint.vendor_id == VendorTracking.id)
            .join(
                Observation,
                and_(
                    Observation.source_id == VendorEndpoint.id,
                    Observation.source_type == "vendor_probe",
                    Observation.timestamp >= window_start,
                ),
            )
            .where(VendorEndpoint.is_active.is_(True))
            .group_by(
                VendorEndpoint.id,
                VendorEndpoint.endpoint_url,
                VendorTracking.vendor_name,
            )
        )
        result = await session.execute(query)
        return result.all()

    async def stale_endpoints(self, session: AsyncSession) -> list:
        """Active endpoints with their vendor name and schedule columns."""
        query = (
            select(VendorEndpoint, VendorTracking.vendor_name)
            .join(VendorTracking, VendorEndpoint.vendor_id == VendorTracking.id)
            .where(VendorEndpoint.is_active.is_(True))
        )
        result = await session.execute(query)
        return result.all()

    async def public_vendors(self, session: AsyncSession) -> list[VendorTracking]:
        result = await session.execute(select(VendorTracking))
        return list(result.scalars().all())

    async def public_vendors_without_active_endpoints(
        self, session: AsyncSession
    ) -> list[str]:
        """Public vendors with zero active endpoints."""
        active = (
            select(VendorEndpoint.vendor_id)
            .where(VendorEndpoint.is_active.is_(True))
            .scalar_subquery()
        )
        query = (
            select(VendorTracking.vendor_name)
            .where(
                VendorTracking.is_public.is_(True),
                ~VendorTracking.id.in_(active),
            )
            .order_by(VendorTracking.vendor_name)
        )
        result = await session.execute(query)
        return list(result.scalars().all())


class DataQualityService:
    def __init__(self, repository: DataQualityRepository | None = None) -> None:
        self.repository = repository or DataQualityRepository()

    async def scan(
        self,
        session: AsyncSession,
        *,
        window_days: int = DEFAULT_WINDOW_DAYS,
        min_attempts: int = DEFAULT_MIN_ATTEMPTS,
    ) -> DataQualityReport:
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(days=window_days)

        dead_targets = await self._dead_targets(
            session, window_start, window_days, min_attempts
        )
        stale = await self._stale_registry(session, now)
        broken = await self._broken_identity(session)

        return DataQualityReport(
            generated_at=now,
            generator=DATA_QUALITY_GENERATOR,
            window_days=window_days,
            min_attempts=min_attempts,
            dead_targets=dead_targets,
            stale_registry=stale,
            broken_identity=broken,
        )

    async def _dead_targets(
        self,
        session: AsyncSession,
        window_start: datetime,
        window_days: int,
        min_attempts: int,
    ) -> list[DeadTargetFinding]:
        rows = await self.repository.endpoint_attempt_stats(session, window_start)
        findings: list[DeadTargetFinding] = []
        for endpoint_id, endpoint_url, vendor_name, attempts, successes, last in rows:
            if attempts < min_attempts or successes:
                continue
            findings.append(
                DeadTargetFinding(
                    vendor_name=vendor_name,
                    endpoint_id=endpoint_id,
                    endpoint_url=endpoint_url,
                    attempt_count=attempts,
                    last_attempt_at=last,
                    window_days=window_days,
                    note=(
                        "every probe attempt in the window failed: the target "
                        "is a registry mistake until proven otherwise"
                    ),
                )
            )
        findings.sort(key=lambda f: (f.vendor_name, f.endpoint_url))
        return findings

    async def _stale_registry(
        self, session: AsyncSession, now: datetime
    ) -> list[StaleRegistryFinding]:
        findings: list[StaleRegistryFinding] = []
        for endpoint, vendor_name in await self.repository.stale_endpoints(session):
            if endpoint.last_check_at is None:
                if now - endpoint.created_at > NEVER_CHECKED_GRACE:
                    findings.append(
                        StaleRegistryFinding(
                            vendor_name=vendor_name,
                            endpoint_id=endpoint.id,
                            endpoint_url=endpoint.endpoint_url,
                            reason="never_checked",
                            detail=(
                                "active for over "
                                f"{int(NEVER_CHECKED_GRACE.total_seconds() // 3600)}h "
                                "without a single probe"
                            ),
                        )
                    )
                continue
            overdue_after = endpoint.last_check_at + timedelta(
                seconds=OVERDUE_MULTIPLIER * endpoint.check_interval_seconds
            )
            if now > overdue_after:
                findings.append(
                    StaleRegistryFinding(
                        vendor_name=vendor_name,
                        endpoint_id=endpoint.id,
                        endpoint_url=endpoint.endpoint_url,
                        reason="check_overdue",
                        detail=(
                            "last check "
                            f"{int((now - endpoint.last_check_at).total_seconds() // 60)}m "
                            "ago exceeds "
                            f"{OVERDUE_MULTIPLIER}x the configured interval"
                        ),
                    )
                )
        for vendor_name in await self.repository.public_vendors_without_active_endpoints(
            session
        ):
            findings.append(
                StaleRegistryFinding(
                    vendor_name=vendor_name,
                    endpoint_id=None,
                    endpoint_url=None,
                    reason="no_active_endpoints",
                    detail="public vendor has no active endpoints to measure",
                )
            )
        findings.sort(key=lambda f: (f.reason, f.vendor_name, f.endpoint_url or ""))
        return findings

    async def _broken_identity(
        self, session: AsyncSession
    ) -> list[BrokenIdentityFinding]:
        findings: list[BrokenIdentityFinding] = []
        for vendor in await self.repository.public_vendors(session):
            findings.extend(identity_findings(vendor))
        findings.sort(key=lambda f: (f.vendor_name, f.field))
        return findings


data_quality_service = DataQualityService()
