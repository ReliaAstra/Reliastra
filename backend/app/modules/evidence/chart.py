"""Latency chart for the evidence artifact, drawn from the observations.

The artifact used to ship a static SVG whose polyline coordinates were typed
into the template (``40,30 150,35 260,85 370,80 480,40``). In a document whose
entire purpose is to be handed to a vendor as proof, a chart that does not come
from the data is worse than no chart: it is a fabricated measurement next to a
real checksum.

This module builds the SVG from the actual observations in the incident window.
It is deliberately hand-rolled string building rather than a charting library:
the output goes into a PDF via a template, has to be deterministic, and adding
a heavyweight visualisation dependency to render one polyline is not a trade
worth making.

Behaviour that matters for evidence:

* **Time-proportional x axis.** Gaps in monitoring are visible as gaps, not
  compressed away, so a reader can see how long the incident actually ran.
* **Deterministic downsampling.** Long incidents can hold thousands of checks;
  they are reduced to at most ``max_points`` buckets by taking the *maximum*
  latency in each bucket. Max-per-bucket cannot hide a spike, and the chart
  says how many observations it was drawn from and whether it was reduced.
* **Failures are marked**, not smoothed: a check that did not succeed gets a
  marker on the baseline, because a failed probe has no latency to plot and
  dropping it would draw a healthy-looking line through an outage.
* **Absence is stated.** No observations, or observations with no latency
  measurement, produce an explicit message instead of an empty axis.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from app.modules.evidence.metrics import ObservationSummary

# Canvas geometry. Kept module-level so tests can assert on the coordinate
# space without re-deriving it.
WIDTH = 720
HEIGHT = 190
PADDING_LEFT = 52
PADDING_RIGHT = 16
PADDING_TOP = 18
PADDING_BOTTOM = 34
PLOT_WIDTH = WIDTH - PADDING_LEFT - PADDING_RIGHT
PLOT_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM

_COLOUR_LINE = "#0b5cad"
_COLOUR_FAIL = "#b3261e"
_COLOUR_AXIS = "#8a8f98"
_COLOUR_GRID = "#e3e6ea"
_COLOUR_TEXT = "#4a4f57"
_COLOUR_THRESHOLD = "#a15c00"


@dataclass(frozen=True)
class ChartFacts:
    """What the chart was drawn from, exposed so the artifact can state it."""

    observations_used: int
    observations_available: int
    downsampled: bool
    failed_marks: int
    max_latency_ms: float | None
    rendered: bool
    note: str

    def as_dict(self) -> dict[str, object]:
        return {
            "observations_available": self.observations_available,
            "observations_plotted": self.observations_used,
            "downsampled": self.downsampled,
            "failed_marks": self.failed_marks,
            "max_latency_ms": self.max_latency_ms,
            "rendered": self.rendered,
            "note": self.note,
        }


def _message_svg(message: str, detail: str = "") -> str:
    """An honest placeholder: the chart says what is missing and why."""
    detail_markup = (
        f'<text x="{WIDTH / 2}" y="{HEIGHT / 2 + 20}" text-anchor="middle" '
        f'font-size="11" fill="{_COLOUR_TEXT}">{detail}</text>'
        if detail
        else ""
    )
    return (
        f'<svg width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" '
        'xmlns="http://www.w3.org/2000/svg" role="img" '
        f'aria-label="{message}">'
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#ffffff" />'
        f'<rect x="0.5" y="0.5" width="{WIDTH - 1}" height="{HEIGHT - 1}" '
        f'fill="none" stroke="{_COLOUR_GRID}" />'
        f'<text x="{WIDTH / 2}" y="{HEIGHT / 2 - 4}" text-anchor="middle" '
        f'font-size="12" fill="{_COLOUR_TEXT}">{message}</text>'
        f"{detail_markup}</svg>"
    )


def _bucket(
    observations: Sequence[ObservationSummary], max_points: int
) -> list[ObservationSummary]:
    """Reduce to at most ``max_points`` entries, keeping each bucket's worst.

    Worst = highest latency when one exists, otherwise the failed check. A
    bucket holding a spike and a bucket holding an outage both survive.
    """
    if len(observations) <= max_points:
        return list(observations)

    bucket_size = len(observations) / max_points
    buckets: list[ObservationSummary | None] = [None] * max_points
    for index, observation in enumerate(observations):
        slot = min(max_points - 1, int(index / bucket_size))
        current = buckets[slot]
        if current is None:
            buckets[slot] = observation
            continue
        # Prefer a failure over a success, then the higher latency.
        if current.is_up and not observation.is_up:
            buckets[slot] = observation
        elif current.is_up == observation.is_up:
            current_latency = current.latency_ms or 0.0
            candidate_latency = observation.latency_ms or 0.0
            if candidate_latency > current_latency:
                buckets[slot] = observation
    return [b for b in buckets if b is not None]


def render_latency_svg(
    observations: Sequence[ObservationSummary],
    *,
    window_start: datetime | None = None,
    window_end: datetime | None = None,
    threshold_ms: float | None = None,
    max_points: int = 120,
) -> tuple[str, ChartFacts]:
    """Return ``(svg_markup, facts)`` for the given observations.

    ``observations`` must already be sorted by ``executed_at``. Only values
    that can be derived from them are drawn; there is no synthetic point, no
    interpolation across a gap and no assumed baseline.
    """
    plotted = [o for o in observations]
    available = len(plotted)

    if not plotted:
        return (
            _message_svg(
                "No observations recorded inside the incident window",
                "The chart is omitted rather than approximated.",
            ),
            ChartFacts(
                observations_used=0,
                observations_available=0,
                downsampled=False,
                failed_marks=0,
                max_latency_ms=None,
                rendered=False,
                note="no observations in window",
            ),
        )

    reduced = _bucket(plotted, max_points)
    downsampled = len(reduced) < available

    latencies = [o.latency_ms for o in reduced if o.has_latency]
    failed = [o for o in reduced if not o.is_up]

    if not latencies and not failed:
        return (
            _message_svg(
                "No latency measurements recorded inside the incident window",
                f"{available} check(s) recorded, none with a measured latency.",
            ),
            ChartFacts(
                observations_used=0,
                observations_available=available,
                downsampled=downsampled,
                failed_marks=0,
                max_latency_ms=None,
                rendered=False,
                note="no latency measurements",
            ),
        )

    # ── scales ────────────────────────────────────────────────────────────
    times = [o.executed_at for o in plotted]
    start = window_start or min(times)
    end = window_end or max(times)
    span = max((end - start).total_seconds(), 1.0)

    ceiling = max([*(latencies or [0.0]), float(threshold_ms or 0.0), 1.0])
    # 10% headroom so the peak is not drawn on the frame.
    y_max = ceiling * 1.1

    def x_of(moment: datetime) -> float:
        offset = (moment - start).total_seconds() / span
        return PADDING_LEFT + max(0.0, min(1.0, offset)) * PLOT_WIDTH

    def y_of(value: float) -> float:
        return PADDING_TOP + PLOT_HEIGHT - (value / y_max) * PLOT_HEIGHT

    baseline_y = PADDING_TOP + PLOT_HEIGHT

    parts: list[str] = [
        (
            f'<svg width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" '
            'xmlns="http://www.w3.org/2000/svg" role="img" '
            'aria-label="Observed latency and failed checks during the incident window">'
        ),
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#ffffff" />',
    ]

    # ── grid + y axis labels ──────────────────────────────────────────────
    for fraction in (0.0, 0.5, 1.0):
        y = PADDING_TOP + PLOT_HEIGHT - fraction * PLOT_HEIGHT
        parts.append(
            f'<line x1="{PADDING_LEFT}" y1="{y:.1f}" x2="{WIDTH - PADDING_RIGHT}" '
            f'y2="{y:.1f}" stroke="{_COLOUR_GRID}" stroke-width="1" />'
        )
        parts.append(
            f'<text x="{PADDING_LEFT - 8}" y="{y + 4:.1f}" text-anchor="end" '
            f'font-size="10" fill="{_COLOUR_TEXT}">{y_max * fraction:.0f}</text>'
        )
    parts.append(
        f'<text x="{PADDING_LEFT - 8}" y="{PADDING_TOP - 6}" text-anchor="end" '
        f'font-size="9" fill="{_COLOUR_TEXT}">ms</text>'
    )

    # ── x axis: first / middle / last timestamps actually observed ────────
    for moment, anchor in (
        (start, "start"),
        (start + (end - start) / 2, "middle"),
        (end, "end"),
    ):
        anchor_x = {
            "start": PADDING_LEFT,
            "middle": PADDING_LEFT + PLOT_WIDTH / 2,
            "end": WIDTH - PADDING_RIGHT,
        }[anchor]
        parts.append(
            f'<text x="{anchor_x:.1f}" y="{HEIGHT - 12}" text-anchor="{anchor}" '
            f'font-size="10" fill="{_COLOUR_TEXT}">'
            f'{moment.strftime("%H:%M:%S")}</text>'
        )

    # ── alert threshold, only when one is configured ──────────────────────
    if threshold_ms and threshold_ms > 0:
        y = y_of(float(threshold_ms))
        parts.append(
            f'<line x1="{PADDING_LEFT}" y1="{y:.1f}" x2="{WIDTH - PADDING_RIGHT}" '
            f'y2="{y:.1f}" stroke="{_COLOUR_THRESHOLD}" stroke-width="1" '
            'stroke-dasharray="5 4" />'
        )
        parts.append(
            f'<text x="{WIDTH - PADDING_RIGHT}" y="{y - 4:.1f}" '
            f'text-anchor="end" font-size="9" fill="{_COLOUR_THRESHOLD}">'
            f"alert threshold {threshold_ms:.0f} ms</text>"
        )

    # ── the measured series ───────────────────────────────────────────────
    series = [o for o in reduced if o.has_latency]
    if len(series) >= 2:
        points = " ".join(
            f"{x_of(o.executed_at):.1f},{y_of(o.latency_ms):.1f}" for o in series
        )
        parts.append(
            f'<polyline fill="none" stroke="{_COLOUR_LINE}" stroke-width="1.6" '
            f'points="{points}" />'
        )
    elif len(series) == 1:
        only = series[0]
        parts.append(
            f'<circle cx="{x_of(only.executed_at):.1f}" cy="{y_of(only.latency_ms):.1f}" '
            f'r="3" fill="{_COLOUR_LINE}" />'
        )

    # ── failures, on the baseline where no latency exists ─────────────────
    for observation in failed:
        y = (
            y_of(observation.latency_ms)
            if observation.has_latency
            else baseline_y - 4
        )
        parts.append(
            f'<circle cx="{x_of(observation.executed_at):.1f}" cy="{y:.1f}" '
            f'r="3" fill="{_COLOUR_FAIL}" />'
        )

    parts.append(
        f'<line x1="{PADDING_LEFT}" y1="{baseline_y:.1f}" '
        f'x2="{WIDTH - PADDING_RIGHT}" y2="{baseline_y:.1f}" '
        f'stroke="{_COLOUR_AXIS}" stroke-width="1" />'
    )

    caption = (
        f"{available} observation(s) in window"
        + (f", plotted as {len(reduced)} worst-per-bucket" if downsampled else "")
        + (f", {len(failed)} failed" if failed else "")
    )
    parts.append(
        f'<text x="{PADDING_LEFT}" y="{HEIGHT - 1}" font-size="9" '
        f'fill="{_COLOUR_TEXT}">{caption}</text>'
    )
    parts.append("</svg>")

    return (
        "".join(parts),
        ChartFacts(
            observations_used=len(reduced),
            observations_available=available,
            downsampled=downsampled,
            failed_marks=len(failed),
            max_latency_ms=round(max(latencies), 3) if latencies else None,
            rendered=True,
            note=caption,
        ),
    )


__all__ = ["ChartFacts", "render_latency_svg"]
