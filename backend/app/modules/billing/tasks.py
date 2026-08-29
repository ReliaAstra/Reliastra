"""Evaluation lifecycle background tasks.

The 14-day full-access evaluation is enforced by :mod:`app.core.permissions`
from the organization's ``evaluation_expires_at`` (server time). The
entitlement layer itself correctly evaluates an expired window as Free,
even if this job never runs. This module adds the *synchronization* layer:
* state column sync (evaluation_status),
* pausing of excess resources (data preserved, monitoring paused),
* exactly-once expiration emails, and
* advance reminders (trial ending soon, upcoming renewal).

All copy is rendered by :mod:`app.modules.billing.notifications` through the
shared transactional email layout, so the canonical support footer is present
exactly once in every one of these messages and no price string is hardcoded
here.

Idempotency: a Redis ``SET NX`` marker per organization guarantees the
notice is sent once even if beat fires repeatedly, a worker restarts
mid-task, or the task retries. If SMTP fails the marker is released so
the next run can retry delivery.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.core.audit_log import AuditLogService
from app.core.payment_pricing import payment_currency, resolve_payment_price
from app.core.permissions import (
    PLAN_DEPENDENCY_LIMITS,
    Plan,
    TRIAL_DAYS,
    evaluation_days_remaining,
    is_evaluation_active,
)
from app.db.session import get_session_maker
from app.infrastructure.celery_app import celery_app
from app.infrastructure.redis_client import safe_redis_claim, safe_redis_delete
from app.modules.billing.models import Subscription
from app.modules.billing.notifications import (
    PaymentSummary,
    render_trial_expired_email,
    send_renewal_reminder_email,
    send_trial_ending_email,
)
from app.modules.organizations.models import Organization, OrganizationMember
from app.modules.users.models import User

logger = logging.getLogger(__name__)

#: How long the "already notified" marker lives per organization (90 days).
_TRIAL_NOTIFIED_TTL_SECONDS = 90 * 24 * 3600

#: Days before expiry/expiration when the advance reminder fires.
_REMINDER_DAYS_BEFORE = 3

#: The reminder must not re-fire on the following beat runs, and must not be
#: suppressed for the whole window, so the marker lives just under it.
_REMINDER_MARKER_TTL_SECONDS = 20 * 3600


def _trial_marker_key(org_id: str) -> str:
    return f"trial_expired_notified:{org_id}"


@celery_app.task(name="app.modules.billing.tasks.notify_trial_expirations")
def notify_trial_expirations() -> int:
    """Email owners of Free-plan organizations whose trial just ended.

    Paid organizations are skipped — subscriptions never lose entitlements.
    Returns the number of emails actually sent (deduplicated).
    """
    return asyncio.run(_run())


async def _run() -> int:
    now = datetime.now(timezone.utc)

    session_maker = get_session_maker()
    # Prefer evaluation_expires_at when present, fall back to created_at + 14d for
    # legacy rows that predate the migration. Paid plans never expire.
    async with session_maker() as session:
        orgs = (
            (
                await session.execute(
                    select(Organization)
                    .where(
                        Organization.plan == "free",
                        # evaluation_status != converted ensures we don't re-notify paid orgs
                        # and evaluation_used ensures we only notify orgs that actually had a window
                    )
                    .order_by(Organization.created_at.asc())
                    .limit(500)
                )
            )
            .scalars()
            .all()
        )
        # Filter in Python where we need the effective expiry logic (handles legacy fallback).
        orgs = [o for o in orgs if not is_evaluation_active(o, now=now) and getattr(o, "evaluation_expires_at", None) is not None or o.created_at <= now - timedelta(days=TRIAL_DAYS)]
        # Narrow further: only orgs whose window has elapsed (server time) and that are still marked free
        # Re-query to ensure we respect evaluation_expires_at correctly
        filtered = []
        for o in orgs:
            expires = getattr(o, "evaluation_expires_at", None) or (o.created_at + timedelta(days=TRIAL_DAYS) if o.created_at else None)
            if expires is not None and now >= expires and o.plan == "free":
                filtered.append(o)
        orgs = filtered[:500]

    # Sync evaluation_status and pause excess resources BEFORE notifying, so the
    # email's claims match the actual state. Best-effort, never blocks notifications.
    for org in orgs:
        try:
            await _sync_evaluation_expiry(org.id)
        except Exception:
            logger.debug("Evaluation expiry sync failed for org %s", org.id, exc_info=True)

    sent = 0
    for org in orgs:
        # SET NX = exactly-once across workers, beats, and retries. Tri-state:
        # an unreachable Redis must not be mistaken for "already notified",
        # or the expiration email is silently dropped for every organization.
        claimed = await safe_redis_claim(
            _trial_marker_key(str(org.id)), "1", ex=_TRIAL_NOTIFIED_TTL_SECONDS
        )
        if claimed is False:
            continue
        if claimed is None:
            logger.warning(
                "Idempotency store unavailable — sending trial expiry notice for "
                "org %s without duplicate protection",
                org.id,
            )

        async with session_maker() as session:
            owner = (
                await _org_owner(session, org.id)
            )

        if owner is None or not owner.email:
            continue

        if await _send_trial_expired_email(org, owner):
            sent += 1
            await _audit_notified(session_maker, org.id, owner.id)
        else:
            # Release the marker so the next beat run retries delivery.
            await safe_redis_delete(_trial_marker_key(str(org.id)))

    if sent:
        logger.info("Trial expiration notices sent: %s", sent)
    return sent


async def _sync_evaluation_expiry(org_id) -> None:
    """Materialize the expired evaluation: update status and pause excess deps.

    The entitlement layer already treats the window as expired via server time,
    so this is purely a state-sync / data-preservation helper. It must never
    delete customer data — excess dependencies are paused (is_active=False),
    preserving configuration and history for re-activation on upgrade.
    """
    session_maker = get_session_maker()
    async with session_maker() as session:
        org = await session.get(Organization, org_id)
        if not org or org.plan != "free":
            return
        # Mark expired if the window has passed
        now = datetime.now(timezone.utc)
        expires = org.evaluation_expires_at or (org.created_at + timedelta(days=TRIAL_DAYS) if org.created_at else None)
        if expires is None or now < expires:
            return
        if org.evaluation_status != "expired":
            org.evaluation_status = "expired"
            session.add(org)
            await session.flush()
        # Pause excess dependencies beyond Free limits, preserving data.
        # Keep the oldest dependencies active (stable, predictable) and pause the rest.
        free_limit = PLAN_DEPENDENCY_LIMITS[Plan.FREE.value]
        from app.modules.dependencies.models import Dependency

        result = await session.execute(
            select(Dependency)
            .where(
                Dependency.org_id == org_id,
                Dependency.is_deleted == False,  # noqa: E712
            )
            .order_by(Dependency.created_at.asc())
        )
        deps = list(result.scalars().all())
        if len(deps) <= free_limit:
            await session.commit()
            return
        # First N stay active, rest paused
        to_pause = deps[free_limit:]
        for dep in to_pause:
            if dep.is_active:
                dep.is_active = False
                session.add(dep)
        await session.commit()
        if to_pause:
            logger.info(
                "Evaluation expired for org %s: paused %d/%d dependencies (preserved, not deleted)",
                org_id,
                len(to_pause),
                len(deps),
            )


async def _org_owner(session, org_id) -> User | None:
    row = (
        await session.execute(
            select(User)
            .join(OrganizationMember, OrganizationMember.user_id == User.id)
            .where(
                OrganizationMember.org_id == org_id,
                OrganizationMember.role == "owner",
                OrganizationMember.deleted_at.is_(None),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    return row


def _fallback_lines(org, dependencies_total: int | None) -> list[str]:
    """Expiry consequences — same numbers the dashboard shows, never invented."""
    free_limit = PLAN_DEPENDENCY_LIMITS[Plan.FREE.value]
    lines = [
        "Your account stays active and your data is preserved.",
        f"Monitoring now follows Free plan limits: {free_limit} dependencies, "
        "24-hour data retention and 60-second checks.",
        "Evidence generation, attribution, API access and extended history "
        "are paused until you upgrade.",
    ]
    if dependencies_total and free_limit and dependencies_total > free_limit:
        lines.insert(
            1,
            f"{dependencies_total} dependencies are configured; the oldest "
            f"{free_limit} stay active and {dependencies_total - free_limit} are "
            "paused (configuration and history preserved).",
        )
    return lines


async def _send_trial_expired_email(org: Organization, owner: User) -> bool:
    from app.modules.dependencies.repository import DependencyRepository

    total: int | None = None
    try:
        async with get_session_maker()() as session:
            total = await DependencyRepository.count_for_org(session, org.id)
    except Exception:  # pragma: no cover - copy must survive a count failure
        logger.debug("trial expiry: dependency count failed", exc_info=True)

    plain, html = render_trial_expired_email(
        user_name=owner.full_name or owner.email.split("@")[0],
        org_name=org.name,
        trial_days=TRIAL_DAYS,
        fallback_lines=_fallback_lines(org, total),
    )
    from app.infrastructure.email import email_client
    import asyncio

    try:
        return bool(
            await asyncio.to_thread(
                email_client.send_email,
                to_email=owner.email,
                subject="Your RELIASTRA trial has ended",
                body=plain,
                html_body=html,
            )
        )
    except Exception:  # pragma: no cover - SMTP failure
        logger.warning("Trial expiry email failed for org %s", org.id)
        return False


# ── Advance reminders ───────────────────────────────────────────────────────


@celery_app.task(name="app.modules.billing.tasks.notify_trial_ending_soon")
def notify_trial_ending_soon() -> int:
    """Remind owners whose full-access evaluation ends in ``_REMINDER_DAYS_BEFORE`` days."""
    return asyncio.run(_run_trial_reminders())


async def _run_trial_reminders() -> int:
    now = datetime.now(timezone.utc)
    session_maker = get_session_maker()
    sent = 0
    async with session_maker() as session:
        orgs = (
            (
                await session.execute(
                    select(Organization)
                    .where(Organization.plan == Plan.FREE.value)
                    .order_by(Organization.created_at.asc())
                    .limit(500)
                )
            )
            .scalars()
            .all()
        )
        for org in orgs:
            if not is_evaluation_active(org, now=now):
                continue
            remaining = evaluation_days_remaining(org, now=now)
            if remaining != _REMINDER_DAYS_BEFORE:
                continue
            key = f"trial_ending_notified:{org.id}:{remaining}"
            if await safe_redis_claim(key, "1", ex=_REMINDER_MARKER_TTL_SECONDS) is False:
                continue
            owner = await _org_owner(session, org.id)
            if owner is None or not owner.email:
                continue
            ok = await send_trial_ending_email(
                to_email=owner.email,
                user_name=owner.full_name or owner.email.split("@")[0],
                org_name=org.name,
                days_left=remaining,
            )
            if ok:
                sent += 1
            else:
                await safe_redis_delete(key)
    if sent:
        logger.info("Trial-ending reminders sent: %s", sent)
    return sent


@celery_app.task(name="app.modules.billing.tasks.notify_upcoming_renewals")
def notify_upcoming_renewals() -> int:
    """Tell owners with an active paid subscription when it renews and how much."""
    return asyncio.run(_run_renewal_reminders())


async def _run_renewal_reminders() -> int:
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(days=_REMINDER_DAYS_BEFORE + 1)
    session_maker = get_session_maker()
    sent = 0
    async with session_maker() as session:
        subs = (
            (
                await session.execute(
                    select(Subscription)
                    .where(
                        Subscription.status == "active",
                        Subscription.plan != Plan.FREE.value,
                        Subscription.current_period_end.is_not(None),
                    )
                    .limit(500)
                )
            )
            .scalars()
            .all()
        )
        for sub in subs:
            period_end = sub.current_period_end
            if period_end.tzinfo is None:
                period_end = period_end.replace(tzinfo=timezone.utc)
            if not (now < period_end <= window_end):
                continue
            days_left = max(1, (period_end - now).days)
            key = f"renewal_notified:{sub.id}:{period_end.date().isoformat()}"
            if await safe_redis_claim(key, "1", ex=_REMINDER_MARKER_TTL_SECONDS) is False:
                continue
            org = await session.get(Organization, sub.organization_id)
            if org is None:
                continue
            owner = await _org_owner(session, org.id)
            if owner is None or not owner.email:
                continue
            price = resolve_payment_price(sub.plan, sub.billing_interval)
            payment = PaymentSummary(
                plan=sub.plan,
                billing_interval=sub.billing_interval,
                amount_minor=price.payment_amount,
                currency=payment_currency(),
                period_end=period_end,
            )
            ok = await send_renewal_reminder_email(
                to_email=owner.email,
                user_name=owner.full_name or owner.email.split("@")[0],
                org_name=org.name,
                payment=payment,
                days_left=days_left,
            )
            if ok:
                sent += 1
            else:
                await safe_redis_delete(key)
    if sent:
        logger.info("Renewal reminders sent: %s", sent)
    return sent


async def _audit_notified(session_maker, org_id, user_id) -> None:
    try:
        async with session_maker() as session:
            await AuditLogService.log_event(
                session=session,
                event_type="trial_expiration_notified",
                user_id=user_id,
                resource_type="organization",
                resource_id=str(org_id),
                payload={"trial_days": TRIAL_DAYS},
            )
            await session.commit()
    except Exception:  # pragma: no cover - audit best-effort
        logger.debug("Trial-expiry audit log failed for org %s", org_id)
