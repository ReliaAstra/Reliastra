"""Prospect AI request/response schemas with strict server-side validation."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

MAX_REPORT_TEXT_BYTES = 2_000_000
MAX_LEADS_PER_GENERATE = 8
MAX_LEADS_PER_BATCH = 25

DRAFT_STATUSES = {"pending", "ready", "approved", "failed", "sent"}
PROVIDER_TYPES = {"openai_compatible", "anthropic", "google"}


class ProspectImportRequest(BaseModel):
    """Upload a prospect report as text (files are read client-side).

    ``json_text`` is required and must parse to a prospect list - either a
    bare array or an object with a ``prospects`` array. ``md_text`` (the
    Markdown twin) is archived for reference only.
    """

    filename: str = Field(min_length=1, max_length=255)
    json_text: str = Field(min_length=2, max_length=MAX_REPORT_TEXT_BYTES)
    md_text: str | None = Field(default=None, max_length=MAX_REPORT_TEXT_BYTES)

    @field_validator("filename")
    @classmethod
    def _clean_filename(cls, value: str) -> str:
        cleaned = value.strip().replace("\x00", "").replace("\\", "/").split("/")[-1].strip()
        if not cleaned or cleaned in {".", ".."}:
            raise ValueError("Filename is invalid.")
        return cleaned


class ProspectReportOut(BaseModel):
    id: uuid.UUID
    title: str
    report_date: str | None = None
    source_filename: str
    prospect_count: int
    skipped_count: int
    notes: str | None = None
    created_at: datetime


class ProspectLeadOut(BaseModel):
    id: uuid.UUID
    report_id: uuid.UUID
    rank: int | None = None
    company: str
    product: str | None = None
    website: str | None = None
    domain: str
    contact_name: str | None = None
    role: str | None = None
    contact_email: str | None = None
    pain_signal: str | None = None
    external_dependencies: str | None = None
    evidence: str | None = None
    why_reliastra_is_relevant: str | None = None
    outreach_hook: str | None = None
    verdict: str | None = None
    draft_subject: str | None = None
    draft_body: str | None = None
    draft_status: str
    draft_error: str | None = None
    draft_angle: str | None = None
    draft_rejected_angles: list[dict[str, Any]] | None = None
    drafted_at: datetime | None = None
    approved_at: datetime | None = None
    sent_message_id: uuid.UUID | None = None
    sent_at: datetime | None = None
    batch_id: uuid.UUID | None = None


class ProspectGenerateRequest(BaseModel):
    lead_ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_LEADS_PER_GENERATE)
    tone: str | None = Field(default=None, max_length=64)
    # Regenerating over an approved (or sent) draft needs explicit force:
    # silently overwriting a human-approved email is the one mistake this
    # workflow exists to make impossible.
    force: bool = False


class ProspectDraftPatch(BaseModel):
    subject: str | None = Field(default=None, min_length=1, max_length=500)
    body_text: str | None = Field(default=None, min_length=1, max_length=20000)


class ProspectSendRequest(BaseModel):
    sender: str = Field(min_length=3, max_length=320)
    reply_to: str | None = Field(default=None, max_length=320)
    template_id: uuid.UUID | None = None


class ProspectBatchApproveRequest(BaseModel):
    lead_ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_LEADS_PER_BATCH)


class ProspectBatchSendRequest(BaseModel):
    lead_ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_LEADS_PER_BATCH)
    sender: str = Field(min_length=3, max_length=320)
    reply_to: str | None = Field(default=None, max_length=320)
    # One optional studio template for the whole batch. Its HTML renders
    # with per-lead {{variables}}; the AI's text draft stays the plain body.
    template_id: uuid.UUID | None = None


class ProspectLeadBatchResult(BaseModel):
    lead_id: uuid.UUID
    status: str
    message_id: uuid.UUID | None = None
    error: str | None = None


class ProspectBatchSendResponse(BaseModel):
    batch_id: uuid.UUID
    requested: int
    sent: int
    failed: int
    results: list[ProspectLeadBatchResult]


class ProspectProviderConfig(BaseModel):
    label: str = Field(default="Primary", max_length=120)
    provider_type: str
    endpoint_url: str = Field(min_length=8, max_length=1024)
    model: str = Field(min_length=1, max_length=255)
    api_key: str | None = Field(default=None, max_length=4096)
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=256, le=200_000)
    timeout_seconds: float = Field(default=60.0, ge=5.0, le=300.0)


class ProspectProviderOut(BaseModel):
    label: str
    provider_type: str
    endpoint_url: str
    model: str
    api_key_last4: str | None = None
    temperature: float
    max_tokens: int
    timeout_seconds: float
    is_active: bool
    last_test_at: datetime | None = None
    last_test_ok: bool | None = None
    last_test_detail: str | None = None
    source: str = "profile"


class ProspectProviderTestRequest(BaseModel):
    """Test-connection input. All fields optional: omitted fields fall back
    to the saved active profile (or platform config) - an unsaved candidate
    endpoint can be proved before it is ever persisted."""

    provider_type: str | None = None
    endpoint_url: str | None = Field(default=None, max_length=1024)
    model: str | None = Field(default=None, max_length=255)
    api_key: str | None = Field(default=None, max_length=4096)


class ProspectProviderTestResponse(BaseModel):
    ok: bool
    latency_ms: int | None = None
    model: str | None = None
    detail: str


class ProspectImportResponse(BaseModel):
    report: ProspectReportOut
    imported: int
    skipped: int


class ProspectAiStatus(BaseModel):
    ai_available: bool
    model_name: str | None = None
    total_reports: int
    total_leads: int
    leads_by_status: dict[str, int] = Field(default_factory=dict)
    provider_source: str = "platform"
    daily_send_cap: int = 20
    sends_remaining_today: int = 0


class LeadEvidence(BaseModel):
    """Evidence bundle handed to the model. Anything not pre-researched is
    excluded by construction - the prompt cannot cite what it never saw."""

    model_config = {"extra": "forbid"}

    rank: int | None = None
    company: str
    product: str | None = None
    website: str | None = None
    contact_name: str | None = None
    role: str | None = None
    external_dependencies: str | None = None
    evidence: str | None = None
    pain_signal: str | None = None
    why_reliastra_is_relevant: str | None = None
    outreach_hook: str | None = None
    verdict: str | None = None
    notes: dict[str, Any] | None = None
