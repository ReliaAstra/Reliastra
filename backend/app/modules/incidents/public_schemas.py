"""Public incident API schemas (machine readable incident intelligence)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PublicIncidentSummary(BaseModel):
    """One incident card. Enough to render search results and cards without
    a follow-up call: vendor display identity, the observed target, the
    window, and the methodology metadata that supports the claim."""

    model_config = ConfigDict(from_attributes=True)

    incident_id: uuid.UUID
    vendor_name: str
    vendor_display_name: str
    category: str
    target_name: str | None = None
    endpoint_url: str
    region: str
    status: str
    severity: str
    failure_kind: str
    started_at: datetime
    detected_at: datetime
    resolved_at: datetime | None = None
    duration_seconds: float | None = None
    observation_count: int
    failure_count: int
    methodology_version: str
    attribution_status: str


class PublicIncidentListResponse(BaseModel):
    items: list[PublicIncidentSummary] = Field(default_factory=list)
    next_cursor: str | None = None
    has_more: bool = False


class PublicIncidentDetailResponse(PublicIncidentSummary):
    """The full record stored for one incident, including provenance a
    reader can verify the claim from."""

    status_codes: list[int] | None = None
    first_observation_id: str | None = None
    last_observation_id: str | None = None
    detection_rule: str | None = None
    detection_metadata: dict | None = None
    description: str | None = None
