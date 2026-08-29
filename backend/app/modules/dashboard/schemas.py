import uuid
from datetime import datetime

from pydantic import BaseModel


class DashboardSummaryResponse(BaseModel):
    active_dependencies_count: int
    open_incidents_count: int
    overall_uptime_percentage: float | None = None
    alerts_today_count: int


class LatencyPointResponse(BaseModel):
    timestamp: datetime
    region: str
    latency_ms: float
    dependency_id: uuid.UUID | None = None


class SLADegradationResponse(BaseModel):
    total_degradation_pct: float
    affected_services: int
    period: str


class DependencyHealthResponse(BaseModel):
    dependency_id: uuid.UUID
    name: str
    endpoint_url: str
    current_status: str
    uptime_percentage_24h: float | None = None
    avg_latency_ms_24h: float
    last_check_at: datetime | None = None
    total_checks_24h: int = 0
