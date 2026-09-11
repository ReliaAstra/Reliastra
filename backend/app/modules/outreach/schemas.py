from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class OutreachLeadCreate(BaseModel):
    website: str = Field(min_length=4, max_length=1024)
    seed_source: str | None = Field(default=None, max_length=128)


class OutreachLeadPatch(BaseModel):
    status: str | None = Field(default=None, max_length=32)  # killed | skipped | approved
    kill_reason: str | None = Field(default=None, max_length=1024)


class OutreachDraftPatch(BaseModel):
    subject: str | None = Field(default=None, max_length=500)
    body_text: str | None = Field(default=None, max_length=20000)
    status: str | None = Field(default=None, max_length=32)  # approved | killed


class OutreachHuntRequest(BaseModel):
    urls: list[str] = Field(min_length=1, max_length=300)
    seed_source: str | None = Field(default=None, max_length=128)


class OutreachSuppressionCreate(BaseModel):
    value: str = Field(min_length=3, max_length=320)
    reason: str = Field(default="opt_out", max_length=64)


class OutreachLeadOut(BaseModel):
    id: UUID
    domain: str
    website: str
    agency_name: str | None
    country: str | None
    city: str | None
    size_band: str | None
    founder_name: str | None
    contact_email: str | None
    contact_route: str | None
    linkedin_url: str | None
    care_plan_url: str | None
    care_plan_tiers: str | None
    status: str
    kill_reason: str | None
    seed_source: str | None
    created_at: datetime


class OutreachDraftOut(BaseModel):
    id: UUID
    lead_id: UUID
    agency_name: str | None = None
    domain: str | None = None
    contact_email: str | None = None
    subject: str
    body_text: str
    angle: str | None
    status: str
    sent_at: datetime | None
    send_error: str | None


class OutreachOverviewOut(BaseModel):
    queued_today: int
    sent_today: int
    daily_cap: int
    warmup_ceiling: int = 50
    paused: bool
    pause_reason: str | None = None
    totals: dict[str, int] = Field(default_factory=dict)
    kill_breakdown: dict[str, int] = Field(default_factory=dict)


class OutreachQaOut(BaseModel):
    answer: str
    rows: list[dict] = Field(default_factory=list)
