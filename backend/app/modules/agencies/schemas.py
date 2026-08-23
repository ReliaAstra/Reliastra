import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ClientCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=500)


class ClientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


class ApplicationCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=500)


class ApplicationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    client_id: uuid.UUID | None
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


# ── Agency portfolio (client-facing SLA portal) ──────────────────────────────

PortfolioStatus = str  # "operational" | "degraded" | "critical"


class PortfolioClient(BaseModel):
    """One agency customer's rolled-up SLA posture."""

    id: uuid.UUID
    name: str
    description: str | None = None
    application_count: int = 0
    dependency_count: int = 0
    uptime_24h: float = 100.0
    avg_latency_ms: float = 0.0
    open_incidents: int = 0
    critical_incidents: int = 0
    last_incident_at: datetime | None = None
    status: PortfolioStatus = "operational"


class PortfolioTotals(BaseModel):
    clients: int = 0
    dependencies: int = 0
    avg_uptime_24h: float = 100.0
    open_incidents: int = 0
    clients_needing_attention: int = 0


class PortfolioResponse(BaseModel):
    org_name: str
    generated_at: datetime
    share_token: str
    clients: list[PortfolioClient]
    totals: PortfolioTotals
    unassigned_monitors: int = 0
