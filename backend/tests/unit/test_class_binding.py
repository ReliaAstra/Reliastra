"""Unit tests for EmailService.bind_class_variables.

Service-level with stubbed repositories (no DB): the provenance math itself
is covered by ``test_provenance_binding.py``. These tests pin the endpoint's
orchestration contract:

* unknown class -> 404, no ids -> 422, missing rows -> 404
* live records flow into variables; absent facts land in ``missing``
* classes with no record-backed fields return everything as missing
* nothing is ever invented: vendor/evidence gaps are reported, not filled
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

import app.modules.attribution.repository as att_r
import app.modules.checks.repository as chk_r
import app.modules.dependencies.repository as dep_r
import app.modules.evidence.repository as ev_r
import app.modules.incidents.repository as inc_r
from app.core.exceptions import ResourceNotFoundException, ValidationException
from app.modules.email_center.service import EmailService


def _incident(**over):
    base = {
        "id": uuid.uuid4(),
        "severity": "critical",
        "status": "open",
        "started_at": datetime(2026, 3, 11, 4, 12, 7, tzinfo=timezone.utc),
        "resolved_at": None,
        "updated_at": datetime(2026, 3, 11, 4, 41, 7, tzinfo=timezone.utc),
        "dependency_id": uuid.uuid4(),
        "evidence_report_id": None,
    }
    base.update(over)
    return SimpleNamespace(**base)


def _dependency(**over):
    base = {
        "id": uuid.uuid4(),
        "name": "Auth0 /api/v2/token",
        "endpoint_url": "https://meridian.auth0.com/oauth/token",
        "check_interval_seconds": 60,
    }
    base.update(over)
    return SimpleNamespace(**base)


def _attribution(**over):
    base = {
        "classification": "vendor_failure",
        "confidence_score": 92.0,
        "signal_breakdown": {
            "temporal": 1.0,
            "endpoint_overlap": 1.0,
            "latency_correlation": 0.9,
            "error_pattern": 0.8,
            "infrastructure_baseline": 1.0,
        },
        "methodology_version": "v1.1",
    }
    base.update(over)
    return SimpleNamespace(**base)


def _stub_all(monkeypatch, *, incident=None, dependency=None, attribution=None,
              evidence=None, count=30):
    async def _get_inc(db, i):
        return incident

    async def _get_dep(db, i):
        return dependency

    async def _get_att(db, i):
        return attribution

    async def _get_ev(db, i):
        return evidence

    async def _count(db, *a):
        return count

    monkeypatch.setattr(inc_r.IncidentRepository, "get_by_id", _get_inc)
    monkeypatch.setattr(dep_r.DependencyRepository, "get_by_id", _get_dep)
    monkeypatch.setattr(att_r.AttributionRepository, "get_by_incident", _get_att)
    monkeypatch.setattr(ev_r.EvidenceRepository, "get_by_id", _get_ev)
    monkeypatch.setattr(chk_r.CheckRepository, "count_for_dependency_window", _count)


async def test_unknown_class_is_404():
    svc = EmailService()
    with pytest.raises(ResourceNotFoundException):
        await svc.bind_class_variables(
            None, class_id="nope", incident_id=uuid.uuid4()
        )


async def test_neither_id_is_422():
    svc = EmailService()
    with pytest.raises(ValidationException):
        await svc.bind_class_variables(None, class_id="dependency_failure")


async def test_missing_incident_is_404(monkeypatch):
    _stub_all(monkeypatch, incident=None)
    svc = EmailService()
    with pytest.raises(ResourceNotFoundException):
        await svc.bind_class_variables(
            None, class_id="dependency_failure", incident_id=uuid.uuid4()
        )


async def test_incident_binds_live_values_and_reports_gaps(monkeypatch):
    inc = _incident()
    dep = _dependency()
    att = _attribution()
    _stub_all(monkeypatch, incident=inc, dependency=dep, attribution=att,
              evidence=None)
    svc = EmailService()
    out = await svc.bind_class_variables(
        None, class_id="dependency_failure", incident_id=inc.id
    )
    assert out["class_id"] == "dependency_failure"
    assert out["bound_from"] == {"incident_id": str(inc.id)}
    v = out["variables"]
    # Live values, formatted the way the template prints them.
    assert v["dependency_name"] == "Auth0 /api/v2/token"
    assert v["endpoint"] == "https://meridian.auth0.com/oauth/token"
    assert v["confidence_score"] == "92.00"
    assert v["classification"] == "vendor_failure"
    assert v["state_word"] == "Failed"
    assert v["window_start"] == "2026-03-11 04:12:07 UTC"
    assert v["observation_count"] == "30"
    assert v["latency_correlation_score"] == "0.9000"
    assert v["infrastructure_baseline_score"] == "1.0000"
    assert v["interval_seconds"] == "60"
    # Nothing held is invented: no vendor column, no evidence row.
    assert "vendor_name" in out["missing"]
    assert "document_checksum" in out["missing"]
    assert "verification_url" in out["missing"]
    # Operator-authored fields are reported, not filled.
    assert "recipient_name" in out["missing"]
    assert "organisation_name" in out["missing"]


async def test_evidence_only_path(monkeypatch):
    ev = SimpleNamespace(
        id=uuid.uuid4(),
        incident_id=uuid.uuid4(),
        file_path="/var/evidence/RS-EV-9F2C41A7.pdf",
        file_size_bytes=486_219,
        checksum="a" * 64,
        data_hash="b" * 64,
        methodology_version="v1.0",
        signed=True,
        signature_alg="Ed25519",
        verification_url="https://reliastra.com/evidence/verify/9f2c41a7",
        verification_id="EV-9F2C41A7",
        generated_at=datetime(2026, 3, 11, 4, 44, 19, tzinfo=timezone.utc),
        expires_at=None,
    )
    _stub_all(monkeypatch, incident=None, evidence=ev)
    svc = EmailService()
    out = await svc.bind_class_variables(
        None, class_id="evidence_delivery", evidence_id=ev.id
    )
    v = out["variables"]
    assert v["report_id"] == str(ev.id)
    assert v["document_checksum"] == "a" * 64
    assert v["file_size_bytes"] == "486219"
    assert v["signed"] == "true"
    # file_name is derived deterministically from the stored path.
    assert out["bound_from"] == {"evidence_id": str(ev.id)}


async def test_manual_class_returns_all_required_missing(monkeypatch):
    inc = _incident()
    _stub_all(monkeypatch, incident=inc, dependency=_dependency(),
              attribution=_attribution())
    svc = EmailService()
    out = await svc.bind_class_variables(
        None, class_id="billing", incident_id=inc.id
    )
    assert out["variables"] == {}
    assert set(out["missing"]) == set(
        __import__(
            "app.modules.email_center.compiled", fromlist=["load_catalogue"]
        ).load_catalogue().by_id("billing").required_variables
    )
