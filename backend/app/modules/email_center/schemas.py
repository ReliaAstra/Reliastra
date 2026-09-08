"""Email Center request/response schemas with strict server-side validation."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# ── Limits ────────────────────────────────────────────────────────────────

MAX_RECIPIENTS_PER_FIELD = 25
MAX_RECIPIENTS_TOTAL = 50
MAX_SUBJECT_LENGTH = 500
MAX_TEXT_BYTES = 512_000
MAX_HTML_BYTES = 1_048_576
MAX_ATTACHMENTS = 5
MAX_ATTACHMENT_BYTES = 8_000_000
MAX_ATTACHMENTS_TOTAL_BYTES = 20_000_000
MAX_SENDER_NAME_LENGTH = 120
MAX_TEMPLATE_NAME_LENGTH = 120

SenderStatus = Literal["verified", "not_verified", "unavailable"]
MessageStatus = Literal["queued", "sent", "failed", "rejected"]


class AttachmentInput(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_base64: str = Field(min_length=1, max_length=12_000_000)
    content_type: str | None = Field(default=None, max_length=127)

    @field_validator("filename")
    @classmethod
    def _clean_filename(cls, value: str) -> str:
        cleaned = value.strip().replace("\x00", "")
        # Strip any directory components the client may have included.
        cleaned = cleaned.replace("\\", "/").split("/")[-1].strip()
        if not cleaned or cleaned in {".", ".."}:
            raise ValueError("Attachment filename is invalid.")
        return cleaned


class SendEmailRequest(BaseModel):
    sender: str = Field(min_length=3, max_length=320)
    to: list[str] = Field(min_length=1, max_length=MAX_RECIPIENTS_PER_FIELD)
    cc: list[str] = Field(default_factory=list, max_length=MAX_RECIPIENTS_PER_FIELD)
    bcc: list[str] = Field(default_factory=list, max_length=MAX_RECIPIENTS_PER_FIELD)
    reply_to: str | None = Field(default=None, max_length=320)
    subject: str = Field(min_length=1, max_length=MAX_SUBJECT_LENGTH)
    text: str | None = Field(default=None, max_length=MAX_TEXT_BYTES)
    html: str | None = Field(default=None, max_length=MAX_HTML_BYTES)
    attachments: list[AttachmentInput] = Field(default_factory=list, max_length=MAX_ATTACHMENTS)
    template_id: uuid.UUID | None = None
    variables: dict[str, str] = Field(default_factory=dict, max_length=50)
    idempotency_key: str | None = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def _check_bodies(self) -> SendEmailRequest:
        if not (self.text or "").strip() and not (self.html or "").strip():
            raise ValueError("Provide a plain-text body, an HTML body, or both.")
        total = len(self.to) + len(self.cc) + len(self.bcc)
        if total > MAX_RECIPIENTS_TOTAL:
            raise ValueError(
                f"Too many recipients ({total}). Maximum is {MAX_RECIPIENTS_TOTAL} across To/CC/BCC."
            )
        return self


class TestEmailRequest(BaseModel):
    sender: str = Field(min_length=3, max_length=320)
    to: str = Field(min_length=3, max_length=320)


class SenderCreateRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    name: str = Field(min_length=1, max_length=MAX_SENDER_NAME_LENGTH)


class SenderUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=MAX_SENDER_NAME_LENGTH)
    enabled: bool | None = None


class SenderResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    domain: str
    verified: bool
    enabled: bool
    status: SenderStatus
    status_detail: str
    is_system: bool


class SendersListResponse(BaseModel):
    senders: list[SenderResponse]
    domain: str
    domain_status: str
    last_checked_at: datetime | None = None


class ResendStatusResponse(BaseModel):
    connected: bool
    connection_detail: str
    sending_domain: str
    domain_status: str
    domain_detail: str
    sender_identities_verified: int | None = None
    sender_identities_total: int | None = None
    last_checked_at: datetime | None = None


class SendEmailResponse(BaseModel):
    id: uuid.UUID
    status: MessageStatus
    provider: str
    provider_message_id: str | None = None
    message: str
    failure_code: str | None = None


class RecipientsPayload(BaseModel):
    to: list[str] = Field(default_factory=list)
    cc: list[str] = Field(default_factory=list)
    bcc: list[str] = Field(default_factory=list)


class MessageListItem(BaseModel):
    id: uuid.UUID
    status: str
    sender: str
    sender_name: str | None = None
    recipients: RecipientsPayload
    subject: str
    provider: str
    provider_message_id: str | None = None
    is_test: bool = False
    failure_code: str | None = None
    created_at: datetime


class MessageDetailResponse(MessageListItem):
    admin_email: str | None = None
    text_body: str | None = None
    html_body: str | None = None
    failure_reason: str | None = None
    template_id: uuid.UUID | None = None
    attachments_meta: list[dict[str, Any]] | None = None
    updated_at: datetime


class MessagesListResponse(BaseModel):
    items: list[MessageListItem]
    total: int
    page: int
    page_size: int


class TemplateInput(BaseModel):
    name: str = Field(min_length=1, max_length=MAX_TEMPLATE_NAME_LENGTH)
    description: str | None = Field(default=None, max_length=500)
    subject: str = Field(min_length=1, max_length=MAX_SUBJECT_LENGTH)
    text_body: str = Field(default="", max_length=MAX_TEXT_BYTES)
    html_body: str = Field(default="", max_length=MAX_HTML_BYTES)

    @model_validator(mode="after")
    def _check_bodies(self) -> TemplateInput:
        if not self.text_body.strip() and not self.html_body.strip():
            raise ValueError("Provide a plain-text body, an HTML body, or both.")
        return self

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Template name is required.")
        return cleaned


class TemplateUpdateInput(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=MAX_TEMPLATE_NAME_LENGTH)
    description: str | None = Field(default=None, max_length=500)
    subject: str | None = Field(default=None, min_length=1, max_length=MAX_SUBJECT_LENGTH)
    text_body: str | None = Field(default=None, max_length=MAX_TEXT_BYTES)
    html_body: str | None = Field(default=None, max_length=MAX_HTML_BYTES)


class TemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    subject: str
    text_body: str
    html_body: str
    variables: list[str] = Field(default_factory=list)
    is_system: bool = False
    created_at: datetime
    updated_at: datetime


class TemplateRenderRequest(BaseModel):
    template_id: uuid.UUID | None = None
    subject: str | None = Field(default=None, max_length=MAX_SUBJECT_LENGTH)
    text_body: str | None = Field(default=None, max_length=MAX_TEXT_BYTES)
    html_body: str | None = Field(default=None, max_length=MAX_HTML_BYTES)
    variables: dict[str, str] = Field(default_factory=dict, max_length=50)


class TemplateRenderResponse(BaseModel):
    subject: str
    text_body: str
    html_body: str
    variables: list[str]
    missing_variables: list[str]
