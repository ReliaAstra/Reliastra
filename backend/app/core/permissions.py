from datetime import datetime, timedelta, timezone
from enum import Enum

from app.core.exceptions import ForbiddenException


class Role(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


ROLE_HIERARCHY: dict[str, int] = {
    Role.OWNER.value: 40,
    Role.ADMIN.value: 30,
    Role.MEMBER.value: 20,
    Role.VIEWER.value: 10,
}


def get_role_level(role: str) -> int:
    return ROLE_HIERARCHY.get(role.lower(), 0)


def has_permission(user_role: str, required_role: str) -> bool:
    """
    Check if user_role satisfies required_role based on hierarchy:
    owner > admin > member > viewer.
    """
    return get_role_level(user_role) >= get_role_level(required_role)


def require_permission(user_role: str, required_role: str) -> None:
    if not has_permission(user_role, required_role):
        raise ForbiddenException(
            f"Action requires at least '{required_role}' role, but user has '{user_role}' role."
        )


class Plan(str, Enum):
    FREE = "free"
    STARTER = "starter"
    STANDARD = "standard"
    PROFESSIONAL = "professional"
    AGENCY = "agency"


# ── Pricing Tier Configuration (matches pricing page) ────────────────────────
# All values are sourced from the official Reliastra pricing page.

# Monthly prices in USD (used for Paystack amount calculation in kobo)
PLAN_PRICES_USD: dict[str, int] = {
    Plan.FREE.value: 0,
    Plan.STARTER.value: 19,
    Plan.STANDARD.value: 49,
    Plan.PROFESSIONAL.value: 99,
    Plan.AGENCY.value: 199,
}

# Vendor (dependency) monitoring limits per plan
PLAN_DEPENDENCY_LIMITS: dict[str, int] = {
    Plan.FREE.value: 3,
    Plan.STARTER.value: 10,
    Plan.STANDARD.value: 30,
    Plan.PROFESSIONAL.value: 100,
    Plan.AGENCY.value: 500,
}

# Team member (organization membership) limits per plan
PLAN_TEAM_LIMITS: dict[str, int] = {
    Plan.FREE.value: 1,
    Plan.STARTER.value: 3,
    Plan.STANDARD.value: 5,
    Plan.PROFESSIONAL.value: 10,
    Plan.AGENCY.value: 25,
}

# Minimum check intervals in seconds per plan
PLAN_CHECK_INTERVALS: dict[str, int] = {
    Plan.FREE.value: 60,           # 1-minute
    Plan.STARTER.value: 60,        # 1-minute
    Plan.STANDARD.value: 15,       # 15-second
    Plan.PROFESSIONAL.value: 5,    # 5-second
    Plan.AGENCY.value: 5,          # 5-second
}

# Data retention in days per plan
PLAN_RETENTION_DAYS: dict[str, int] = {
    Plan.FREE.value: 1,             # 24-hour retention
    Plan.STARTER.value: 7,
    Plan.STANDARD.value: 30,
    Plan.PROFESSIONAL.value: 90,
    Plan.AGENCY.value: 90,
}

# Plan feature flags — used by the public pricing endpoint and frontend
PLAN_FEATURES: dict[str, dict] = {
    Plan.FREE.value: {
        "custom_endpoint_urls": True,
        "data_retention_days": 1,
        "email_alerts": True,
        "basic_incident_detection": True,
        "slack_alerts": False,
        "api_access": False,
        "attribution": False,
        "evidence_generation": False,
        "historical_analysis": False,
        "custom_branded_evidence": False,
        "client_groups_isolation": False,
        "client_facing_reports": False,
        "agency_branding": False,
    },
    Plan.STARTER.value: {
        "custom_endpoint_urls": True,
        "data_retention_days": 7,
        "email_alerts": True,
        "basic_incident_detection": True,
        "slack_alerts": False,
        "api_access": False,
        "attribution": "limited",
        "evidence_generation": False,
        "historical_analysis": True,
        "custom_branded_evidence": False,
        "client_groups_isolation": False,
        "client_facing_reports": False,
        "agency_branding": False,
    },
    Plan.STANDARD.value: {
        "custom_endpoint_urls": True,
        "data_retention_days": 30,
        "email_alerts": True,
        "basic_incident_detection": True,
        "slack_alerts": True,
        "api_access": True,
        "attribution": "deterministic",
        "evidence_generation": True,
        "historical_analysis": True,
        "custom_branded_evidence": False,
        "client_groups_isolation": False,
        "client_facing_reports": False,
        "agency_branding": False,
    },
    Plan.PROFESSIONAL.value: {
        "custom_endpoint_urls": True,
        "data_retention_days": 90,
        "email_alerts": True,
        "basic_incident_detection": True,
        "slack_alerts": True,
        "api_access": True,
        "attribution": "deterministic",
        "evidence_generation": True,
        "historical_analysis": True,
        "custom_branded_evidence": True,
        "client_groups_isolation": False,
        "client_facing_reports": False,
        "agency_branding": False,
    },
    Plan.AGENCY.value: {
        "custom_endpoint_urls": True,
        "data_retention_days": 90,
        "email_alerts": True,
        "basic_incident_detection": True,
        "slack_alerts": True,
        "api_access": True,
        "attribution": "deterministic",
        "evidence_generation": True,
        "historical_analysis": True,
        "custom_branded_evidence": True,
        "client_groups_isolation": True,
        "client_facing_reports": True,
        "agency_branding": True,
    },
}

# Display tags for the pricing page
PLAN_TAGS: dict[str, str | None] = {
    Plan.FREE.value: None,
    Plan.STARTER.value: None,
    Plan.STANDARD.value: "most_popular",
    Plan.PROFESSIONAL.value: None,
    Plan.AGENCY.value: "built_for_agencies",
}

# Display descriptions for the pricing page
PLAN_DESCRIPTIONS: dict[str, str] = {
    Plan.FREE.value: "Start measuring your dependencies.",
    Plan.STARTER.value: "Track more of your stack.",
    Plan.STANDARD.value: "Investigate and prove dependency failures.",
    Plan.PROFESSIONAL.value: "Operate dependency intelligence at team scale.",
    Plan.AGENCY.value: "Manage reliability across your entire client portfolio.",
}

# Backward-compatible alias
PLAN_AMOUNTS = PLAN_PRICES_USD


# ── 14-Day Full-Access Evaluation ──────────────────────────────────────────
# Every new organization receives 14 days of full RELIASTRA capabilities.
# The evaluation is a first-class server-side entitlement state stored on the
# organization (evaluation_* columns). Legacy rows that predate the migration
# still derive eligibility from created_at so expiry is correct without a
# background job ever running. New rows use the explicit window.
#
# Effective entitlements are always:
#   subscription_plan (org.plan) + evaluation_status -> effective_plan
# The entitlement layer itself evaluates expiry using server time; scheduled
# jobs are only for notifications and optional state sync.

TRIAL_DAYS = 14
TRIAL_PLAN = Plan.PROFESSIONAL.value
# Aliases that match the spec's evaluation terminology exactly.
EVALUATION_DAYS = TRIAL_DAYS
EVALUATION_PLAN = TRIAL_PLAN


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(value: datetime) -> datetime:
    """Treat naive timestamps as UTC (Postgres tz-aware columns pass through)."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def is_trial_active(org_created_at: datetime | None, now: datetime | None = None) -> bool:
    """True while the organization is inside its 14-day trial window."""
    if org_created_at is None:
        return False
    now = _as_aware(now or _utcnow())
    created = _as_aware(org_created_at)
    return now < created + timedelta(days=TRIAL_DAYS)


def trial_days_remaining(org_created_at: datetime | None, now: datetime | None = None) -> int:
    """Whole days of trial left, rounded UP (the final partial day counts).

    Returns 0 once expired or when no timestamp is available.
    """
    if org_created_at is None:
        return 0
    now = _as_aware(now or _utcnow())
    created = _as_aware(org_created_at)
    remaining = (created + timedelta(days=TRIAL_DAYS)) - now
    if remaining <= timedelta(0):
        return 0
    return int(-(-remaining.total_seconds() // 86_400))


# ── Evaluation-aware helpers (preferred for all new code) ──────────────────

def _evaluation_expires_at(org: object) -> datetime | None:
    """Resolve the authoritative expiry timestamp for an organization."""
    expires = getattr(org, "evaluation_expires_at", None)
    if isinstance(expires, datetime):
        return _as_aware(expires)
    # Non-datetime values (None, MagicMock, string) fall back to legacy
    created = getattr(org, "created_at", None)
    if isinstance(created, datetime):
        return _as_aware(created) + timedelta(days=TRIAL_DAYS)
    return None


def _evaluation_started_at(org: object) -> datetime | None:
    started = getattr(org, "evaluation_started_at", None)
    if isinstance(started, datetime):
        return _as_aware(started)
    created = getattr(org, "created_at", None)
    if isinstance(created, datetime):
        return _as_aware(created)
    return None


def is_evaluation_active(org: object, now: datetime | None = None) -> bool:
    """True while the organization is inside its 14-day evaluation window.

    Evaluation is only applicable while the stored plan is Free. A paid plan
    is always authoritative — it never needs an evaluation overlay. Paid orgs
    return False even if their window has not technically elapsed.
    Server time (now) is used; client clocks are never trusted.
    """
    if org is None:
        return False
    raw_plan = getattr(org, "plan", None)
    plan = raw_plan.lower() if isinstance(raw_plan, str) else Plan.FREE.value
    if plan != Plan.FREE.value:
        return False
    # If the row explicitly marks itself converted/expired, honour that, but
    # the timestamp is the real authority — an expired window is expired even
    # if the status column lags behind a failed background job.
    now = _as_aware(now or _utcnow())
    expires = _evaluation_expires_at(org)
    if expires is None:
        return False
    # If evaluation was never started (should not happen), treat as not active.
    started = _evaluation_started_at(org)
    if started is not None and now < started:
        return False
    return now < expires


def evaluation_days_remaining(org: object, now: datetime | None = None) -> int:
    """Whole days of evaluation left, rounded UP. 0 when expired or not applicable."""
    if org is None:
        return 0
    if not is_evaluation_active(org, now=now):
        # Active check already enforces free-plan; if not active we return 0
        # whether the window is expired or the org is already paid.
        # For UX we still want to know how many days would remain if it were
        # still active — but spec says evaluation schedule is server-side, so 0
        # once the window is past is correct.
        # Distinguish "paid, no evaluation needed" vs "expired": both 0.
        expires = _evaluation_expires_at(org)
        if expires is None:
            return 0
        now_a = _as_aware(now or _utcnow())
        remaining = expires - now_a
        if remaining <= timedelta(0):
            return 0
        # If the org is paid, we still return 0 rather than a misleading countdown.
        raw_plan = getattr(org, "plan", None)
        plan = raw_plan.lower() if isinstance(raw_plan, str) else Plan.FREE.value
        if plan != Plan.FREE.value:
            return 0
        return int(-(-remaining.total_seconds() // 86_400))
    now_a = _as_aware(now or _utcnow())
    expires = _evaluation_expires_at(org)  # type: ignore[assignment]
    remaining = expires - now_a  # type: ignore[operator]
    if remaining <= timedelta(0):
        return 0
    return int(-(-remaining.total_seconds() // 86_400))


def get_evaluation_status(org: object, now: datetime | None = None) -> str:
    """Canonical evaluation lifecycle value: active | expired | converted | none."""
    if org is None:
        return "none"
    raw_plan = getattr(org, "plan", None)
    plan = raw_plan.lower() if isinstance(raw_plan, str) else Plan.FREE.value
    if plan != Plan.FREE.value:
        return "converted"
    # If the org never had an evaluation (no timestamps), treat as none.
    if _evaluation_expires_at(org) is None and getattr(org, "created_at", None) is None:
        return "none"
    if is_evaluation_active(org, now=now):
        return "active"
    # If the window existed and is now past, it's expired regardless of the
    # stored column. This keeps authorization correct even if a job missed.
    expires = _evaluation_expires_at(org)
    started = _evaluation_started_at(org)
    if expires is not None and started is not None:
        now_a = _as_aware(now or _utcnow())
        if now_a >= expires:
            return "expired"
    # Fallback to stored column if present.
    stored = getattr(org, "evaluation_status", None)
    if isinstance(stored, str) and stored:
        return stored.lower()
    return "expired"


def get_effective_plan(org_plan: str, org_created_at: datetime | None) -> str:
    """The plan whose LIMITS apply right now (legacy signature).

    During the evaluation window a Free-tier organization operates with
    Professional limits so teams can evaluate the full product. Enforcement
    points MUST use this (or get_effective_plan_for_org) instead of the raw
    stored plan.
    """
    plan = (org_plan or Plan.FREE.value).lower()
    if not is_valid_plan(plan):
        plan = Plan.FREE.value
    if plan == Plan.FREE.value and is_trial_active(org_created_at):
        return TRIAL_PLAN
    return plan


def get_effective_plan_for_org(org: object) -> str:
    """Preferred entry point: derive the effective plan from an organization row."""
    if org is None:
        return Plan.FREE.value
    raw_plan = getattr(org, "plan", None)
    plan = raw_plan.lower() if isinstance(raw_plan, str) else Plan.FREE.value
    if not is_valid_plan(plan):
        plan = Plan.FREE.value
    if plan == Plan.FREE.value and is_evaluation_active(org):
        return EVALUATION_PLAN
    return plan


def get_effective_entitlements(org: object) -> dict:
    """Centralized entitlement resolution.

    Returns the authoritative view that all feature gates should branch on:

        subscription_plan  (stored org.plan)
        evaluation_status  (active/expired/converted)
        effective_plan     (plan whose limits apply now)
        effective_features (PLAN_FEATURES[effective_plan])
        evaluation fields  (started/expires/remaining/days)
    """
    if org is None:
        plan = Plan.FREE.value
        effective = Plan.FREE.value
        status = "none"
        remaining = 0
        features = PLAN_FEATURES[Plan.FREE.value]
        return {
            "subscription_plan": plan,
            "evaluation_status": status,
            "effective_plan": effective,
            "effective_features": features,
            "is_evaluation_active": False,
            "evaluation_days_remaining": 0,
            "evaluation_started_at": None,
            "evaluation_expires_at": None,
            "evaluation_used": False,
        }
    raw_plan = getattr(org, "plan", None)
    plan = raw_plan.lower() if isinstance(raw_plan, str) else Plan.FREE.value
    if not is_valid_plan(plan):
        plan = Plan.FREE.value
    effective = get_effective_plan_for_org(org)
    status = get_evaluation_status(org)
    active = status == "active"
    remaining = evaluation_days_remaining(org) if active else 0
    # evaluation_used may be MagicMock in legacy unit tests
    raw_used = getattr(org, "evaluation_used", False)
    evaluation_used = bool(raw_used) if isinstance(raw_used, bool) else False
    return {
            "subscription_plan": plan,
            "evaluation_status": status,
            "effective_plan": effective,
            "effective_features": PLAN_FEATURES.get(effective, PLAN_FEATURES[Plan.FREE.value]),
            "is_evaluation_active": active,
            "evaluation_days_remaining": remaining,
            "evaluation_started_at": _evaluation_started_at(org),
            "evaluation_expires_at": _evaluation_expires_at(org),
            "evaluation_used": evaluation_used,
        }


# ── Helper Functions ──────────────────────────────────────────────────────────


def get_min_check_interval(plan: str) -> int:
    return PLAN_CHECK_INTERVALS.get(plan.lower(), 60)


def get_dependency_limit(plan: str) -> int:
    return PLAN_DEPENDENCY_LIMITS.get(plan.lower(), 3)


def get_team_limit(plan: str) -> int:
    return PLAN_TEAM_LIMITS.get(plan.lower(), 1)


def get_plan_price_usd(plan: str) -> int:
    return PLAN_PRICES_USD.get(plan.lower(), 0)


def get_retention_days(plan: str) -> int:
    return PLAN_RETENTION_DAYS.get(plan.lower(), 1)


def is_valid_plan(plan: str) -> bool:
    """Check if a plan string is a valid plan value."""
    return plan.lower() in {p.value for p in Plan}


def is_paid_plan(plan: str) -> bool:
    """Check if a plan requires payment."""
    return get_plan_price_usd(plan) > 0
