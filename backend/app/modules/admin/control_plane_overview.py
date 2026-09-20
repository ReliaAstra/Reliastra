"""Admin control plane: Console landing: the fleet overview and the attention queue.

One room behind the front door in :mod:`app.modules.admin.control_plane_service`.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.control_plane_schemas import (
    AdminOverviewResponse,
    AttentionItem,
    AttentionResponse,
    ComponentHealth,
    OverviewBusinessSection,
    OverviewCommunicationsSection,
    OverviewGrowthSection,
    OverviewProductSection,
    OverviewSupportSection,
    OverviewSystemSection,
)
from app.modules.admin.control_plane_shared import (
    count_checks_since,
    count_rows_where,
    utc_now,
)
from app.modules.admin.models import (
    Announcement,
    EmailCampaign,
    FeedbackTicket,
)
from app.modules.admin.repository import (
    AdminAnalyticsRepository,
    AdminBusinessRepository,
    AdminFeedbackRepository,
    AdminOperationsRepository,
)
from app.modules.admin.service import (
    admin_operations_service,
)



class ControlPlaneOverview:
    """Fleet overview and attention queue."""

    async def get_overview(self, session: AsyncSession) -> AdminOverviewResponse:
        business_raw = await AdminBusinessRepository.get_summary(session)
        engagement = await AdminAnalyticsRepository.get_engagement(session)
        metrics = await AdminOperationsRepository.get_system_metrics(session)
        support_stats = await AdminFeedbackRepository.get_ticket_stats(session)
        health = await admin_operations_service.health_check(session)
        engines = await admin_operations_service.check_engines(session)

        mrr = float(business_raw.get("mrr") or 0.0)
        paying = int(business_raw.get("active_subscriptions") or 0)
        users = int(business_raw.get("total_users") or 0)
        orgs = int(business_raw.get("total_organizations") or 0)
        new_signups = int(business_raw.get("new_signups_7d") or 0)
        churned = int(business_raw.get("churned_7d") or 0)

        # Communications counts
        drafts = await count_rows_where(session, EmailCampaign, EmailCampaign.status == "draft")
        scheduled = await count_rows_where(
            session, EmailCampaign, EmailCampaign.status == "scheduled"
        )
        active_campaigns = await count_rows_where(
            session, EmailCampaign, EmailCampaign.status.in_(["sent", "sending"])
        )
        announcements_active = await count_rows_where(
            session, Announcement, Announcement.is_active.is_(True)
        )

        # Support urgency
        urgent = await count_rows_where(
            session,
            FeedbackTicket,
            and_(
                FeedbackTicket.status.in_(["open", "in_progress", "pending"]),
                FeedbackTicket.priority.in_(["urgent", "critical", "high"]),
            ),
        )
        unassigned = await count_rows_where(
            session,
            FeedbackTicket,
            and_(
                FeedbackTicket.status.in_(["open", "in_progress", "pending"]),
                FeedbackTicket.assigned_to.is_(None),
            ),
        )

        # Product metrics
        checks_today = await count_checks_since(
            session, utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
        )
        open_incidents = int(metrics.get("total_incidents_open") or 0)
        dependencies = int(metrics.get("total_dependencies") or 0)

        health_map = {c.component: c for c in health.checks}
        db_h = health_map.get("database")
        redis_h = health_map.get("redis")

        def _comp(item) -> ComponentHealth:
            if item is None:
                return ComponentHealth(status="unknown", last_checked=utc_now())
            status = "healthy" if item.status == "ok" else (
                "degraded" if item.status == "degraded" else "error"
            )
            return ComponentHealth(
                status=status,
                latency_ms=item.latency_ms,
                last_checked=utc_now(),
                error=item.message if status != "healthy" else None,
                message=item.message,
            )

        engine_list = engines.get("engines") or []
        worker_status = "healthy"
        if any(e.get("status") not in ("running", "idle", "ok") for e in engine_list):
            worker_status = "degraded"

        actions = await self._collect_attention_items(
            session,
            urgent_tickets=urgent,
            unassigned_tickets=unassigned,
            open_incidents=open_incidents,
            health=health,
            engines=engine_list,
        )

        return AdminOverviewResponse(
            business=OverviewBusinessSection(
                users=users,
                organizations=orgs,
                active_users=int(engagement.get("dau") or 0),
                active_organizations=paying,  # best available proxy
                paying_organizations=paying,
                mrr=mrr,
                arr_estimate=round(mrr * 12, 2),
                new_signups=new_signups,
                new_paying_customers=0,
                churn_count=churned,
                churn_rate=round(churned / max(paying, 1) * 100, 2),
            ),
            growth=OverviewGrowthSection(
                signup_growth=0.0,
                customer_growth=0.0,
                mrr_growth=0.0,
                conversion_rate=round(paying / max(orgs, 1) * 100, 2),
            ),
            product=OverviewProductSection(
                monitors=dependencies,
                active_monitors=dependencies,
                dependencies=dependencies,
                checks_today=checks_today,
                incidents=open_incidents,
                open_incidents=open_incidents,
            ),
            support=OverviewSupportSection(
                open_tickets=int(support_stats.get("open_tickets") or 0),
                urgent_tickets=urgent,
                unassigned_tickets=unassigned,
                average_response_time_hours=float(
                    support_stats.get("avg_resolution_hours") or 0.0
                ),
            ),
            communications=OverviewCommunicationsSection(
                active_campaigns=active_campaigns,
                scheduled_campaigns=scheduled,
                draft_campaigns=drafts,
                recent_announcements=announcements_active,
            ),
            system=OverviewSystemSection(
                api_health=ComponentHealth(status="healthy", last_checked=utc_now()),
                database_health=_comp(db_h),
                redis_health=_comp(redis_h),
                worker_health=ComponentHealth(
                    status=worker_status, last_checked=utc_now()
                ),
                scheduler_health=ComponentHealth(
                    status=worker_status, last_checked=utc_now()
                ),
            ),
            actions_required=actions,
            generated_at=utc_now(),
        )

    async def get_attention(self, session: AsyncSession) -> AttentionResponse:
        support_stats = await AdminFeedbackRepository.get_ticket_stats(session)
        urgent = await count_rows_where(
            session,
            FeedbackTicket,
            and_(
                FeedbackTicket.status.in_(["open", "in_progress", "pending"]),
                FeedbackTicket.priority.in_(["urgent", "critical", "high"]),
            ),
        )
        unassigned = await count_rows_where(
            session,
            FeedbackTicket,
            and_(
                FeedbackTicket.status.in_(["open", "in_progress", "pending"]),
                FeedbackTicket.assigned_to.is_(None),
            ),
        )
        metrics = await AdminOperationsRepository.get_system_metrics(session)
        health = await admin_operations_service.health_check(session)
        engines = (await admin_operations_service.check_engines(session)).get("engines") or []
        churn = await AdminBusinessRepository.get_churn_signals(session, limit=50)
        high_churn = [c for c in churn if c.get("risk_level") == "high"]

        # Pending partner payouts (best-effort)
        pending_payouts = 0
        try:
            from app.modules.partners.models import PartnerPayout

            pending_payouts = await count_rows_where(
                session,
                PartnerPayout,
                PartnerPayout.status.in_(["pending", "processing", "requested"]),
            )
        except Exception:
            pending_payouts = 0

        items = await self._collect_attention_items(
            session,
            urgent_tickets=urgent,
            unassigned_tickets=unassigned,
            open_incidents=int(metrics.get("total_incidents_open") or 0),
            health=health,
            engines=engines,
            high_churn_count=len(high_churn),
            pending_payouts=pending_payouts,
            open_tickets=int(support_stats.get("open_tickets") or 0),
        )

        return AttentionResponse(
            items=items,
            critical_count=sum(1 for i in items if i.priority == "critical"),
            high_count=sum(1 for i in items if i.priority == "high"),
            normal_count=sum(1 for i in items if i.priority == "normal"),
            generated_at=utc_now(),
        )

    async def _collect_attention_items(
        self,
        session: AsyncSession,
        *,
        urgent_tickets: int = 0,
        unassigned_tickets: int = 0,
        open_incidents: int = 0,
        health=None,
        engines: list[dict[str, Any]] | None = None,
        high_churn_count: int = 0,
        pending_payouts: int = 0,
        open_tickets: int = 0,
    ) -> list[AttentionItem]:
        items: list[AttentionItem] = []

        if urgent_tickets > 0:
            items.append(
                AttentionItem(
                    type="urgent_support",
                    priority="critical",
                    count=urgent_tickets,
                    title=f"{urgent_tickets} urgent support ticket(s)",
                    description="Tickets marked urgent/critical/high that still need attention.",
                    target_resource="support_ticket",
                    href="/v1/admin/support/tickets?priority=urgent",
                )
            )

        if unassigned_tickets > 0:
            items.append(
                AttentionItem(
                    type="unassigned_support",
                    priority="high",
                    count=unassigned_tickets,
                    title=f"{unassigned_tickets} unassigned ticket(s)",
                    description="Open tickets with no assignee.",
                    target_resource="support_ticket",
                    href="/v1/admin/support/tickets?status=open",
                )
            )

        if open_incidents > 0:
            items.append(
                AttentionItem(
                    type="open_incidents",
                    priority="high" if open_incidents >= 5 else "normal",
                    count=open_incidents,
                    title=f"{open_incidents} open incident(s)",
                    description="Customer-facing incidents currently open.",
                    target_resource="incident",
                )
            )

        if high_churn_count > 0:
            items.append(
                AttentionItem(
                    type="churn_risk",
                    priority="high",
                    count=high_churn_count,
                    title=f"{high_churn_count} high-value customer(s) at churn risk",
                    description="Paying orgs with low recent activity.",
                    target_resource="customer",
                    href="/v1/admin/customers/churn-risk",
                )
            )

        if pending_payouts > 0:
            items.append(
                AttentionItem(
                    type="pending_partner_payouts",
                    priority="normal",
                    count=pending_payouts,
                    title=f"{pending_payouts} pending partner payout(s)",
                    description="Partner payouts awaiting processing.",
                    target_resource="partner_payout",
                    href="/v1/admin/partners/payouts",
                )
            )

        if health is not None:
            for check in health.checks:
                if check.status != "ok":
                    items.append(
                        AttentionItem(
                            type="system_health",
                            priority="critical",
                            count=1,
                            title=f"{check.component} unhealthy",
                            description=check.message or f"{check.component} status={check.status}",
                            target_resource="operations",
                            href="/v1/admin/operations/overview",
                        )
                    )

        for eng in engines or []:
            status = eng.get("status")
            if status not in ("running", "idle", "ok", None):
                items.append(
                    AttentionItem(
                        type="failed_worker",
                        priority="critical",
                        count=1,
                        title=f"Worker '{eng.get('name')}' is {status}",
                        description=eng.get("last_error") or "Background worker needs attention.",
                        target_resource="operations",
                        href="/v1/admin/operations/overview",
                    )
                )

        # Unresolved error logs
        try:
            from app.modules.admin.models import AppErrorLog

            unresolved = await count_rows_where(
                session, AppErrorLog, AppErrorLog.is_resolved.is_(False)
            )
            if unresolved > 0:
                items.append(
                    AttentionItem(
                        type="unresolved_errors",
                        priority="high" if unresolved >= 10 else "normal",
                        count=unresolved,
                        title=f"{unresolved} unresolved error log(s)",
                        description="Application errors awaiting triage.",
                        target_resource="error_log",
                        href="/v1/admin/operations/errors",
                    )
                )
        except Exception:
            pass

        priority_rank = {"critical": 0, "high": 1, "normal": 2, "low": 3}
        items.sort(key=lambda i: (priority_rank.get(i.priority, 9), -i.count))
        return items
