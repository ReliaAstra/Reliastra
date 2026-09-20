"""Admin control plane: Product surface: features, vendors, engagement, activation.

One room behind the front door in :mod:`app.modules.admin.control_plane_service`.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.control_plane_schemas import (
    ProductActivationResponse,
    ProductEngagementResponse,
    ProductFeatureItem,
    ProductFeaturesResponse,
    ProductOverviewResponse,
    ProductVendorItem,
    ProductVendorsResponse,
)
from app.modules.admin.repository import (
    AdminAnalyticsRepository,
    AdminOperationsRepository,
)

from app.modules.admin.control_plane_shared import (
    count_checks_since,
    utc_now,
)


class ControlPlaneProduct:
    """Product aggregates."""

    async def get_product_overview(self, session: AsyncSession) -> ProductOverviewResponse:
        engagement = await AdminAnalyticsRepository.get_engagement(session)
        features = await AdminAnalyticsRepository.get_feature_adoption(session)
        vendors = await AdminAnalyticsRepository.get_vendor_coverage(session)
        ttv = await AdminAnalyticsRepository.get_time_to_value(session)
        metrics = await AdminOperationsRepository.get_system_metrics(session)
        checks_today = await count_checks_since(
            session, utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
        )

        return ProductOverviewResponse(
            active_users=int(engagement.get("dau") or 0),
            active_organizations=int(metrics.get("total_orgs") or 0),
            active_monitors=int(metrics.get("total_dependencies") or 0),
            checks=0,
            checks_today=checks_today,
            incidents=int(metrics.get("total_incidents_open") or 0),
            open_incidents=int(metrics.get("total_incidents_open") or 0),
            dependencies=int(metrics.get("total_dependencies") or 0),
            vendor_coverage_top=vendors[:5],
            feature_adoption=features,
            time_to_value={"buckets": ttv},
            engagement=engagement,
        )

    async def get_product_features(self, session: AsyncSession) -> ProductFeaturesResponse:
        raw = await AdminAnalyticsRepository.get_feature_adoption(session)
        features = [
            ProductFeatureItem(
                feature=f.get("feature", "unknown"),
                eligible=int(f.get("total_users") or 0),
                adopted=int(f.get("active_users") or 0),
                adoption_rate=round(
                    (f.get("active_users") or 0) / max(f.get("total_users") or 1, 1), 4
                ),
            )
            for f in raw
        ]
        return ProductFeaturesResponse(features=features)

    async def get_product_vendors(
        self, session: AsyncSession, *, limit: int = 20
    ) -> ProductVendorsResponse:
        coverage = await AdminAnalyticsRepository.get_vendor_coverage(session)
        # Merge PLG top-vendor stats when available
        plg_map: dict[str, Any] = {}
        try:
            from app.modules.growth.service import growth_service

            top = await growth_service.get_top_vendors(session, sort_by="views", limit=limit)
            plg_map = {t.vendor_name: t for t in top}
        except Exception:
            pass

        items: list[ProductVendorItem] = []
        seen: set[str] = set()
        for v in coverage[:limit]:
            name = v.get("vendor_name") or "unknown"
            seen.add(name)
            plg = plg_map.get(name)
            items.append(
                ProductVendorItem(
                    vendor=name,
                    organizations_using=int(v.get("monitoring_orgs") or 0),
                    coverage_percentage=float(v.get("coverage_pct") or 0.0),
                    incidents=0,
                    monitoring_volume=int(v.get("monitoring_orgs") or 0),
                    views=plg.views if plg else None,
                    badge_embeds=plg.badge_embeds if plg else None,
                    submissions=plg.submissions if plg else None,
                    evidence_downloads=plg.evidence_downloads if plg else None,
                )
            )
        for name, plg in plg_map.items():
            if name in seen:
                continue
            items.append(
                ProductVendorItem(
                    vendor=name,
                    organizations_using=0,
                    coverage_percentage=0.0,
                    views=plg.views,
                    badge_embeds=plg.badge_embeds,
                    submissions=plg.submissions,
                    evidence_downloads=plg.evidence_downloads,
                )
            )
        return ProductVendorsResponse(vendors=items[:limit])

    async def get_product_engagement(
        self, session: AsyncSession
    ) -> ProductEngagementResponse:
        m = await AdminAnalyticsRepository.get_engagement(session)
        dau = int(m.get("dau") or 0)
        mau = int(m.get("mau") or 0)
        return ProductEngagementResponse(
            dau=dau,
            wau=int(m.get("wau") or 0),
            mau=mau,
            stickiness=round(dau / max(mau, 1), 4),
        )

    async def get_product_activation(
        self, session: AsyncSession
    ) -> ProductActivationResponse:
        buckets = await AdminAnalyticsRepository.get_time_to_value(session)
        # Fallback activation rate from org-level monitoring coverage
        from app.modules.organizations.models import Organization
        from app.modules.checks.models import CheckResult

        total_orgs = (
            await session.execute(select(func.count()).select_from(Organization))
        ).scalar() or 0
        orgs_with_checks = (
            await session.execute(
                select(func.count(func.distinct(CheckResult.org_id))).select_from(
                    CheckResult
                )
            )
        ).scalar() or 0
        activation_rate = round(orgs_with_checks / max(total_orgs, 1), 4)

        return ProductActivationResponse(
            median_time_to_first_check_hours=None,
            p25_hours=None,
            p50_hours=None,
            p75_hours=None,
            activation_rate=activation_rate,
            buckets=buckets,
        )
