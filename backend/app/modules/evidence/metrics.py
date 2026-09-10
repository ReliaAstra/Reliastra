"""Evidence metrics, computed from the incident window.

Every figure in an evidence artifact comes from here, and everything here is a
pure function of the check results that fall inside the incident's own time
window. Nothing is read from a rolling clock, nothing is defaulted to a
plausible number, and nothing is estimated.

Why this module exists: the report used to print ``Measured 24h Uptime`` taken
from a rolling 24-hour aggregate evaluated at generation time, while the same
document carried an incident ``time_window`` the arithmetic ignored. For an SLA
dispute those are different claims, and only one of them describes the
incident. The rolling figure is still useful, so it is computed too - but as a
separately labelled context metric, never as the incident measurement.

Conventions, stated because they change the numbers:

* **Window** is ``[start, end]`` inclusive at both ends. The first and last
  observations therefore count. Callers pass ``resolved_at`` as ``end`` (or the
  generation time for an incident that is somehow still open).
* **Availability** is ``up / measured``, where ``measured`` excludes checks the
  probe never issued. A request RELIASTRA refused to send (SSRF policy block)
  is a configuration fault on our side of the boundary; counting it as vendor
  downtime would inflate the vendor's blame. Blocked checks are reported
  separately so the exclusion is visible rather than silent.
* **Latency statistics** use only checks that produced a real measurement
  (``latency_ms > 0``). Failed and blocked checks record ``0.0``, which is an
  absence of measurement, not a fast response.
* **No data is never 100%.** An empty or fully blocked window yields ``None``
  for availability and latency. Turning absence into a number is how a report
  ends up certifying uptime nobody measured.
* All datetimes are normalised to aware UTC; naive values are interpreted as
  UTC, matching the database columns.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timezone

from app.modules.checks.constants import (
    BLOCKED_BY_SECURITY_POLICY_PREFIX,
    REDIRECT_BLOCKED_BY_SECURITY_POLICY_PREFIX,
)

#: Prefixes that mean "RELIASTRA refused to probe", not "the target failed".
_BLOCKED_PREFIXES = (
    BLOCKED_BY_SECURITY_POLICY_PREFIX,
    REDIRECT_BLOCKED_BY_SECURITY_POLICY_PREFIX,
)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def is_blocked_check(error_message: str | None) -> bool:
    """True when the probe was refused by policy rather than failing at target."""
    if not error_message:
        return False
    return any(error_message.startswith(prefix) for prefix in _BLOCKED_PREFIXES)


@dataclass(frozen=True)
class ObservationSummary:
    """One check result, reduced to what the artifact is allowed to claim."""

    executed_at: datetime
    is_up: bool
    latency_ms: float | None
    status_code: int | None
    error_message: str | None
    observation_point: str
    blocked: bool

    @property
    def measured(self) -> bool:
        """Did this check actually reach (or fail at) the target?"""
        return not self.blocked

    @property
    def has_latency(self) -> bool:
        return self.latency_ms is not None and self.latency_ms > 0


def summarise(row) -> ObservationSummary:
    """Adapt a ``CheckResult`` row (or anything shaped like one)."""
    return ObservationSummary(
        executed_at=_aware(row.executed_at),
        is_up=bool(row.is_up),
        latency_ms=float(row.latency_ms) if row.latency_ms is not None else None,
        status_code=row.status_code,
        error_message=row.error_message,
        observation_point=row.region,
        blocked=is_blocked_check(row.error_message),
    )


def _percentile(sorted_values: Sequence[float], percentile: float) -> float | None:
    """Nearest-rank percentile. Deterministic: no interpolation, no rounding."""
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = max(1, min(len(sorted_values), -(-int(percentile * len(sorted_values)) // 100)))
    return sorted_values[rank - 1]


def _longest_failure_run(observations: Sequence[ObservationSummary]) -> int:
    longest = current = 0
    for observation in observations:
        if observation.blocked:
            # A refused probe neither breaks nor extends a failure run; it is
            # not an observation of the target at all.
            continue
        if observation.is_up:
            current = 0
        else:
            current += 1
            longest = max(longest, current)
    return longest


@dataclass(frozen=True)
class IncidentWindowMetrics:
    """The measured facts about one incident window."""

    window_start: datetime
    window_end: datetime
    total_checks: int
    measured_checks: int
    up_checks: int
    down_checks: int
    blocked_checks: int
    #: ``up / measured * 100``; None when nothing was measured.
    availability_pct: float | None
    avg_latency_ms: float | None
    min_latency_ms: float | None
    max_latency_ms: float | None
    p50_latency_ms: float | None
    p95_latency_ms: float | None
    longest_failure_run: int
    observation_points: tuple[str, ...]
    first_observed_at: datetime | None
    last_observed_at: datetime | None
    window_seconds: float
    #: True when the window holds too few measurements to characterise it.
    insufficient_data: bool
    #: Machine-readable reason for ``insufficient_data``, rendered verbatim.
    data_note: str

    @property
    def duration_seconds(self) -> float:
        return max(0.0, (self.window_end - self.window_start).total_seconds())

    def as_dict(self) -> dict[str, object]:
        """JSON-safe payload for the evidence document. Stable key order."""
        return {
            "window_start": self.window_start.isoformat(),
            "window_end": self.window_end.isoformat(),
            "window_seconds": round(self.window_seconds, 3),
            "total_checks": self.total_checks,
            "measured_checks": self.measured_checks,
            "up_checks": self.up_checks,
            "down_checks": self.down_checks,
            "blocked_checks_excluded": self.blocked_checks,
            "availability_pct": self.availability_pct,
            "avg_latency_ms": self.avg_latency_ms,
            "min_latency_ms": self.min_latency_ms,
            "max_latency_ms": self.max_latency_ms,
            "p50_latency_ms": self.p50_latency_ms,
            "p95_latency_ms": self.p95_latency_ms,
            "longest_failure_run": self.longest_failure_run,
            "observation_points": list(self.observation_points),
            "first_observed_at": (
                self.first_observed_at.isoformat() if self.first_observed_at else None
            ),
            "last_observed_at": (
                self.last_observed_at.isoformat() if self.last_observed_at else None
            ),
            "insufficient_data": self.insufficient_data,
            "data_note": self.data_note,
        }


#: Below this many measured checks the window cannot characterise an outage,
#: and the artifact says so instead of printing a confident percentage.
MINIMUM_MEASURED_CHECKS = 2


def compute_window_metrics(
    rows: Sequence,
    *,
    window_start: datetime,
    window_end: datetime,
    minimum_measured_checks: int = MINIMUM_MEASURED_CHECKS,
) -> IncidentWindowMetrics:
    """Reduce the check results inside ``[window_start, window_end]``.

    ``rows`` may be in any order; they are sorted by timestamp so the failure
    run and first/last observations are correct regardless of how the caller
    fetched them. Rows outside the window are ignored, so a caller that
    over-fetches cannot skew the numbers.
    """
    start = _aware(window_start)
    end = _aware(window_end)
    # A caller passing an inverted window gets an empty, clearly-flagged
    # result rather than a silently huge one.
    end = max(end, start)

    observations = sorted(
        (
            summarise(row)
            for row in rows
            if start <= _aware(row.executed_at) <= end
        ),
        key=lambda o: o.executed_at,
    )

    measured = [o for o in observations if o.measured]
    blocked = [o for o in observations if o.blocked]
    up = [o for o in measured if o.is_up]
    down = [o for o in measured if not o.is_up]

    availability = (
        round(len(up) / len(measured) * 100, 4) if measured else None
    )

    latencies = sorted(o.latency_ms for o in measured if o.has_latency)
    avg_latency = (
        round(sum(latencies) / len(latencies), 3) if latencies else None
    )

    points: list[str] = []
    for observation in observations:
        if observation.observation_point not in points:
            points.append(observation.observation_point)

    if not measured:
        note = (
            "No checks reached the target inside the incident window"
            + (
                f" ({len(blocked)} were blocked by policy and excluded)."
                if blocked
                else "."
            )
        )
        insufficient = True
    elif len(measured) < minimum_measured_checks:
        note = (
            f"Only {len(measured)} measured check(s) inside the incident "
            f"window; at least {minimum_measured_checks} are needed to "
            "characterise it."
        )
        insufficient = True
    elif not latencies:
        note = (
            "No successful check inside the window produced a latency "
            "measurement."
        )
        insufficient = False
    else:
        note = ""
        insufficient = False

    return IncidentWindowMetrics(
        window_start=start,
        window_end=end,
        total_checks=len(observations),
        measured_checks=len(measured),
        up_checks=len(up),
        down_checks=len(down),
        blocked_checks=len(blocked),
        availability_pct=availability,
        avg_latency_ms=avg_latency,
        min_latency_ms=round(latencies[0], 3) if latencies else None,
        max_latency_ms=round(latencies[-1], 3) if latencies else None,
        p50_latency_ms=(
            round(_percentile(latencies, 50), 3) if latencies else None
        ),
        p95_latency_ms=(
            round(_percentile(latencies, 95), 3) if latencies else None
        ),
        longest_failure_run=_longest_failure_run(observations),
        observation_points=tuple(points),
        first_observed_at=observations[0].executed_at if observations else None,
        last_observed_at=observations[-1].executed_at if observations else None,
        window_seconds=(end - start).total_seconds(),
        insufficient_data=insufficient,
        data_note=note,
    )


@dataclass(frozen=True)
class SlaImpact:
    """Availability shortfall against a stated target, with its inputs kept."""

    target_uptime_pct: float
    measured_availability_pct: float | None
    #: ``target - measured``, floored at zero; None when nothing was measured.
    impact_pct: float | None
    #: Seconds of measured unavailability inside the window.
    measured_downtime_seconds: float
    #: Allowable downtime implied by the target over the window.
    allowable_downtime_seconds: float
    exceeded_allowance: bool
    basis: str

    def as_dict(self) -> dict[str, object]:
        return {
            "target_uptime_pct": self.target_uptime_pct,
            "measured_availability_pct": self.measured_availability_pct,
            "impact_pct": self.impact_pct,
            "measured_downtime_seconds": round(self.measured_downtime_seconds, 3),
            "allowable_downtime_seconds": round(self.allowable_downtime_seconds, 3),
            "exceeded_allowance": self.exceeded_allowance,
            "basis": self.basis,
        }


def compute_sla_impact(
    metrics: IncidentWindowMetrics,
    *,
    target_uptime_pct: float = 100.0,
) -> SlaImpact:
    """Express the window's availability as a shortfall against *target*.

    Downtime is measured, not extrapolated: it is the share of measured checks
    that failed, applied to the window duration. With no measured checks there
    is no impact figure - returning 0% would certify a clean incident that was
    never observed, and returning 100% would invent a total outage.
    """
    if metrics.availability_pct is None:
        return SlaImpact(
            target_uptime_pct=target_uptime_pct,
            measured_availability_pct=None,
            impact_pct=None,
            measured_downtime_seconds=0.0,
            allowable_downtime_seconds=(
                metrics.duration_seconds * (100.0 - target_uptime_pct) / 100.0
            ),
            exceeded_allowance=False,
            basis=(
                "No measured checks inside the incident window; impact is "
                "not calculable and is not assumed."
            ),
        )

    shortfall = max(0.0, target_uptime_pct - metrics.availability_pct)
    downtime = metrics.duration_seconds * shortfall / 100.0
    allowance = metrics.duration_seconds * (100.0 - target_uptime_pct) / 100.0
    return SlaImpact(
        target_uptime_pct=target_uptime_pct,
        measured_availability_pct=metrics.availability_pct,
        impact_pct=round(shortfall, 4),
        measured_downtime_seconds=downtime,
        allowable_downtime_seconds=allowance,
        exceeded_allowance=downtime > allowance + 1e-9,
        basis=(
            f"{metrics.down_checks} of {metrics.measured_checks} measured "
            f"checks failed inside the {metrics.duration_seconds:.0f}s window "
            f"({len(metrics.observation_points)} observation point(s))."
        ),
    )


__all__ = [
    "MINIMUM_MEASURED_CHECKS",
    "IncidentWindowMetrics",
    "ObservationSummary",
    "SlaImpact",
    "compute_sla_impact",
    "compute_window_metrics",
    "is_blocked_check",
    "summarise",
]
