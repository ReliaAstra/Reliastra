import uuid
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import ForbiddenException, ResourceNotFoundException
from app.dependencies import get_current_org, get_current_user, require_admin, require_member
from app.db.session import get_db
from app.modules.notifications.schemas import (
    AlertConfigCreateRequest,
    AlertConfigResponse,
    AlertConfigUpdateRequest,
    AlertTestRequest,
    AlertTestResponse,
    InboxItem,
    InboxListResponse,
    InboxMarkReadRequest,
    InboxUnreadCountResponse,
)
from app.modules.notifications.service import (
    NotificationService,
    notification_service,
)
from app.modules.organizations.models import Organization
from app.modules.users.models import User

router = APIRouter(
    prefix="/v1/notifications", tags=["Notifications"]
)


def get_notif_service() -> NotificationService:
    return notification_service


async def require_human_user(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> User:
    """Authenticate a person, never an organization API key.

    The in-dashboard inbox belongs to an individual: an API key has no
    notification deliveries of its own, so it must not be able to read or
    mutate someone else's feed.
    """
    if getattr(request.state, "auth_method", None) == "apikey":
        raise ForbiddenException(
            "Organization API keys cannot access the notification inbox"
        )
    return current_user


@router.get("/configs", response_model=list[AlertConfigResponse])
async def list_alert_configs(
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: NotificationService = Depends(get_notif_service),
) -> list[AlertConfigResponse]:
    return await service.list_configs(db, current_org.id)


@router.post(
    "/configs",
    response_model=AlertConfigResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_member)],
)
async def create_alert_config(
    request: AlertConfigCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: NotificationService = Depends(get_notif_service),
) -> AlertConfigResponse:
    return await service.create_config(db, current_org.id, request)


@router.get("/configs/{config_id}", response_model=AlertConfigResponse)
async def get_alert_config(
    config_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: NotificationService = Depends(get_notif_service),
) -> AlertConfigResponse:
    return await service.get_config(db, current_org.id, config_id)


@router.patch(
    "/configs/{config_id}",
    response_model=AlertConfigResponse,
    dependencies=[Depends(require_member)],
)
async def update_alert_config(
    config_id: uuid.UUID,
    request: AlertConfigUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: NotificationService = Depends(get_notif_service),
) -> AlertConfigResponse:
    return await service.update_config(db, current_org.id, config_id, request)


@router.delete(
    "/configs/{config_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_member)],
)
async def delete_alert_config(
    config_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: NotificationService = Depends(get_notif_service),
) -> None:
    await service.delete_config(db, current_org.id, config_id)


@router.post(
    "/test",
    response_model=AlertTestResponse,
    dependencies=[Depends(require_member)],
)
async def send_test_notification(
    request: AlertTestRequest,
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: NotificationService = Depends(get_notif_service),
) -> AlertTestResponse:
    return await service.send_test_alert(db, current_org.id, request.config_id)


# ═════════════════════════ In-dashboard inbox ═══════════════════════════
#
# The single feed every persona reads: dependency degradation alerts, support
# replies, and admin announcements all land here as ``in_app_notifications``
# rows fanned out per user.  The customer console bell polls
# ``/inbox/unread-count`` and expands into ``/inbox``.


def _inbox_service():
    """The notification tables are shared with the partner program.

    Importing lazily keeps the notifications module importable without pulling
    in the partner stack at module load.
    """
    from app.modules.partners.notifications import partner_notification_service

    return partner_notification_service


@router.get("/inbox", response_model=InboxListResponse, summary="My in-dashboard feed")
async def list_inbox(
    unread_only: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_human_user),
) -> InboxListResponse:
    """Everything the platform has told this user, newest first."""
    service = _inbox_service()
    rows, total = await service.list_for_user(
        db, current_user.id, unread_only=unread_only, page=page, page_size=page_size
    )
    unread = await service.unread_count(db, current_user.id)
    return InboxListResponse(
        items=[
            InboxItem(
                id=notification.id,
                event=notification.notification_type,
                title=notification.title,
                body=notification.body,
                action_url=notification.action_url,
                action_label=notification.action_label,
                priority=notification.priority,
                is_read=delivery.is_read,
                created_at=notification.created_at,
            )
            for notification, delivery in rows
        ],
        page=page,
        page_size=page_size,
        total=total,
        unread=unread,
    )


@router.get(
    "/inbox/unread-count",
    response_model=InboxUnreadCountResponse,
    summary="Unread in-dashboard notification count",
)
async def inbox_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_human_user),
) -> InboxUnreadCountResponse:
    return InboxUnreadCountResponse(
        unread=await _inbox_service().unread_count(db, current_user.id)
    )


@router.post(
    "/inbox/read",
    response_model=InboxUnreadCountResponse,
    summary="Mark in-dashboard notifications read",
)
async def mark_inbox_read(
    body: InboxMarkReadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_human_user),
) -> InboxUnreadCountResponse:
    service = _inbox_service()
    await service.mark_read(db, current_user.id, body.notification_ids or None)
    return InboxUnreadCountResponse(unread=await service.unread_count(db, current_user.id))


@router.delete(
    "/inbox/{notification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Dismiss an in-dashboard notification",
)
async def dismiss_inbox_item(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_human_user),
) -> None:
    dismissed = await _inbox_service().dismiss(db, current_user.id, notification_id)
    if dismissed == 0:
        # Either it does not exist or it belongs to somebody else; either way
        # the caller must not be told the dismissal succeeded.
        raise ResourceNotFoundException("Notification not found")

