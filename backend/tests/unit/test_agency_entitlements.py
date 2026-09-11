"""Pro agency wedge: entitlements, trial access, backend authorization, $39 SSOT.

The agency wedge (client groups / isolation, client-facing incident and
evidence reports, sharing those reports with clients) is a Pro capability -
which means the 14-day trial carries it too, via the effective plan. Only
white-label branding (and the other pre-existing Enterprise-only flags) stay
behind Enterprise.

Covers, without a database:

* ``PLAN_FEATURES`` grants the wedge to Pro and keeps branding Enterprise-only;
* trial orgs (Free stored plan inside the evaluation window) are entitled,
  expired-trial orgs are not;
* ``AgencyService`` refuses every operation for unentitled orgs (403) and
  serves Pro / trial / Enterprise orgs;
* the public portfolio share link renders invalid (404) when the owning org
  loses the entitlement;
* the Pro price is $39/mo - $390/yr from the single source of truth through
  the transparency triple;
* no pending-price copy survives in backend or frontend sources.
"""

from __future__ import annotations

import types
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from app.core.exceptions import ForbiddenException, ResourceNotFoundException
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
from app.modules.agencies import router as agencies_router
from app.modules.agencies.service import AgencyService


def _org(*, plan: str, created_at: datetime | None = None, **extra):
    now = datetime.now(timezone.utc)
    return types.SimpleNamespace(
        id=uuid.uuid4(),
        name="Wedge Org",
        plan=plan,
        created_at=created_at if created_at is not None else now,
        has_agency_mode=False,
        evaluation_started_at=None,
        evaluation_expires_at=None,
        evaluation_status=None,
        evaluation_used=False,
        **extra,
    )


def _trial_org():
    return _org(plan=Plan.FREE.value, created_at=datetime.now(timezone.utc))


def _expired_org():
    return _org(
        plan=Plan.FREE.value,
        created_at=datetime.now(timezone.utc) - timedelta(days=15),
    )


# ── the entitlement table ────────────────────────────────────────────────────


def test_pro_plan_includes_the_agency_wedge():
    pro = PLAN_FEATURES[Plan.PRO.value]
    assert pro["client_groups_isolation"] is True
    assert pro["client_facing_reports"] is True
    # Evidence generation is what makes the reports exist; Pro already had it.
    assert pro["evidence_generation"] is True


def test_white_label_stays_enterprise_only():
    pro = PLAN_FEATURES[Plan.PRO.value]
    assert pro["agency_branding"] is False
    assert pro["custom_branded_evidence"] is False
    enterprise = PLAN_FEATURES[Plan.ENTERPRISE.value]
    assert enterprise["agency_branding"] is True
    assert enterprise["custom_branded_evidence"] is True
    assert enterprise["client_groups_isolation"] is True
    assert enterprise["client_facing_reports"] is True


def test_trial_org_is_entitled_to_the_wedge():
    org = _trial_org()
    assert plan_allows_feature(org, "client_groups_isolation") is True
    assert plan_allows_feature(org, "client_facing_reports") is True
    entitlements = get_effective_entitlements(org)
    assert entitlements["effective_plan"] == Plan.PRO.value
    assert entitlements["effective_features"]["client_groups_isolation"] is True


def test_expired_trial_loses_the_wedge():
    org = _expired_org()
    assert plan_allows_feature(org, "client_groups_isolation") is False
    assert plan_allows_feature(org, "client_facing_reports") is False
    assert get_effective_entitlements(org)["effective_plan"] == Plan.FREE.value


def test_stored_pro_and_enterprise_are_entitled_without_a_trial():
    old_pro = _org(
        plan=Plan.PRO.value,
        created_at=datetime.now(timezone.utc) - timedelta(days=90),
    )
    assert plan_allows_feature(old_pro, "client_groups_isolation") is True
    assert plan_allows_feature(old_pro, "client_facing_reports") is True
    old_ent = _org(
        plan=Plan.ENTERPRISE.value,
        created_at=datetime.now(timezone.utc) - timedelta(days=90),
    )
    assert plan_allows_feature(old_ent, "client_groups_isolation") is True
    assert plan_allows_feature(old_ent, "client_facing_reports") is True


# ── service-level enforcement ────────────────────────────────────────────────


def _service_with_org(monkeypatch, org, **repo_stubs):
    """An AgencyService whose org lookup returns ``org`` and whose repository
    answers from ``repo_stubs`` (no database)."""
    service = AgencyService()

    async def _require_org(session, org_id):
        assert org_id == org.id
        return org

    monkeypatch.setattr(service, "_require_org", _require_org)

    class StubRepo:
        async def list_clients(self, session, org_id):
            return repo_stubs.get("clients", [])

        async def list_applications(self, session, org_id, client_id):
            return repo_stubs.get("applications", [])

        async def get_client(self, session, client_id):
            return repo_stubs.get("client")

    monkeypatch.setattr(service, "repository", StubRepo())
    return service


@pytest.mark.asyncio
async def test_list_clients_refuses_free_expired_orgs(monkeypatch):
    org = _expired_org()
    service = _service_with_org(monkeypatch, org)
    with pytest.raises(ForbiddenException, match="Client environments"):
        await service.list_clients(AsyncMock(), org.id)


@pytest.mark.asyncio
async def test_list_clients_serves_pro_and_trial_orgs(monkeypatch):
    for org in (
        _org(plan=Plan.PRO.value),
        _trial_org(),
        _org(plan=Plan.ENTERPRISE.value),
    ):
        service = _service_with_org(monkeypatch, org)
        rows = await service.list_clients(AsyncMock(), org.id)
        assert rows == []


@pytest.mark.asyncio
async def test_application_reads_require_the_wedge(monkeypatch):
    client_id = uuid.uuid4()
    free = _expired_org()
    service = _service_with_org(
        monkeypatch, free, client=types.SimpleNamespace(org_id=free.id)
    )
    with pytest.raises(ForbiddenException):
        await service.list_applications(AsyncMock(), free.id, client_id)

    pro = _org(plan=Plan.PRO.value)
    service = _service_with_org(
        monkeypatch, pro, client=types.SimpleNamespace(org_id=pro.id)
    )
    rows = await service.list_applications(AsyncMock(), pro.id, client_id)
    assert rows == []


@pytest.mark.asyncio
async def test_create_client_requires_the_wedge(monkeypatch):
    from app.modules.agencies.schemas import ClientCreateRequest
    from app.modules.organizations.repository import OrganizationRepository

    async def _noop_update(session, org, **kwargs):
        return org

    monkeypatch.setattr(OrganizationRepository, "update", _noop_update)

    free = _expired_org()
    service = AgencyService()

    async def _require_free(session, org_id):
        return free

    monkeypatch.setattr(service, "_require_org", _require_free)
    with pytest.raises(ForbiddenException):
        await service.create_client(
            AsyncMock(), free.id, ClientCreateRequest(name="Acme")
        )

    pro = _org(plan=Plan.PRO.value)

    async def _require_pro(session, org_id):
        return pro

    client_row = types.SimpleNamespace(
        id=uuid.uuid4(),
        org_id=pro.id,
        name="Acme",
        description=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    class CreateRepo:
        async def create_client(self, session, org_id, name, description):
            return client_row

    monkeypatch.setattr(service, "_require_org", _require_pro)
    monkeypatch.setattr(service, "repository", CreateRepo())
    created = await service.create_client(
        AsyncMock(), pro.id, ClientCreateRequest(name="Acme")
    )
    assert created.id == client_row.id


@pytest.mark.asyncio
async def test_portfolio_requires_client_facing_reports(monkeypatch):
    service = AgencyService()

    async def _require_free(session, org_id):
        return _expired_org()

    monkeypatch.setattr(service, "_require_org", _require_free)
    with pytest.raises(ForbiddenException, match="Client-facing reports"):
        await service.get_portfolio(AsyncMock(), uuid.uuid4())


@pytest.mark.asyncio
async def test_public_share_link_is_invalid_without_entitlement(monkeypatch):
    """A lapsed plan must not leak the client list through an old link."""
    from app.modules.agencies import service as agencies_service_module

    async def _forbidden(session, org_id):
        raise ForbiddenException("nope")

    monkeypatch.setattr(
        agencies_service_module.agency_service, "get_portfolio", _forbidden
    )
    monkeypatch.setattr(
        agencies_router, "enforce_rate_limit", AsyncMock(return_value=None)
    )
    token = AgencyService.portfolio_share_token(uuid.uuid4())
    with pytest.raises(ResourceNotFoundException, match="Report link is invalid"):
        await agencies_router.get_public_agency_portfolio(
            token, request=AsyncMock(), db=AsyncMock()
        )


# ── the $39 single source of truth ───────────────────────────────────────────


def test_pro_price_is_39_everywhere():
    assert PLAN_PRICES_USD[Plan.PRO.value] == 39
    assert PLAN_ANNUAL_PRICES_USD[Plan.PRO.value] == 390
    assert PLAN_AMOUNTS[Plan.PRO.value] == 3900
    assert PLAN_ANNUAL_AMOUNTS[Plan.PRO.value] == 39000
    from app.core.commercial_terms import terms_acceptance_label

    assert "$39" in terms_acceptance_label()
    assert "$19" not in terms_acceptance_label()
    from app.core.payment_pricing import MONTHLY, transparency_lines

    lines = transparency_lines("pro", MONTHLY, rate=1322.0)
    assert lines["product_price"] == "$39.00 (USD)"
    assert lines["actual_charge"] == "\u20a651,558.00 (NGN)"


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
