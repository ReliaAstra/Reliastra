"""Email senders: seed defaults, eligibility, and sender CRUD.

A sender is sendable only when its domain reports ``verified`` in Resend
(checked live) and the local row is enabled. Also owns address
normalization, which sending and validation build on.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import ConflictException, ResourceNotFoundException, ValidationException
from app.modules.email_center import resend_client
from app.modules.email_center.models import (
    EmailCenterSender,
)

#: Candidate aliases offered on a fresh install. These are NOT trusted as
#: valid - each one is sendable only when the sending domain reports
#: ``verified`` in Resend (checked live on every sender listing and every
#: send). Seeded as ``is_system`` rows so operators recognize the defaults.
SYSTEM_SENDER_SEEDS: tuple[tuple[str, str], ...] = (
    ("finance@reliastra.com", "Reliastra Finance"),
    ("support@reliastra.com", "Reliastra Support"),
    ("hello@reliastra.com", "Reliastra"),
    ("partners@reliastra.com", "Reliastra Partnerships"),
    ("security@reliastra.com", "Reliastra Security"),
    ("noreply@reliastra.com", "Reliastra"),
    ("alerts@reliastra.com", "Reliastra Alerts"),
    ("billing@reliastra.com", "Reliastra Billing"),
)


def sending_domain() -> str:
    return (settings.RESEND_SENDING_DOMAIN or "reliastra.com").strip().lower()


def normalize_email(value: str) -> str:
    """Validate + normalize one address. Raises ``ValidationException``."""
    candidate = (value or "").strip()
    if not candidate or len(candidate) > 320 or candidate.count("@") != 1:
        raise ValidationException(f"'{value}' is not a valid email address.")
    try:
        result = validate_email(candidate, check_deliverability=False)
        return result.normalized
    except EmailNotValidError:
        raise ValidationException(f"'{value}' is not a valid email address.")


class EmailSenders:
    """Sender lifecycle and eligibility (stateless; takes ``db`` per call)."""

    async def ensure_seed_senders(self, db: AsyncSession) -> None:
        existing = {
            row.lower()
            for row in (
                await db.execute(select(EmailCenterSender.email))
            ).scalars()
        }
        domain = sending_domain()
        added = False
        for seed_email, seed_name in SYSTEM_SENDER_SEEDS:
            local = seed_email.split("@")[0]
            email = f"{local}@{domain}"
            if email.lower() in existing:
                continue
            db.add(
                EmailCenterSender(
                    email=email, name=seed_name, domain=domain,
                    enabled=True, is_system=True,
                )
            )
            added = True
        if added:
            await db.commit()

    async def list_senders(
        self, db: AsyncSession, *, force_refresh: bool = False
    ) -> tuple[list[dict], str, str, datetime | None]:
        """Return ``(senders, domain, domain_status, last_checked_at)``.

        ``verified`` is True only when the Resend account reports the
        sender's domain as verified. When Resend cannot be reached the
        status is ``unavailable`` - never guessed.
        """
        await self.ensure_seed_senders(db)
        rows = (
            await db.execute(select(EmailCenterSender).order_by(EmailCenterSender.email))
        ).scalars().all()

        snapshot = await resend_client.fetch_domains(force_refresh=force_refresh)
        domain = sending_domain()
        domain_info = snapshot.status_for(domain)
        if snapshot.error is not None:
            domain_status = "unavailable"
        elif domain_info is None:
            domain_status = "not_found"
        else:
            domain_status = domain_info.status.strip().lower()

        last_checked = datetime.fromtimestamp(snapshot.fetched_at, tz=UTC)

        senders: list[dict] = []
        for row in rows:
            info = snapshot.status_for(row.domain)
            if snapshot.error is not None:
                status, detail = "unavailable", (
                    "Resend status unavailable - could not verify this sender."
                )
            elif info is None:
                status, detail = "not_verified", (
                    f"Domain {row.domain} is not registered in the Resend account."
                )
            elif info.verified:
                status, detail = "verified", "Domain verified in Resend - ready to send."
            else:
                status, detail = "not_verified", (
                    f"Domain {row.domain} is '{info.status}' in Resend - "
                    "complete domain verification to send."
                )
            # `status` reports honest provider truth; `verified` is the
            # sendability gate (provider truth AND locally enabled).
            verified = status == "verified" and row.enabled
            if status == "verified" and not row.enabled:
                detail = "Domain verified, but this sender is disabled."
            senders.append(
                {
                    "id": row.id,
                    "email": row.email,
                    "name": row.name,
                    "domain": row.domain,
                    "verified": verified,
                    "enabled": row.enabled,
                    "status": status,
                    "status_detail": detail,
                    "is_system": row.is_system,
                }
            )
        return senders, domain, domain_status, last_checked

    async def check_sender_eligibility(
        self, db: AsyncSession, sender_email: str, *, force_refresh: bool = False
    ) -> tuple[EmailCenterSender, str]:
        """Validate a sender for delivery. Returns ``(row, formatted_from)``.

        Raises ``ValidationException`` with admin-safe copy when the alias
        may not be used. The Resend domain state is always consulted live
        (short-TTL cache), so a domain unverified after listing still fails
        closed at send time.
        """
        await self.ensure_seed_senders(db)
        normalized = normalize_email(sender_email)
        row = (
            await db.execute(
                select(EmailCenterSender).where(
                    func.lower(EmailCenterSender.email) == normalized.lower()
                )
            )
        ).scalars().first()
        if row is None:
            raise ValidationException(
                "This sender is not registered in the Email Center. Add it as a sender first."
            )
        if not row.enabled:
            raise ValidationException("This sender is disabled. Enable it before sending.")
        if row.domain.strip().lower() != sending_domain():
            raise ValidationException(
                f"Senders must belong to the {sending_domain()} sending domain."
            )
        snapshot = await resend_client.fetch_domains(force_refresh=force_refresh)
        info = snapshot.status_for(row.domain)
        if snapshot.error is not None or info is None or not info.verified:
            raise ValidationException(
                "This sender cannot currently be used with Resend. "
                "Verify the sending domain or sender identity in Resend first."
            )
        return row, f"{row.name} <{row.email}>"

    async def add_sender(self, db: AsyncSession, *, email: str, name: str) -> EmailCenterSender:
        normalized = normalize_email(email)
        domain = normalized.split("@")[1].lower()
        if domain != sending_domain():
            raise ValidationException(
                f"Only @{sending_domain()} aliases can be added. "
                f"'{normalized}' belongs to a different domain."
            )
        existing = (
            await db.execute(
                select(EmailCenterSender).where(
                    func.lower(EmailCenterSender.email) == normalized.lower()
                )
            )
        ).scalars().first()
        if existing is not None:
            raise ConflictException("This sender is already registered.")

        # Live eligibility probe - never accept an alias Resend cannot send.
        snapshot = await resend_client.fetch_domains(force_refresh=True)
        info = snapshot.status_for(domain)
        if snapshot.error is not None:
            raise ValidationException(
                "Could not verify this sender with Resend right now "
                "(status unavailable). Try again shortly."
            )
        if info is None or not info.verified:
            raise ValidationException(
                "This sender cannot currently be used with Resend. "
                "Verify the sending domain or sender identity in Resend first."
            )
        row = EmailCenterSender(
            email=normalized, name=" ".join(name.split()), domain=domain,
            enabled=True, is_system=False,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    async def update_sender(
        self, db: AsyncSession, sender_id: uuid.UUID, *, name: str | None, enabled: bool | None
    ) -> EmailCenterSender:
        row = await db.get(EmailCenterSender, sender_id)
        if row is None:
            raise ResourceNotFoundException("Sender not found.")
        if name is not None:
            row.name = " ".join(name.split())
        if enabled is not None:
            row.enabled = enabled
        await db.commit()
        await db.refresh(row)
        return row

    async def delete_sender(self, db: AsyncSession, sender_id: uuid.UUID) -> None:
        row = await db.get(EmailCenterSender, sender_id)
        if row is None:
            raise ResourceNotFoundException("Sender not found.")
        await db.delete(row)
        await db.commit()

    async def resend_status(
        self, db: AsyncSession, *, force_refresh: bool = False
    ) -> dict:
        senders, domain, domain_status, last_checked = await self.list_senders(
            db, force_refresh=force_refresh
        )
        snapshot_error = (await resend_client.fetch_domains()).error
        if domain_status == "verified":
            connected, connection_detail = True, "Connected"
            domain_detail = "Verified in Resend"
        elif domain_status == "unavailable":
            connected, connection_detail = False, (
                "Status unavailable"
                if snapshot_error not in ("missing_api_key", "auth_failed")
                else ("Resend API key not configured" if snapshot_error == "missing_api_key"
                      else "Resend rejected the API credentials")
            )
            domain_detail = "Status unavailable"
        elif domain_status == "not_found":
            connected, connection_detail = True, "Connected"
            domain_detail = "Domain not registered in Resend"
        else:
            connected, connection_detail = True, "Connected"
            domain_detail = f"Resend reports '{domain_status}'"
        return {
            "connected": connected,
            "connection_detail": connection_detail,
            "sending_domain": domain,
            "domain_status": domain_status,
            "domain_detail": domain_detail,
            "sender_identities_verified": sum(1 for s in senders if s["verified"]),
            "sender_identities_total": len(senders),
            "last_checked_at": last_checked,
        }
