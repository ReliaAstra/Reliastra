"""Email Center HTTP surface.

``/v1/admin/email-center/*`` - every route requires a dedicated
ADMIN-console session (``require_system_admin``). The Next.js admin proxy
forwards ``/api/admin/email-center/*`` here with its CSRF marker.

No response in this module may contain the Resend API key or any other
provider credential - verified by tests.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationException
from app.core.rate_limit import SlidingWindowRateLimiter, enforce_rate_limit
from app.db.session import get_db
from app.modules.admin.decorators import audit_log
from app.modules.admin.guards import require_system_admin
from app.modules.email_center import resend_client
from app.modules.email_center.models import EmailCenterMessage, EmailCenterTemplate
from app.modules.email_center.schemas import (
    MessageDetailResponse,
    MessageListItem,
    MessagesListResponse,
    RecipientsPayload,
    ResendStatusResponse,
    SendEmailRequest,
    SendEmailResponse,
    SenderCreateRequest,
    SenderResponse,
    SenderUpdateRequest,
    SendersListResponse,
    TemplateInput,
    TemplateRenderRequest,
    TemplateRenderResponse,
    TemplateResponse,
    TemplateUpdateInput,
    TestEmailRequest,
)
from app.modules.email_center.service import (
    STATUS_FAILED,
    STATUS_SENT,
    email_service,
    extract_variables,
    normalize_email,
    render_variables,
)
from app.modules.users.models import User

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/v1/admin/email-center",
    tags=["Admin - Email Center"],
    dependencies=[Depends(require_system_admin)],
)

# Delivery is a privileged, billable action: tight per-admin budgets.
# (Redis-backed; fail-open only when Redis itself is down.)
_send_limiter = SlidingWindowRateLimiter(
    limit=30, window_seconds=600, key_prefix="rl_email_center_send"
)
_test_limiter = SlidingWindowRateLimiter(
    limit=10, window_seconds=3600, key_prefix="rl_email_center_test"
)
_senders_refresh_limiter = SlidingWindowRateLimiter(
    limit=20, window_seconds=300, key_prefix="rl_email_center_refresh"
)


def _template_to_response(row: EmailCenterTemplate) -> TemplateResponse:
    return TemplateResponse(
        id=row.id,
        name=row.name,
        description=row.description,
        subject=row.subject,
        text_body=row.text_body or "",
        html_body=row.html_body or "",
        variables=list(row.variables or []),
        is_system=row.is_system,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _message_to_item(row: EmailCenterMessage) -> MessageListItem:
    recipients = row.recipients or {}
    return MessageListItem(
        id=row.id,
        status=row.status,
        sender=row.sender,
        sender_name=row.sender_name,
        recipients=RecipientsPayload(
            to=list(recipients.get("to", [])),
            cc=list(recipients.get("cc", [])),
            bcc=list(recipients.get("bcc", [])),
        ),
        subject=row.subject,
        provider=row.provider,
        provider_message_id=row.provider_message_id,
        is_test=row.is_test,
        failure_code=row.failure_code,
        created_at=row.created_at,
    )


# ── Resend status ─────────────────────────────────────────────────────────


@router.get("/status", response_model=ResendStatusResponse, summary="Resend connection status")
async def get_resend_status(
    request: Request,
    refresh: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> ResendStatusResponse:
    if refresh:
        await enforce_rate_limit(request, _senders_refresh_limiter, str(admin_user.id))
    data = await email_service.resend_status(db, force_refresh=refresh)
    return ResendStatusResponse(**data)


# ── Senders ───────────────────────────────────────────────────────────────


@router.get("/senders", response_model=SendersListResponse, summary="List sender identities")
async def list_senders(
    request: Request,
    refresh: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> SendersListResponse:
    if refresh:
        await enforce_rate_limit(request, _senders_refresh_limiter, str(admin_user.id))
    senders, domain, domain_status, last_checked = await email_service.list_senders(
        db, force_refresh=refresh
    )
    return SendersListResponse(
        senders=[SenderResponse(**item) for item in senders],
        domain=domain,
        domain_status=domain_status,
        last_checked_at=last_checked,
    )


@router.post("/senders", response_model=SenderResponse, status_code=201, summary="Add sender")
@audit_log(action="email_center.add_sender", entity_type="email_sender")
async def add_sender(
    request: Request,
    payload: SenderCreateRequest,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> SenderResponse:
    row = await email_service.add_sender(db, email=payload.email, name=payload.name)
    senders, _, _, _ = await email_service.list_senders(db)
    live = next((s for s in senders if str(s["id"]) == str(row.id)), None)
    if live is None:  # pragma: no cover - defensive
        return SenderResponse(
            id=row.id, email=row.email, name=row.name, domain=row.domain,
            verified=False, enabled=row.enabled, status="unavailable",
            status_detail="Resend status unavailable.", is_system=row.is_system,
        )
    return SenderResponse(**live)


@router.patch("/senders/{sender_id}", response_model=SenderResponse, summary="Update sender")
@audit_log(action="email_center.update_sender", entity_type="email_sender")
async def update_sender(
    request: Request,
    sender_id: uuid.UUID,
    payload: SenderUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> SenderResponse:
    row = await email_service.update_sender(
        db, sender_id, name=payload.name, enabled=payload.enabled
    )
    senders, _, _, _ = await email_service.list_senders(db)
    live = next((s for s in senders if str(s["id"]) == str(row.id)), None)
    if live is None:  # pragma: no cover - defensive
        return SenderResponse(
            id=row.id, email=row.email, name=row.name, domain=row.domain,
            verified=False, enabled=row.enabled, status="unavailable",
            status_detail="Resend status unavailable.", is_system=row.is_system,
        )
    return SenderResponse(**live)


@router.delete("/senders/{sender_id}", status_code=204, summary="Remove sender")
@audit_log(action="email_center.remove_sender", entity_type="email_sender")
async def delete_sender(
    request: Request,
    sender_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> None:
    await email_service.delete_sender(db, sender_id)


# ── Delivery ──────────────────────────────────────────────────────────────


@router.post("/send", response_model=SendEmailResponse, summary="Send email")
@audit_log(action="email_center.send", entity_type="email_message")
async def send_email(
    request: Request,
    payload: SendEmailRequest,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> SendEmailResponse:
    await enforce_rate_limit(request, _send_limiter, str(admin_user.id))
    record, message = await email_service.send(
        db,
        admin_user_id=admin_user.id,
        admin_email=admin_user.email,
        payload=payload,
        is_test=False,
    )
    return SendEmailResponse(
        id=record.id,
        status=record.status,  # type: ignore[arg-type]
        provider=record.provider,
        provider_message_id=record.provider_message_id,
        message=message,
        failure_code=record.failure_code,
    )


@router.post("/test", response_model=SendEmailResponse, summary="Send test email")
@audit_log(action="email_center.send_test", entity_type="email_message")
async def send_test_email(
    request: Request,
    payload: TestEmailRequest,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> SendEmailResponse:
    await enforce_rate_limit(request, _test_limiter, str(admin_user.id))
    recipient = normalize_email(payload.to)
    test_payload = SendEmailRequest(
        sender=payload.sender,
        to=[recipient],
        subject="[Test] Reliastra Email Center Test",
        text=(
            "This is a test message from the Reliastra Email Center.\n\n"
            "If you received this, the sender identity and Resend delivery "
            "path are working correctly.\n\n— Reliastra Operations"
        ),
        html=(
            '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,'
            'sans-serif;color:#1f2937;line-height:1.65;max-width:640px;">'
            "<p><strong>[Test] Reliastra Email Center Test</strong></p>"
            "<p>This is a test message from the Reliastra Email Center.</p>"
            "<p>If you received this, the sender identity and Resend delivery path "
            "are working correctly.</p>"
            "<p>&mdash; Reliastra Operations</p></div>"
        ),
    )
    record, message = await email_service.send(
        db,
        admin_user_id=admin_user.id,
        admin_email=admin_user.email,
        payload=test_payload,
        is_test=True,
    )
    response = SendEmailResponse(
        id=record.id,
        status=record.status,  # type: ignore[arg-type]
        provider=record.provider,
        provider_message_id=record.provider_message_id,
        message=message,
        failure_code=record.failure_code,
    )
    if record.status == STATUS_FAILED:
        # Test failures surface as 422 with the friendly provider message
        # (the audit record still exists for inspection).
        raise ValidationException(message)
    return response


# ── Logs ──────────────────────────────────────────────────────────────────


@router.get("/messages", response_model=MessagesListResponse, summary="Email activity log")
async def list_messages(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    status: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=200),
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> MessagesListResponse:
    if status is not None and status not in ("queued", "sent", "failed", "rejected"):
        raise ValidationException("Invalid status filter.")
    rows, total = await email_service.list_messages(
        db, page=page, page_size=page_size, status=status, search=search
    )
    return MessagesListResponse(
        items=[_message_to_item(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/messages/{message_id}", response_model=MessageDetailResponse, summary="Message detail")
async def get_message(
    request: Request,
    message_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> MessageDetailResponse:
    row = await email_service.get_message(db, message_id)
    item = _message_to_item(row)
    return MessageDetailResponse(
        **item.model_dump(),
        admin_email=row.admin_email,
        text_body=row.text_body,
        html_body=row.html_body,
        failure_reason=row.failure_reason,
        template_id=row.template_id,
        attachments_meta=row.attachments_meta,
        updated_at=row.updated_at,
    )


# ── Templates ─────────────────────────────────────────────────────────────


@router.get("/templates", response_model=list[TemplateResponse], summary="List templates")
async def list_templates(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> list[TemplateResponse]:
    rows = await email_service.list_templates(db)
    return [_template_to_response(row) for row in rows]


@router.post("/templates", response_model=TemplateResponse, status_code=201, summary="Create template")
@audit_log(action="email_center.create_template", entity_type="email_template")
async def create_template(
    request: Request,
    payload: TemplateInput,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> TemplateResponse:
    row = await email_service.create_template(
        db,
        name=payload.name,
        description=payload.description,
        subject=payload.subject,
        text_body=payload.text_body,
        html_body=payload.html_body,
        created_by_admin_id=admin_user.id,
    )
    return _template_to_response(row)


@router.post("/templates/render", response_model=TemplateRenderResponse, summary="Render template preview")
async def render_template(
    request: Request,
    payload: TemplateRenderRequest,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> TemplateRenderResponse:
    if payload.template_id is not None:
        template = await email_service.get_template(db, payload.template_id)
        subject, text_body, html_body = template.subject, template.text_body or "", template.html_body or ""
    else:
        subject, text_body, html_body = (
            payload.subject or "",
            payload.text_body or "",
            payload.html_body or "",
        )
    variables = {str(k): str(v) for k, v in (payload.variables or {}).items()}
    names = extract_variables(subject, text_body, html_body)
    return TemplateRenderResponse(
        subject=render_variables(subject, variables, escape_html=False),
        text_body=render_variables(text_body, variables, escape_html=False),
        html_body=render_variables(html_body, variables, escape_html=True),
        variables=names,
        missing_variables=[name for name in names if name not in variables],
    )


@router.get("/templates/{template_id}", response_model=TemplateResponse, summary="Get template")
async def get_template(
    request: Request,
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> TemplateResponse:
    row = await email_service.get_template(db, template_id)
    return _template_to_response(row)


@router.patch("/templates/{template_id}", response_model=TemplateResponse, summary="Update template")
@audit_log(action="email_center.update_template", entity_type="email_template")
async def update_template(
    request: Request,
    template_id: uuid.UUID,
    payload: TemplateUpdateInput,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> TemplateResponse:
    row = await email_service.update_template(
        db,
        template_id,
        name=payload.name,
        description=payload.description,
        subject=payload.subject,
        text_body=payload.text_body,
        html_body=payload.html_body,
    )
    return _template_to_response(row)


@router.delete("/templates/{template_id}", status_code=204, summary="Delete template")
@audit_log(action="email_center.delete_template", entity_type="email_template")
async def delete_template(
    request: Request,
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> None:
    await email_service.delete_template(db, template_id)


@router.post(
    "/templates/{template_id}/duplicate",
    response_model=TemplateResponse,
    status_code=201,
    summary="Duplicate template",
)
@audit_log(action="email_center.duplicate_template", entity_type="email_template")
async def duplicate_template(
    request: Request,
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_system_admin),
) -> TemplateResponse:
    row = await email_service.duplicate_template(
        db, template_id, created_by_admin_id=admin_user.id
    )
    return _template_to_response(row)

