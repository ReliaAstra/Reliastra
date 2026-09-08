"""Email Center service - the backend email abstraction.

:class:`EmailService` is the only code path that sends Email Center mail:

* sender eligibility (live Resend domain state + local enable flag)
* recipient/sender validation
* delivery via :mod:`resend_client` (Resend today; provider-swappable)
* audit records for every attempt (:class:`EmailCenterMessage`)
* template storage + safe ``{{variable}}`` rendering (regex substitution
  only - no template engine, no code execution)

Provider failures are normalized to ``(code, friendly message)`` pairs: the
friendly message is safe for the admin UI, the technical detail stays in
server logs and the audit record's ``failure_reason`` (which admins can
see - it never contains credentials).
"""

from __future__ import annotations

import base64
import binascii
import html as html_module
import logging
import re
import uuid
from datetime import UTC, datetime

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import ConflictException, ResourceNotFoundException, ValidationException
from app.modules.email_center import resend_client
from app.modules.email_center.models import (
    EmailCenterMessage,
    EmailCenterSender,
    EmailCenterTemplate,
)
from app.modules.email_center.sanitize import sanitize_html
from app.modules.email_center.schemas import (
    MAX_ATTACHMENT_BYTES,
    MAX_ATTACHMENTS_TOTAL_BYTES,
    AttachmentInput,
    SendEmailRequest,
)

logger = logging.getLogger(__name__)

PROVIDER_RESEND = "resend"

STATUS_QUEUED = "queued"
STATUS_SENT = "sent"
STATUS_FAILED = "failed"
STATUS_REJECTED = "rejected"

VARIABLE_RE = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")

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


def normalize_email_list(values: list[str], *, field: str) -> list[str]:
    """Validate a recipient list; dedupes case-insensitively, order kept."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in values or []:
        try:
            normalized = normalize_email(raw)
        except ValidationException:
            raise ValidationException(f"'{raw}' in {field} is not a valid email address.")
        key = normalized.lower()
        if key not in seen:
            seen.add(key)
            out.append(normalized)
    return out


def extract_variables(*texts: str | None) -> list[str]:
    found: list[str] = []
    for text in texts:
        if not text:
            continue
        for match in VARIABLE_RE.finditer(text):
            name = match.group(1)
            if name not in found:
                found.append(name)
    return found


def render_variables(text: str, variables: dict[str, str], *, escape_html: bool) -> str:
    """Substitute ``{{name}}`` placeholders. Unknown names are left intact.

    ``escape_html=True`` HTML-escapes substituted values so a variable can
    never inject markup into an HTML body.
    """

    def _replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in variables:
            return match.group(0)
        value = str(variables[name])
        return html_module.escape(value, quote=True) if escape_html else value

    return VARIABLE_RE.sub(_replace, text or "")


def _validate_attachments(attachments: list[AttachmentInput]) -> tuple[list[dict], list[dict]]:
    """Decode + size-check attachments.

    Returns ``(resend_payloads, meta)`` where meta holds only filename /
    size / content-type (safe to persist and display).
    """
    payloads: list[dict] = []
    meta: list[dict] = []
    total = 0
    for item in attachments or []:
        try:
            raw = base64.b64decode(item.content_base64, validate=True)
        except (binascii.Error, ValueError):
            raise ValidationException(f"Attachment '{item.filename}' is not valid base64.")
        if not raw:
            raise ValidationException(f"Attachment '{item.filename}' is empty.")
        if len(raw) > MAX_ATTACHMENT_BYTES:
            raise ValidationException(
                f"Attachment '{item.filename}' exceeds the 8 MB per-file limit."
            )
        total += len(raw)
        if total > MAX_ATTACHMENTS_TOTAL_BYTES:
            raise ValidationException("Attachments exceed the 20 MB total limit.")
        entry: dict = {"filename": item.filename, "content": list(raw)}
        if item.content_type:
            entry["content_type"] = item.content_type
        payloads.append(entry)
        meta.append(
            {
                "filename": item.filename,
                "size_bytes": len(raw),
                "content_type": item.content_type,
            }
        )
    return payloads, meta


class EmailService:
    """Backend email abstraction for the Admin Email Center."""

    # ── Senders ─────────────────────────────────────────────────────────

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

    # ── Delivery ────────────────────────────────────────────────────────

    async def send(
        self,
        db: AsyncSession,
        *,
        admin_user_id: uuid.UUID | None,
        admin_email: str | None,
        payload: SendEmailRequest,
        is_test: bool = False,
    ) -> tuple[EmailCenterMessage, str]:
        """Validate, deliver, and audit one message.

        Returns ``(record, user_message)``. ``ValidationException`` (HTTP
        422) is raised for sender/recipient/content problems; provider
        failures are persisted as ``failed`` records and returned normally
        so the UI can show the friendly error with the audit trail.
        """
        # Idempotency: a retried request with the same key returns the
        # original outcome instead of sending a duplicate.
        if payload.idempotency_key:
            existing = (
                await db.execute(
                    select(EmailCenterMessage).where(
                        EmailCenterMessage.idempotency_key == payload.idempotency_key
                    )
                )
            ).scalars().first()
            if existing is not None:
                logger.info("Email Center idempotent replay key=%s", payload.idempotency_key[:12])
                if existing.status == STATUS_SENT:
                    return existing, "Email sent."
                return existing, resend_client.friendly_error(existing.failure_code)

        sender_row, formatted_from = await self.check_sender_eligibility(db, payload.sender)

        to_list = normalize_email_list(payload.to, field="To")
        cc_list = normalize_email_list(payload.cc, field="CC")
        bcc_list = normalize_email_list(payload.bcc, field="BCC")
        if not to_list:
            raise ValidationException("Add at least one recipient.")
        reply_to = normalize_email(payload.reply_to) if payload.reply_to else None

        variables = {str(k): str(v) for k, v in (payload.variables or {}).items()}
        subject = render_variables(payload.subject.strip(), variables, escape_html=False)
        text_body = render_variables(payload.text or "", variables, escape_html=False) or None
        html_body = render_variables(payload.html or "", variables, escape_html=True) or None
        if html_body:
            html_body = sanitize_html(html_body)
        if not (text_body or "").strip() and not (html_body or "").strip():
            raise ValidationException("Provide a plain-text body, an HTML body, or both.")

        attachment_payloads, attachments_meta = _validate_attachments(payload.attachments)

        record = EmailCenterMessage(
            admin_user_id=admin_user_id,
            admin_email=admin_email,
            sender=sender_row.email,
            sender_name=sender_row.name,
            recipients={"to": to_list, "cc": cc_list, "bcc": bcc_list},
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            provider=PROVIDER_RESEND,
            status=STATUS_QUEUED,
            is_test=is_test,
            template_id=payload.template_id,
            attachments_meta=attachments_meta or None,
            idempotency_key=payload.idempotency_key,
        )
        db.add(record)
        try:
            await db.flush()  # obtain id before the provider call
        except IntegrityError:
            # Lost a double-submit race: another request with the same
            # idempotency key won. Return its outcome instead of erroring.
            await db.rollback()
            if payload.idempotency_key:
                winner = (
                    await db.execute(
                        select(EmailCenterMessage).where(
                            EmailCenterMessage.idempotency_key == payload.idempotency_key
                        )
                    )
                ).scalars().first()
                if winner is not None:
                    logger.info(
                        "Email Center idempotent race resolved key=%s",
                        payload.idempotency_key[:12],
                    )
                    if winner.status == STATUS_SENT:
                        return winner, "Email sent."
                    return winner, resend_client.friendly_error(winner.failure_code)
            raise

        tags = [
            {"name": "source", "value": "email_center"},
            {"name": "test", "value": "true" if is_test else "false"},
        ]
        result = await resend_client.send_email(
            sender=formatted_from,
            to=to_list,
            subject=subject,
            html=html_body,
            text=text_body,
            cc=cc_list or None,
            bcc=bcc_list or None,
            reply_to=reply_to,
            attachments=attachment_payloads or None,
            tags=tags,
        )

        if result.ok:
            record.status = STATUS_SENT
            record.provider_message_id = result.resend_id
            await db.commit()
            await db.refresh(record)
            logger.info(
                "Email Center sent id=%s from=%s to=%s resend_id=%s",
                record.id, sender_row.email, to_list[0][:3] + "***", result.resend_id,
            )
            return record, "Email sent."

        record.status = STATUS_FAILED
        record.failure_code = result.error_code or "provider_error"
        record.failure_reason = (
            resend_client.friendly_error(result.error_code)
            + (f" [technical: {result.technical_detail}]" if result.technical_detail else "")
        )[:2000]
        await db.commit()
        await db.refresh(record)
        logger.warning(
            "Email Center send failed id=%s code=%s", record.id, record.failure_code
        )
        return record, resend_client.friendly_error(result.error_code)

    # ── Logs ────────────────────────────────────────────────────────────

    async def list_messages(
        self,
        db: AsyncSession,
        *,
        page: int = 1,
        page_size: int = 25,
        status: str | None = None,
        search: str | None = None,
    ) -> tuple[list[EmailCenterMessage], int]:
        page = max(1, page)
        page_size = min(100, max(1, page_size))
        query = select(EmailCenterMessage)
        count_query = select(func.count(EmailCenterMessage.id))
        if status:
            query = query.where(EmailCenterMessage.status == status)
            count_query = count_query.where(EmailCenterMessage.status == status)
        if search:
            like = f"%{search.strip()}%"
            query = query.where(
                EmailCenterMessage.subject.ilike(like)
                | EmailCenterMessage.sender.ilike(like)
            )
            count_query = count_query.where(
                EmailCenterMessage.subject.ilike(like)
                | EmailCenterMessage.sender.ilike(like)
            )
        total = (await db.execute(count_query)).scalar() or 0
        rows = (
            await db.execute(
                query.order_by(EmailCenterMessage.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).scalars().all()
        return list(rows), total

    async def get_message(self, db: AsyncSession, message_id: uuid.UUID) -> EmailCenterMessage:
        row = await db.get(EmailCenterMessage, message_id)
        if row is None:
            raise ResourceNotFoundException("Message not found.")
        return row

    # ── Templates ───────────────────────────────────────────────────────

    async def ensure_seed_templates(self, db: AsyncSession) -> None:
        count = (await db.execute(select(func.count(EmailCenterTemplate.id)))).scalar() or 0
        if count:
            return
        for seed in _SEED_TEMPLATES:
            db.add(
                EmailCenterTemplate(
                    name=seed["name"],
                    description=seed.get("description"),
                    subject=seed["subject"],
                    text_body=seed.get("text_body", ""),
                    html_body=seed.get("html_body", ""),
                    variables=extract_variables(
                        seed["subject"], seed.get("text_body"), seed.get("html_body")
                    ),
                    is_system=True,
                )
            )
        await db.commit()

    async def list_templates(self, db: AsyncSession) -> list[EmailCenterTemplate]:
        await self.ensure_seed_templates(db)
        rows = (
            await db.execute(
                select(EmailCenterTemplate).order_by(EmailCenterTemplate.name)
            )
        ).scalars().all()
        return list(rows)

    async def get_template(self, db: AsyncSession, template_id: uuid.UUID) -> EmailCenterTemplate:
        row = await db.get(EmailCenterTemplate, template_id)
        if row is None:
            raise ResourceNotFoundException("Template not found.")
        return row

    async def create_template(
        self,
        db: AsyncSession,
        *,
        name: str,
        description: str | None,
        subject: str,
        text_body: str,
        html_body: str,
        created_by_admin_id: uuid.UUID | None,
    ) -> EmailCenterTemplate:
        existing = (
            await db.execute(
                select(EmailCenterTemplate).where(
                    func.lower(EmailCenterTemplate.name) == name.strip().lower()
                )
            )
        ).scalars().first()
        if existing is not None:
            raise ConflictException("A template with this name already exists.")
        clean_html = sanitize_html(html_body) if html_body else ""
        row = EmailCenterTemplate(
            name=name.strip(),
            description=(description or "").strip() or None,
            subject=subject.strip(),
            text_body=text_body or "",
            html_body=clean_html,
            variables=extract_variables(subject, text_body, clean_html),
            is_system=False,
            created_by_admin_id=created_by_admin_id,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    async def update_template(
        self,
        db: AsyncSession,
        template_id: uuid.UUID,
        *,
        name: str | None,
        description: str | None,
        subject: str | None,
        text_body: str | None,
        html_body: str | None,
    ) -> EmailCenterTemplate:
        row = await self.get_template(db, template_id)
        if name is not None and name.strip().lower() != row.name.lower():
            clash = (
                await db.execute(
                    select(EmailCenterTemplate).where(
                        func.lower(EmailCenterTemplate.name) == name.strip().lower()
                    )
                )
            ).scalars().first()
            if clash is not None:
                raise ConflictException("A template with this name already exists.")
            row.name = " ".join(name.split())
        if description is not None:
            row.description = description.strip() or None
        if subject is not None:
            row.subject = subject.strip()
        if text_body is not None:
            row.text_body = text_body
        if html_body is not None:
            row.html_body = sanitize_html(html_body)
        row.variables = extract_variables(row.subject, row.text_body, row.html_body)
        await db.commit()
        await db.refresh(row)
        return row

    async def delete_template(self, db: AsyncSession, template_id: uuid.UUID) -> None:
        row = await self.get_template(db, template_id)
        await db.delete(row)
        await db.commit()

    async def duplicate_template(
        self, db: AsyncSession, template_id: uuid.UUID, *, created_by_admin_id: uuid.UUID | None
    ) -> EmailCenterTemplate:
        source = await self.get_template(db, template_id)
        base = f"{source.name} (copy)"
        candidate = base
        suffix = 2
        while (
            await db.execute(
                select(EmailCenterTemplate.id).where(
                    func.lower(EmailCenterTemplate.name) == candidate.lower()
                )
            )
        ).scalars().first() is not None:
            candidate = f"{base} {suffix}"
            suffix += 1
        row = EmailCenterTemplate(
            name=candidate,
            description=source.description,
            subject=source.subject,
            text_body=source.text_body,
            html_body=source.html_body,
            variables=list(source.variables or []),
            is_system=False,
            created_by_admin_id=created_by_admin_id,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row


email_service = EmailService()


# ── Seed templates ────────────────────────────────────────────────────────
# Stored as plain data (editable + deletable from the Admin UI). Variables
# use the safe {{name}} substitution - never a template engine.

_KORA_TEXT = """Hello Kora Support,

I'm currently onboarding Reliastra, a B2B SaaS platform providing infrastructure monitoring, reliability evidence, and trust tooling for businesses.

We are preparing to accept payments from customers outside Nigeria, primarily in USD, and I'd like to confirm the best Kora setup for this.

Specifically, I'd like to request access to:

- A USD virtual bank account for receiving international customer payments
- USD payment collection through the supported international payment rails
- The ability to hold and manage USD balances where applicable
- Guidance on converting or settling those funds to my Nigerian account
- Any additional KYC/KYB or business documentation required for activation

Reliastra is a software/SaaS business, and the expected payments will be legitimate subscription and service payments from international customers.

My Kora merchant account is currently showing a Cloudflare verification issue during onboarding, displaying a Ray ID. I would also appreciate assistance with completing the account activation.

Business: Reliastra
Website: https://reliastra.com
Use case: International SaaS/customer subscription payments
Primary settlement country: Nigeria

Please let me know the exact requirements and whether USD virtual account access can be enabled for my account.

Thank you,

{{admin_name}}
Founder, Reliastra
finance@reliastra.com"""

_KORA_HTML = """<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;line-height:1.65;max-width:640px;">
<p>Hello Kora Support,</p>
<p>I&rsquo;m currently onboarding <strong>Reliastra</strong>, a B2B SaaS platform providing infrastructure monitoring, reliability evidence, and trust tooling for businesses.</p>
<p>We are preparing to accept payments from customers outside Nigeria, primarily in USD, and I&rsquo;d like to confirm the best Kora setup for this.</p>
<p>Specifically, I&rsquo;d like to request access to:</p>
<ul>
<li>A USD virtual bank account for receiving international customer payments</li>
<li>USD payment collection through the supported international payment rails</li>
<li>The ability to hold and manage USD balances where applicable</li>
<li>Guidance on converting or settling those funds to my Nigerian account</li>
<li>Any additional KYC/KYB or business documentation required for activation</li>
</ul>
<p>Reliastra is a software/SaaS business, and the expected payments will be legitimate subscription and service payments from international customers.</p>
<p>My Kora merchant account is currently showing a Cloudflare verification issue during onboarding, displaying a Ray ID. I would also appreciate assistance with completing the account activation.</p>
<p><strong>Business:</strong> Reliastra<br><strong>Website:</strong> <a href="https://reliastra.com">https://reliastra.com</a><br><strong>Use case:</strong> International SaaS/customer subscription payments<br><strong>Primary settlement country:</strong> Nigeria</p>
<p>Please let me know the exact requirements and whether USD virtual account access can be enabled for my account.</p>
<p>Thank you,</p>
<p>{{admin_name}}<br>Founder, Reliastra<br><a href="mailto:finance@reliastra.com">finance@reliastra.com</a></p>
</div>"""

_SEED_TEMPLATES: tuple[dict, ...] = (
    {
        "name": "Kora — USD International Payments Request",
        "description": "Outreach to Kora support requesting USD virtual account and international payment collection.",
        "subject": "Request for USD Virtual Account and International Payment Collection",
        "text_body": _KORA_TEXT,
        "html_body": _KORA_HTML,
    },
    {
        "name": "Welcome Email",
        "description": "Welcome a new customer to Reliastra.",
        "subject": "Welcome to Reliastra, {{customer_name}}",
        "text_body": (
            "Hello {{customer_name}},\n\nWelcome to Reliastra. Your workspace for "
            "{{company_name}} is ready, and you can connect your first dependency "
            "from the dashboard.\n\nIf you need anything, reply to this email and "
            "our team will help.\n\n— The Reliastra Team"
        ),
        "html_body": (
            '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;'
            'color:#1f2937;line-height:1.65;max-width:640px;">'
            "<p>Hello {{customer_name}},</p>"
            "<p>Welcome to <strong>Reliastra</strong>. Your workspace for {{company_name}} is ready, "
            "and you can connect your first dependency from the dashboard.</p>"
            "<p>If you need anything, reply to this email and our team will help.</p>"
            "<p>&mdash; The Reliastra Team</p></div>"
        ),
    },
    {
        "name": "Billing Notification",
        "description": "Notify a customer about an invoice or billing event.",
        "subject": "Billing update for {{company_name}} — {{invoice_id}}",
        "text_body": (
            "Hello {{customer_name}},\n\nThis is a billing notification regarding "
            "invoice {{invoice_id}} for {{company_name}}.\n\nAmount due: {{amount_due}}\n"
            "Due date: {{due_date}}\n\nYou can review and pay from your Reliastra "
            "billing page. Reply to this email with any questions.\n\n— Reliastra Billing"
        ),
        "html_body": (
            '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;'
            'color:#1f2937;line-height:1.65;max-width:640px;">'
            "<p>Hello {{customer_name}},</p>"
            "<p>This is a billing notification regarding invoice <strong>{{invoice_id}}</strong> "
            "for {{company_name}}.</p>"
            "<p><strong>Amount due:</strong> {{amount_due}}<br>"
            "<strong>Due date:</strong> {{due_date}}</p>"
            "<p>You can review and pay from your Reliastra billing page. "
            "Reply to this email with any questions.</p>"
            "<p>&mdash; Reliastra Billing</p></div>"
        ),
    },
    {
        "name": "System Alert",
        "description": "Operational alert notification for internal or customer follow-up.",
        "subject": "[Reliastra] {{alert_title}}",
        "text_body": (
            "Reliastra system alert\n\n{{alert_title}}\n\n{{alert_details}}\n\n"
            "Detected at: {{detected_at}}\n\n— Reliastra Operations"
        ),
        "html_body": (
            '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;'
            'color:#1f2937;line-height:1.65;max-width:640px;">'
            "<p><strong>Reliastra system alert</strong></p>"
            "<p><strong>{{alert_title}}</strong></p>"
            "<p>{{alert_details}}</p>"
            "<p>Detected at: {{detected_at}}</p>"
            "<p>&mdash; Reliastra Operations</p></div>"
        ),
    },
    {
        "name": "Partner Invitation",
        "description": "Invite a company to the Reliastra partner program.",
        "subject": "Invitation: partner with Reliastra",
        "text_body": (
            "Hello {{partner_name}},\n\nI'd like to invite {{company_name}} to partner "
            "with Reliastra. Our partners earn recurring revenue by bringing "
            "reliability intelligence to their customers.\n\nYou can start here: "
            "https://reliastra.com/partners\n\nHappy to walk you through the program "
            "on a short call.\n\n— {{admin_name}}\nReliastra Partnerships"
        ),
        "html_body": (
            '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;'
            'color:#1f2937;line-height:1.65;max-width:640px;">'
            "<p>Hello {{partner_name}},</p>"
            "<p>I&rsquo;d like to invite {{company_name}} to partner with <strong>Reliastra</strong>. "
            "Our partners earn recurring revenue by bringing reliability intelligence to "
            "their customers.</p>"
            '<p>You can start here: <a href="https://reliastra.com/partners">'
            "https://reliastra.com/partners</a></p>"
            "<p>Happy to walk you through the program on a short call.</p>"
            "<p>&mdash; {{admin_name}}<br>Reliastra Partnerships</p></div>"
        ),
    },
)
