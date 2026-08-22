"""Notification delivery for the Partner Referral program.

One entry point — :meth:`PartnerNotificationService.notify` — writes an
**in-app** notification (always) and optionally sends an **email** copy when
the partner's preferences allow it. Browser/Chrome notifications are raised by
the dashboard itself from the in-app feed (the partner opts in via
``browser_enabled``), so there is exactly one source of truth for "what
happened" and no event can exist in email but not in the dashboard.

Storage reuses the platform's existing ``in_app_notifications`` /
``in_app_notification_deliveries`` tables rather than introducing a parallel
partner-only feed.

Delivery is best-effort and never breaks the business transaction that
triggered it: an SMTP outage must not roll back a payout being marked paid.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.infrastructure.email import email_client
from app.modules.admin.models import InAppNotification, InAppNotificationDelivery
from app.modules.partners.models import PartnerNotificationPreference
from app.modules.users.models import User

logger = logging.getLogger(__name__)


class PartnerEvent:
    """Notification event types emitted by the partner program."""

    REFERRAL_SIGNUP = "partner_referral_signup"
    COMMISSION_EARNED = "partner_commission_earned"
    PAYOUT_REQUESTED = "partner_payout_requested"
    PAYOUT_PAID = "partner_payout_paid"
    PAYOUT_FAILED = "partner_payout_failed"
    DESTINATION_CHANGED = "partner_payout_destination_changed"
    SUPPORT_REPLY = "partner_support_reply"
    ANNOUNCEMENT = "partner_announcement"
    MARKETING = "partner_marketing"


#: Which preference column gates the *email* copy of each event.
_EMAIL_PREFERENCE_FIELD: dict[str, str] = {
    PartnerEvent.REFERRAL_SIGNUP: "email_referral",
    PartnerEvent.COMMISSION_EARNED: "email_commission",
    PartnerEvent.PAYOUT_REQUESTED: "email_payout",
    PartnerEvent.PAYOUT_PAID: "email_payout",
    PartnerEvent.PAYOUT_FAILED: "email_payout",
    PartnerEvent.DESTINATION_CHANGED: "email_payout",
    PartnerEvent.SUPPORT_REPLY: "email_support",
    PartnerEvent.ANNOUNCEMENT: "email_announcement",
    PartnerEvent.MARKETING: "email_marketing",
}


def _money(amount_minor: int, currency: str = "USD") -> str:
    return f"{currency} {amount_minor / 100:,.2f}"


class PartnerNotificationService:
    # ── Preferences ──────────────────────────────────────────────────────

    async def get_preferences(
        self, session: AsyncSession, user_id: uuid.UUID
    ) -> PartnerNotificationPreference:
        """Return the partner's preferences, creating defaults on first use."""
        row = (
            await session.execute(
                select(PartnerNotificationPreference).where(
                    PartnerNotificationPreference.user_id == user_id
                )
            )
        ).scalar_one_or_none()
        if row is not None:
            return row

        row = PartnerNotificationPreference(user_id=user_id)
        session.add(row)
        try:
            await session.flush()
        except Exception:  # pragma: no cover - concurrent first write
            await session.rollback()
            row = (
                await session.execute(
                    select(PartnerNotificationPreference).where(
                        PartnerNotificationPreference.user_id == user_id
                    )
                )
            ).scalar_one()
        return row

    async def update_preferences(
        self,
        session: AsyncSession,
        user_id: uuid.UUID,
        values: dict[str, bool],
    ) -> PartnerNotificationPreference:
        prefs = await self.get_preferences(session, user_id)
        for key, value in values.items():
            if value is not None and hasattr(prefs, key):
                setattr(prefs, key, bool(value))
        session.add(prefs)
        await session.flush()
        return prefs

    # ── Delivery ─────────────────────────────────────────────────────────

    async def notify(
        self,
        session: AsyncSession,
        *,
        user_id: uuid.UUID,
        event: str,
        title: str,
        body: str,
        action_url: str | None = None,
        action_label: str | None = None,
        priority: str = "normal",
        email_subject: str | None = None,
        email_body: str | None = None,
        created_by: uuid.UUID | None = None,
        send_email: bool | None = None,
    ) -> InAppNotification:
        """Deliver one notification to one partner.

        ``send_email=None`` (the default) consults the partner's preferences.
        Pass ``True``/``False`` to force or suppress the email copy.
        """
        notification = InAppNotification(
            title=title,
            body=body,
            notification_type=event,
            action_url=action_url,
            action_label=action_label,
            priority=priority,
            created_by=created_by,
        )
        session.add(notification)
        await session.flush()

        session.add(
            InAppNotificationDelivery(
                notification_id=notification.id, user_id=user_id
            )
        )
        await session.flush()

        wants_email = send_email
        if wants_email is None:
            prefs = await self.get_preferences(session, user_id)
            field = _EMAIL_PREFERENCE_FIELD.get(event)
            wants_email = bool(getattr(prefs, field, True)) if field else True

        if wants_email:
            user = (
                await session.execute(select(User).where(User.id == user_id))
            ).scalar_one_or_none()
            if user is not None and user.email:
                await self._send_email(
                    to_email=user.email,
                    subject=email_subject or title,
                    body=email_body or body,
                    action_url=action_url,
                )

        return notification

    async def _send_email(
        self,
        *,
        to_email: str,
        subject: str,
        body: str,
        action_url: str | None = None,
    ) -> None:
        """Send an email without ever failing the caller's transaction."""
        origin = settings.RELIASTRA_PUBLIC_URL.rstrip("/")
        link = f"{origin}{action_url}" if action_url and action_url.startswith("/") else (action_url or origin)
        text = f"{body}\n\nOpen your partner dashboard: {link}\n\n— RELIASTRA Partner Network"
        html = (
            f"<p>{body}</p>"
            f'<p><a href="{link}">Open your partner dashboard</a></p>'
            "<p style=\"color:#64748b;font-size:12px\">— RELIASTRA Partner Network</p>"
        )
        try:
            await asyncio.to_thread(
                email_client.send_email,
                to_email=to_email,
                subject=f"[RELIASTRA Partners] {subject}",
                body=text,
                html_body=html,
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Partner notification email failed for %s: %s", to_email, exc)

    # ── Event helpers ────────────────────────────────────────────────────

    async def referral_signup(
        self,
        session: AsyncSession,
        *,
        partner_user_id: uuid.UUID,
        referred_email: str | None,
    ) -> None:
        who = referred_email or "Someone"
        await self.notify(
            session,
            user_id=partner_user_id,
            event=PartnerEvent.REFERRAL_SIGNUP,
            title="New referral signup",
            body=(
                f"{who} just signed up through your referral link. "
                "You'll start earning commission once they subscribe."
            ),
            action_url="/?page=referrals",
            action_label="View referrals",
        )

    async def commission_earned(
        self,
        session: AsyncSession,
        *,
        partner_user_id: uuid.UUID,
        amount_minor: int,
        currency: str,
    ) -> None:
        await self.notify(
            session,
            user_id=partner_user_id,
            event=PartnerEvent.COMMISSION_EARNED,
            title=f"You earned {_money(amount_minor, currency)}",
            body=(
                f"A referred customer was billed and {_money(amount_minor, currency)} "
                "commission was added to your ledger. It becomes payable after the "
                f"{settings.PARTNER_COMMISSION_HOLD_DAYS}-day hold period."
            ),
            action_url="/?page=earnings",
            action_label="View earnings",
        )

    async def payout_requested(
        self,
        session: AsyncSession,
        *,
        partner_user_id: uuid.UUID,
        amount_minor: int,
        currency: str,
        destination: str,
    ) -> None:
        await self.notify(
            session,
            user_id=partner_user_id,
            event=PartnerEvent.PAYOUT_REQUESTED,
            title=f"Payout request received — {_money(amount_minor, currency)}",
            body=(
                f"We received your payout request for {_money(amount_minor, currency)} "
                f"to {destination}. You'll be notified as soon as it is sent."
            ),
            action_url="/?page=payouts",
            action_label="View payouts",
        )

    async def payout_paid(
        self,
        session: AsyncSession,
        *,
        partner_user_id: uuid.UUID,
        amount_minor: int,
        currency: str,
        destination: str,
        transaction_reference: str,
    ) -> None:
        await self.notify(
            session,
            user_id=partner_user_id,
            event=PartnerEvent.PAYOUT_PAID,
            title=f"Payout sent — {_money(amount_minor, currency)}",
            body=(
                f"{_money(amount_minor, currency)} has been sent to {destination}. "
                f"Transaction reference: {transaction_reference}."
            ),
            action_url="/?page=payouts",
            action_label="View payouts",
            priority="high",
        )

    async def payout_failed(
        self,
        session: AsyncSession,
        *,
        partner_user_id: uuid.UUID,
        amount_minor: int,
        currency: str,
    ) -> None:
        await self.notify(
            session,
            user_id=partner_user_id,
            event=PartnerEvent.PAYOUT_FAILED,
            title=f"Payout could not be completed — {_money(amount_minor, currency)}",
            body=(
                "We were unable to complete your payout. The amount has been returned "
                "to your payable balance. Please check your payout destination in "
                "Settings → Payout Info, then request the payout again."
            ),
            action_url="/?page=settings",
            action_label="Check payout details",
            priority="high",
        )

    async def payout_destination_changed(
        self,
        session: AsyncSession,
        *,
        partner_user_id: uuid.UUID,
        destination: str,
        cooldown_hours: int,
    ) -> None:
        """Security notice — always emailed, regardless of preferences.

        This is the one notification a partner cannot switch off: it is their
        only out-of-band signal that someone changed where their money goes.
        """
        wait = (
            f" For your protection, payouts to it are held for {cooldown_hours} "
            "hour(s)."
            if cooldown_hours > 0
            else ""
        )
        await self.notify(
            session,
            user_id=partner_user_id,
            event=PartnerEvent.DESTINATION_CHANGED,
            title="Your payout destination was changed",
            body=(
                f"Payouts will now be sent to {destination}.{wait} "
                "If this wasn't you, contact support immediately and change "
                "your password."
            ),
            action_url="/?page=settings",
            action_label="Review payout settings",
            priority="high",
            send_email=True,
        )

    async def support_reply(
        self,
        session: AsyncSession,
        *,
        partner_user_id: uuid.UUID,
        ticket_number: str,
        subject: str,
        preview: str,
    ) -> None:
        await self.notify(
            session,
            user_id=partner_user_id,
            event=PartnerEvent.SUPPORT_REPLY,
            title=f"Support replied — {subject}",
            body=f"[{ticket_number}] {preview}",
            action_url="/?page=support",
            action_label="Open conversation",
        )

    # ── Feed reads ───────────────────────────────────────────────────────

    async def list_for_user(
        self,
        session: AsyncSession,
        user_id: uuid.UUID,
        *,
        unread_only: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[tuple[InAppNotification, InAppNotificationDelivery]], int]:
        base = (
            select(InAppNotification, InAppNotificationDelivery)
            .join(
                InAppNotificationDelivery,
                InAppNotificationDelivery.notification_id == InAppNotification.id,
            )
            .where(
                InAppNotificationDelivery.user_id == user_id,
                InAppNotificationDelivery.is_dismissed.is_(False),
            )
        )
        count_q = (
            select(func.count())
            .select_from(InAppNotificationDelivery)
            .where(
                InAppNotificationDelivery.user_id == user_id,
                InAppNotificationDelivery.is_dismissed.is_(False),
            )
        )
        if unread_only:
            base = base.where(InAppNotificationDelivery.is_read.is_(False))
            count_q = count_q.where(InAppNotificationDelivery.is_read.is_(False))

        total = int((await session.execute(count_q)).scalar() or 0)
        rows = (
            await session.execute(
                base.order_by(InAppNotification.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).all()
        return [(r[0], r[1]) for r in rows], total

    async def unread_count(self, session: AsyncSession, user_id: uuid.UUID) -> int:
        return int(
            (
                await session.execute(
                    select(func.count())
                    .select_from(InAppNotificationDelivery)
                    .where(
                        InAppNotificationDelivery.user_id == user_id,
                        InAppNotificationDelivery.is_read.is_(False),
                        InAppNotificationDelivery.is_dismissed.is_(False),
                    )
                )
            ).scalar()
            or 0
        )

    async def mark_read(
        self,
        session: AsyncSession,
        user_id: uuid.UUID,
        notification_ids: list[uuid.UUID] | None = None,
    ) -> int:
        now = datetime.now(timezone.utc)
        stmt = (
            update(InAppNotificationDelivery)
            .where(
                InAppNotificationDelivery.user_id == user_id,
                InAppNotificationDelivery.is_read.is_(False),
            )
            .values(is_read=True, read_at=now)
        )
        if notification_ids:
            stmt = stmt.where(
                InAppNotificationDelivery.notification_id.in_(notification_ids)
            )
        result = await session.execute(stmt)
        return int(result.rowcount or 0)

    async def dismiss(
        self, session: AsyncSession, user_id: uuid.UUID, notification_id: uuid.UUID
    ) -> None:
        now = datetime.now(timezone.utc)
        await session.execute(
            update(InAppNotificationDelivery)
            .where(
                InAppNotificationDelivery.user_id == user_id,
                InAppNotificationDelivery.notification_id == notification_id,
            )
            .values(is_dismissed=True, dismissed_at=now, is_read=True, read_at=now)
        )


partner_notification_service = PartnerNotificationService()
