"""Email messages: validated sending plus the audit log.

``send`` validates sender/recipients/attachments, renders template
variables, delivers through the provider client, and persists an audit
record for every attempt. Reads (list/get) serve the admin UI.
"""

from __future__ import annotations

import base64
import binascii
import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundException, ValidationException
from app.modules.email_center import resend_client
from app.modules.email_center.models import (
    EmailCenterMessage,
)
from app.modules.email_center.sanitize import sanitize_html
from app.modules.email_center.schemas import (
    MAX_ATTACHMENT_BYTES,
    MAX_ATTACHMENTS_TOTAL_BYTES,
    AttachmentInput,
    SendEmailRequest,
)
from app.modules.email_center.senders import EmailSenders, normalize_email
from app.modules.email_center.templates import render_variables

logger = logging.getLogger(__name__)


PROVIDER_RESEND = "resend"


STATUS_QUEUED = "queued"
STATUS_SENT = "sent"
STATUS_FAILED = "failed"


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


class EmailMessages:
    """Sending + audit reads; eligibility comes from ``EmailSenders``."""

    def __init__(self, senders: EmailSenders) -> None:
        self._senders = senders

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

        sender_row, formatted_from = await self._senders.check_sender_eligibility(db, payload.sender)

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
