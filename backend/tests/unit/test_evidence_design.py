"""The evidence artifact's presentation rules, tested where they are defined.

These are the properties that make the document quotable by someone who did not
build it: no float residue, no raw storage tokens, an explicit dash instead of a
blank, a reference a human can read aloud, and a finding block that never
outstates the measurements under it. Each test below exists because the artifact
used to violate it.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.modules.evidence import design

T0 = datetime(2026, 9, 11, 9, 44, 0, tzinfo=timezone.utc)


def metrics_dict(**overrides):
    base = {
        "window_start": T0.isoformat(),
        "window_end": (T0 + timedelta(minutes=130)).isoformat(),
        "window_seconds": 7800.0,
        "total_checks": 65,
        "measured_checks": 65,
        "up_checks": 56,
        "down_checks": 9,
        "blocked_checks_excluded": 0,
        "availability_pct": 86.1538,
        "avg_latency_ms": 214.5,
        "p50_latency_ms": 190.0,
        "p95_latency_ms": 402.1,
        "min_latency_ms": 120.0,
        "max_latency_ms": 990.0,
        "longest_failure_run": 9,
        "observation_points": ["primary"],
        "first_observed_at": T0.isoformat(),
        "last_observed_at": (T0 + timedelta(minutes=130)).isoformat(),
        "insufficient_data": False,
        "data_note": "",
    }
    base.update(overrides)
    return base


def impact_dict(**overrides):
    base = {
        "target_uptime_pct": 100.0,
        "measured_availability_pct": 86.1538,
        "impact_pct": 13.8462,
        "measured_downtime_seconds": 1080.0,
        "allowable_downtime_seconds": 0.0,
        "exceeded_allowance": True,
        "basis": "9 of 65 measured checks failed inside the 7800s window (1 observation point(s)).",
    }
    base.update(overrides)
    return base


class TestNumbers:
    def test_percentage_keeps_the_precision_that_was_measured(self):
        assert design.percent(86.1538) == "86.1538%"
        assert design.percent(100.0, 1) == "100.0%"

    @pytest.mark.parametrize("raw", [0.55, 0.1, 0.7, 0.32])
    def test_share_multiplier_leaves_no_float_residue(self, raw):
        # The defect this guards: `{{ x * 100 }}%` printed
        # "55.00000000000001%" in a document about precision.
        rendered = design.share_percent(raw)
        assert rendered.endswith("%")
        assert float(rendered[:-1]) == pytest.approx(raw * 100, abs=0.05)
        assert len(rendered.split(".")[1]) <= 2, rendered

    def test_absence_is_stated_not_blanked(self):
        for value in (None, "", "not recorded"):
            assert design.percent(None) == design.ABSENT
        assert design.milliseconds(None) == design.ABSENT
        assert design.seconds(None) == design.ABSENT
        assert design.duration(None) == design.ABSENT
        assert design.int_grouped(None) == design.ABSENT

    def test_durations_read_as_durations(self):
        assert design.duration(45.0) == "45 s"
        assert design.duration(2125.0) == "35 min 25 s"
        assert design.duration(7800.0) == "2 h 10 min"
        assert design.duration(94200.0) == "1 d 2 h 10 min"

    def test_timestamps_always_carry_the_zone(self):
        stamp = design.utc_stamp(T0)
        assert stamp.endswith("UTC")
        assert stamp == "11 Sep 2026, 09:44:00 UTC"
        assert design.utc_stamp(None) == design.ABSENT
        assert design.utc_stamp("2026-09-11T09:44:00+00:00") == stamp

    def test_aware_timestamps_are_converted_not_relabelled(self):
        offset = datetime(2026, 9, 11, 11, 44, tzinfo=timezone(timedelta(hours=2)))
        assert design.utc_stamp(offset) == "11 Sep 2026, 09:44:00 UTC"


class TestTokensNeverLeak:
    def test_enum_tokens_become_labels(self):
        assert design.label("vendor_failure", design.CLASSIFICATION_LABELS) == "Vendor failure"
        assert design.label("critical", design.SEVERITY_LABELS) == "Critical"
        assert design.label("resolved", design.STATUS_LABELS) == "Resolved"
        assert design.label("temporal", design.CORRELATION_METHOD_LABELS) == "Time window overlap"

    def test_an_unmapped_token_is_readable_and_not_invented(self):
        # Title-casing a token is a visible fallback. Translating it to a
        # confident phrase we have not defined would be a fabrication.
        assert design.label("brand_new_signal", design.CLASSIFICATION_LABELS) == "Brand new signal"

    def test_every_documented_classification_has_a_label(self):
        assert set(design.CLASSIFICATION_LABELS) == {
            "vendor_failure",
            "multi_cause",
            "infrastructure_issue",
            "unknown",
        }


class TestReference:
    def test_reference_is_deterministic_and_speakable(self):
        incident_id = "01J8ZQ4K6M9T7B2C4D6E8F0A1B"
        first = design.report_reference("OpenAI API", T0, incident_id)
        assert first == design.report_reference("OpenAI API", T0, incident_id)
        assert first.startswith("RA-20260911-OPENAIAPI-")
        assert len(first) <= 40
        assert "-" in first

    def test_reference_does_not_expose_a_raw_uuid(self):
        incident_id = "01J8ZQ4K6M9T7B2C4D6E8F0A1B"
        reference = design.report_reference("OpenAI", T0, incident_id)
        assert incident_id not in reference
        assert len(reference.split("-")[-1]) == 5

    def test_a_dependency_with_no_safe_characters_still_produces_a_reference(self):
        reference = design.report_reference("///", T0, "abc123")
        assert "DEP" in reference
        assert reference.endswith("BC123")


class TestLinks:
    def test_verification_url_points_at_the_human_page(self, monkeypatch):
        from app.config import settings

        monkeypatch.setattr(settings, "EVIDENCE_VERIFICATION_BASE_URL", "", raising=False)
        monkeypatch.setattr(settings, "SITE_URL", "https://reliastra.com", raising=False)
        assert design.verification_url("tok123") == "https://reliastra.com/reports/tok123"
        assert design.verify_api_url("tok123") == (
            "https://reliastra.com/api/v1/verify/tok123"
        )
        assert design.keys_api_url() == "https://reliastra.com/api/v1/verify/keys"

    def test_a_staging_override_changes_every_printed_link(self, monkeypatch):
        from app.config import settings

        monkeypatch.setattr(
            settings, "EVIDENCE_VERIFICATION_BASE_URL", "https://stage.example/", raising=False
        )
        assert design.verification_url("tok") == "https://stage.example/reports/tok"
        assert design.keys_api_url() == "https://stage.example/api/v1/verify/keys"


class TestFiguresAndFindings:
    def test_four_tiles_stated_before_the_detail(self):
        tiles = design.metric_tiles(metrics_dict(), impact_dict(), None)
        assert [t.label for t in tiles] == [
            "Incident window",
            "Measured availability",
            "Measured downtime",
            "Attribution",
        ]
        assert tiles[1].value == "86.15%"
        # The note carries the denominator: a percentage without one is the
        # failure mode RELIASTRA's own measurement-integrity paper describes.
        assert "of 65 measured checks" in tiles[1].note

    def test_attribution_without_a_result_says_so_instead_of_guessing(self):
        tiles = design.metric_tiles(metrics_dict(), impact_dict(), None)
        assert tiles[3].value == "Not asserted"
        assert "no attribution result" in tiles[3].note

    def test_availability_without_measurements_is_not_zero(self):
        empty = metrics_dict(
            measured_checks=0, up_checks=0, down_checks=0, availability_pct=None,
            avg_latency_ms=None, total_checks=3,
        )
        tiles = design.metric_tiles(empty, impact_dict(measured_availability_pct=None,
                                                        impact_pct=None), None)
        assert tiles[1].value == design.ABSENT
        assert "0.00%" not in [t.value for t in tiles]

    def _sentences(self, **overrides):
        kwargs = dict(
            dependency_name="OpenAI API",
            endpoint_url="https://api.openai.com/v1/models",
            metrics=metrics_dict(),
            impact=impact_dict(),
            attribution={
                "classification": "vendor_failure",
                "confidence_score": 68.0,
                "methodology_version": "v1.0",
            },
            detection={"rule_label": "Consecutive failed checks (single observation point)"},
            topology={"observation_point_count": 1, "independent_confirmation": False},
            incident={"severity": "critical", "status": "resolved"},
        )
        kwargs.update(overrides)
        return design.verdict_sentences(**kwargs)

    def test_finding_restates_only_measured_facts(self):
        sentences = self._sentences()
        joined = " ".join(sentences)
        assert "9 of 65 checks" in joined
        assert "86.1538%" in joined
        assert "Vendor failure" in joined
        # No causation, no liability, no credit language - the document is a
        # measurement record and says so.
        for banned in ("liable", "guarantee", "refund", "credit is due", "proves that"):
            assert banned not in joined.lower()

    def test_single_point_topology_is_disclosed_in_the_finding(self):
        assert any("single RELIASTRA observation point" in s for s in self._sentences())

    def test_multi_point_topology_is_not_apologised_for(self):
        sentences = self._sentences(
            topology={"observation_point_count": 3, "independent_confirmation": True}
        )
        assert not any("single RELIASTRA observation point" in s for s in sentences)

    def test_no_measurements_produces_no_percentage(self):
        sentences = self._sentences(
            metrics=metrics_dict(measured_checks=0, up_checks=0, down_checks=0,
                                 availability_pct=None, window_seconds=0.0)
        )
        assert len(sentences) == 1
        assert "no check that reached" in sentences[0]
        assert "%" not in sentences[0]

    @pytest.mark.parametrize("key", ["blocked_checks", "blocked_checks_excluded"])
    def test_blocked_checks_are_excluded_and_said(self, key):
        # The exclusion is the one case where a check that never reached the
        # vendor must not silently become downtime - and not silently vanish.
        sentences = self._sentences(metrics=metrics_dict(**{key: 4}))
        disclosure = [s for s in sentences if "outbound security policy" in s]
        assert disclosure, sentences
        assert "4 scheduled check(s)" in disclosure[0]

    def test_headline_names_the_dependency_not_an_identifier(self):
        headline = design.headline(
            incident={"severity": "critical", "status": "resolved"},
            metrics=metrics_dict(),
            dependency_name="OpenAI API",
        )
        assert headline.startswith("Critical dependency event on OpenAI API")
        assert "86.15%" in headline

    def test_headline_when_nothing_was_measured(self):
        headline = design.headline(
            incident={"severity": "minor", "status": "open"},
            metrics=metrics_dict(measured_checks=0, availability_pct=None),
            dependency_name="OpenAI API",
        )
        assert headline == "OpenAI API: no measurement inside the recorded window"


class TestQr:
    def test_qr_renders_inline_svg_for_a_url(self):
        from app.modules.evidence.qr import render_qr_svg

        svg = render_qr_svg("https://reliastra.com/reports/tok123")
        assert svg.startswith("<svg")
        assert "<path" in svg
        assert svg.endswith("</svg>")

    def test_qr_never_breaks_a_document(self):
        from app.modules.evidence.qr import render_qr_svg

        assert render_qr_svg("") == ""
        assert render_qr_svg(None) == ""
