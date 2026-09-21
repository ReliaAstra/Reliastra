"""The public incident channel's window is a published-URL lifetime.

Every incident `GET /v1/vendors/{name}/incidents/public` returns has a public
web page at `/observatory/{vendor}/incidents/{id}`, is linked from the vendor
record and is listed in `sitemap.xml`. The window therefore decides how long a
published, indexed URL keeps resolving.

It used to be a hard-coded 90 days while the web app described these records as
permanent, so a cited URL started returning 404 three months after publication
- on a schedule nobody had chosen, and with no way to see it from the
configuration. These tests pin the window to the setting, and the setting to
the evidence retention the public docs claim.
"""

import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy.sql import Select

from app.config import settings
from app.modules.evidence_gate.service import EvidenceGateService

APP = Path(__file__).resolve().parents[2] / "app"


class _StubPublicReport:
    def __init__(self, incident_id: uuid.UUID) -> None:
        self.incident_id = incident_id
        self.custom_title = None
        self.custom_summary = None
        self.report_token = "token"


class _StubReportRepository:
    def __init__(self, reports: list[_StubPublicReport]) -> None:
        self._reports = reports

    async def list_public_for_vendor(self, session, vendor_name):  # noqa: ANN001
        return self._reports


class _StubScalarResult:
    def scalars(self) -> "_StubScalarResult":
        return self

    def all(self) -> list:
        return []


class _StubSession:
    """Captures the statement instead of executing it."""

    def __init__(self) -> None:
        self.statements: list[Select] = []

    async def execute(self, statement):  # noqa: ANN001
        self.statements.append(statement)
        return _StubScalarResult()


def _cutoff_from(statement: Select) -> datetime:
    """The bound datetime the query filters `started_at` against."""
    compiled = statement.compile()
    stamps = [v for v in compiled.params.values() if isinstance(v, datetime)]
    assert len(stamps) == 1, f"expected exactly one bound timestamp, got {stamps}"
    return stamps[0]


@pytest.mark.asyncio
async def test_public_incidents_are_windowed_by_the_setting(monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_INCIDENT_WINDOW_DAYS", 365)
    session = _StubSession()
    service = EvidenceGateService(
        public_report_repo=_StubReportRepository([_StubPublicReport(uuid.uuid4())])
    )

    await service.list_public_incidents(session, "openai")

    assert session.statements, "the service never queried incidents"
    cutoff = _cutoff_from(session.statements[0])
    expected = datetime.now(timezone.utc) - timedelta(days=365)
    assert abs(cutoff - expected) < timedelta(minutes=5)


@pytest.mark.asyncio
async def test_the_window_follows_the_setting(monkeypatch):
    """Proves the value is read from configuration, not baked into the query."""
    monkeypatch.setattr(settings, "PUBLIC_INCIDENT_WINDOW_DAYS", 30)
    session = _StubSession()
    service = EvidenceGateService(
        public_report_repo=_StubReportRepository([_StubPublicReport(uuid.uuid4())])
    )

    await service.list_public_incidents(session, "openai")

    cutoff = _cutoff_from(session.statements[0])
    expected = datetime.now(timezone.utc) - timedelta(days=30)
    assert abs(cutoff - expected) < timedelta(minutes=5)


@pytest.mark.asyncio
async def test_a_vendor_with_no_published_reports_is_not_queried():
    """No reports means no incidents; the absence is not an error."""
    session = _StubSession()
    service = EvidenceGateService(public_report_repo=_StubReportRepository([]))

    assert await service.list_public_incidents(session, "openai") == []
    assert session.statements == []


def test_no_hard_coded_window_survives_in_the_service():
    """The 90-day literal is what made published URLs expire by accident."""
    source = (APP / "modules" / "evidence_gate" / "service.py").read_text()
    assert "timedelta(days=90)" not in source
    assert "PUBLIC_INCIDENT_WINDOW_DAYS" in source


def test_the_default_matches_the_retention_the_docs_publish():
    """`llms.txt` and the evidence artifact both state 365 days of retention.

    A public incident window shorter than the retention it indexes would
    withdraw a record whose artifact is still published and still verifiable.
    """
    config_source = (APP / "config.py").read_text()
    match = re.search(
        r"PUBLIC_INCIDENT_WINDOW_DAYS: int = Field\(\s*default=(\d+)", config_source
    )
    assert match, "PUBLIC_INCIDENT_WINDOW_DAYS is not declared as a Field with a default"
    configured_default = int(match.group(1))

    expiry = re.search(
        r"DEFAULT_EVIDENCE_EXPIRY_DAYS: int = (\d+)",
        (APP / "modules" / "evidence" / "constants.py").read_text(),
    )
    assert expiry, "the evidence expiry constant moved; update this test"

    assert configured_default == settings.PUBLIC_INCIDENT_WINDOW_DAYS
    assert configured_default >= int(expiry.group(1))
