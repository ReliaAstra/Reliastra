"""Admin control plane: Growth: funnel, retention and referrals.

One room behind the front door in :mod:`app.modules.admin.control_plane_service`.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.control_plane_schemas import (
    GrowthFunnelResponse,
    GrowthFunnelStage,
    GrowthOverviewResponse,
    GrowthReferralsResponse,
)
from app.modules.admin.repository import (
    AdminAnalyticsRepository,
)

from app.modules.admin.control_plane_shared import (
    PERIOD_DAYS,
    utc_now,
)


logger = logging.getLogger(__name__)


class ControlPlaneGrowth:
    """Growth aggregates."""

    async def get_growth_overview(
        self, session: AsyncSession, *, period: str = "30d"
    ) -> GrowthOverviewResponse:
        days = PERIOD_DAYS.get(period, 30)
        since = utc_now() - timedelta(days=days)

        from app.modules.users.models import User
        from app.modules.organizations.models import Organization
        from app.modules.dependencies.models import Dependency
        from app.modules.billing.models import Subscription

        signups = (
            await session.execute(
                select(func.count()).select_from(User).where(User.created_at >= since)
            )
        ).scalar() or 0

        activated_orgs = (
            await session.execute(
                select(func.count(func.distinct(Dependency.org_id))).select_from(Dependency)
            )
        ).scalar() or 0

        paying = (
            await session.execute(
                select(func.count())
                .select_from(Subscription)
                .where(Subscription.status == "active")
            )
        ).scalar() or 0

        total_orgs = (
            await session.execute(select(func.count()).select_from(Organization))
        ).scalar() or 0

        engagement = await AdminAnalyticsRepository.get_engagement(session)
        funnel = await AdminAnalyticsRepository.get_growth_funnel(session)
        activated_users = next(
            (s["count"] for s in funnel if s["stage"] == "organizations"), 0
        )

        return GrowthOverviewResponse(
            signups=signups,
            activated_users=activated_users,
            activated_organizations=activated_orgs,
            paying_customers=paying,
            conversion_rate=round(paying / max(total_orgs, 1) * 100, 2),
            mrr_growth=0.0,
            retention_summary={},
            engagement=engagement,
            period=period,
        )

    async def get_growth_funnel(
        self, session: AsyncSession, *, period: str = "30d"
    ) -> GrowthFunnelResponse:
        # Enrich with available activation stages
        from app.modules.users.models import User
        from app.modules.organizations.models import Organization
        from app.modules.dependencies.models import Dependency
        from app.modules.billing.models import Subscription
        from app.modules.checks.models import CheckResult

        total_users = (
            await session.execute(select(func.count()).select_from(User))
        ).scalar() or 0
        verified = (
            await session.execute(
                select(func.count())
                .select_from(User)
                .where(User.is_email_verified.is_(True))
            )
        ).scalar() or 0
        total_orgs = (
            await session.execute(select(func.count()).select_from(Organization))
        ).scalar() or 0
        deps = (
            await session.execute(
                select(func.count(func.distinct(Dependency.org_id))).select_from(Dependency)
            )
        ).scalar() or 0
        monitoring = (
            await session.execute(
                select(func.count(func.distinct(CheckResult.org_id))).select_from(
                    CheckResult
                )
            )
        ).scalar() or 0
        paid = (
            await session.execute(
                select(func.count())
                .select_from(Subscription)
                .where(Subscription.status == "active")
            )
        ).scalar() or 0

        stage_defs = [
            ("signup", total_users),
            ("verified", verified),
            ("organization", total_orgs),
            ("dependency_added", deps),
            ("monitoring_started", monitoring),
            ("activated", monitoring),
            ("paid", paid),
        ]
        stages: list[GrowthFunnelStage] = []
        prev = None
        for name, count in stage_defs:
            conv = None
            if prev is not None and prev > 0:
                conv = round(count / prev, 4)
            stages.append(
                GrowthFunnelStage(
                    stage=name, count=count, conversion_from_previous=conv
                )
            )
            prev = count

        # Attach PLG funnel when available
        plg = None
        try:
            from app.modules.growth.service import growth_service

            plg_funnel = await growth_service.get_funnel(session, period=period)
            plg = plg_funnel.model_dump()
        except Exception as exc:
            logger.debug("PLG funnel unavailable: %s", exc)

        return GrowthFunnelResponse(period=period, stages=stages, plg=plg)

    async def get_growth_retention(
        self, session: AsyncSession, *, weeks: int = 4
    ) -> dict[str, Any]:
        cohorts = await AdminAnalyticsRepository.get_retention_cohorts(session, weeks)
        return {"cohorts": cohorts, "weeks": weeks}

    async def get_growth_referrals(self, session: AsyncSession) -> GrowthReferralsResponse:
        try:
            from app.modules.growth.service import growth_service

            data = await growth_service.get_referral_stats(session)
            return GrowthReferralsResponse(
                summary=data.get("summary") or {},
                top_referrers=data.get("top_referrers") or [],
            )
        except Exception as exc:
            logger.warning("Referral stats unavailable: %s", exc)
            return GrowthReferralsResponse()
