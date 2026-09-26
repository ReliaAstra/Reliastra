"""Digest generation service: unit tests with a stubbed incident reader.

The service's own logic is what is under test: window collection ordering,
content-hash idempotency, append-only versioning when content changes, and
the generate_pending accounting. The canonical detail objects are real
schema instances; the incident reader is a stub. The database-level
constraint set is covered by the integration suite.
"""

import json
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from app.modules.digest import service as digest_service_module
from app.modules.digest.models import (
    KIND_INCIDENT_SOCIAL,
    KIND_WEEKLY_DIGEST,
    DigestDraft,
)
from app.modules.digest.service import (
    OUTCOME_CURRENT,
    OUTCOME_DRAFTED,
    DigestDraftRepository,
    DigestDraftService,
    week_window,
    window_bounds,
)
from app.modules.incidents.public_schemas import PublicIncidentDetailResponse

SITE = "https://reliastra.com"
W1_START = date(2026, 9, 21)
W1_END = date(2026, 9, 27)


def detail(started: datetime, *, status: str = "resolved") -> PublicIncidentDetailResponse:
    return PublicIncidentDetailResponse(
        incident_id=uuid.uuid4(),
        vendor_name="stripe",
        vendor_display_name="Stripe",
        category="payments",
        target_name="api.stripe.com",
        endpoint_url="https://api.stripe.com/v1/charges",
        region="us-east",
        status=status,
        severity="major",
        failure_kind="http_5xx",
        started_at=started,
        detected_at=started + timedelta(minutes=10),
        resolved_at=started + timedelta(hours=1) if status == "resolved" else None,
        duration_seconds=3600.0 if status == "resolved" else None,
        observation_count=12,
        failure_count=6,
        methodology_version="v1.0",
        attribution_status="observed",
        status_codes=[503],
        first_observation_id=str(uuid.uuid4()),
        last_observation_id=str(uuid.uuid4()),
        detection_rule="consecutive_failures",
        detection_metadata={},
        description=None,
        evidence=None,
    )


class _Row:
    def __init__(self, incident_id):
        self.id = incident_id


class _Vendor:
    pass


@pytest.fixture
def svc(monkeypatch):
    """A service with a stubbed canonical reader and an in-memory repo.

    ``window_details`` is the live list the stubbed search returns; tests
    mutate it between generations to simulate records changing. The repo is
    a plain list: creation appends, lookups scan - enough to exercise
    idempotency and versioning without a database.
    """
    window_details: list = []

    async def _search(session, **kwargs):
        return [(_Row(d.incident_id), _Vendor()) for d in window_details]

    stub = type("StubService", (), {})()
    stub.repository = type("StubRepo", (), {"search": staticmethod(_search)})()
    stub._to_detail = staticmethod(
        lambda incident, vendor: next(
            d for d in window_details if d.incident_id == incident.id
        )
    )
    monkeypatch.setattr(digest_service_module, "public_incident_service", stub)

    async def _get_detail(session, incident_id):
        return next(d for d in window_details if d.incident_id == incident_id)

    stub.get_detail = _get_detail

    rows: list[DigestDraft] = []

    class MemRepo(DigestDraftRepository):
        async def find_content(self, session, kind, period_key, content_hash):
            for r in rows:
                if (
                    r.kind == kind
                    and r.period_key == period_key
                    and r.content_hash == content_hash
                ):
                    return r
            return None

        async def create(self, session, **kwargs):
            row = DigestDraft(id=uuid.uuid4(), **kwargs)
            rows.append(row)
            return row

    return DigestDraftService(repository=MemRepo()), rows, window_details


class TestWindowHelpers:
    def test_week_window_monday_to_sunday(self):
        assert week_window(date(2026, 9, 23)) == (W1_START, W1_END)

    def test_window_bounds_are_utc_half_open(self):
        start, end = window_bounds(W1_START, W1_END)
        assert start == datetime(2026, 9, 21, 0, 0, tzinfo=timezone.utc)
        assert end == datetime(2026, 9, 28, 0, 0, tzinfo=timezone.utc)


class TestWeeklyGeneration:
    async def test_first_generation_drafts(self, svc):
        service, rows, _ = svc
        draft, outcome = await service.generate_weekly_digest(
            None, W1_START, W1_END, site_url=SITE
        )
        assert outcome == OUTCOME_DRAFTED
        assert draft.kind == KIND_WEEKLY_DIGEST
        assert draft.status == "draft"
        assert draft.period_key == "2026-W39"
        assert len(rows) == 1

    async def test_regenerating_same_content_is_current(self, svc):
        service, _, _ = svc
        first, outcome1 = await service.generate_weekly_digest(
            None, W1_START, W1_END, site_url=SITE
        )
        second, outcome2 = await service.generate_weekly_digest(
            None, W1_START, W1_END, site_url=SITE
        )
        assert outcome1 == OUTCOME_DRAFTED
        assert outcome2 == OUTCOME_CURRENT
        assert first.id == second.id

    async def test_changed_content_creates_a_new_draft_row(self, svc):
        service, _, window_details = svc
        first, _ = await service.generate_weekly_digest(
            None, W1_START, W1_END, site_url=SITE
        )
        # A second incident appears in the same window: content changes.
        window_details.append(detail(datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc)))
        second, outcome = await service.generate_weekly_digest(
            None, W1_START, W1_END, site_url=SITE
        )
        assert outcome == OUTCOME_DRAFTED
        assert second.id != first.id
        # The window went from zero incidents to one.
        assert "1 confirmed incident," in second.subject

    async def test_details_render_oldest_first(self, svc):
        service, _, window_details = svc
        late = detail(datetime(2026, 9, 25, 10, 0, tzinfo=timezone.utc))
        early = detail(datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc))
        window_details.extend([late, early])
        draft, _ = await service.generate_weekly_digest(
            None, W1_START, W1_END, site_url=SITE
        )
        assert draft.incident_ids == [str(early.incident_id), str(late.incident_id)]
        body = draft.text_body
        assert body.index("2026-09-22T10:00:00+00:00") < body.index(
            "2026-09-25T10:00:00+00:00"
        )


class TestSocialGeneration:
    async def test_social_draft_per_incident(self, svc):
        service, _, window_details = svc
        d = detail(datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc))
        window_details.append(d)
        draft, outcome = await service.generate_incident_social(
            None, d.incident_id, site_url=SITE
        )
        assert outcome == OUTCOME_DRAFTED
        assert draft.kind == KIND_INCIDENT_SOCIAL
        assert draft.period_key == str(d.incident_id)
        assert draft.subject is None
        assert draft.html_body is None
        assert draft.incident_ids == [str(d.incident_id)]
        assert draft.vendor_slugs == ["stripe"]
        assert draft.methodology_version == "v1.0"

    async def test_social_idempotent_for_same_content(self, svc):
        service, _, window_details = svc
        d = detail(datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc))
        window_details.append(d)
        first, outcome1 = await service.generate_incident_social(
            None, d.incident_id, site_url=SITE
        )
        second, outcome2 = await service.generate_incident_social(
            None, d.incident_id, site_url=SITE
        )
        assert outcome1 == OUTCOME_DRAFTED
        assert outcome2 == OUTCOME_CURRENT
        assert first.id == second.id

    async def test_social_versions_when_status_changes(self, svc):
        # The incident resolved after its "open" social draft was reviewed:
        # the next generation appends a NEW draft row for the new content.
        service, rows, window_details = svc
        started = datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc)
        open_d = detail(started, status="open")
        window_details.append(open_d)
        first, _ = await service.generate_incident_social(
            None, open_d.incident_id, site_url=SITE
        )
        assert "Status: open." in first.text_body

        window_details.remove(open_d)
        resolved_d = detail(started, status="resolved")
        resolved_d.incident_id = open_d.incident_id  # same incident, new state
        window_details.append(resolved_d)
        second, outcome = await service.generate_incident_social(
            None, open_d.incident_id, site_url=SITE
        )
        assert outcome == OUTCOME_DRAFTED
        assert second.id != first.id
        assert "Status: resolved." in second.text_body
        # Both drafts remain: append-only review history.
        assert len(rows) == 2


class TestGeneratePending:
    async def test_covers_weekly_and_missing_socials(self, svc):
        service, _, window_details = svc
        window_details.extend(
            [
                detail(datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc)),
                detail(datetime(2026, 9, 24, 8, 0, tzinfo=timezone.utc), status="open"),
            ]
        )
        counts = await service.generate_pending(None, W1_START, W1_END, site_url=SITE)
        assert counts == {
            f"{KIND_WEEKLY_DIGEST}_{OUTCOME_DRAFTED}": 1,
            f"{KIND_INCIDENT_SOCIAL}_{OUTCOME_DRAFTED}": 2,
        }

    async def test_second_run_is_all_current(self, svc):
        service, _, window_details = svc
        window_details.append(detail(datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc)))
        await service.generate_pending(None, W1_START, W1_END, site_url=SITE)
        counts = await service.generate_pending(None, W1_START, W1_END, site_url=SITE)
        assert counts == {
            f"{KIND_WEEKLY_DIGEST}_{OUTCOME_DRAFTED}": 0,
            f"{KIND_INCIDENT_SOCIAL}_{OUTCOME_DRAFTED}": 0,
        }

    async def test_content_change_in_window_redrafts_only_what_changed(self, svc):
        service, _, window_details = svc
        d = detail(datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc), status="open")
        window_details.append(d)
        await service.generate_pending(None, W1_START, W1_END, site_url=SITE)

        # The incident resolves; the weekly digest and its social draft both
        # change, so the next run drafts new versions of exactly those two.
        window_details.remove(d)
        resolved = detail(d.started_at, status="resolved")
        resolved.incident_id = d.incident_id
        window_details.append(resolved)
        counts = await service.generate_pending(None, W1_START, W1_END, site_url=SITE)
        assert counts == {
            f"{KIND_WEEKLY_DIGEST}_{OUTCOME_DRAFTED}": 1,
            f"{KIND_INCIDENT_SOCIAL}_{OUTCOME_DRAFTED}": 1,
        }

    async def test_empty_window_still_drafts_the_newsletter(self, svc):
        service, rows, _ = svc
        counts = await service.generate_pending(None, W1_START, W1_END, site_url=SITE)
        # The explicit "no confirmed incidents" issue is content: drafted
        # once, then current.
        assert counts[f"{KIND_WEEKLY_DIGEST}_{OUTCOME_DRAFTED}"] == 1
        assert counts[f"{KIND_INCIDENT_SOCIAL}_{OUTCOME_DRAFTED}"] == 0
        counts2 = await service.generate_pending(None, W1_START, W1_END, site_url=SITE)
        assert counts2[f"{KIND_WEEKLY_DIGEST}_{OUTCOME_DRAFTED}"] == 0
        assert len(rows) == 1


class TestOutboxHandler:
    async def test_handler_drafts_for_the_events_incident(self, svc, monkeypatch):
        service, rows, window_details = svc
        monkeypatch.setattr(digest_service_module, "digest_draft_service", service)
        d = detail(datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc))
        window_details.append(d)

        from app.modules.digest.service import handle_social_draft_requested

        await handle_social_draft_requested(
            None, json.dumps({"incident_id": str(d.incident_id)})
        )
        assert len(rows) == 1
        assert rows[0].kind == KIND_INCIDENT_SOCIAL
        assert rows[0].period_key == str(d.incident_id)

    async def test_handler_redelivery_is_a_noop(self, svc, monkeypatch):
        service, rows, window_details = svc
        monkeypatch.setattr(digest_service_module, "digest_draft_service", service)
        d = detail(datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc))
        window_details.append(d)

        from app.modules.digest.service import handle_social_draft_requested

        payload = json.dumps({"incident_id": str(d.incident_id)})
        await handle_social_draft_requested(None, payload)
        await handle_social_draft_requested(None, payload)
        assert len(rows) == 1, "at-least-once delivery must not duplicate drafts"
