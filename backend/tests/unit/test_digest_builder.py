"""Digest builder: table-driven, fully specified records.

The builder is the entire claim surface of the newsletter and the social
post, so these tests pin it word for word: the measurement statement is the
same sentence the RSS builder emits, the URL shape matches the frontend's
SHARE_ROUTES, HTML is escaped, and no output ever contains a wall-clock
value (the window is an argument, not a clock read).
"""

from datetime import date, datetime, timezone
from uuid import uuid4

import pytest

from app.modules.digest.builder import (
    DIGEST_GENERATOR,
    build_incident_social,
    build_weekly_newsletter,
    digest_content_hash,
    incident_title,
    incident_url,
    measurement_statement,
)
from app.modules.incidents.public_schemas import PublicIncidentDetailResponse

SITE = "https://reliastra.com"
PERIOD_START = date(2026, 9, 21)
PERIOD_END = date(2026, 9, 27)


def detail(**overrides) -> PublicIncidentDetailResponse:
    """A fully specified canonical incident detail (the real schema)."""
    row = {
        "incident_id": uuid4(),
        "vendor_name": "stripe",
        "vendor_display_name": "Stripe",
        "category": "payments",
        "target_name": "api.stripe.com",
        "endpoint_url": "https://api.stripe.com/v1/charges",
        "region": "us-east",
        "status": "resolved",
        "severity": "major",
        "failure_kind": "http_5xx",
        "started_at": datetime(2026, 9, 23, 12, 5, 0, tzinfo=timezone.utc),
        "detected_at": datetime(2026, 9, 23, 12, 15, 0, tzinfo=timezone.utc),
        "resolved_at": datetime(2026, 9, 23, 13, 5, 0, tzinfo=timezone.utc),
        "duration_seconds": 3600.0,
        "observation_count": 12,
        "failure_count": 6,
        "methodology_version": "v1.0",
        "attribution_status": "observed",
        "status_codes": [503, 503],
        "first_observation_id": str(uuid4()),
        "last_observation_id": str(uuid4()),
        "detection_rule": "consecutive_failures",
        "detection_metadata": {},
        "description": None,
        "evidence": None,
    }
    row.update(overrides)
    return PublicIncidentDetailResponse(**row)


class TestMeasurementStatement:
    def test_resolved_incident_states_the_full_window(self):
        d = detail()
        assert measurement_statement(d) == (
            "RELIASTRA observed consecutive failed probes against "
            "api.stripe.com for Stripe from us-east during "
            "2026-09-23T12:05:00+00:00 to 2026-09-23T13:05:00+00:00."
        )

    def test_open_incident_marks_the_window_open(self):
        d = detail(resolved_at=None, duration_seconds=None, status="open")
        assert "during 2026-09-23T12:05:00+00:00 (open)." in measurement_statement(d)

    def test_falls_back_to_endpoint_url_when_target_missing(self):
        d = detail(target_name=None)
        assert (
            "against https://api.stripe.com/v1/charges for Stripe"
            in measurement_statement(d)
        )

    def test_no_cause_no_speculation(self):
        # The statement must not name a cause or a vendor-claimed state:
        # only what the probes observed.
        text = measurement_statement(detail(description="Vendors says: degraded"))
        assert "degraded" not in text
        assert "vendor" not in text.lower().replace("vendor_display", "").replace(
            "for stripe", ""
        )


class TestTitlesAndUrls:
    def test_title_mirrors_the_feed_wording(self):
        assert (
            incident_title(detail())
            == "Stripe api.stripe.com failure window (resolved)"
        )
        assert (
            incident_title(detail(resolved_at=None, duration_seconds=None))
            == "Stripe api.stripe.com failure window (open)"
        )

    def test_url_matches_the_frontend_route_shape(self):
        d = detail()
        # SHARE_ROUTES.observatoryIncident: /observatory/{vendor}/incidents/{id}
        url = incident_url(d, SITE)
        assert url == f"{SITE}/observatory/stripe/incidents/{d.incident_id}"

    def test_site_url_trailing_slash_is_normalized(self):
        d = detail()
        assert incident_url(d, "https://reliastra.com/") == incident_url(d, SITE)


class TestWeeklyNewsletter:
    def test_subject_counts_and_bounds(self):
        parts = build_weekly_newsletter(
            [detail()], PERIOD_START, PERIOD_END, site_url=SITE
        )
        assert parts["subject"] == (
            "RELIASTRA weekly digest: 1 confirmed incident, 2026-09-21 to 2026-09-27"
        )

    def test_subject_pluralizes(self):
        parts = build_weekly_newsletter(
            [detail(), detail()], PERIOD_START, PERIOD_END, site_url=SITE
        )
        assert "2 confirmed incidents" in parts["subject"]

    def test_empty_window_is_publishable_and_explicit(self):
        parts = build_weekly_newsletter([], PERIOD_START, PERIOD_END, site_url=SITE)
        assert parts["subject"] == (
            "RELIASTRA weekly digest: no confirmed incidents, "
            "2026-09-21 to 2026-09-27"
        )
        assert "No confirmed incidents were recorded in this window" in parts[
            "text_body"
        ]
        assert "<p>" in parts["html_body"]

    def test_body_lists_each_incident_with_statement_and_url(self):
        d1 = detail()
        d2 = detail(vendor_name="twilio", vendor_display_name="Twilio")
        parts = build_weekly_newsletter(
            [d1, d2], PERIOD_START, PERIOD_END, site_url=SITE
        )
        text = parts["text_body"]
        assert "* Stripe api.stripe.com failure window (resolved) [resolved]" in text
        assert measurement_statement(d1) in text
        assert f"Details and evidence: {incident_url(d1, SITE)}" in text
        assert measurement_statement(d2) in text
        assert (
            "not from vendor status pages" in text
        ), "provenance must be explicit in every issue"

    def test_html_escapes_hostile_identity_fields(self):
        hostile = detail(vendor_display_name="Stripe <script>alert(1)</script>")
        parts = build_weekly_newsletter(
            [hostile], PERIOD_START, PERIOD_END, site_url=SITE
        )
        assert "<script>" not in parts["html_body"]
        assert "&lt;script&gt;" in parts["html_body"]

    def test_html_escapes_hostile_url_fields(self):
        hostile = detail(target_name='x" onclick="evil()')
        parts = build_weekly_newsletter(
            [hostile], PERIOD_START, PERIOD_END, site_url=SITE
        )
        assert 'onclick="evil()' not in parts["html_body"].replace("&quot;", "")

    def test_determinism_same_inputs_same_bytes(self):
        d1 = detail()
        d2 = detail()
        a = build_weekly_newsletter([d1, d2], PERIOD_START, PERIOD_END, site_url=SITE)
        b = build_weekly_newsletter([d1, d2], PERIOD_START, PERIOD_END, site_url=SITE)
        assert a == b

    def test_no_wall_clock_anywhere(self):
        # 2026-09-26 is "today" in this environment; the draft for an
        # earlier window must not leak it.
        parts = build_weekly_newsletter(
            [detail()], PERIOD_START, PERIOD_END, site_url=SITE
        )
        assert "2026-09-26" not in parts["text_body"]
        assert "2026-09-26" not in parts["html_body"]


class TestIncidentSocial:
    def test_statement_status_url_only(self):
        d = detail()
        parts = build_incident_social(d, site_url=SITE)
        assert parts["subject"] is None
        assert parts["html_body"] is None
        text = parts["text_body"]
        assert text == (
            f"{measurement_statement(d)}\n"
            f"Status: resolved.\n"
            f"Details and evidence: {incident_url(d, SITE)}"
        )

    def test_open_incident_states_open(self):
        d = detail(resolved_at=None, duration_seconds=None, status="open")
        assert "Status: open." in build_incident_social(d, site_url=SITE)["text_body"]

    def test_deterministic(self):
        d = detail()
        assert build_incident_social(d, site_url=SITE) == build_incident_social(
            d, site_url=SITE
        )


class TestContentHash:
    def test_stable_for_identical_content(self):
        parts = {"subject": "s", "text_body": "t", "html_body": "<p>h</p>"}
        assert digest_content_hash(parts) == digest_content_hash(dict(parts))

    def test_moves_with_any_field(self):
        base = {"subject": "s", "text_body": "t", "html_body": None}
        changed_subject = dict(base, subject="s2")
        changed_text = dict(base, text_body="t2")
        changed_html = dict(base, html_body="<p>h</p>")
        h = digest_content_hash(base)
        assert digest_content_hash(changed_subject) != h
        assert digest_content_hash(changed_text) != h
        assert digest_content_hash(changed_html) != h

    def test_none_html_is_not_empty_html(self):
        # A social draft (no html) and a hypothetical newsletter with an
        # empty html body must never share a hash: None is a marker.
        a = digest_content_hash({"subject": "s", "text_body": "t", "html_body": None})
        b = digest_content_hash({"subject": "s", "text_body": "t", "html_body": ""})
        assert a != b

    def test_field_boundaries_cannot_alias(self):
        # ("ab", "c") vs ("a", "bc") - the NUL separators make these differ.
        a = digest_content_hash({"subject": "ab", "text_body": "c", "html_body": None})
        b = digest_content_hash({"subject": "a", "text_body": "bc", "html_body": None})
        assert a != b


def test_generator_identity_is_versioned():
    assert DIGEST_GENERATOR == "reliastra-digest/1.0"


@pytest.mark.parametrize(
    ("day", "expected"),
    [
        (date(2026, 9, 23), "2026-W39"),  # Wednesday
        (date(2026, 9, 21), "2026-W39"),  # Monday edge
        (date(2026, 9, 27), "2026-W39"),  # Sunday edge
        (date(2026, 1, 1), "2026-W01"),
    ],
)
def test_period_key_iso_weeks(day, expected):
    from app.modules.digest.service import period_key_for

    assert period_key_for(day) == expected
