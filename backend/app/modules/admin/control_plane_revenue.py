"""Admin control plane: Revenue summaries, timeseries and money-needing-attention.

One room behind the front door in :mod:`app.modules.admin.control_plane_service`.
"""

from __future__ import annotations


from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.control_plane_schemas import (
    AttentionItem,
    RevenueAttentionResponse,
    RevenueDataPoint,
    RevenueSummaryResponse,
    RevenueTimeseriesResponse,
)
from app.modules.admin.repository import (
    AdminBusinessRepository,
)

from app.modules.admin.control_plane_shared import (
    PERIOD_DAYS,
)


class ControlPlaneRevenue:
    """Revenue aggregates."""

    async def get_revenue_summary(self, session: AsyncSession) -> RevenueSummaryResponse:
        summary = await AdminBusinessRepository.get_summary(session)
        mrr = float(summary.get("mrr") or 0.0)
        paying = int(summary.get("active_subscriptions") or 0)
        arpu = round(mrr / max(paying, 1), 2)
        return RevenueSummaryResponse(
            mrr=mrr,
            mrr_growth=0.0,  # requires historical snapshots
            arr_estimate=round(mrr * 12, 2),
            new_mrr=0.0,
            expansion_mrr=0.0,
            contraction_mrr=0.0,
            churned_mrr=0.0,
            net_new_mrr=0.0,
            paying_customers=paying,
            arpu=arpu,
            currency="USD",
        )

    async def get_revenue_timeseries(
        self,
        session: AsyncSession,
        *,
        period: str = "30d",
        granularity: str = "day",
    ) -> RevenueTimeseriesResponse:
        days = PERIOD_DAYS.get(period, 30)
        if granularity == "week":
            # sample weekly points
            raw = await AdminBusinessRepository.get_mrr_timeseries(session, days=days)
            points = [
                RevenueDataPoint(date=p["date"], mrr=p["mrr"])
                for i, p in enumerate(raw)
                if i % 7 == 0 or i == len(raw) - 1
            ]
        elif granularity == "month":
            raw = await AdminBusinessRepository.get_mrr_timeseries(session, days=days)
            points = [
                RevenueDataPoint(date=p["date"], mrr=p["mrr"])
                for i, p in enumerate(raw)
                if i % 30 == 0 or i == len(raw) - 1
            ]
        else:
            raw = await AdminBusinessRepository.get_mrr_timeseries(session, days=days)
            points = [RevenueDataPoint(date=p["date"], mrr=p["mrr"]) for p in raw]

        return RevenueTimeseriesResponse(
            period=period, granularity=granularity, data_points=points
        )

    async def get_revenue_attention(
        self, session: AsyncSession
    ) -> RevenueAttentionResponse:
        churn = await AdminBusinessRepository.get_churn_signals(session, limit=20)
        high_value = [
            AttentionItem(
                type="high_value_churn",
                priority="high" if c.get("risk_level") == "high" else "normal",
                count=1,
                title=f"{c.get('org_name')} at churn risk",
                description=f"Plan={c.get('plan')} risk={c.get('risk_level')}",
                target_resource="organization",
                target_id=str(c.get("org_id")),
                href="/v1/admin/customers/churn-risk",
            )
            for c in churn
            if c.get("risk_level") in ("high", "medium")
        ]
        items = list(high_value)
        return RevenueAttentionResponse(
            failed_payments=[],  # requires payment-provider failure events
            revenue_drop_alerts=[],
            unusual_mrr_changes=[],
            high_value_churn=high_value,
            items=items,
        )
