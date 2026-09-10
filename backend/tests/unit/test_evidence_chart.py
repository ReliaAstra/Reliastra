"""The evidence chart must be drawn from the observations it claims to show.

The template used to ship a hand-typed polyline
(``40,30 150,35 260,85 370,80 480,40``) next to a real checksum - a fabricated
measurement inside a document whose purpose is to be trusted. These tests pin
the replacement: coordinates derived from data, failures visible, downsampling
that cannot hide a spike, and an explicit statement when there is nothing to
draw.
"""

import re
from datetime import datetime, timedelta, timezone

import pytest

from app.modules.evidence.chart import (
    PADDING_LEFT,
    PADDING_RIGHT,
    PLOT_WIDTH,
    WIDTH,
    ChartFacts,
    render_latency_svg,
)
from app.modules.evidence.metrics import summarise

T0 = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)


def make_observations(count: int, **overrides) -> list:
    from types import SimpleNamespace

    return [
        summarise(
            SimpleNamespace(
                executed_at=T0 + timedelta(minutes=i),
                is_up=overrides.get("is_up", True),
                latency_ms=overrides.get("latency_ms", 100.0 + i),
                error_message=overrides.get("error_message"),
                status_code=overrides.get("status_code", 200),
                region="primary",
            )
        )
        for i in range(count)
    ]


def polyline_points(svg: str) -> list[tuple[float, float]]:
    match = re.search(r'<polyline[^>]*points="([^"]+)"', svg)
    assert match, "expected a polyline in the rendered chart"
    return [
        tuple(float(part) for part in pair.split(","))
        for pair in match.group(1).split()
    ]


# ── absence is stated, never drawn around ───────────────────────────────────


def test_no_observations_renders_an_explanation_instead_of_an_empty_axis():
    svg, facts = render_latency_svg([])
    assert facts.rendered is False
    assert facts.observations_available == 0
    assert "No observations recorded" in svg
    assert "<polyline" not in svg


def test_observations_without_latency_say_so_rather_than_plotting_zero():
    from types import SimpleNamespace

    observations = [
        summarise(
            SimpleNamespace(
                executed_at=T0 + timedelta(minutes=i),
                is_up=True,
                latency_ms=0.0,
                error_message=None,
                status_code=200,
                region="primary",
            )
        )
        for i in range(3)
    ]
    svg, facts = render_latency_svg(observations)
    assert facts.rendered is False
    assert facts.observations_available == 3
    assert "No latency measurements" in svg
    assert "<polyline" not in svg


# ── coordinates come from the data ──────────────────────────────────────────


def test_x_coordinates_are_proportional_to_elapsed_time():
    """A gap in monitoring stays visible as a gap in the chart."""
    from types import SimpleNamespace

    observations = [
        summarise(
            SimpleNamespace(
                executed_at=T0 + timedelta(minutes=minute),
                is_up=True,
                latency_ms=100.0,
                error_message=None,
                status_code=200,
                region="primary",
            )
        )
        for minute in (0, 1, 30)
    ]
    svg, _ = render_latency_svg(
        observations, window_start=T0, window_end=T0 + timedelta(minutes=30)
    )
    xs = [x for x, _ in polyline_points(svg)]
    span = WIDTH - PADDING_LEFT - PADDING_RIGHT
    # minute 1 of 30 sits ~1/30 along the plot; minute 30 at the right edge.
    assert xs[0] == pytest.approx(PADDING_LEFT, abs=0.5)
    assert xs[1] == pytest.approx(PADDING_LEFT + span / 30, abs=0.5)
    assert xs[2] == pytest.approx(PADDING_LEFT + span, abs=0.5)
    assert PLOT_WIDTH == span


def test_higher_latency_is_drawn_higher_on_the_canvas():
    from types import SimpleNamespace

    observations = [
        summarise(
            SimpleNamespace(
                executed_at=T0 + timedelta(minutes=i),
                is_up=True,
                latency_ms=latency,
                error_message=None,
                status_code=200,
                region="primary",
            )
        )
        for i, latency in enumerate((100.0, 400.0))
    ]
    svg, facts = render_latency_svg(observations)
    (_, y_slow), (_, y_fast) = polyline_points(svg)
    assert y_fast < y_slow  # SVG y grows downward
    assert facts.max_latency_ms == 400.0


def test_a_configured_threshold_extends_the_scale_and_is_labelled():
    observations = make_observations(3, latency_ms=100.0)
    _, facts_no_threshold = render_latency_svg(observations)
    svg, facts = render_latency_svg(observations, threshold_ms=500.0)
    assert "alert threshold 500 ms" in svg
    # Same data, bigger ceiling: the peak must sit lower on the canvas.
    assert facts.max_latency_ms == facts_no_threshold.max_latency_ms


def test_threshold_is_not_invented_when_none_is_configured():
    svg, _ = render_latency_svg(make_observations(3))
    assert "alert threshold" not in svg


# ── failures stay visible ───────────────────────────────────────────────────


def test_failed_checks_are_marked_on_the_baseline():
    from types import SimpleNamespace

    observations = [
        summarise(
            SimpleNamespace(
                executed_at=T0 + timedelta(minutes=i),
                is_up=(i != 1),
                latency_ms=None if i == 1 else 120.0,
                error_message=None if i != 1 else "500 Internal Server Error",
                status_code=200 if i != 1 else 500,
                region="primary",
            )
        )
        for i in range(3)
    ]
    svg, facts = render_latency_svg(observations)
    assert facts.failed_marks == 1
    assert svg.count('fill="#b3261e"') == 1
    # The healthy series is still drawn, so the failure sits on top of it.
    assert "<polyline" in svg


def test_a_single_measurement_renders_a_point_not_a_polyline():
    svg, facts = render_latency_svg(make_observations(1))
    assert facts.observations_used == 1
    assert "<polyline" not in svg
    assert "<circle" in svg


# ── downsampling ────────────────────────────────────────────────────────────


def test_long_incidents_are_reduced_but_the_fact_is_disclosed():
    observations = make_observations(500)
    svg, facts = render_latency_svg(observations, max_points=60)
    assert facts.observations_available == 500
    assert facts.observations_used <= 60
    assert facts.downsampled is True
    assert "plotted as" in facts.note
    assert "plotted as" in svg


def test_downsampling_keeps_the_worst_value_of_each_bucket():
    """Max-per-bucket: a spike cannot be averaged away."""
    from types import SimpleNamespace

    observations = [
        summarise(
            SimpleNamespace(
                executed_at=T0 + timedelta(seconds=i * 10),
                is_up=True,
                latency_ms=9000.0 if i == 7 else 50.0,
                error_message=None,
                status_code=200,
                region="primary",
            )
        )
        for i in range(200)
    ]
    _, facts = render_latency_svg(observations, max_points=20)
    assert facts.downsampled is True
    assert facts.max_latency_ms == 9000.0


def test_a_short_incident_is_never_downsampled():
    observations = make_observations(10)
    _, facts = render_latency_svg(observations, max_points=120)
    assert facts.downsampled is False
    assert facts.observations_used == 10


# ── determinism and shape ───────────────────────────────────────────────────


def test_rendering_is_deterministic():
    observations = make_observations(12)
    first, _ = render_latency_svg(observations)
    second, _ = render_latency_svg(observations)
    assert first == second


def test_facts_round_trip_to_json_safe_keys():
    _, facts = render_latency_svg(make_observations(4))
    payload = facts.as_dict()
    assert isinstance(facts, ChartFacts)
    assert set(payload) == {
        "observations_available",
        "observations_plotted",
        "downsampled",
        "failed_marks",
        "max_latency_ms",
        "rendered",
        "note",
    }
    assert payload["observations_plotted"] == facts.observations_used


def test_svg_is_well_formed_and_self_closing():
    svg, _ = render_latency_svg(make_observations(5))
    assert svg.startswith("<svg ")
    assert svg.endswith("</svg>")
    assert svg.count("<svg ") == 1
