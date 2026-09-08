import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class CheckResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    dependency_id: uuid.UUID
    org_id: uuid.UUID
    region: str
    executed_at: datetime
    latency_ms: float
    status_code: int | None = None
    is_up: bool
    error_message: str | None = None
    quorum_confirmed: bool


class CheckResultCreateDTO(BaseModel):
    dependency_id: uuid.UUID
    org_id: uuid.UUID
    region: str
    latency_ms: float
    status_code: int | None = None
    is_up: bool
    error_message: str | None = None
    quorum_confirmed: bool = False


# ── Diagnostics & manual trigger ────────────────────────────────────────────


class ManualCheckRequest(BaseModel):
    """Ask for one immediate probe of a dependency.

    A diagnostic, not a second scheduler: it publishes the same task Beat
    publishes. ``region`` defaults to every region configured on the
    dependency.
    """

    dependency_id: uuid.UUID
    region: str | None = None


class QueuedCheck(BaseModel):
    region: str
    task_id: str
    state: str | None = None


class ManualCheckResponse(BaseModel):
    dependency_id: uuid.UUID
    queued: list[QueuedCheck]
    regions: list[str]
    note: str


class SignalHealth(BaseModel):
    """One liveness signal (scheduler or worker)."""

    status: str
    last_heartbeat: str | None = None
    age_seconds: float | None = None
    interval_seconds: float
    stale_after_seconds: int


class BrokerHealth(BaseModel):
    status: str
    queue: str
    queue_depth: int | None = None


class CheckPipelineConfig(BaseModel):
    check_schedule_seconds: float
    heartbeat_ttl_seconds: int
    scheduler: str
    task: str


class CheckPipelineHealth(BaseModel):
    """Pipeline-level health: is the check system capable of probing at all?"""

    status: str
    scheduler: SignalHealth
    worker: SignalHealth
    broker: BrokerHealth
    config: CheckPipelineConfig


class LastCheckResultSummary(BaseModel):
    executed_at: datetime
    region: str
    is_up: bool
    latency_ms: float
    status_code: int | None = None
    error_message: str | None = None


class DispatchFailureSummary(BaseModel):
    dependency_id: str
    region: str
    reason: str
    detail: str
    at: str
    next_check_at_advanced: bool = False


class PipelineMarker(BaseModel):
    region: str
    at: str


class PipelineStatusSummary(BaseModel):
    status: str
    scheduler: str
    worker: str
    broker: str


class CheckStateResponse(BaseModel):
    """Where one dependency is in the check pipeline.

    ``is_target_problem`` / ``is_infrastructure_problem`` are the headline:
    they answer "is the vendor down, or did RELIASTRA never get a probe out?"
    without the caller having to know the state machine.
    """

    dependency_id: uuid.UUID
    state: str
    detail: str
    is_target_problem: bool
    is_infrastructure_problem: bool
    is_active: bool
    next_check_at: str | None = None
    is_due: bool
    check_interval_seconds: int
    regions: list[str]
    is_stale: bool = False
    last_success_at: datetime | None = None
    last_failure_at: datetime | None = None
    last_result: LastCheckResultSummary | None = None
    last_dispatch_failure: DispatchFailureSummary | None = None
    queued: PipelineMarker | None = None
    executing: PipelineMarker | None = None
    pipeline: PipelineStatusSummary
