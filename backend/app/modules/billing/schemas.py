import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class PlanDetailsResponse(BaseModel):
    org_id: uuid.UUID
    plan: str
    # Effective plan = the plan whose limits currently apply (Professional
    # while a Free organization is inside its 14-day evaluation).
    effective_plan: str
    is_trial_active: bool = False
    trial_days_remaining: int = 0
    trial_length_days: int
    # Evaluation is the canonical name (trial is the legacy alias). Both are
    # returned so older frontends keep working while new ones can use the
    # evaluation terminology the spec requires.
    is_evaluation_active: bool = False
    evaluation_status: str = "none"
    evaluation_started_at: datetime | None = None
    evaluation_expires_at: datetime | None = None
    evaluation_days_remaining: int = 0
    evaluation_used: bool = False
    # Convenience: effective limits derived from the effective plan
    max_dependencies: int
    max_team_members: int = 1
    min_check_interval_seconds: int
    data_retention_days: int = 1
    # Feature snapshot for the effective plan (mirrors PLAN_FEATURES)
    effective_features: dict | None = None
    # Fallback UX: actual consequences of expiry (real account data)
    fallback_info: dict | None = None
    subscription_status: str | None = None
    current_period_end: datetime | None = None
    price_usd: int = 0


class PaystackWebhookPayload(BaseModel):
    event: str
    data: dict[str, Any]


class PaystackWebhookResponse(BaseModel):
    received: bool
    event_type: str


class InitializePaymentRequest(BaseModel):
    plan: str = Field(min_length=1, max_length=50)
    email: EmailStr | None = None


class InitializePaymentResponse(BaseModel):
    authorization_url: str
    reference: str
    access_code: str


class VerifyTransactionResponse(BaseModel):
    verified: bool
    plan: str
    reference: str
