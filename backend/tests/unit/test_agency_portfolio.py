"""Behavioral tests for the Agency client SLA portfolio (no DB required).

Runs against stubbed repositories so it works anywhere pytest does; CI runs
it alongside the pgserver-backed suites without change.
"""

import types
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.modules.agencies.schemas import PortfolioClient
from app.modules.agencies.service import AgencyService


class Row:
    def __init__(self, *values):
        self._v = values

    def __iter__(self):
        return iter(self._v)


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def __iter__(self):
        return iter(self._rows)

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None

    def scalars(self):
        class _S:
            def __init__(self, rows):
                self._r = rows

            def all(self_inner):
                return self._r

        return _S(self._rows)


def make_org():
    org = types.SimpleNamespace(
        id=uuid.uuid4(),
        name="Acme Agency",
        plan="agency",
        created_at=datetime.now(timezone.utc),
        has_agency_mode=True,
    )
    return org


def make_client(name):
    return types.SimpleNamespace(
        id=uuid.uuid4(), name=name, description=None, org_id=uuid.uuid4()
    )


def make_app(client_id):
    return types.SimpleNamespace(
        id=uuid.uuid4(), client_id=client_id, org_id=uuid.uuid4()
    )


def configure_stubs(
    monkeypatch, clients, apps, dep_rows, dep_counts, incidents, last_inc, org
):
    """Wire AgencyRepository statics + session.execute + bulk stats."""
    svc = AgencyService()

    class StubRepo:
        async def list_clients(self, s, org_id):
            return clients

        async def list_applications_for_org(self, s, org_id):
            return apps

        async def dependency_counts_by_application(self, s, org_id):
            return dep_counts

        async def open_incidents_by_client(self, s, org_id):
            return incidents

        async def latest_incident_at_by_client(self, s, org_id):
            return last_inc

        async def get_by_id(self, s, oid):  # not used by get_portfolio
            return None

    monkeypatch.setattr(svc, "repository", StubRepo())

    class FakeSession:
        def __init__(self_inner, org):
            self_inner._org = org
            self_inner._calls = 0

        async def execute(self_inner, query):
            # First call is OrganizationRepository.get_by_id (scalar), then
            # the active-dependency select (row tuples).
            self_inner._calls += 1
            if self_inner._calls == 1:
                return FakeResult([self_inner._org])
            return FakeResult([(d, a) for d, a in dep_rows])

    monkeypatch.setattr(
        "app.modules.checks.repository.CheckRepository.get_aggregated_stats_bulk",
        _make_bulk(dep_rows),
    )
    return svc, FakeSession(org)


def _make_bulk(dep_rows):
    async def bulk(session, dependency_ids, window_hours=24):
        out = {}
        for i, dep_id in enumerate(dependency_ids):
            uptime = 100.0 if i % 3 else 97.5  # every third dep is degraded-ish
            out[dep_id] = {
                "uptime_percentage": uptime,
                "avg_latency_ms": 120.0,
                "total_checks": 10,
                "total_up": int(uptime / 10),
                "total_down": 0,
            }
        return out

    return staticmethod(bulk)


def test_portfolio_rollup_math(monkeypatch):
    now = datetime.now(timezone.utc)
    c1, c2 = make_client("Northwind"), make_client("Helios")
    a1, a2, a3 = make_app(c1.id), make_app(c1.id), make_app(c2.id)
    dep_rows = [
        (uuid.uuid4(), a1.id),  # c1 via a1 -> uptime 97.5 (degraded bucket)
        (uuid.uuid4(), a2.id),  # c1 via a2 -> 100
        (uuid.uuid4(), a3.id),  # c2 via a3 -> 100
        (uuid.uuid4(), None),  # unassigned
    ]
    incidents = {a3.id: {"critical": 1}}
    last_inc = {a3.id: now - timedelta(hours=2)}

    org = make_org()
    svc, session = configure_stubs(
        monkeypatch,
        clients=[c1, c2],
        apps=[a1, a2, a3],
        dep_rows=dep_rows,
        dep_counts={a1.id: 1, a2.id: 1, a3.id: 1},
        incidents=incidents,
        last_inc=last_inc,
        org=org,
    )

    import asyncio

    resp = asyncio.run(svc.get_portfolio(session, org.id))

    assert resp.org_name == "Acme Agency"
    assert resp.unassigned_monitors == 1
    assert resp.totals.clients == 2
    assert resp.totals.dependencies == 3
    assert resp.totals.open_incidents == 1
    assert resp.totals.clients_needing_attention == 2  # c1 degraded uptime, c2 critical

    north = next(c for c in resp.clients if c.name == "Northwind")
    helios = next(c for c in resp.clients if c.name == "Helios")

    # c1 mean uptime across its two deps: (97.5 + 100)/2 = 98.75 -> degraded
    assert abs(north.uptime_24h - 98.75) < 0.01
    assert north.status == "degraded"
    assert north.dependency_count == 2
    assert north.application_count == 2

    # c2 has one critical open incident -> critical wins over operational uptime
    assert helios.critical_incidents == 1
    assert helios.status == "critical"
    assert helios.last_incident_at is not None
    assert resp.share_token.count(".") == 1


def test_status_precedence():
    assert AgencyService._rollup_status(99.99, 0, 0) == "operational"
    assert AgencyService._rollup_status(98.5, 0, 0) == "degraded"
    assert AgencyService._rollup_status(100.0, 2, 0) == "degraded"
    assert AgencyService._rollup_status(100.0, 5, 1) == "critical"


def test_share_token_roundtrip_and_tamper(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(
        settings,
        "SECRET_KEY",
        "ci-test-secret-key-that-is-at-least-thirty-two-chars-long",
    )
    oid = uuid.uuid4()
    token = AgencyService.portfolio_share_token(oid)
    assert AgencyService.verify_portfolio_share_token(token) == oid

    bad = token[:-1] + ("0" if token[-1] != "0" else "1")
    with pytest.raises(Exception) as exc:
        AgencyService.verify_portfolio_share_token(bad)
    assert "invalid" in str(exc.value)

    with pytest.raises(Exception):
        AgencyService.verify_portfolio_share_token("not-a-token")


def test_portfolio_client_schema_defaults():
    pc = PortfolioClient(id=uuid.uuid4(), name="X")
    assert pc.status == "operational"
    assert pc.open_incidents == 0 and pc.critical_incidents == 0
    assert pc.last_incident_at is None
