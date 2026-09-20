"""Admin control plane: Customer reads and mutations: list, detail, plan, impersonation, lifecycle.

One room behind the front door in :mod:`app.modules.admin.control_plane_service`.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundException, ValidationException
from app.core.permissions import get_plan_price_usd
from app.core.security import create_access_token
from app.infrastructure.email import email_client
from app.infrastructure.email_layout import ensure_transactional_footer
from app.modules.admin.control_plane_schemas import (
    CustomerDetailResponse,
    CustomerImpersonateResponse,
    CustomerListItem,
    CustomerListResponse,
    CustomerOrgSnapshot,
)
from app.modules.admin.models import (
    FeedbackTicket,
    PlanChangeHistory,
)
from app.modules.admin.repository import (
    AdminFeedbackRepository,
    AdminUserRepository,
)
from app.modules.admin.service import (
    IMPERSONATION_TOKEN_TTL_MINUTES,
    admin_audit_service,
    admin_business_service,
    admin_user_service,
)

from app.modules.admin.control_plane_shared import (
    utc_now,
)


class ControlPlaneCustomers:
    """Customer reads and mutations."""

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
        from app.modules.users.models import User

        is_active = None
        if status == "active":
            is_active = True
        elif status in ("inactive", "deactivated"):
            is_active = False

        # segment reserved for future filters (founding program removed)
        _ = segment

        query = select(User)
        count_q = select(func.count()).select_from(User)
        filters = []
        if search:
            pattern = f"%{search}%"
            filters.append(or_(User.email.ilike(pattern), User.full_name.ilike(pattern)))
        if is_active is not None:
            filters.append(User.is_active == is_active)
        if created_from is not None:
            filters.append(User.created_at >= created_from)
        if created_to is not None:
            filters.append(User.created_at <= created_to)
        for f in filters:
            query = query.where(f)
            count_q = count_q.where(f)

        total = (await session.execute(count_q)).scalar() or 0
        if sort == "created_at_asc":
            query = query.order_by(User.created_at.asc())
        elif sort == "name":
            query = query.order_by(User.full_name.asc())
        else:
            query = query.order_by(User.created_at.desc())

        offset = (page - 1) * page_size
        users = (await session.execute(query.offset(offset).limit(page_size))).scalars().all()

        items: list[CustomerListItem] = []
        for u in users:
            orgs = await AdminUserRepository.get_user_orgs(session, u.id)
            primary = orgs[0] if orgs else None
            org_plan = primary["plan"] if primary else None
            if plan and org_plan != plan:
                continue
            org_id = primary["org_id"] if primary else None

            cust_health = self._derive_health(
                is_active=u.is_active,
                last_activity_at=getattr(u, "last_activity_at", None),
                plan=org_plan,
            )
            if health and cust_health != health:
                continue

            mrr = float(get_plan_price_usd(org_plan)) if org_plan and org_plan != "free" else 0.0
            items.append(
                CustomerListItem(
                    customer_id=u.id,
                    email=u.email,
                    full_name=u.full_name,
                    is_active=u.is_active,
                    source=u.source,
                    plan=org_plan,
                    org_id=org_id,
                    org_name=primary["org_name"] if primary else None,
                    health=cust_health,
                    mrr=mrr,
                    last_activity_at=getattr(u, "last_activity_at", None),
                    created_at=u.created_at,
                )
            )

        return CustomerListResponse(
            items=items, total=total, page=page, page_size=page_size
        )

    async def get_customer_detail(
        self, session: AsyncSession, customer_id: uuid.UUID
    ) -> CustomerDetailResponse:
        from app.modules.users.repository import UserRepository
        from app.modules.organizations.models import Organization, OrganizationMember
        from app.modules.billing.models import Subscription
        from app.modules.dependencies.models import Dependency
        from app.modules.incidents.models import Incident

        user = await UserRepository.get_by_id(session, customer_id)
        if not user:
            raise ResourceNotFoundException("Customer not found")

        org_rows = (
            await session.execute(
                select(Organization, OrganizationMember.role)
                .join(OrganizationMember, OrganizationMember.org_id == Organization.id)
                .where(OrganizationMember.user_id == customer_id)
            )
        ).all()

        org_snapshots: list[CustomerOrgSnapshot] = []
        total_deps = 0
        total_incidents = 0
        open_incidents = 0
        total_mrr = 0.0
        primary: CustomerOrgSnapshot | None = None
        subscription_payload: dict[str, Any] | None = None

        for org, role in org_rows:
            member_count = (
                await session.execute(
                    select(func.count())
                    .select_from(OrganizationMember)
                    .where(OrganizationMember.org_id == org.id)
                )
            ).scalar() or 0
            dep_count = (
                await session.execute(
                    select(func.count())
                    .select_from(Dependency)
                    .where(Dependency.org_id == org.id)
                )
            ).scalar() or 0
            open_inc = (
                await session.execute(
                    select(func.count())
                    .select_from(Incident)
                    .where(Incident.org_id == org.id, Incident.status == "open")
                )
            ).scalar() or 0
            all_inc = (
                await session.execute(
                    select(func.count())
                    .select_from(Incident)
                    .where(Incident.org_id == org.id)
                )
            ).scalar() or 0

            sub = (
                await session.execute(
                    select(Subscription)
                    .where(Subscription.organization_id == org.id)
                    .order_by(Subscription.created_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            billing_status = sub.status if sub else None
            org_mrr = (
                float(get_plan_price_usd(org.plan))
                if org.plan and org.plan != "free"
                else 0.0
            )
            open_tickets = (
                await session.execute(
                    select(func.count())
                    .select_from(FeedbackTicket)
                    .where(
                        FeedbackTicket.user_id == customer_id,
                        FeedbackTicket.status.in_(["open", "in_progress", "pending"]),
                    )
                )
            ).scalar() or 0

            snap = CustomerOrgSnapshot(
                org_id=org.id,
                org_name=org.name,
                role=role,
                plan=org.plan,
                mrr=org_mrr,
                billing_status=billing_status,
                member_count=member_count,
                dependency_count=dep_count,
                open_incidents=open_inc,
                open_tickets=open_tickets,
            )
            org_snapshots.append(snap)
            total_deps += dep_count
            total_incidents += all_inc
            open_incidents += open_inc
            total_mrr += org_mrr
            if primary is None or role == "owner":
                primary = snap
                if sub:
                    subscription_payload = {
                        "id": str(sub.id),
                        "plan": sub.plan,
                        "status": sub.status,
                        "organization_id": str(sub.organization_id),
                    }

        activity_logs, _ = await AdminUserRepository.list_activity(
            session, customer_id, page=1, page_size=10
        )
        recent_activity = [
            {
                "id": str(a.id),
                "action": a.action,
                "details": a.details,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in activity_logs
        ]

        tickets, ticket_total = await AdminFeedbackRepository.list_tickets(
            session, search=user.email, page=1, page_size=5
        )
        # Prefer user_id match when available
        user_tickets = (
            await session.execute(
                select(FeedbackTicket)
                .where(FeedbackTicket.user_id == customer_id)
                .order_by(FeedbackTicket.created_at.desc())
                .limit(5)
            )
        ).scalars().all()
        ticket_source = user_tickets or tickets
        recent_tickets = [
            {
                "id": str(t.id),
                "ticket_number": t.ticket_number,
                "subject": t.subject,
                "status": t.status,
                "priority": t.priority,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in ticket_source
        ]
        open_support = sum(
            1
            for t in ticket_source
            if t.status in ("open", "in_progress", "pending")
        )

        plan = primary.plan if primary else None
        health = self._derive_health(
            is_active=user.is_active,
            last_activity_at=getattr(user, "last_activity_at", None),
            plan=plan,
        )

        # First-party acquisition attribution (FIRST TOUCH). One extra
        # query; None for accounts created before the feature existed.
        from app.modules.acquisition.models import AcquisitionFirstTouch

        acquisition_row = (
            await session.execute(
                select(AcquisitionFirstTouch).where(
                    AcquisitionFirstTouch.user_id == customer_id
                )
            )
        ).scalar_one_or_none()
        acquisition_payload = None
        if acquisition_row is not None:
            from app.modules.acquisition.schemas import AcquisitionRead

            acquisition_payload = AcquisitionRead(
                channel=acquisition_row.channel,
                source=acquisition_row.source,
                medium=acquisition_row.medium,
                campaign=acquisition_row.campaign,
                content=acquisition_row.content,
                term=acquisition_row.term,
                landing_path=acquisition_row.landing_path,
                referrer_host=acquisition_row.referrer_host,
                first_touch_at=(
                    acquisition_row.first_touch_at.isoformat()
                    if acquisition_row.first_touch_at
                    else None
                ),
                last_channel=acquisition_row.last_channel,
                last_source=acquisition_row.last_source,
                last_campaign=acquisition_row.last_campaign,
                last_touch_at=(
                    acquisition_row.last_touch_at.isoformat()
                    if acquisition_row.last_touch_at
                    else None
                ),
            )

        return CustomerDetailResponse(
            customer_id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            is_email_verified=bool(getattr(user, "is_email_verified", False)),
            is_system_admin=bool(getattr(user, "is_system_admin", False)),
            avatar_url=getattr(user, "avatar_url", None),
            auth_provider=getattr(user, "auth_provider", None),
            source=user.source,
            admin_note=getattr(user, "admin_note", None),
            health=health,
            last_login_at=getattr(user, "last_login_at", None),
            last_activity_at=getattr(user, "last_activity_at", None),
            login_count=int(getattr(user, "login_count", 0) or 0),
            created_at=user.created_at,
            updated_at=getattr(user, "updated_at", None),
            acquisition=acquisition_payload,
            organizations=org_snapshots,
            primary_org=primary,
            plan=plan,
            mrr=total_mrr,
            billing_status=primary.billing_status if primary else None,
            subscription=subscription_payload,
            dependencies=total_deps,
            monitors=total_deps,
            incidents=total_incidents,
            open_incidents=open_incidents,
            support_tickets=ticket_total if not user_tickets else len(user_tickets),
            open_support_tickets=open_support,
            recent_activity=recent_activity,
            recent_tickets=recent_tickets,
        )

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
        kwargs: dict[str, Any] = {}
        if full_name is not None:
            kwargs["full_name"] = full_name
        if admin_note is not None:
            kwargs["admin_note"] = admin_note
        if source is not None:
            kwargs["source"] = source
        await admin_user_service.update_user(
            session,
            customer_id,
            admin_user_id=admin_user_id,
            admin_email=admin_email,
            ip_address=ip_address,
            user_agent=user_agent,
            **kwargs,
        )
        return await self.get_customer_detail(session, customer_id)

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
        from app.modules.users.repository import UserRepository
        import jwt as _jwt
        from app.config import settings

        user = await UserRepository.get_by_id(session, customer_id)
        if not user:
            raise ResourceNotFoundException("Customer not found")
        if not user.is_active:
            raise ValidationException("Cannot impersonate an inactive customer")
        if not reason or len(reason.strip()) < 3:
            raise ValidationException("Impersonation reason is required")

        token = create_access_token(
            subject=str(customer_id),
            additional_claims={
                "impersonator_id": str(admin_user_id),
                "impersonated_user_id": str(customer_id),
                "type": "impersonation",
                "reason": reason.strip()[:200],
                # Explicit: no refresh token for impersonation sessions
                "refresh": False,
            },
        )
        payload = _jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        payload["exp"] = int(
            (
                utc_now() + timedelta(minutes=IMPERSONATION_TOKEN_TTL_MINUTES)
            ).timestamp()
        )
        token = _jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

        await admin_audit_service.log_action(
            session,
            admin_user_id=admin_user_id,
            admin_email=admin_email,
            action="impersonate_customer",
            entity_type="customer",
            entity_id=str(customer_id),
            details={"reason": reason.strip()},
            ip_address=ip_address,
            user_agent=user_agent,
        )

        return CustomerImpersonateResponse(
            token=token,
            impersonated_user_id=customer_id,
            impersonated_email=user.email,
            expires_in_seconds=IMPERSONATION_TOKEN_TTL_MINUTES * 60,
            impersonator_id=admin_user_id,
            reason=reason.strip(),
            no_refresh_token=True,
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
        from app.modules.organizations.repository import OrganizationRepository
        from app.modules.organizations.models import OrganizationMember

        if org_id is None:
            orgs = await AdminUserRepository.get_user_orgs(session, customer_id)
            if not orgs:
                raise ResourceNotFoundException(
                    "Customer has no organization to apply plan to"
                )
            # Prefer owner org
            owner = next((o for o in orgs if o["role"] == "owner"), orgs[0])
            org_id = owner["org_id"]

        org = await OrganizationRepository.get_by_id(session, org_id)
        if not org:
            raise ResourceNotFoundException("Organization not found")

        # Ensure customer is a member of the org
        membership = (
            await session.execute(
                select(OrganizationMember).where(
                    OrganizationMember.org_id == org_id,
                    OrganizationMember.user_id == customer_id,
                )
            )
        ).scalar_one_or_none()
        if membership is None:
            raise ValidationException("Customer is not a member of the target organization")

        from_plan = org.plan
        await OrganizationRepository.update(session, org, plan=plan)

        change = PlanChangeHistory(
            org_id=org_id,
            changed_by=admin_user_id,
            from_plan=from_plan,
            to_plan=plan,
            reason=reason,
            admin_note=f"Admin plan change by {admin_email} for customer {customer_id}",
        )
        session.add(change)
        await session.flush()

        await admin_audit_service.log_action(
            session,
            admin_user_id=admin_user_id,
            admin_email=admin_email,
            action="override_plan",
            entity_type="organization",
            entity_id=str(org_id),
            details={
                "from_plan": from_plan,
                "to_plan": plan,
                "reason": reason,
                "customer_id": str(customer_id),
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )

        return {
            "customer_id": str(customer_id),
            "org_id": str(org_id),
            "from_plan": from_plan,
            "to_plan": plan,
            "message": f"Plan changed from {from_plan} to {plan}",
        }

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
        from app.modules.users.repository import UserRepository

        user = await UserRepository.get_by_id(session, customer_id)
        if not user:
            raise ResourceNotFoundException("Customer not found")

        body_text, html_rendered = ensure_transactional_footer(
            body_text=body, html_body=html_body
        )
        success = email_client.send_email(
            to_email=user.email,
            subject=subject,
            body=body_text,
            html_body=html_rendered,
        )
        await admin_audit_service.log_action(
            session,
            admin_user_id=admin_user_id,
            admin_email=admin_email,
            action="send_email_to_customer",
            entity_type="customer",
            entity_id=str(customer_id),
            details={"subject": subject, "success": success},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return {"success": success, "customer_id": str(customer_id)}

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
        from app.modules.users.repository import UserRepository

        user = await UserRepository.get_by_id(session, customer_id)
        if not user:
            raise ResourceNotFoundException("Customer not found")
        if customer_id == admin_user_id:
            raise ValidationException("Cannot deactivate your own admin account")

        await UserRepository.update(session, user, is_active=False)
        note = getattr(user, "admin_note", None) or ""
        stamp = f"[deactivated {utc_now().isoformat()}] {reason}"
        new_note = f"{note}\n{stamp}".strip() if note else stamp
        await UserRepository.update(session, user, admin_note=new_note)

        await admin_audit_service.log_action(
            session,
            admin_user_id=admin_user_id,
            admin_email=admin_email,
            action="deactivate_customer",
            entity_type="customer",
            entity_id=str(customer_id),
            details={"reason": reason},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return await self.get_customer_detail(session, customer_id)

    async def get_customer_activity(
        self,
        session: AsyncSession,
        customer_id: uuid.UUID,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        logs, total = await AdminUserRepository.list_activity(
            session, customer_id, page=page, page_size=page_size
        )
        return {
            "items": [
                {
                    "id": str(a.id),
                    "action": a.action,
                    "details": a.details,
                    "ip_address": a.ip_address,
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                }
                for a in logs
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    async def get_recent_customers(
        self, session: AsyncSession, *, limit: int = 20
    ) -> dict[str, Any]:
        signups = await admin_business_service.get_recent_signups(session, limit=limit)
        return {
            "items": [
                {
                    "customer_id": s.user_id,
                    "email": s.email,
                    "full_name": s.full_name,
                    "org_name": s.org_name,
                    "plan": s.plan,
                    "source": s.source,
                    "created_at": s.created_at,
                }
                for s in signups.items
            ]
        }

    async def get_churn_risk(
        self, session: AsyncSession, *, limit: int = 20
    ) -> dict[str, Any]:
        signals = await admin_business_service.get_churn_signals(session, limit=limit)
        return {
            "items": [
                {
                    "org_id": s.org_id,
                    "org_name": s.org_name,
                    "plan": s.plan,
                    "last_activity_at": s.last_activity_at,
                    "subscription_status": s.subscription_status,
                    "risk_level": s.risk_level,
                    "health": "at_risk" if s.risk_level == "high" else "healthy",
                }
                for s in signals.items
            ]
        }

    @staticmethod
    def _derive_health(
        *,
        is_active: bool,
        last_activity_at: datetime | None,
        plan: str | None,
    ) -> str:
        if not is_active:
            return "inactive"
        if last_activity_at is None:
            return "unknown"
        age = utc_now() - (
            last_activity_at
            if last_activity_at.tzinfo
            else last_activity_at.replace(tzinfo=timezone.utc)
        )
        if age > timedelta(days=30) and plan and plan != "free":
            return "at_risk"
        if age > timedelta(days=60):
            return "churning"
        return "healthy"
