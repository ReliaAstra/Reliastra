"""The rendered evidence document: what a recipient sees, and what it may not say.

These tests render the *real* template through the *real* presentation layer over a
synthetic incident with an incident-shaped window. They exist because the artifact
is the product's only externally quoted surface: every defect in it lands in front
of a counterparty. The previous revision printed raw enums, float residue, a
truncation promise with nothing behind it, a 720-unit chart inside a 692-pixel box,
and no address anyone could verify against.

Assertions are made against the rendered HTML rather than the context dict, because
the document is the deliverable.
"""

import hashlib
import re
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.modules.checks.constants import BLOCKED_BY_SECURITY_POLICY_PREFIX
from app.modules.evidence.chart import render_latency_svg
from app.modules.evidence.constants import DEFAULT_EVIDENCE_EXPIRY_DAYS
from app.modules.evidence.metrics import (
    compute_sla_impact,
    compute_window_metrics,
    summarise,
)
from app.modules.evidence.context import EvidenceContext
from app.modules.evidence.service import (
    DEFAULT_METHODOLOGY_VERSION,
    RENDERER_CHROMIUM,
    RENDERER_XHTML2PDF,
    TARGET_UPTIME_PCT,
    EvidenceService,
    canonical_json_bytes,
)

T0 = datetime(2026, 9, 11, 9, 44, 0, tzinfo=timezone.utc)

#: Sentinel for "use the realistic attribution result". ``None`` is a meaningful
#: value here - an incident with no attribution recorded - so it cannot also be
#: the default marker.
_DEFAULT_ATTRIBUTION = object()

#: Claims the artifact must never make, whatever the data looks like. Mirrors the
#: frontend product contract (``EVIDENCE_FORBIDDEN_CLAIMS``) so the landing page
#: and the document cannot drift into different levels of honesty.
FORBIDDEN = (
    "Multi-Region",
    "Quorum Confirmed",
    "Verification Regions",
    "Regions Observed",
    "Region of First Detection",
    "Per-Region Latency",
    "Measured 24h Uptime",
    "independent regional",
)

SECTIONS = (
    "1. Incident Record",
    "2. Detection Record",
    "3. Incident Window Measurements",
    "4. SLA Impact Calculation",
    "5. Observed Latency And Failures",
    "6. Rolling 24-Hour Health (Context)",
    "7. Correlated Dependency Events",
    "8. Deterministic Attribution",
    "10. Documented Observations",
    "11. Authenticity, Retention and Verification",
)

FAILURE_MESSAGE = "connect timeout after 10000ms"
BLOCKED_MESSAGE = f"{BLOCKED_BY_SECURITY_POLICY_PREFIX}: private address range"

SIGNED = {
    "alg": "Ed25519",
    "encoding": "base64url",
    "key_id": "9f2c41ba77de3311",
    "value": "kQ8kY1rQm2sT7uVw9xA0yB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0uV1wX2yZ3aB4cD5eF6g",
}


def _rows(count: int, *, down_from: int, down_to: int, blocked: int = 0):
    rows = []
    for index in range(count):
        down = down_from <= index <= down_to
        is_blocked = index < blocked
        rows.append(
            SimpleNamespace(
                id=uuid.UUID(int=index + 1),
                executed_at=T0 + timedelta(minutes=2 * index),
                is_up=not down,
                latency_ms=None if down else 180.0 + (index % 7) * 11,
                status_code=500 if down else 200,
                # `is_blocked_check` reads the error message, not a flag, so the
                # fixture has to match the real stored prefix.
                error_message=(
                    BLOCKED_MESSAGE
                    if is_blocked
                    else (FAILURE_MESSAGE if down else None)
                ),
                region="primary",
                quorum_confirmed=down,
            )
        )
    return rows


def _incident():
    return SimpleNamespace(
        id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        dependency_id=uuid.uuid4(),
        started_at=T0,
        resolved_at=T0 + timedelta(minutes=130),
        severity="critical",
        status="resolved",
        root_cause="vendor_failure",
        detection_rule="single.consecutive_failures",
        detection_metadata={
            "rule": "single.consecutive_failures",
            "reason": "9 consecutive failed checks (5 required)",
            "confirmed": True,
            "consecutive_failures": 9,
            "required": 5,
            "agreeing_observation_points": [],
        },
    )


def _dependency():
    return SimpleNamespace(
        id=uuid.uuid4(),
        name="OpenAI API",
        endpoint_url="https://api.openai.com/v1/models",
        regions=["primary"],
        alert_threshold_ms=250,
    )


def _render(
    monkeypatch,
    *,
    rows=None,
    organization=None,
    attribution=_DEFAULT_ATTRIBUTION,
    signature=SIGNED,
    renderer=None,
    correlations=(),
    total_in_window=None,
    resolved=True,
):
    """Produce the rendered document the way generation would."""
    from app.config import settings

    monkeypatch.setattr(settings, "SITE_URL", "https://reliastra.com", raising=False)
    monkeypatch.setattr(settings, "EVIDENCE_VERIFICATION_BASE_URL", "", raising=False)

    incident, dependency = _incident(), _dependency()
    if not resolved:
        # An open incident: the window end is "now", so the record is a snapshot
        # of a measurement that is still moving, and must be labelled that way.
        incident.resolved_at = None
        incident.status = "open"
    window_end = incident.resolved_at or T0 + timedelta(minutes=130)
    rows = rows if rows is not None else _rows(45, down_from=8, down_to=16)
    metrics = compute_window_metrics(
        rows, window_start=incident.started_at, window_end=window_end
    )
    impact = compute_sla_impact(metrics, target_uptime_pct=TARGET_UPTIME_PCT)
    chart_svg, chart_facts = render_latency_svg(
        [summarise(row) for row in rows],
        window_start=metrics.window_start,
        window_end=metrics.window_end,
        threshold_ms=250.0,
    )
    detection = EvidenceContext._detection_context(incident)
    topology = EvidenceContext._topology_context(metrics.observation_points)
    attribution_payload = (
        {
            "id": str(uuid.uuid4()),
            "classification": "vendor_failure",
            "confidence_score": 68.0,
            "signal_breakdown": {"temporal": 1.0, "endpoint_overlap": 0.5},
            "supporting_evidence": [],
            "contradicting_evidence": [],
            "methodology_version": "v1.0",
        }
        if attribution is _DEFAULT_ATTRIBUTION
        else attribution
    )
    payload = {
        "schema_version": "2.0",
        "incident": {"id": str(incident.id)},
        "window_metrics": metrics.as_dict(),
    }
    data_hash = hashlib.sha256(canonical_json_bytes(payload)).hexdigest()
    verification_id = "T3st-Tok3n_Verification-Id"
    generated_at = datetime(2026, 9, 11, 12, 0, 0, tzinfo=timezone.utc)
    documented_rows, caption = EvidenceContext._documented_observations(rows)
    available = total_in_window if total_in_window is not None else len(rows)
    service = EvidenceService()
    presentation = service._context._presentation_context(
        incident=incident,
        dependency=dependency,
        organization=organization,
        metrics=metrics,
        impact=impact,
        detection=detection,
        topology=topology,
        attribution=attribution_payload,
        methodology_version=DEFAULT_METHODOLOGY_VERSION,
        correlations=list(correlations),
        documented_rows=documented_rows,
        observation_caption=caption,
        total_in_window=available,
        verification_id=verification_id,
        generated_at=generated_at,
        expires_at=generated_at + timedelta(days=DEFAULT_EVIDENCE_EXPIRY_DAYS),
        signature=signature,
        renderer=(
            {
                "renderer": RENDERER_CHROMIUM,
                "renderer_version": "141.0.7390.31",
                "pagination": "running footer with page numbers",
            }
            if renderer is None
            else renderer
        ),
    )
    html = service._renderer._render_html(
        {
            "incident": incident,
            "dependency": dependency,
            "metrics": metrics,
            "impact": impact,
            "rolling": {
                "uptime_percentage": 99.62,
                "avg_latency_ms": 214.5,
                "total_checks": 712,
            },
            "detection": detection,
            "topology": topology,
            "chart_svg": chart_svg,
            "chart_facts": chart_facts.as_dict(),
            "observations_truncated": len(rows) < available,
            "observations_available_in_window": available,
            "observation_count": len(rows),
            "attribution": attribution_payload,
            "methodology_version": DEFAULT_METHODOLOGY_VERSION,
            "ai_explanation": None,
            "data_hash": data_hash,
            "signature": signature,
            "verification_id": verification_id,
            "generated_at": generated_at.isoformat(),
            "schema_version": "2.0",
            "target_uptime_pct": TARGET_UPTIME_PCT,
            **presentation,
        }
    )
    return html, presentation, incident, dependency


class TestDocumentIsAddressable:
    """A report a counterparty can act on, not only read."""

    def test_the_verification_page_is_printed_as_a_url(self, monkeypatch):
        html, _, _, _ = _render(monkeypatch)
        assert "https://reliastra.com/reports/T3st-Tok3n_Verification-Id" in html

    def test_a_qr_is_offered_when_the_library_is_present(self, monkeypatch):
        pytest.importorskip("qrcode")
        html, _, _, _ = _render(monkeypatch)
        assert "Scan to open" in html
        assert '<svg xmlns="http://www.w3.org/2000/svg"' in html

    def test_both_parties_are_named(self, monkeypatch):
        organization = SimpleNamespace(name="Adeoyi Logistics Ltd")
        html, _, incident, _ = _render(monkeypatch, organization=organization)
        assert "Adeoyi Logistics Ltd" in html
        # The identifier stays: a name is for reading, an id is for resolving.
        assert str(incident.org_id) in html

    def test_a_missing_name_falls_back_to_the_identifier_without_inventing_one(
        self, monkeypatch
    ):
        html, presentation, incident, _ = _render(monkeypatch, organization=None)
        assert presentation["document"]["prepared_for"] == (
            f"Organization {incident.org_id}"
        )
        assert ">None<" not in html

    def test_a_mock_object_never_becomes_the_addressee(self):
        # Half-populated ORM doubles are a real condition in tests and in
        # degraded reads; `getattr(x, "name")` on a mock is not a name.
        from unittest.mock import MagicMock

        name, ref = EvidenceContext._addressee(MagicMock(), uuid.uuid4())
        assert name.startswith("Organization ")
        assert "MagicMock" not in name
        assert ref

    def test_the_document_carries_a_citable_reference(self, monkeypatch):
        html, presentation, _, _ = _render(monkeypatch)
        reference = presentation["document"]["reference"]
        assert reference.startswith("RA-20260911-OPENAIAPI-")
        assert html.count(reference) >= 3  # letterhead, section 1, footer

    def test_retention_is_stated_because_files_do_not_last_forever(self, monkeypatch):
        html, presentation, _, _ = _render(monkeypatch)
        assert "retained until" in html
        assert str(DEFAULT_EVIDENCE_EXPIRY_DAYS) in html
        assert presentation["document"]["expires_date"].endswith("2027")


class TestDocumentStatesItsOwnLimits:
    def test_unsigned_says_unsigned(self, monkeypatch):
        html, _, _, _ = _render(
            monkeypatch, signature=None, renderer={"renderer": None, "renderer_version": None, "pagination": None}
        )
        assert "Unsigned" in html
        assert "attest internal consistency only" in html

    def test_signed_names_the_algorithm_and_key(self, monkeypatch):
        html, _, _, _ = _render(monkeypatch)
        assert "Signed" in html and "Ed25519" in html
        assert "9f2c41ba77de3311" in html
        assert "Unsigned" not in html

    def test_the_renderer_that_ran_is_recorded(self, monkeypatch):
        html, _, _, _ = _render(monkeypatch)
        assert RENDERER_CHROMIUM in html
        assert "141.0.7390.31" in html

    def test_a_fallback_rendering_is_printed_not_buried(self, monkeypatch):
        html, _, _, _ = _render(
            monkeypatch,
            renderer={
                "renderer": RENDERER_XHTML2PDF,
                "renderer_version": "0.2.17",
                "pagination": "no running footer (page numbers unavailable)",
            },
        )
        assert RENDERER_XHTML2PDF in html
        assert "page numbers unavailable" in html

    def test_the_checksum_of_a_file_is_not_inside_the_file(self, monkeypatch):
        html, _, _, _ = _render(monkeypatch)
        assert "A file cannot contain the checksum of itself" in html

    def test_scope_denies_legal_and_credit_claims(self, monkeypatch):
        html, _, _, _ = _render(monkeypatch)
        assert "assigns no liability" in html
        assert "certifies no service credit" in html

    def test_absence_of_attribution_is_reported_as_absence(self, monkeypatch):
        html, presentation, _, _ = _render(monkeypatch, attribution=None)
        joined = " ".join(presentation["verdict"]["sentences"]).lower()
        assert "attribution result was recorded" in joined
        assert "Not asserted" in html

    def test_an_open_incident_is_marked_provisional(self, monkeypatch):
        html, presentation, _, _ = _render(monkeypatch, resolved=False)
        assert presentation["document"]["record_state"].startswith("Provisional")
        assert "open at time of issue" in html

    def test_blocked_probes_are_disclosed_in_the_finding(self, monkeypatch):
        html, presentation, _, _ = _render(
            monkeypatch, rows=_rows(40, down_from=8, down_to=16, blocked=3)
        )
        joined = " ".join(presentation["verdict"]["sentences"])
        assert "refused by RELIASTRA's outbound security policy" in joined
        assert ">Blocked Checks (Excluded)<" in html


class TestDocumentIsPrintable:
    def test_page_geometry_is_declared(self, monkeypatch):
        html, _, _, _ = _render(monkeypatch)
        assert "@page" in html
        assert "size: A4" in html
        # Rows must not straddle pages, and the chart must scale instead of
        # being clipped - the right-hand end of that chart is the recovery.
        assert "break-inside: avoid" in html
        assert "page-break-inside: avoid" in html
        assert "max-width: 100%" in html

    def test_the_appendix_exists_so_the_truncation_claim_is_true(self, monkeypatch):
        # The previous revision promised "the first N are documented here" and
        # documented none. If a coverage sentence is printed, rows must follow.
        rows = _rows(400, down_from=8, down_to=16)
        html, *_ = _render(monkeypatch, rows=rows, total_in_window=400)
        assert "10. Documented Observations" in html
        assert FAILURE_MESSAGE in html
        assert "First 40 and last 20 of 400 documented" in html
        assert "withheld from print, present in the payload" in html

    def test_a_small_window_prints_in_full(self, monkeypatch):
        html, presentation, _, _ = _render(monkeypatch)
        assert (
            presentation["document"]["observation_caption"]
            == "All 45 documented check(s)"
        )
        assert "Executed At (UTC)" in html

    def test_fonts_do_not_depend_on_an_unnamed_ambient_family(self, monkeypatch):
        html, _, _, _ = _render(monkeypatch)
        # Liberation Sans is metric-compatible with Arial and is installed
        # explicitly in the image; a document whose line breaks depend on
        # whatever fontconfig happens to resolve is not a document of record.
        assert "Liberation Sans" in html
        assert "tabular-nums" in html

    def test_the_running_footer_carries_the_reference(self):
        from app.modules.evidence.service import _footer_template

        footer = _footer_template("RA-20260911-OPENAIAPI-188B0")
        assert "pageNumber" in footer and "totalPages" in footer
        assert "RA-20260911-OPENAIAPI-188B0" in footer

    def test_the_running_footer_escapes_what_it_prints(self):
        from app.modules.evidence.service import _footer_template

        footer = _footer_template('<script>alert("x")</script>')
        assert "<script>" not in footer
        assert "&lt;script&gt;" in footer


class TestNothingIsLeakedOrInvented:
    def test_raw_enum_tokens_never_reach_the_page(self, monkeypatch):
        html, _, _, _ = _render(monkeypatch)
        body = html.split("</header>", 1)[1]
        assert "vendor_failure" not in body
        assert "infrastructure_issue" not in body

    def test_float_residue_is_gone(self, monkeypatch):
        html, _, _, _ = _render(monkeypatch)
        assert not re.search(r"\d\.\d{5,}", html), "float residue in rendered document"

    def test_forbidden_claims_are_absent(self, monkeypatch):
        html, _, _, _ = _render(monkeypatch)
        for claim in FORBIDDEN:
            assert claim not in html, f"artifact claims {claim!r}"

    def test_the_detection_rule_identifier_is_still_printed(self, monkeypatch):
        # The one raw token that belongs in the document: cited under an
        # explicit "Rule Identifier" label, because it is a citation rather than
        # a presentation leak. The product contract test requires it too.
        html, _, _, _ = _render(monkeypatch)
        assert ">Rule Identifier<" in html
        assert "single.consecutive_failures" in html

    def test_every_section_is_present_in_order(self, monkeypatch):
        html, _, _, _ = _render(monkeypatch)
        positions = [html.index(section) for section in SECTIONS]
        assert positions == sorted(positions)

    def test_ai_section_is_omitted_when_no_explanation_exists(self, monkeypatch):
        html, _, _, _ = _render(monkeypatch)
        assert "AI-Generated Explanation" not in html

    def test_correlated_dependencies_are_named_not_ided(self, monkeypatch):
        html, _, _, _ = _render(
            monkeypatch,
            correlations=[
                {
                    "name": "Stripe Payments",
                    "endpoint_url": "https://api.stripe.com/v1/charges",
                    "correlation_method": "time_window",
                    "time_window_seconds": 300,
                    "correlation_confidence": 0.55,
                }
            ],
        )
        assert "Stripe Payments" in html
        assert "Time window overlap" in html
        assert "55.0%" in html
        assert "55.0000000000000" not in html

    def test_a_window_of_only_blocked_probes_states_no_availability(self, monkeypatch):
        # Every scheduled check was refused by policy: nothing reached the
        # target, so the artifact must print an explicit absence. "0.00%" would
        # certify a total outage that was never observed, and "100%" would
        # certify health - both are fabrications, in opposite directions.
        rows = _rows(3, down_from=0, down_to=2, blocked=3)
        html, presentation, _, _ = _render(monkeypatch, rows=rows)
        joined = " ".join(presentation["verdict"]["sentences"])
        assert "not calculable" in html
        assert "0.00%" not in html and "100.00%" not in html
        assert "no check that reached" in joined or "recorded no check" in joined
