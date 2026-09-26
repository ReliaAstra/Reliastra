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


class PublicIncidentEvidenceDescriptor(BaseModel):
    """Pointer to the incident's published evidence artifact.

    Deliberately metadata only: the artifact itself is served, byte-for-byte,
    at ``/v1/public/incidents/{id}/evidence`` so a verifier hashes exactly
    what was stored, never a re-serialisation of it.
    """

    version: int
    incident_status: str
    artifact_schema_version: str
    methodology_version: str
    data_hash: str
    byte_size: int
    observation_count: int
    observations_truncated: bool
    generated_at: datetime


class PublicIncidentDetailResponse(PublicIncidentSummary):
    """The full record stored for one incident, including provenance a
    reader can verify the claim from."""

    status_codes: list[int] | None = None
    first_observation_id: str | None = None
    last_observation_id: str | None = None
    detection_rule: str | None = None
    detection_metadata: dict | None = None
    description: str | None = None
    #: The newest evidence freeze, when one exists. Null until the freeze
    #: processor has run: absence here is "artifact not generated yet", never
    #: "this record is unverifiable by design".
    evidence: PublicIncidentEvidenceDescriptor | None = None
