from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field
from app.modules.notifications.constants import ChannelType


class AlertPayload(BaseModel):
    org_id: uuid.UUID
    incident_id: uuid.UUID | None = None
    severity: str
    event: str = "incident.detected"
    title: str
    body: str
    metadata: dict[str, Any] = {}


class AlertConfigCreateRequest(BaseModel):
    channel_type: ChannelType
    config: dict[str, Any]
    is_active: bool = True



class AlertConfigUpdateRequest(BaseModel):
    channel_type: ChannelType | None = None
    config: dict[str, Any] | None = None
    is_active: bool | None = None


class AlertConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    channel_type: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    destination: str | None = None
    connection_status: str = 'configured'
    verification_required: bool = False
    events: dict[str, bool] = Field(default_factory=lambda: {'incident.detected': True, 'incident.resolved': True})
    last_test_at: str | None = None
    last_test_success: bool | None = None


class AlertTestRequest(BaseModel):
    config_id: uuid.UUID


class AlertTestResponse(BaseModel):
    success: bool
    message: str


# ---------------------------------------------------------------------------
# In-dashboard inbox
#
# Every authenticated human - normal customer, agency operator, partner -
# reads the same ``in_app_notifications`` fan-out through these endpoints.
# They are deliberately NOT org-scoped: a notification belongs to a person.
# ---------------------------------------------------------------------------


class InboxItem(BaseModel):
    id: uuid.UUID
    event: str
    title: str
    body: str
    action_url: str | None = None
    action_label: str | None = None
    priority: str
    is_read: bool
    created_at: datetime


class InboxListResponse(BaseModel):
    items: list[InboxItem]
    page: int
    page_size: int
    total: int
    unread: int


class InboxUnreadCountResponse(BaseModel):
    unread: int


class InboxMarkReadRequest(BaseModel):
    #: Omit (or send an empty list) to mark the whole feed read.
    notification_ids: list[uuid.UUID] | None = None


class ChannelVerificationRequest(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")
