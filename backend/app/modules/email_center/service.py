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

The service itself is a thin facade: ``EmailService`` keeps its method
signatures, and the work lives in focused collaborators - :mod:`senders`,
:mod:`messages` and :mod:`templates`.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.email_center.messages import (
    STATUS_FAILED,
    STATUS_SENT,
    EmailMessages,
    _validate_attachments,
    normalize_email_list,
)
from app.modules.email_center.models import (
    EmailCenterMessage,
    EmailCenterSender,
    EmailCenterTemplate,
)
from app.modules.email_center.schemas import (
    SendEmailRequest,
)
from app.modules.email_center.senders import EmailSenders, normalize_email
from app.modules.email_center.templates import (
    EmailTemplates,
    extract_variables,
    render_variables,
)


class EmailService:
    """Backend email abstraction for the Admin Email Center."""

    def __init__(self) -> None:
        self._senders = EmailSenders()
        self._templates = EmailTemplates()
        self._messages = EmailMessages(self._senders)

    async def ensure_seed_senders(
        self,
        db: AsyncSession,
    ) -> None:
        return await self._senders.ensure_seed_senders(db)

    async def list_senders(
        self,
        db: AsyncSession,
        *,
        force_refresh: bool = False,
    ) -> tuple[list[dict], str, str, datetime | None]:
        return await self._senders.list_senders(db, force_refresh=force_refresh)

    async def check_sender_eligibility(
        self,
        db: AsyncSession,
        sender_email: str,
        *,
        force_refresh: bool = False,
    ) -> tuple[EmailCenterSender, str]:
        return await self._senders.check_sender_eligibility(
            db, sender_email, force_refresh=force_refresh
        )

    async def add_sender(
        self,
        db: AsyncSession,
        *,
        email: str,
        name: str,
    ) -> EmailCenterSender:
        return await self._senders.add_sender(db, email=email, name=name)

    async def update_sender(
        self,
        db: AsyncSession,
        sender_id: uuid.UUID,
        *,
        name: str | None,
        enabled: bool | None,
    ) -> EmailCenterSender:
        return await self._senders.update_sender(db, sender_id, name=name, enabled=enabled)

    async def delete_sender(
        self,
        db: AsyncSession,
        sender_id: uuid.UUID,
    ) -> None:
        return await self._senders.delete_sender(db, sender_id)

    async def resend_status(
        self,
        db: AsyncSession,
        *,
        force_refresh: bool = False,
    ) -> dict:
        return await self._senders.resend_status(db, force_refresh=force_refresh)

    async def send(
        self,
        db: AsyncSession,
        *,
        admin_user_id: uuid.UUID | None,
        admin_email: str | None,
        payload: SendEmailRequest,
        is_test: bool = False,
    ) -> tuple[EmailCenterMessage, str]:
        return await self._messages.send(
            db,
            admin_user_id=admin_user_id,
            admin_email=admin_email,
            payload=payload,
            is_test=is_test,
        )

    async def list_messages(
        self,
        db: AsyncSession,
        *,
        page: int = 1,
        page_size: int = 25,
        status: str | None = None,
        search: str | None = None,
    ) -> tuple[list[EmailCenterMessage], int]:
        return await self._messages.list_messages(
            db, page=page, page_size=page_size, status=status, search=search
        )

    async def get_message(
        self,
        db: AsyncSession,
        message_id: uuid.UUID,
    ) -> EmailCenterMessage:
        return await self._messages.get_message(db, message_id)

    async def ensure_seed_templates(
        self,
        db: AsyncSession,
    ) -> None:
        return await self._templates.ensure_seed_templates(db)

    async def list_templates(
        self,
        db: AsyncSession,
    ) -> list[EmailCenterTemplate]:
        return await self._templates.list_templates(db)

    async def get_template(
        self,
        db: AsyncSession,
        template_id: uuid.UUID,
    ) -> EmailCenterTemplate:
        return await self._templates.get_template(db, template_id)

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
        return await self._templates.create_template(
            db,
            name=name,
            description=description,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            created_by_admin_id=created_by_admin_id,
        )

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
        return await self._templates.update_template(
            db,
            template_id,
            name=name,
            description=description,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
        )

    async def delete_template(
        self,
        db: AsyncSession,
        template_id: uuid.UUID,
    ) -> None:
        return await self._templates.delete_template(db, template_id)

    async def duplicate_template(
        self,
        db: AsyncSession,
        template_id: uuid.UUID,
        *,
        created_by_admin_id: uuid.UUID | None,
    ) -> EmailCenterTemplate:
        return await self._templates.duplicate_template(
            db, template_id, created_by_admin_id=created_by_admin_id
        )


email_service = EmailService()
# Re-exported so existing importers keep working: the router and tests
# import statuses, helpers, and the singleton from here.
__all__ = [
    "STATUS_FAILED",
    "STATUS_SENT",
    "EmailService",
    "_validate_attachments",
    "email_service",
    "extract_variables",
    "normalize_email",
    "normalize_email_list",
    "render_variables",
]
