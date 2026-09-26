"""Data-quality scan: unit tests for the pure logic and service decisions.

The identity checks are pure functions over vendor rows (fully specified
records, the _vendor_record pattern). The dead-target and stale decisions
are tested against an in-memory repository, mirroring the aggregate rows
the real SQL returns.
"""

import uuid
from collections import namedtuple
from datetime import datetime, timedelta, timezone

import pytest

from app.modules.data_quality.service import (
    DataQualityRepository,
    DataQualityService,
    identity_findings,
    url_problem,
)
from app.modules.vendors.models import VendorEndpoint, VendorTracking

# Anchor to the real clock: the scan compares against the wall clock, so
# relative offsets must start from it to stay deterministic in meaning.
NOW = datetime.now(timezone.utc).replace(microsecond=0)


def vendor_record(**overrides) -> VendorTracking:
    """A fully specified vendor row (SanativeConvert-safe construction)."""
    row = {
        "id": uuid.uuid4(),
        "vendor_name": "stripe",
        "display_name": "Stripe",
        "endpoint_url": "https://api.stripe.com/v1/charges",
        "category": "payments",
        "is_public": True,
        "last_check_at": NOW - timedelta(minutes=5),
        "official_name": "Stripe, Inc.",
        "description": "Payments infrastructure",
        "website_url": "https://stripe.com",
        "documentation_url": "https://docs.stripe.com",
        "status_page_url": "https://status.stripe.com",
        "logo_url": "https://stripe.com/logo.svg",
        "country": "US",
        "tags": ["payments"],
        "created_at": NOW - timedelta(days=30),
        "updated_at": NOW,
    }
    row.update(overrides)
    return VendorTracking(**row)


def endpoint_record(**overrides) -> VendorEndpoint:
    row = {
        "id": uuid.uuid4(),
        "vendor_id": uuid.uuid4(),
        "endpoint_url": "https://api.stripe.com/v1/charges",
        "check_interval_seconds": 300,
        "regions": ["us-east"],
        "is_active": True,
        "next_check_at": None,
        "health_status": "operational",
        "last_check_at": NOW - timedelta(minutes=5),
        "created_at": NOW - timedelta(days=30),
        "updated_at": NOW,
    }
    row.update(overrides)
    return VendorEndpoint(**row)


class TestUrlProblem:
    def test_https_url_is_clean(self):
        assert url_problem("https://stripe.com/x") is None

    def test_http_scheme_is_parseable(self):
        # http is parseable; the endpoint-specific https rule is separate.
        assert url_problem("http://stripe.com") is None

    def test_bad_scheme(self):
        assert url_problem("ftp://stripe.com") == "scheme_not_http"
        assert url_problem("stripe.com") == "scheme_not_http"

    def test_missing_host(self):
        assert url_problem("https://") == "missing_host"

    def test_unparseable(self):
        assert url_problem("http://[::z") == "unparseable_url"


class TestIdentityFindings:
    def test_clean_vendor_has_no_findings(self):
        assert identity_findings(vendor_record()) == []

    def test_malformed_link_is_flagged(self):
        v = vendor_record(status_page_url="not a url")
        found = identity_findings(v)
        assert len(found) == 1
        assert found[0].field == "status_page_url"
        assert found[0].problem == "scheme_not_http"

    def test_each_link_field_checked(self):
        v = vendor_record(
            website_url="https://ok.com",
            documentation_url="javascript:alert(1)",
            logo_url="https://",
        )
        problems = {f.field: f.problem for f in identity_findings(v)}
        assert problems == {
            "documentation_url": "scheme_not_http",
            "logo_url": "missing_host",
        }

    def test_http_probe_target_flagged(self):
        v = vendor_record(endpoint_url="http://api.stripe.com/v1/charges")
        found = identity_findings(v)
        assert [f.problem for f in found] == ["probe_target_not_https"]

    def test_empty_display_name_flagged(self):
        v = vendor_record(display_name="   ")
        found = identity_findings(v)
        assert [f.problem for f in found] == ["empty_display_name"]

    def test_unknown_category_flagged(self):
        v = vendor_record(category="not_a_category")
        found = identity_findings(v)
        assert [f.problem for f in found] == ["category_not_in_taxonomy"]

    def test_absent_optional_links_are_not_flagged(self):
        v = vendor_record(
            website_url=None,
            documentation_url=None,
            status_page_url=None,
            logo_url=None,
        )
        assert identity_findings(v) == []


# Unpacks positionally exactly like the real aggregate SQL row.
_StatRow = namedtuple("_StatRow", ["endpoint_id", "endpoint_url", "vendor_name", "attempts", "successes", "last_attempt_at"])


def _Row(endpoint_id, url, vendor, attempts, successes, last):
    return _StatRow(endpoint_id, url, vendor, attempts, successes, last)


class StubRepo(DataQualityRepository):
    """In-memory stand-in returning prebuilt aggregates."""

    def __init__(self, *, stats=(), stale=(), vendors=(), dead_vendors=()):
        self._stats = stats
        self._stale = stale
        self._vendors = vendors
        self._dead_vendors = dead_vendors

    async def endpoint_attempt_stats(self, session, window_start):
        return self._stats

    async def stale_endpoints(self, session):
        return self._stale

    async def public_vendors(self, session):
        return self._vendors

    async def public_vendors_without_active_endpoints(self, session):
        return self._dead_vendors


@pytest.mark.asyncio
class TestScan:
    async def test_dead_target_requires_min_attempts_and_zero_successes(self):
        dead = _Row(uuid.uuid4(), "https://d.com", "deadco", 12, 0, NOW)
        healthy = _Row(uuid.uuid4(), "https://h.com", "healthco", 12, 12, NOW)
        quiet = _Row(uuid.uuid4(), "https://q.com", "quietco", 3, 0, NOW)
        svc = DataQualityService(
            repository=StubRepo(stats=[dead, healthy, quiet])
        )
        report = await svc.scan(None, min_attempts=10)
        assert [f.vendor_name for f in report.dead_targets] == ["deadco"]
        assert report.dead_targets[0].attempt_count == 12
        assert report.dead_targets[0].window_days == 30

    async def test_never_checked_after_grace(self):
        endpoint = endpoint_record(
            last_check_at=None, created_at=NOW - timedelta(hours=30)
        )
        fresh = endpoint_record(
            last_check_at=None, created_at=NOW - timedelta(hours=2)
        )
        svc = DataQualityService(
            repository=StubRepo(stale=[(endpoint, "oldco"), (fresh, "newco")])
        )
        report = await svc.scan(None)
        reasons = [(f.vendor_name, f.reason) for f in report.stale_registry]
        assert ("oldco", "never_checked") in reasons
        assert all(v != "newco" for v, _ in reasons)

    async def test_overdue_by_interval_multiple(self):
        interval = 300
        endpoint = endpoint_record(
            last_check_at=NOW - timedelta(seconds=interval * 4),
            check_interval_seconds=interval,
        )
        ontime = endpoint_record(
            last_check_at=NOW - timedelta(seconds=interval),
            check_interval_seconds=interval,
        )
        svc = DataQualityService(
            repository=StubRepo(stale=[(endpoint, "latenco"), (ontime, "promptco")])
        )
        report = await svc.scan(None)
        lateness = {(f.vendor_name, f.reason) for f in report.stale_registry}
        assert ("latenco", "check_overdue") in lateness
        assert all(v != "promptco" for v, _ in lateness)
        overdue = next(f for f in report.stale_registry if f.reason == "check_overdue")
        assert "exceeds 3x the configured interval" in overdue.detail

    async def test_vendor_without_active_endpoints(self):
        svc = DataQualityService(repository=StubRepo(dead_vendors=["ghostco"]))
        report = await svc.scan(None)
        ghost = [f for f in report.stale_registry if f.vendor_name == "ghostco"]
        assert len(ghost) == 1
        assert ghost[0].reason == "no_active_endpoints"
        assert ghost[0].endpoint_id is None

    async def test_identity_findings_flow_into_report(self):
        svc = DataQualityService(
            repository=StubRepo(vendors=[vendor_record(category="bogus")])
        )
        report = await svc.scan(None)
        assert [f.problem for f in report.broken_identity] == [
            "category_not_in_taxonomy"
        ]

    async def test_report_is_fully_typed(self):
        svc = DataQualityService(repository=StubRepo())
        report = await svc.scan(None)
        assert report.generator == "reliastra-data-quality/1.0"
        assert report.finding_count == 0
        assert report.window_days == 30
        assert report.min_attempts == 10
