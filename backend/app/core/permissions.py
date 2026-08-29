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
    PRO = "pro"
    ENTERPRISE = "enterprise"


# ── Canonical Plan Identifiers ──────────────────────────────────────────────
# The ONLY customer-facing plan identifiers. Use these everywhere in backend
# and frontend. Legacy names (starter/standard/professional/agency) must NOT
# leak into customer-facing pricing — they survive only inside the legacy
# adapter mapping below.
CANONICAL_PLANS: set[str] = {Plan.FREE.value, Plan.PRO.value, Plan.ENTERPRISE.value}

# Legacy -> canonical mapping, used ONLY for migration/backward compatibility.
# After the migration these names should not be stored anywhere.
LEGACY_PLAN_MAP: dict[str, str] = {
    "starter": Plan.PRO.value,
    "standard": Plan.PRO.value,
    "professional": Plan.PRO.value,
    "agency": Plan.ENTERPRISE.value,
}

# Display names (customer-facing).
PLAN_DISPLAY_NAMES: dict[str, str] = {
    Plan.FREE.value: "Free",
    Plan.PRO.value: "Pro",
    Plan.ENTERPRISE.value: "Enterprise",
}

# ── Pricing Tier Configuration (single source of truth) ─────────────────────
# All values below are the authoritative pricing contract. The frontend and
# the pricing endpoint derive everything from here. Do not duplicate these
# numbers elsewhere.

# Monthly prices in USD (used for Paystack amount calculation in minor units).
# Enterprise is custom pricing => represented as None so the UI never invents
# a number.
PLAN_PRICES_USD: dict[str, int] = {
    Plan.FREE.value: 0,
    Plan.PRO.value: 39,
    Plan.ENTERPRISE.value: 0,  # custom — not a real list price
}

# Annual prices in USD. Enterprise is custom => None.
PLAN_ANNUAL_PRICES_USD: dict[str, int | None] = {
    Plan.FREE.value: 0,
    Plan.PRO.value: 390,
    Plan.ENTERPRISE.value: None,  # custom pricing
}

# Billing availability: which plans can complete self-serve checkout.
PLAN_BILLING_AVAILABILITY: dict[str, str] = {
    Plan.FREE.value: "self_serve",
    Plan.PRO.value: "self_serve",
    Plan.ENTERPRISE.value: "contact_sales",
}

# Vendor (dependency) monitoring limits per plan. Enterprise is custom => None.
PLAN_DEPENDENCY_LIMITS: dict[str, int | None] = {
    Plan.FREE.value: 3,
    Plan.PRO.value: 50,
    Plan.ENTERPRISE.value: None,
}

# Team member (organization membership / seat) limits per plan.
# Enterprise is unlimited/custom => None.
PLAN_TEAM_LIMITS: dict[str, int | None] = {
    Plan.FREE.value: 1,
    Plan.PRO.value: 10,
    Plan.ENTERPRISE.value: None,
}

# Minimum check intervals in seconds per plan. Enterprise custom => None.
PLAN_CHECK_INTERVALS: dict[str, int | None] = {
    Plan.FREE.value: 60,   # 1-minute
    Plan.PRO.value: 15,    # 15-second
    Plan.ENTERPRISE.value: None,
}

# Data retention in days per plan. Enterprise custom => None.
PLAN_RETENTION_DAYS: dict[str, int | None] = {
    Plan.FREE.value: 1,             # 24-hour retention
    Plan.PRO.value: 90,
    Plan.ENTERPRISE.value: None,
}

# Plan feature flags — used by the public pricing endpoint and frontend.
PLAN_FEATURES: dict[str, dict] = {
    Plan.FREE.value: {
        "custom_endpoint_urls": True,
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
    Plan.PRO.value: {
        "custom_endpoint_urls": True,
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
    Plan.ENTERPRISE.value: {
        "custom_endpoint_urls": True,
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

# Display tags for the pricing page.
PLAN_TAGS: dict[str, str | None] = {
    Plan.FREE.value: None,
    Plan.PRO.value: "most_popular",
    Plan.ENTERPRISE.value: "contact_sales",
}

# Display descriptions for the pricing page.
PLAN_DESCRIPTIONS: dict[str, str] = {
    Plan.FREE.value: "For trying RELIASTRA.",
    Plan.PRO.value: "For growing SaaS teams and agencies.",
    Plan.ENTERPRISE.value: "For organizations requiring advanced controls, scale and custom requirements.",
}

# Self-serve checkout amounts, in minor units of PAYSTACK_CURRENCY (USD cents).
# ENTERPRISE is deliberately absent: it must route to Contact Sales. FREE is
# not self-serve (nothing to pay).
PLAN_AMOUNTS: dict[str, int] = {
    Plan.PRO.value: 3900,  # $39/mo
}

# Annual self-serve checkout amounts, in minor units of PAYSTACK_CURRENCY.
PLAN_ANNUAL_AMOUNTS: dict[str, int] = {
    Plan.PRO.value: 39000,  # $390/year
}


# ── 14-Day Full-Access Trial ──────────────────────────────────────────────
# Every new organization receives 14 days of full RELIASTRA capabilities
# (PRO limits). The trial is entirely DERIVED from the organization's
# created_at — it requires no migration, no flag, and no background job to be
# correct. It expires automatically: while created_at + 14 days > now the
# effective plan is PRO; afterwards the effective plan is whatever is stored.
# There is no separate "trial" plan.
#
# Effective entitlements are always:
#   stored_plan (org.plan)  ->  effective_plan (PRO during trial if free, else stored)

TRIAL_DAYS = 14
TRIAL_PLAN = Plan.PRO.value
# Aliases that match the spec's evaluation terminology.
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
    """True while the organization is inside its 14-day trial window.

    Derived purely from created_at. No flag, no migration.
    """
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


# ── Evaluation-aware helpers ─────────────────────────────────────────────────
# The evaluation lifecycle mirrors the 14-day trial. The authoritative window
# is derived from created_at; the stored evaluation_* columns (when present)
# are purely informational state kept for compatibility with older rows.

def _evaluation_window(org: object) -> datetime | None:
    """Authoritative trial expiry: created_at + TRIAL_DAYS, else stored expires_at."""
    created = getattr(org, "created_at", None)
    if isinstance(created, datetime):
        return _as_aware(created) + timedelta(days=TRIAL_DAYS)
    expires = getattr(org, "evaluation_expires_at", None)
    if isinstance(expires, datetime):
        return _as_aware(expires)
    return None


def _evaluation_started_at(org: object) -> datetime | None:
    started = getattr(org, "evaluation_started_at", None)
    if isinstance(started, datetime):
        return _as_aware(started)
    created = getattr(org, "created_at", None)
    if isinstance(created, datetime):
        return _as_aware(created)
    return None


def _org_stored_plan(org: object) -> str:
    raw_plan = getattr(org, "plan", None)
    plan = raw_plan.lower() if isinstance(raw_plan, str) else Plan.FREE.value
    return normalize_plan(plan)


def is_evaluation_active(org: object, now: datetime | None = None) -> bool:
    """True while the organization is inside its 14-day trial window.

    Evaluation is only applicable while the stored plan is Free. A paid plan
    is always authoritative — it never needs a trial overlay. Server time
    (now) is authoritative; client clocks are never trusted.
    """
    if org is None:
        return False
    if _org_stored_plan(org) != Plan.FREE.value:
        return False
    now = _as_aware(now or _utcnow())
    expires = _evaluation_window(org)
    if expires is None:
        return False
    started = _evaluation_started_at(org)
    if started is not None and now < started:
        return False
    return now < expires


def evaluation_days_remaining(org: object, now: datetime | None = None) -> int:
    """Whole days of evaluation left, rounded UP. 0 when expired or not applicable."""
    if org is None:
        return 0
    if not is_evaluation_active(org, now=now):
        return 0
    now_a = _as_aware(now or _utcnow())
    expires = _evaluation_window(org)
    if expires is None:
        return 0
    remaining = expires - now_a
    if remaining <= timedelta(0):
        return 0
    return int(-(-remaining.total_seconds() // 86_400))


def get_evaluation_status(org: object, now: datetime | None = None) -> str:
    """Canonical evaluation lifecycle value: active | expired | converted | none."""
    if org is None:
        return "none"
    plan = _org_stored_plan(org)
    if plan != Plan.FREE.value:
        return "converted"
    if _evaluation_window(org) is None and getattr(org, "created_at", None) is None:
        return "none"
    if is_evaluation_active(org, now=now):
        return "active"
    # The window existed and is now past => expired regardless of stored column.
    expires = _evaluation_window(org)
    started = _evaluation_started_at(org)
    if expires is not None and started is not None:
        now_a = _as_aware(now or _utcnow())
        if now_a >= expires:
            return "expired"
    stored = getattr(org, "evaluation_status", None)
    if isinstance(stored, str) and stored:
        return stored.lower()
    return "expired"


def get_effective_plan(org_plan: str, org_created_at: datetime | None) -> str:
    """The plan whose LIMITS apply right now (legacy signature).

    During the trial window a Free-tier organization operates with PRO limits
    so teams can evaluate the full product. Enforcement points MUST use this
    (or get_effective_plan_for_org) instead of the raw stored plan.
    """
    plan = normalize_plan(org_plan or Plan.FREE.value)
    if plan == Plan.FREE.value and is_trial_active(org_created_at):
        return TRIAL_PLAN
    return plan


def get_effective_plan_for_org(org: object) -> str:
    """Preferred entry point: derive the effective plan from an organization row."""
    if org is None:
        return Plan.FREE.value
    plan = _org_stored_plan(org)
    if plan == Plan.FREE.value and is_evaluation_active(org):
        return EVALUATION_PLAN
    return plan


def get_effective_entitlements(org: object) -> dict:
    """Centralized entitlement resolution.

    Returns the authoritative view that all feature gates should branch on:

        subscription_plan  (stored org.plan, normalized)
        evaluation_status  (active/expired/converted/none)
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
    plan = _org_stored_plan(org)
    effective = get_effective_plan_for_org(org)
    status = get_evaluation_status(org)
    active = status == "active"
    remaining = evaluation_days_remaining(org) if active else 0
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
        "evaluation_expires_at": _evaluation_window(org),
        "evaluation_used": evaluation_used,
    }


# ── Helper Functions ──────────────────────────────────────────────────────────


def normalize_plan(plan: str | None) -> str:
    """Map a plan string to its canonical identifier.

    Converts legacy names (starter/standard/professional/agency) to their
    canonical equivalents. Unknown/None values fall back to FREE.
    """
    if plan is None:
        return Plan.FREE.value
    value = plan.strip().lower()
    if value in CANONICAL_PLANS:
        return value
    return LEGACY_PLAN_MAP.get(value, Plan.FREE.value)


def is_valid_plan(plan: str) -> bool:
    """Check if a plan string is a valid CANONICAL plan value."""
    return plan.strip().lower() in CANONICAL_PLANS


def is_enterprise_plan(plan: str) -> bool:
    return normalize_plan(plan) == Plan.ENTERPRISE.value


def is_custom_plan(plan: str) -> bool:
    """True for plans that use custom/contact-sales pricing rather than a fixed price."""
    return is_enterprise_plan(plan)


def get_min_check_interval(plan: str) -> int | None:
    return PLAN_CHECK_INTERVALS.get(normalize_plan(plan), 60)


def get_dependency_limit(plan: str) -> int | None:
    return PLAN_DEPENDENCY_LIMITS.get(normalize_plan(plan), 3)


def get_team_limit(plan: str) -> int | None:
    return PLAN_TEAM_LIMITS.get(normalize_plan(plan), 1)


def get_plan_price_usd(plan: str) -> int:
    return PLAN_PRICES_USD.get(normalize_plan(plan), 0)


def get_plan_annual_price_usd(plan: str) -> int | None:
    return PLAN_ANNUAL_PRICES_USD.get(normalize_plan(plan), None)


def get_plan_display_name(plan: str) -> str:
    return PLAN_DISPLAY_NAMES.get(normalize_plan(plan), "Free")


def get_retention_days(plan: str) -> int | None:
    return PLAN_RETENTION_DAYS.get(normalize_plan(plan), 1)


def is_paid_plan(plan: str) -> bool:
    """Check if a plan requires payment and is available for self-serve checkout."""
    normalized = normalize_plan(plan)
    return normalized in PLAN_AMOUNTS


def get_plan_billing_availability(plan: str) -> str:
    return PLAN_BILLING_AVAILABILITY.get(normalize_plan(plan), "contact_sales")
