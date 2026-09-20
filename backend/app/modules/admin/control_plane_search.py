"""Admin control plane: Global search across users, organizations and partners.

One room behind the front door in :mod:`app.modules.admin.control_plane_service`.
"""

from __future__ import annotations


from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.control_plane_schemas import (
    AdminSearchResponse,
    SearchHit,
)
from app.modules.admin.models import (
    EmailCampaign,
    FeedbackTicket,
)



class ControlPlaneSearch:
    """Global admin search."""

    async def search(
        self, session: AsyncSession, q: str, *, limit: int = 8
    ) -> AdminSearchResponse:
        q = (q or "").strip()
        if len(q) < 2:
            return AdminSearchResponse(query=q, total=0)

        pattern = f"%{q}%"
        customers: list[SearchHit] = []
        organizations: list[SearchHit] = []
        tickets: list[SearchHit] = []
        partners: list[SearchHit] = []
        campaigns: list[SearchHit] = []

        from app.modules.users.models import User
        from app.modules.organizations.models import Organization

        user_rows = (
            await session.execute(
                select(User)
                .where(or_(User.email.ilike(pattern), User.full_name.ilike(pattern)))
                .order_by(User.created_at.desc())
                .limit(limit)
            )
        ).scalars().all()
        for u in user_rows:
            customers.append(
                SearchHit(
                    resource_type="customer",
                    id=str(u.id),
                    title=u.full_name or u.email,
                    subtitle=u.email,
                    href=f"/v1/admin/customers/{u.id}",
                    meta={"is_active": u.is_active},
                )
            )

        org_rows = (
            await session.execute(
                select(Organization)
                .where(Organization.name.ilike(pattern))
                .order_by(Organization.created_at.desc())
                .limit(limit)
            )
        ).scalars().all()
        for o in org_rows:
            organizations.append(
                SearchHit(
                    resource_type="organization",
                    id=str(o.id),
                    title=o.name,
                    subtitle=o.plan,
                    href=f"/v1/admin/customers?search={o.name}",
                    meta={"plan": o.plan},
                )
            )

        ticket_rows = (
            await session.execute(
                select(FeedbackTicket)
                .where(
                    or_(
                        FeedbackTicket.subject.ilike(pattern),
                        FeedbackTicket.email.ilike(pattern),
                        FeedbackTicket.ticket_number.ilike(pattern),
                    )
                )
                .order_by(FeedbackTicket.created_at.desc())
                .limit(limit)
            )
        ).scalars().all()
        for t in ticket_rows:
            tickets.append(
                SearchHit(
                    resource_type="ticket",
                    id=str(t.id),
                    title=f"{t.ticket_number}: {t.subject}",
                    subtitle=f"{t.status} · {t.priority}",
                    href=f"/v1/admin/support/tickets/{t.id}",
                    meta={"status": t.status, "priority": t.priority},
                )
            )

        try:
            from app.modules.partners.models import PartnerProfile
            from app.modules.users.repository import UserRepository

            partner_rows = (
                await session.execute(
                    select(PartnerProfile).limit(50)
                )
            ).scalars().all()
            matched = 0
            for p in partner_rows:
                if matched >= limit:
                    break
                user = await UserRepository.get_by_id(session, p.user_id)
                email = (user.email if user else "") or ""
                if q.lower() in email.lower() or q.lower() in str(p.id).lower():
                    partners.append(
                        SearchHit(
                            resource_type="partner",
                            id=str(p.id),
                            title=email or str(p.id),
                            subtitle=p.status,
                            href=f"/v1/admin/partners/{p.id}",
                            meta={"status": p.status},
                        )
                    )
                    matched += 1
        except Exception:
            pass

        campaign_rows = (
            await session.execute(
                select(EmailCampaign)
                .where(
                    or_(
                        EmailCampaign.campaign_name.ilike(pattern),
                        EmailCampaign.subject.ilike(pattern),
                    )
                )
                .order_by(EmailCampaign.created_at.desc())
                .limit(limit)
            )
        ).scalars().all()
        for c in campaign_rows:
            campaigns.append(
                SearchHit(
                    resource_type="campaign",
                    id=str(c.id),
                    title=c.campaign_name,
                    subtitle=c.status,
                    href=f"/v1/admin/communications/campaigns/{c.id}",
                    meta={"status": c.status},
                )
            )

        total = (
            len(customers)
            + len(organizations)
            + len(tickets)
            + len(partners)
            + len(campaigns)
        )
        return AdminSearchResponse(
            query=q,
            customers=customers,
            organizations=organizations,
            tickets=tickets,
            partners=partners,
            campaigns=campaigns,
            total=total,
        )
