"""Support desk service: intake, alerting and the admin's new-email signal.

The customer-facing rule is simple and enforced here: **a support request is
an email, and its answer is an email**. Nothing in this module keeps a
connection open, schedules a refresh, or expects the writer to be looking at
a page when the answer arrives.

Three responsibilities:

* :meth:`SupportEmailService.submit_request` - record the request on a
  ``feedback_tickets`` row, alert the team (email) and confirm receipt to the
  writer (email).
* :meth:`SupportEmailService.alert_new_ticket` - the same alerting for intake
  paths that create the ticket themselves (the public site form).
* :meth:`SupportEmailService.alerts_since` - the cheap read the admin console
  polls to raise a browser notification, and the only polling left in the
  support surface.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.admin.models import FeedbackMessage, FeedbackTicket
from app.modules.admin.schemas import FeedbackTicketResponse
from app.modules.admin.service import admin_feedback_service
from app.modules.support import emails
from app.modules.support.schemas import (
    SupportAlertItem,
    SupportAlertsResponse,
    SupportRequestReceipt,
)
from app.modules.users.models import User

logger = logging.getLogger(__name__)

#: Where a console-submitted request came from. The public form keeps
#: ``web``; ``admin`` means staff wrote on someone's behalf (never alerted, see
#: below - the team already knows).
SOURCE_CONSOLE = "console_email"
SOURCE_PUBLIC = "web"
SOURCE_ADMIN = "admin"

#: Statuses that mean "the ball is with us". A ticket waiting on the customer
#: is deliberately absent: it is not an unanswered email.
_AWAITING_STATUSES = ("open", "in_progress", "pending", "waiting_on_agent")

#: How far back an alert cursor may reach. A stale ``since`` (an admin console
#: that has not been opened for a month) must not fan out into a notification
#: storm, and a future one must not swallow the next real email.
_MAX_ALERT_LOOKBACK = timedelta(days=7)

_PRIORITY_RANK = {"urgent": 0, "critical": 1, "high": 2, "normal": 3, "low": 4}


class SupportEmailService:
    # ── Intake ───────────────────────────────────────────────────────────

    async def submit_request(
        self,
        session: AsyncSession,
        *,
        user: User,
        subject: str,
        message: str,
        category: str = "general",
    ) -> SupportRequestReceipt:
        """Record a console support email and dispatch both notifications."""
        ticket = await admin_feedback_service.create_ticket(
            session,
            email=user.email,
            full_name=user.full_name,
            category=category,
            subject=subject,
            body=message,
            priority="normal",
            source=SOURCE_CONSOLE,
            user_id=user.id,
        )

        delivered = await self.alert_new_ticket(
            session,
            ticket=ticket,
            requester_name=user.full_name,
            requester_email=user.email,
            user_id=user.id,
        )
        confirmation = await emails.acknowledge_requester(
            session,
            ticket_number=ticket.ticket_number,
            subject=ticket.subject,
            body=ticket.body,
            category=ticket.category,
            priority=ticket.priority,
            requester_name=user.full_name,
            requester_email=user.email,
            source=ticket.source,
            to_email=user.email,
            user_id=user.id,
        )

        logger.info(
            "Support request %s recorded for %s (alerted %d admin address(es), confirmation=%s)",
            ticket.ticket_number,
            user.email,
            len(delivered),
            confirmation,
        )
        return SupportRequestReceipt(
            ticket_number=ticket.ticket_number,
            status=ticket.status,
            subject=ticket.subject,
            category=ticket.category,
            support_email=settings.SUPPORT_EMAIL,
            received_at=ticket.created_at,
            confirmation_sent_to=user.email if confirmation else None,
            admin_notified=bool(delivered),
        )

    async def alert_new_ticket(
        self,
        session: AsyncSession,
        *,
        ticket: FeedbackTicketResponse,
        requester_name: str | None = None,
        requester_email: str | None = None,
        user_id: uuid.UUID | None = None,
    ) -> list[str]:
        """Email the configured admins about a freshly created ticket.

        Staff-created tickets (``source='admin'``) are skipped: the person who
        created it is the team.
        """
        if ticket.source == SOURCE_ADMIN:
            return []
        return await emails.announce_to_admins(
            session,
            ticket_id=ticket.id,
            ticket_number=ticket.ticket_number,
            subject=ticket.subject,
            body=ticket.body,
            category=ticket.category,
            priority=ticket.priority,
            requester_name=requester_name or ticket.full_name,
            requester_email=requester_email or ticket.email,
            source=ticket.source,
            org_id=None,
        )

    # ── Admin browser-notification signal ────────────────────────────────

    async def alerts_since(
        self, session: AsyncSession, *, since: datetime | None
    ) -> SupportAlertsResponse:
        """New support emails since *since*, plus the outstanding-reply count.

        Deliberately a read of two numbers and at most ten rows: the admin
        shell calls this every 20 seconds on every admin page, so it must stay
        cheaper than the page it is protecting.
        """
        now = datetime.now(UTC)
        cursor = since or now
        if cursor.tzinfo is None:
            cursor = cursor.replace(tzinfo=UTC)
        cursor = min(cursor, now)
        cursor = max(cursor, now - _MAX_ALERT_LOOKBACK)

        rows = (
            (
                await session.execute(
                    select(FeedbackTicket)
                    .where(
                        FeedbackTicket.created_at > cursor,
                        FeedbackTicket.source != SOURCE_ADMIN,
                    )
                    .order_by(FeedbackTicket.created_at.desc())
                    .limit(10)
                )
            )
            .scalars()
            .all()
        )
        new_count = int(
            (
                await session.execute(
                    select(func.count())
                    .select_from(FeedbackTicket)
                    .where(
                        FeedbackTicket.created_at > cursor,
                        FeedbackTicket.source != SOURCE_ADMIN,
                    )
                )
            ).scalar()
            or 0
        )

        # Outstanding = we still owe an answer. A ticket the team has replied
        # to (any non-internal admin message) drops out even while it stays
        # open for follow-up, which is what makes this a useful badge.
        replied = select(FeedbackMessage.ticket_id).where(
            FeedbackMessage.sender_type == "admin",
            FeedbackMessage.is_internal_note.is_(False),
        )
        awaiting_reply_count = int(
            (
                await session.execute(
                    select(func.count())
                    .select_from(FeedbackTicket)
                    .where(
                        FeedbackTicket.status.in_(_AWAITING_STATUSES),
                        FeedbackTicket.id.not_in(replied),
                    )
                )
            ).scalar()
            or 0
        )

        latest = [
            SupportAlertItem(
                id=row.id,
                ticket_number=row.ticket_number,
                subject=row.subject,
                requester_email=row.email,
                requester_name=row.full_name,
                category=row.category,
                priority=row.priority,
                source=row.source,
                created_at=row.created_at,
                admin_url=emails.admin_ticket_url(row.id),
            )
            for row in rows
        ]
        highest_priority = (
            min(latest, key=lambda item: _PRIORITY_RANK.get(item.priority, 9)).priority
            if latest
            else None
        )

        return SupportAlertsResponse(
            server_time=now,
            since=cursor,
            new_count=new_count,
            awaiting_reply_count=awaiting_reply_count,
            highest_priority=highest_priority,
            latest=latest,
        )


support_email_service = SupportEmailService()
