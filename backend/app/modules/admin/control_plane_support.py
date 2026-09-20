"""Admin control plane: Care surfaces: support workspace, communications and operations.

One room behind the front door in :mod:`app.modules.admin.control_plane_service`.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.control_plane_customers import ControlPlaneCustomers
from app.modules.admin.control_plane_schemas import (
    CommunicationsOverviewResponse,
    ComponentHealth,
    OperationsOverviewResponse,
    SupportOverviewResponse,
    SupportTicketWorkspaceResponse,
)
from app.modules.admin.models import (
    Announcement,
    EmailCampaign,
    FeedbackTicket,
    InAppNotification,
)
from app.modules.admin.repository import (
    AdminFeedbackRepository,
)
from app.modules.admin.service import (
    admin_feedback_service,
    admin_operations_service,
)

from app.modules.admin.control_plane_shared import (
    count_rows,
    count_rows_where,
    utc_now,
)



logger = logging.getLogger(__name__)


class ControlPlaneSupport:
    """Support, communications and operations overviews."""

    def __init__(
        self, customers: ControlPlaneCustomers = ControlPlaneCustomers()
    ) -> None:
        # The ticket workspace links back to the customer record.
        self._customers = customers

    async def get_support_overview(self, session: AsyncSession) -> SupportOverviewResponse:
        stats = await AdminFeedbackRepository.get_ticket_stats(session)
        open_count = int(stats.get("open_tickets") or 0)
        by_priority = stats.get("by_priority") or {}
        urgent = int(by_priority.get("urgent") or 0) + int(
            by_priority.get("critical") or 0
        ) + int(by_priority.get("high") or 0)

        unassigned = await count_rows_where(
            session,
            FeedbackTicket,
            and_(
                FeedbackTicket.status.in_(["open", "in_progress", "pending"]),
                FeedbackTicket.assigned_to.is_(None),
            ),
        )
        waiting_customer = await count_rows_where(
            session, FeedbackTicket, FeedbackTicket.status == "waiting_on_customer"
        )
        waiting_agent = await count_rows_where(
            session, FeedbackTicket, FeedbackTicket.status == "waiting_on_agent"
        )
        today_start = utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
        resolved_today = await count_rows_where(
            session,
            FeedbackTicket,
            and_(
                FeedbackTicket.status == "resolved",
                FeedbackTicket.resolved_at >= today_start,
            ),
        )

        queue = {
            "critical": int(by_priority.get("critical") or 0),
            "urgent": int(by_priority.get("urgent") or 0),
            "high": int(by_priority.get("high") or 0),
            "normal": int(by_priority.get("normal") or 0),
            "low": int(by_priority.get("low") or 0),
        }

        return SupportOverviewResponse(
            open=open_count,
            urgent=urgent,
            unassigned=unassigned,
            waiting_on_customer=waiting_customer,
            waiting_on_agent=waiting_agent,
            resolved_today=resolved_today,
            average_first_response_hours=0.0,
            average_resolution_hours=float(stats.get("avg_resolution_hours") or 0.0),
            sla_breaches=0,
            queue=queue,
            by_category=stats.get("by_category") or {},
        )

    async def get_support_ticket_workspace(
        self, session: AsyncSession, ticket_id: uuid.UUID
    ) -> SupportTicketWorkspaceResponse:
        detail = await admin_feedback_service.get_ticket(session, ticket_id)
        ticket = detail.ticket
        messages = [m.model_dump(mode="json") for m in detail.messages]

        customer_payload = None
        org_payload = None
        subscription_payload = None
        recent_activity: list[dict[str, Any]] = []
        related_incidents: list[dict[str, Any]] = []

        if ticket.user_id:
            try:
                cust = await self._customers.get_customer_detail(session, ticket.user_id)
                customer_payload = {
                    "customer_id": str(cust.customer_id),
                    "email": cust.email,
                    "full_name": cust.full_name,
                    "is_active": cust.is_active,
                    "plan": cust.plan,
                    "mrr": cust.mrr,
                    "health": cust.health,
                    "billing_status": cust.billing_status,
                }
                if cust.primary_org:
                    org_payload = cust.primary_org.model_dump(mode="json")
                subscription_payload = cust.subscription
                recent_activity = cust.recent_activity
            except Exception as exc:
                logger.debug("Could not load customer for ticket: %s", exc)

        return SupportTicketWorkspaceResponse(
            ticket=ticket.model_dump(mode="json"),
            messages=messages,
            customer=customer_payload,
            organization=org_payload,
            subscription=subscription_payload,
            recent_customer_activity=recent_activity,
            related_incidents=related_incidents,
        )

    async def get_communications_overview(
        self, session: AsyncSession
    ) -> CommunicationsOverviewResponse:
        total = await count_rows(session, EmailCampaign)
        drafts = await count_rows_where(
            session, EmailCampaign, EmailCampaign.status == "draft"
        )
        scheduled = await count_rows_where(
            session, EmailCampaign, EmailCampaign.status == "scheduled"
        )
        today_start = utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
        sent_today = await count_rows_where(
            session,
            EmailCampaign,
            and_(
                EmailCampaign.status == "sent",
                EmailCampaign.sent_at >= today_start,
            ),
        )
        notifications = await count_rows(session, InAppNotification)
        announcements_total = await count_rows(session, Announcement)
        announcements_active = await count_rows_where(
            session, Announcement, Announcement.is_active.is_(True)
        )

        # Aggregate delivery stats from recent campaigns
        recent = (
            await session.execute(
                select(EmailCampaign)
                .where(EmailCampaign.status == "sent")
                .order_by(EmailCampaign.sent_at.desc())
                .limit(10)
            )
        ).scalars().all()
        delivery = {
            "recent_campaigns": len(recent),
            "recipients": sum(c.recipient_count or 0 for c in recent),
            "sent": sum(c.sent_count or 0 for c in recent),
            "opened": sum(c.opened_count or 0 for c in recent),
            "clicked": sum(c.clicked_count or 0 for c in recent),
            "bounced": sum(c.bounced_count or 0 for c in recent),
            "failed": sum(c.failed_count or 0 for c in recent),
        }

        return CommunicationsOverviewResponse(
            campaigns_total=total,
            drafts=drafts,
            scheduled=scheduled,
            sent_today=sent_today,
            notifications=notifications,
            announcements_active=announcements_active,
            announcements_total=announcements_total,
            recent_delivery_stats=delivery,
        )

    async def get_operations_overview(
        self, session: AsyncSession
    ) -> OperationsOverviewResponse:
        import time as _time
        from sqlalchemy import text
        from app.db.session import get_engine

        now = utc_now()
        overall = "healthy"

        # API - if we are serving this request, API is up
        api = ComponentHealth(status="healthy", latency_ms=0.0, last_checked=now)

        # Database
        try:
            engine = get_engine()
            start = _time.monotonic()
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            db = ComponentHealth(
                status="healthy",
                latency_ms=round((_time.monotonic() - start) * 1000, 2),
                last_checked=now,
            )
        except Exception as exc:
            overall = "degraded"
            db = ComponentHealth(
                status="error", last_checked=now, error=str(exc)
            )

        # Redis
        try:
            from app.infrastructure.redis_client import safe_redis_ping

            start = _time.monotonic()
            ok = await safe_redis_ping()
            if ok:
                redis = ComponentHealth(
                    status="healthy",
                    latency_ms=round((_time.monotonic() - start) * 1000, 2),
                    last_checked=now,
                )
            else:
                overall = "degraded"
                redis = ComponentHealth(
                    status="error", last_checked=now, error="Redis ping failed"
                )
        except Exception as exc:
            overall = "degraded"
            redis = ComponentHealth(
                status="error", last_checked=now, error=str(exc)
            )

        engines_payload = await admin_operations_service.check_engines(session)
        engines = engines_payload.get("engines") or []
        worker_status = "healthy"
        for e in engines:
            if e.get("status") not in ("running", "idle", "ok"):
                worker_status = "degraded"
                overall = "degraded"
                break
        workers = ComponentHealth(status=worker_status, last_checked=now)
        scheduler = ComponentHealth(status=worker_status, last_checked=now)
        check_engine = ComponentHealth(status=worker_status, last_checked=now)

        # Billing / email / storage - configuration presence checks
        from app.config import settings

        billing_ok = bool(getattr(settings, "PAYSTACK_SECRET_KEY", "") or "")
        billing = ComponentHealth(
            status="healthy" if billing_ok else "unknown",
            last_checked=now,
            message=None if billing_ok else "Billing provider not configured",
        )
        smtp_host = getattr(settings, "SMTP_HOST", "") or ""
        # localhost is the default dev value - treat as unknown in that case
        email_cfg = bool(smtp_host) and smtp_host not in ("localhost", "127.0.0.1")
        email = ComponentHealth(
            status="healthy" if email_cfg else "unknown",
            last_checked=now,
            message=None if email_cfg else "SMTP not configured for production",
        )
        storage_ok = bool(getattr(settings, "SUPABASE_S3_BUCKET", "") or "")
        storage = ComponentHealth(
            status="healthy" if storage_ok else "unknown",
            last_checked=now,
            message=None if storage_ok else "Object storage not configured",
        )

        return OperationsOverviewResponse(
            api=api,
            database=db,
            redis=redis,
            workers=workers,
            scheduler=scheduler,
            check_engine=check_engine,
            billing=billing,
            email=email,
            storage=storage,
            overall=overall,
            engines=engines,
            generated_at=now,
        )
