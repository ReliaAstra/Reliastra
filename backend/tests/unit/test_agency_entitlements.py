"""Developer-first commercial contract: one plan, no B2B wedge, $9 SSOT.

The product no longer has an agency wedge (client groups / client-facing
reports / white-label branding). The B2B surfaces are unmounted in stage 1
of a two-stage removal: module code and tables are preserved, but no plan
grants their entitlements and no router exposes their endpoints.

Covers, without a database:

* ``PLAN_FEATURES`` carries no agency/white-label keys for any plan, and
  ``plan_allows_feature`` therefore refuses them in every state (trial,
  Developer, expired, legacy enterprise);
* the 14-day trial grants the Developer (``pro``) capability set and expires
  back to the grace state;
* the unmounted B2B routers are absent from the public API schema
  (agencies, partner portal, badges, vendor submissions, growth, org status
  pages, referral leaderboard/claim);
* the Developer price is $9/mo from the single source of truth through the
  transparency triple, with no annual billing anywhere;
* no pending-price copy survives in backend or frontend sources.
"""

from __future__ import annotations

import types
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.core.permissions import (
    PLAN_AMOUNTS,
    PLAN_ANNUAL_AMOUNTS,
    PLAN_ANNUAL_PRICES_USD,
    PLAN_FEATURES,
    PLAN_PRICES_USD,
    Plan,
    get_effective_entitlements,
    plan_allows_feature,
)

#: Feature keys that belonged to the removed B2B product. Any plan carrying
#: any of these is a regression.
AGENCY_FEATURE_KEYS = (
    "client_groups_isolation",
    "client_facing_reports",
    "agency_branding",
    "custom_branded_evidence",
)


def _org(*, plan: str, created_at: datetime | None = None, **extra):
    now = datetime.now(timezone.utc)
    return types.SimpleNamespace(
        id=uuid.uuid4(),
        name="Dev Org",
        plan=plan,
        created_at=created_at if created_at is not None else now,
        evaluation_started_at=None,
        evaluation_expires_at=None,
        evaluation_status=None,
        evaluation_used=False,
        **extra,
    )


# ── the entitlement table ────────────────────────────────────────────────────


def test_agency_wedge_is_gone_from_every_plan():
    for plan_id, features in PLAN_FEATURES.items():
        for key in AGENCY_FEATURE_KEYS:
            assert key not in features, (
                f"plan '{plan_id}' still grants B2B feature '{key}'"
            )


def test_b2b_features_refused_in_every_org_state():
    trial = _org(plan=Plan.FREE.value, created_at=datetime.now(timezone.utc))
    developer = _org(plan=Plan.PRO.value)
    expired = _org(
        plan=Plan.FREE.value,
        created_at=datetime.now(timezone.utc) - timedelta(days=15),
    )
    legacy = _org(
        plan=Plan.ENTERPRISE.value,
        created_at=datetime.now(timezone.utc) - timedelta(days=90),
    )
    for org in (trial, developer, expired, legacy):
        for key in AGENCY_FEATURE_KEYS:
            assert plan_allows_feature(org, key) is False


def test_trial_grants_developer_capabilities_and_expires():
    trial = _org(plan=Plan.FREE.value, created_at=datetime.now(timezone.utc))
    entitlements = get_effective_entitlements(trial)
    assert entitlements["effective_plan"] == Plan.PRO.value
    assert entitlements["effective_features"]["evidence_generation"] is True
    assert entitlements["effective_features"]["api_access"] is True

    expired = _org(
        plan=Plan.FREE.value,
        created_at=datetime.now(timezone.utc) - timedelta(days=15),
    )
    assert get_effective_entitlements(expired)["effective_plan"] == Plan.FREE.value
    assert plan_allows_feature(expired, "evidence_generation") is False


# ── the unmounted surfaces ───────────────────────────────────────────────────


def _public_paths() -> set[str]:
    from app.main import app

    return set(app.openapi()["paths"].keys())


def test_agency_surface_is_unmounted():
    paths = _public_paths()
    for prefix in ("/v1/clients", "/v1/agency", "/v1/status-page"):
        assert not any(p.startswith(prefix) for p in paths), (
            f"B2B surface '{prefix}' is exposed again"
        )


def test_partner_surface_is_unmounted_except_creator_link_resolution():
    paths = _public_paths()
    portal_paths = {p for p in paths if "/partner" in p or p.startswith("/v1/referrals")}
    assert portal_paths == {"/v1/referrals/my-referral"}
    # The one kept partner-surface endpoint: creator link resolution.
    assert "/v1/public/referral/{referral_code}" in paths


def test_growth_badge_submission_and_leaderboard_surfaces_are_unmounted():
    paths = _public_paths()
    for fragment in (
        "/v1/vendors/badge-embed-code",
        "/v1/vendor-submissions",
        "/v1/growth",
        "/v1/referrals/leaderboard",
        "/v1/referrals/claim-reward",
        "/v1/public/analytics",
    ):
        assert not any(p.startswith(fragment) for p in paths), (
            f"B2B surface '{fragment}' is exposed again"
        )


# ── the price SSOT ───────────────────────────────────────────────────────────


def test_developer_price_is_9_everywhere():
    assert PLAN_PRICES_USD[Plan.PRO.value] == 9
    assert PLAN_ANNUAL_PRICES_USD[Plan.PRO.value] is None
    assert PLAN_AMOUNTS[Plan.PRO.value] == 900
    assert PLAN_ANNUAL_AMOUNTS == {}
    from app.core.commercial_terms import terms_acceptance_label

    assert "$9" in terms_acceptance_label()
    assert "$39" not in terms_acceptance_label()
    from app.core.payment_pricing import ANNUAL, MONTHLY, transparency_lines

    lines = transparency_lines("pro", MONTHLY, rate=1322.0)
    assert lines["product_price"] == "$9.00 (USD)"
    assert lines["actual_charge"] == "\u20a611,898.00 (NGN)"
    annual = transparency_lines("pro", ANNUAL, rate=1322.0)
    assert annual["product_price"] is None
    assert annual["actual_charge"] is None


def test_no_pending_price_state_in_backend_sources():
    """Production always shows the calculated price - never a pending state."""
    root = Path(__file__).resolve().parents[2] / "app"
    banned = (
        "Pending price confirmation",
        "being finalized",
        "To be confirmed",
        "Confirmed at checkout",
    )
    hits = []
    for path in sorted(root.rglob("*.py")):
        text = path.read_text(encoding="utf-8")
        for token in banned:
            if token in text:
                hits.append(f"{path.relative_to(root)}: {token!r}")
    assert not hits, f"pending-price copy survives in: {hits}"


def test_no_pending_price_state_in_frontend_sources():
    root = (
        Path(__file__).resolve().parents[3] / "frontend" / "src"
    )
    if not root.exists():
        pytest.skip("frontend sources not present")
    banned = (
        "Pending price confirmation",
        "To be confirmed",
        "Confirmed at checkout",
        "Price unavailable",
    )
    hits = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in {".ts", ".tsx"}:
            continue
        # Agency fixture names are content, not pricing states.
        if "__tests__" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        for token in banned:
            if token in text:
                hits.append(f"{path.relative_to(root)}: {token!r}")
    assert not hits, f"pending-price copy survives in: {hits}"
