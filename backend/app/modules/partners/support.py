"""Partner-facing support desk.

Partners open conversations from their dashboard; those conversations are
*the same* ``feedback_tickets`` / ``feedback_messages`` rows the admin support
workspace at ``/v1/admin/support/*`` already works on — there is no separate
partner inbox to keep in sync. A partner ticket is tagged ``source=
"partner_dashboard"`` and ``category="partner"`` so the admin can filter for it.

Live behaviour: both sides poll their thread (the partner every few seconds
while the conversation is open, the admin workspace on its existing interval),
so an admin reply appears in the partner's dashboard without a reload, and an
admin is notified of a new partner message through the support queue.

Internal notes (``is_internal_note=True``) are never exposed to the partner.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundException, ValidationException
from app.modules.admin.models import FeedbackMessage, FeedbackTicket
from app.modules.partners.schemas import (
    PartnerTicketDetailResponse,
    PartnerTicketItem,
    PartnerTicketListResponse,
    PartnerTicketMessageItem,
)
from app.modules.users.models import User

PARTNER_TICKET_SOURCE = "partner_dashboard"
PARTNER_TICKET_CATEGORY = "partner"

#: Statuses a partner reply should re-open, so the ticket returns to the queue.
_CLOSED_STATUSES = {"resolved", "closed"}


def _ticket_item(ticket: FeedbackTicket, *, last_message: FeedbackMessage | None,
                 unread: int = 0) -> PartnerTicketItem:
    return PartnerTicketItem(
        id=ticket.id,
        ticket_number=ticket.ticket_number,
        subject=ticket.subject,
        status=ticket.status,
        priority=ticket.priority,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        last_message_at=last_message.created_at if last_message else ticket.created_at,
        last_message_preview=(
            (last_message.body if last_message else ticket.body)[:140]
        ),
        last_sender_type=last_message.sender_type if last_message else "user",
        unread_admin_messages=unread,
    )


def _message_item(msg: FeedbackMessage) -> PartnerTicketMessageItem:
    return PartnerTicketMessageItem(
        id=msg.id,
        sender_type=msg.sender_type,
        sender_name=msg.sender_name,
        body=msg.body,
        created_at=msg.created_at,
    )


class PartnerSupportService:
    # ── Reads ────────────────────────────────────────────────────────────

    async def _owned_ticket(
        self, session: AsyncSession, user_id: uuid.UUID, ticket_id: uuid.UUID
    ) -> FeedbackTicket:
        ticket = (
            await session.execute(
                select(FeedbackTicket).where(
                    FeedbackTicket.id == ticket_id,
                    FeedbackTicket.user_id == user_id,
                )
            )
        ).scalar_one_or_none()
        if ticket is None:
            raise ResourceNotFoundException("Conversation not found")
        return ticket

    async def _last_message(
        self, session: AsyncSession, ticket_id: uuid.UUID
    ) -> FeedbackMessage | None:
        return (
            await session.execute(
                select(FeedbackMessage)
                .where(
                    FeedbackMessage.ticket_id == ticket_id,
                    FeedbackMessage.is_internal_note.is_(False),
                )
                .order_by(FeedbackMessage.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

    async def list_tickets(
        self,
        session: AsyncSession,
        user_id: uuid.UUID,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> PartnerTicketListResponse:
        base = select(FeedbackTicket).where(FeedbackTicket.user_id == user_id)
        total = int(
            (
                await session.execute(
                    select(func.count())
                    .select_from(FeedbackTicket)
                    .where(FeedbackTicket.user_id == user_id)
                )
            ).scalar()
            or 0
        )
        rows = (
            await session.execute(
                base.order_by(FeedbackTicket.updated_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).scalars().all()

        items = []
        for ticket in rows:
            items.append(
                _ticket_item(ticket, last_message=await self._last_message(session, ticket.id))
            )
        return PartnerTicketListResponse(
            items=items, page=page, page_size=page_size, total=total
        )

    async def get_thread(
        self, session: AsyncSession, user_id: uuid.UUID, ticket_id: uuid.UUID
    ) -> PartnerTicketDetailResponse:
        ticket = await self._owned_ticket(session, user_id, ticket_id)
        messages = (
            (
                await session.execute(
                    select(FeedbackMessage)
                    .where(
                        FeedbackMessage.ticket_id == ticket.id,
                        FeedbackMessage.is_internal_note.is_(False),
                    )
                    .order_by(FeedbackMessage.created_at.asc())
                )
            )
            .scalars()
            .all()
        )
        return PartnerTicketDetailResponse(
            ticket=_ticket_item(
                ticket, last_message=messages[-1] if messages else None
            ),
            messages=[_message_item(m) for m in messages],
        )

    # ── Writes ───────────────────────────────────────────────────────────

    async def create_ticket(
        self,
        session: AsyncSession,
        user: User,
        *,
        subject: str,
        message: str,
        priority: str = "normal",
    ) -> PartnerTicketDetailResponse:
        subject = (subject or "").strip()
        message = (message or "").strip()
        if not subject:
            raise ValidationException("A subject is required")
        if len(message) < 10:
            raise ValidationException("Please describe your issue in at least 10 characters")

        ticket = FeedbackTicket(
            ticket_number=f"PN-{secrets.token_hex(4).upper()}",
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            category=PARTNER_TICKET_CATEGORY,
            subject=subject[:500],
            body=message,
            priority=priority,
            status="open",
            source=PARTNER_TICKET_SOURCE,
        )
        session.add(ticket)
        await session.flush()

        first = FeedbackMessage(
            ticket_id=ticket.id,
            sender_type="user",
            sender_id=user.id,
            sender_name=user.full_name or user.email,
            body=message,
        )
        session.add(first)
        await session.flush()

        return PartnerTicketDetailResponse(
            ticket=_ticket_item(ticket, last_message=first),
            messages=[_message_item(first)],
        )

    async def add_message(
        self,
        session: AsyncSession,
        user: User,
        ticket_id: uuid.UUID,
        body: str,
    ) -> PartnerTicketMessageItem:
        body = (body or "").strip()
        if not body:
            raise ValidationException("Message cannot be empty")

        ticket = await self._owned_ticket(session, user.id, ticket_id)
        msg = FeedbackMessage(
            ticket_id=ticket.id,
            sender_type="user",
            sender_id=user.id,
            sender_name=user.full_name or user.email,
            body=body,
        )
        session.add(msg)

        # A partner reply re-opens a resolved conversation and bumps it back
        # to the top of the admin queue.
        if ticket.status in _CLOSED_STATUSES:
            ticket.status = "open"
            ticket.resolved_at = None
        ticket.updated_at = datetime.now(timezone.utc)
        session.add(ticket)
        await session.flush()
        return _message_item(msg)


partner_support_service = PartnerSupportService()
