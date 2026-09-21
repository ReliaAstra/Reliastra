"""Request/response contracts for the email-only support desk."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

#: Categories a customer can pick from. They route admin triage and the
#: queue's ``by_category`` breakdown; they never change who is emailed.
SUPPORT_CATEGORIES: tuple[str, ...] = (
    "general",
    "monitoring",
    "evidence",
    "billing",
    "account",
    "security",
    "integration",
)


class SupportRequestCreate(BaseModel):
    """One email into the support mailbox, written from the console."""

    model_config = ConfigDict(extra="forbid")

    subject: str = Field(min_length=3, max_length=200)
    message: str = Field(min_length=20, max_length=8000)
    category: str = Field(default="general")

    @field_validator("category")
    @classmethod
    def _known_category(cls, value: str) -> str:
        normalized = (value or "general").strip().lower()
        if normalized not in SUPPORT_CATEGORIES:
            raise ValueError(
                "Unknown category. Use one of: " + ", ".join(SUPPORT_CATEGORIES)
            )
        return normalized

    @field_validator("subject", "message")
    @classmethod
    def _collapse_blank_lines(cls, value: str) -> str:
        # Stored and emailed as written, minus leading/trailing blank space: a
        # subject of spaces is not a subject, and a body padded with six blank
        # lines wastes the alert email's quote budget.
        stripped = (value or "").strip()
        if not stripped:
            raise ValueError("Cannot be blank")
        return stripped


class SupportRequestReceipt(BaseModel):
    """What the console shows after a support email is sent.

    ``admin_notified`` is honest about the alert email: the request is queued
    either way, but when the provider refused the alert the writer should know
    the team will see it on their next look rather than instantly.
    """

    ticket_number: str
    status: str
    subject: str
    category: str
    support_email: str
    received_at: datetime
    confirmation_sent_to: str | None = None
    admin_notified: bool = False
    reply_in_days: int = 1


class SupportAlertItem(BaseModel):
    """One new support email, as a browser notification describes it."""

    id: uuid.UUID
    ticket_number: str
    subject: str
    requester_email: str
    requester_name: str | None = None
    category: str
    priority: str
    source: str | None = None
    created_at: datetime
    admin_url: str


class SupportAlertsResponse(BaseModel):
    """New-ticket signal for the admin console.

    Polled by the admin shell (see ``SupportAlertWatcher``) - it is the *only*
    polling left in support, it runs at 20 seconds, and it exists so a Chrome
    notification can fire for an operator who is looking at a different admin
    page. Nothing about the ticket list or a thread is polled any more.
    """

    model_config = ConfigDict(from_attributes=True)

    server_time: datetime
    since: datetime
    new_count: int = 0
    awaiting_reply_count: int = 0
    highest_priority: str | None = None
    latest: list[SupportAlertItem] = Field(default_factory=list)
