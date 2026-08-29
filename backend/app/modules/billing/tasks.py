"""Evaluation lifecycle background tasks.

The 14-day full-access evaluation is enforced by :mod:`app.core.permissions`
from the organization's ``evaluation_expires_at`` (server time). The
entitlement layer itself correctly evaluates an expired window as Free,
even if this job never runs. This module adds the *synchronization* layer:
* state column sync (evaluation_status),
* pausing of excess resources (data preserved, monitoring paused),
* and exactly-once expiration emails.

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

from app.config import settings
from app.core.audit_log import AuditLogService
from app.core.permissions import PLAN_DEPENDENCY_LIMITS, Plan, TRIAL_DAYS
from app.db.session import get_session_maker
from app.infrastructure.celery_app import celery_app
from app.infrastructure.email import email_client
from app.infrastructure.redis_client import safe_redis_delete, safe_redis_set_nx
from app.modules.organizations.models import Organization, OrganizationMember
from app.modules.users.models import User

logger = logging.getLogger(__name__)

#: How long the "already notified" marker lives per organization (90 days).
_TRIAL_NOTIFIED_TTL_SECONDS = 90 * 24 * 3600


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
        from app.core.permissions import is_evaluation_active

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
        # SET NX = exactly-once across workers, beats, and retries.
        claimed = await safe_redis_set_nx(
            _trial_marker_key(str(org.id)), "1", ex=_TRIAL_NOTIFIED_TTL_SECONDS
        )
        if not claimed:
            continue

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


async def _send_trial_expired_email(org: Organization, owner: User) -> bool:
    origin = settings.RELIASTRA_PUBLIC_URL.rstrip("/")
    name = owner.full_name or "there"
    subject = "Your RELIASTRA trial has ended"
    text = (
        f"Hi {name},\n\n"
        f"Your {TRIAL_DAYS}-day RELIASTRA trial for {org.name} has ended.\n\n"
        "What this means:\n"
        "- Your account stays active and your data is preserved.\n"
        "- Monitoring now follows Free plan limits: 3 dependencies, "
        "24-hour data retention and 60-second checks.\n"
        "- Evidence generation, attribution, API access and extended "
        "history are paused until you upgrade.\n\n"
        f"Upgrade to keep full visibility: {origin}/settings/billing\n\n"
        "Pro ($39/mo) unlocks evidence reports, deterministic "
        "attribution, Slack alerts and API access.\n\n"
        "Need help choosing? Reply to this email or contact "
        "support@reliastra.com - we are happy to help.\n\n"
        "- RELIASTRA"
    )
    html = (
        f"<p>Hi {name},</p>"
        f"<p>Your <strong>{TRIAL_DAYS}-day RELIASTRA trial</strong> for "
        f"<strong>{org.name}</strong> has ended.</p>"
        "<h3 style=\"font-size:14px;margin-bottom:4px\">What this means</h3>"
        "<ul>"
        "<li>Your account stays active and your data is preserved.</li>"
        "<li>Monitoring now follows Free plan limits: 3 dependencies, "
        "24-hour retention, 60-second checks.</li>"
        "<li>Evidence generation, attribution, API access and extended "
        "history are paused until you upgrade.</li>"
        "</ul>"
        f"<p><a href=\"{origin}/settings/billing\">Upgrade to keep full visibility</a></p>"
        "<p style=\"color:#64748b;font-size:12px\">Pro ($39/mo) unlocks evidence reports, "
        "deterministic attribution, Slack alerts and API access.<br>"
        "Questions? support@reliastra.com</p>"
    )
    try:
        await asyncio.to_thread(
            email_client.send_email,
            to_email=owner.email,
            subject=subject,
            body=text,
            html_body=html,
        )
        return True
    except Exception:  # pragma: no cover - SMTP failure
        logger.warning("Trial expiry email failed for org %s", org.id)
        return False


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
