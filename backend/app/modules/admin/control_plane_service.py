"""Front door of the admin control plane.

``AdminControlPlaneService`` is the stable public API the admin router talks
to, and its method signatures are the contract. It holds no aggregation
logic itself; it wires the rooms behind the door:

 * ``control_plane_shared.py`` — the clock, the period table and the
   tolerant row counters every room borrows.
 * ``control_plane_overview.py`` (``ControlPlaneOverview``) — the console
   landing: fleet overview plus the attention queue.
 * ``control_plane_search.py`` (``ControlPlaneSearch``) — global search.
 * ``control_plane_customers.py`` (``ControlPlaneCustomers``) — customer
   reads and mutations.
 * ``control_plane_revenue.py`` (``ControlPlaneRevenue``) — revenue.
 * ``control_plane_growth.py`` (``ControlPlaneGrowth``) — growth.
 * ``control_plane_product.py`` (``ControlPlaneProduct``) — product.
 * ``control_plane_support.py`` (``ControlPlaneSupport``) — support,
   communications and operations. It borrows the customer room for the
   ticket workspace link.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.control_plane_customers import ControlPlaneCustomers
from app.modules.admin.control_plane_growth import ControlPlaneGrowth
from app.modules.admin.control_plane_overview import ControlPlaneOverview
from app.modules.admin.control_plane_product import ControlPlaneProduct
from app.modules.admin.control_plane_revenue import ControlPlaneRevenue
from app.modules.admin.control_plane_schemas import (
    AdminOverviewResponse,
    AdminSearchResponse,
    AttentionResponse,
    CommunicationsOverviewResponse,
    CustomerDetailResponse,
    CustomerImpersonateResponse,
    CustomerListResponse,
    GrowthFunnelResponse,
    GrowthOverviewResponse,
    GrowthReferralsResponse,
    OperationsOverviewResponse,
    ProductActivationResponse,
    ProductEngagementResponse,
    ProductFeaturesResponse,
    ProductOverviewResponse,
    ProductVendorsResponse,
    RevenueAttentionResponse,
    RevenueSummaryResponse,
    RevenueTimeseriesResponse,
    SupportOverviewResponse,
    SupportTicketWorkspaceResponse,
)
from app.modules.support.schemas import SupportAlertsResponse
from app.modules.admin.control_plane_search import ControlPlaneSearch
from app.modules.admin.control_plane_support import ControlPlaneSupport



class AdminControlPlaneService:
    """Stable facade over the control-plane collaborators."""

    def __init__(self) -> None:
        self._overview = ControlPlaneOverview()
        self._search = ControlPlaneSearch()
        self._customers = ControlPlaneCustomers()
        self._revenue = ControlPlaneRevenue()
        self._growth = ControlPlaneGrowth()
        self._product = ControlPlaneProduct()
        self._support = ControlPlaneSupport(self._customers)

    async def get_overview(self, session: AsyncSession) -> AdminOverviewResponse:
        return await self._overview.get_overview(session)

    async def get_attention(self, session: AsyncSession) -> AttentionResponse:
        return await self._overview.get_attention(session)

    async def search(
        self, session: AsyncSession, q: str, *, limit: int = 8
    ) -> AdminSearchResponse:
        return await self._search.search(session, q, limit=limit)

    async def list_customers(
        self,
        session: AsyncSession,
        *,
        search: str | None = None,
        status: str | None = None,
        plan: str | None = None,
        segment: str | None = None,
        health: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        page: int = 1,
        page_size: int = 20,
        sort: str = "created_at_desc",
    ) -> CustomerListResponse:
        return await self._customers.list_customers(
            session,
            search=search,
            status=status,
            plan=plan,
            segment=segment,
            health=health,
            created_from=created_from,
            created_to=created_to,
            page=page,
            page_size=page_size,
            sort=sort,
        )

    async def get_customer_detail(
        self, session: AsyncSession, customer_id: uuid.UUID
    ) -> CustomerDetailResponse:
        return await self._customers.get_customer_detail(session, customer_id)

    async def update_customer(
        self,
        session: AsyncSession,
        customer_id: uuid.UUID,
        *,
        admin_user_id: uuid.UUID,
        admin_email: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
        full_name: str | None = None,
        admin_note: str | None = None,
        source: str | None = None,
    ) -> CustomerDetailResponse:
        return await self._customers.update_customer(
            session,
            customer_id,
            admin_user_id=admin_user_id,
            admin_email=admin_email,
            ip_address=ip_address,
            user_agent=user_agent,
            full_name=full_name,
            admin_note=admin_note,
            source=source,
        )

    async def impersonate_customer(
        self,
        session: AsyncSession,
        customer_id: uuid.UUID,
        *,
        reason: str,
        admin_user_id: uuid.UUID,
        admin_email: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> CustomerImpersonateResponse:
        return await self._customers.impersonate_customer(
            session,
            customer_id,
            reason=reason,
            admin_user_id=admin_user_id,
            admin_email=admin_email,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    async def change_customer_plan(
        self,
        session: AsyncSession,
        customer_id: uuid.UUID,
        *,
        plan: str,
        reason: str | None,
        org_id: uuid.UUID | None,
        admin_user_id: uuid.UUID,
        admin_email: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> dict[str, Any]:
        return await self._customers.change_customer_plan(
            session,
            customer_id,
            plan=plan,
            reason=reason,
            org_id=org_id,
            admin_user_id=admin_user_id,
            admin_email=admin_email,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    async def email_customer(
        self,
        session: AsyncSession,
        customer_id: uuid.UUID,
        *,
        subject: str,
        body: str,
        html_body: str | None,
        admin_user_id: uuid.UUID,
        admin_email: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> dict[str, Any]:
        return await self._customers.email_customer(
            session,
            customer_id,
            subject=subject,
            body=body,
            html_body=html_body,
            admin_user_id=admin_user_id,
            admin_email=admin_email,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    async def deactivate_customer(
        self,
        session: AsyncSession,
        customer_id: uuid.UUID,
        *,
        reason: str,
        admin_user_id: uuid.UUID,
        admin_email: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> CustomerDetailResponse:
        return await self._customers.deactivate_customer(
            session,
            customer_id,
            reason=reason,
            admin_user_id=admin_user_id,
            admin_email=admin_email,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    async def get_customer_activity(
        self,
        session: AsyncSession,
        customer_id: uuid.UUID,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        return await self._customers.get_customer_activity(
            session,
            customer_id,
            page=page,
            page_size=page_size,
        )

    async def get_recent_customers(
        self, session: AsyncSession, *, limit: int = 20
    ) -> dict[str, Any]:
        return await self._customers.get_recent_customers(session, limit=limit)

    async def get_churn_risk(
        self, session: AsyncSession, *, limit: int = 20
    ) -> dict[str, Any]:
        return await self._customers.get_churn_risk(session, limit=limit)

    async def get_revenue_summary(self, session: AsyncSession) -> RevenueSummaryResponse:
        return await self._revenue.get_revenue_summary(session)

    async def get_revenue_timeseries(
        self,
        session: AsyncSession,
        *,
        period: str = "30d",
        granularity: str = "day",
    ) -> RevenueTimeseriesResponse:
        return await self._revenue.get_revenue_timeseries(
            session,
            period=period,
            granularity=granularity,
        )

    async def get_revenue_attention(
        self, session: AsyncSession
    ) -> RevenueAttentionResponse:
        return await self._revenue.get_revenue_attention(session)

    async def get_growth_overview(
        self, session: AsyncSession, *, period: str = "30d"
    ) -> GrowthOverviewResponse:
        return await self._growth.get_growth_overview(session, period=period)

    async def get_growth_funnel(
        self, session: AsyncSession, *, period: str = "30d"
    ) -> GrowthFunnelResponse:
        return await self._growth.get_growth_funnel(session, period=period)

    async def get_growth_retention(
        self, session: AsyncSession, *, weeks: int = 4
    ) -> dict[str, Any]:
        return await self._growth.get_growth_retention(session, weeks=weeks)

    async def get_growth_referrals(self, session: AsyncSession) -> GrowthReferralsResponse:
        return await self._growth.get_growth_referrals(session)

    async def get_product_overview(self, session: AsyncSession) -> ProductOverviewResponse:
        return await self._product.get_product_overview(session)

    async def get_product_features(self, session: AsyncSession) -> ProductFeaturesResponse:
        return await self._product.get_product_features(session)

    async def get_product_vendors(
        self, session: AsyncSession, *, limit: int = 20
    ) -> ProductVendorsResponse:
        return await self._product.get_product_vendors(session, limit=limit)

    async def get_product_engagement(
        self, session: AsyncSession
    ) -> ProductEngagementResponse:
        return await self._product.get_product_engagement(session)

    async def get_product_activation(
        self, session: AsyncSession
    ) -> ProductActivationResponse:
        return await self._product.get_product_activation(session)

    async def get_support_overview(self, session: AsyncSession) -> SupportOverviewResponse:
        return await self._support.get_support_overview(session)

    async def get_support_alerts(
        self, session: AsyncSession, *, since: Any | None = None
    ) -> SupportAlertsResponse:
        return await self._support.get_support_alerts(session, since=since)

    async def get_support_ticket_workspace(
        self, session: AsyncSession, ticket_id: uuid.UUID
    ) -> SupportTicketWorkspaceResponse:
        return await self._support.get_support_ticket_workspace(session, ticket_id)

    async def get_communications_overview(
        self, session: AsyncSession
    ) -> CommunicationsOverviewResponse:
        return await self._support.get_communications_overview(session)

    async def get_operations_overview(
        self, session: AsyncSession
    ) -> OperationsOverviewResponse:
        return await self._support.get_operations_overview(session)


admin_control_plane_service = AdminControlPlaneService()
