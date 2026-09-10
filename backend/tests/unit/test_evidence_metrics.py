"""Evidence window metrics: the arithmetic behind every number in the artifact.

These are pure functions, so they are tested directly and exhaustively rather
than through a mocked service. The cases here are the ones that used to be
wrong: a rolling 24-hour figure presented as the incident measurement, an
empty window defaulting to 100% uptime, and blocked probes counted as vendor
downtime.
"""

import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.modules.evidence.metrics import (
    MINIMUM_MEASURED_CHECKS,
    compute_sla_impact,
    compute_window_metrics,
    is_blocked_check,
    summarise,
)

T0 = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)


def row(
    minute: int,
    *,
    is_up: bool = True,
    latency_ms: float | None = 100.0,
    error_message: str | None = None,
    region: str = "primary",
    status_code: int | None = 200,
) -> SimpleNamespace:
    """A ``CheckResult``-shaped row, offset ``minute`` minutes from ``T0``."""
    return SimpleNamespace(
        executed_at=T0 + timedelta(minutes=minute),
        is_up=is_up,
        latency_ms=latency_ms,
        error_message=error_message,
        status_code=status_code,
        region=region,
    )


def window(minutes: int = 60) -> dict[str, datetime]:
    return {"window_start": T0, "window_end": T0 + timedelta(minutes=minutes)}


# ── blocked-probe classification ────────────────────────────────────────────


def test_blocked_probe_is_recognised_by_its_error_prefix():
    from app.modules.checks.constants import (
        BLOCKED_BY_SECURITY_POLICY_PREFIX,
        REDIRECT_BLOCKED_BY_SECURITY_POLICY_PREFIX,
    )

    assert is_blocked_check(f"{BLOCKED_BY_SECURITY_POLICY_PREFIX} 10.0.0.1")
    assert is_blocked_check(f"{REDIRECT_BLOCKED_BY_SECURITY_POLICY_PREFIX} 169.254.1.1")
    assert not is_blocked_check("500 Internal Server Error")
    assert not is_blocked_check(None)
    assert not is_blocked_check("")


def test_summarise_maps_region_to_observation_point():
    summary = summarise(row(0, region="edge-1"))
    assert summary.observation_point == "edge-1"
    assert summary.measured is True
    assert summary.has_latency is True


def test_summarise_marks_a_zero_latency_failure_as_unmeasured():
    summary = summarise(row(0, is_up=False, latency_ms=0.0, status_code=None))
    assert summary.has_latency is False


# ── window bounds ───────────────────────────────────────────────────────────


def test_window_is_inclusive_at_both_ends():
    rows = [row(0), row(60)]
    metrics = compute_window_metrics(rows, **window(60))
    assert metrics.total_checks == 2
    assert metrics.first_observed_at == T0
    assert metrics.last_observed_at == T0 + timedelta(minutes=60)


def test_observations_outside_the_window_are_ignored():
    rows = [
        row(-30),  # before the incident: healthy, must not dilute the outage
        row(0, is_up=False, latency_ms=None),
        row(10, is_up=False, latency_ms=None),
        row(200),  # long after
    ]
    metrics = compute_window_metrics(rows, **window(60))
    assert metrics.total_checks == 2
    assert metrics.up_checks == 0
    assert metrics.availability_pct == 0.0


def test_rows_need_not_arrive_in_order():
    rows = [row(20, is_up=False, latency_ms=None), row(0), row(10)]
    metrics = compute_window_metrics(rows, **window(60))
    assert metrics.first_observed_at == T0
    assert metrics.last_observed_at == T0 + timedelta(minutes=20)
    assert metrics.longest_failure_run == 1


def test_naive_timestamps_are_read_as_utc():
    naive = SimpleNamespace(
        # No tzinfo on purpose: naive values must be read as UTC.
        executed_at=datetime(2026, 3, 1, 12, 30),  # noqa: DTZ001
        is_up=True,
        latency_ms=100.0,
        error_message=None,
        status_code=200,
        region="primary",
    )
    metrics = compute_window_metrics([naive, row(0)], **window(60))
    assert metrics.total_checks == 2
    assert metrics.first_observed_at.tzinfo is not None


def test_inverted_window_yields_no_observations_rather_than_a_negative_one():
    metrics = compute_window_metrics(
        [row(0), row(10)],
        window_start=T0 + timedelta(minutes=30),
        window_end=T0,
    )
    assert metrics.total_checks == 0
    assert metrics.availability_pct is None
    assert metrics.insufficient_data is True


# ── availability ────────────────────────────────────────────────────────────


def test_availability_is_measured_over_the_incident_window_only():
    rows = [row(i) for i in range(8)] + [
        row(8, is_up=False, latency_ms=None),
        row(9, is_up=False, latency_ms=None),
    ]
    metrics = compute_window_metrics(rows, **window(60))
    assert (metrics.up_checks, metrics.down_checks) == (8, 2)
    assert metrics.availability_pct == pytest.approx(80.0)
    assert metrics.insufficient_data is False


def test_blocked_checks_are_excluded_from_the_denominator():
    """A probe RELIASTRA refused is not vendor downtime."""
    from app.modules.checks.constants import BLOCKED_BY_SECURITY_POLICY_PREFIX

    rows = [
        row(0),
        row(1),
        row(2, is_up=False, latency_ms=None),
        row(3, is_up=False, latency_ms=0.0, error_message=f"{BLOCKED_BY_SECURITY_POLICY_PREFIX} 10.1.2.3"),
    ]
    metrics = compute_window_metrics(rows, **window(60))
    assert metrics.total_checks == 4
    assert metrics.blocked_checks == 1
    assert metrics.measured_checks == 3
    assert metrics.availability_pct == pytest.approx(200.0 / 3.0)


def test_empty_window_is_not_reported_as_full_uptime():
    metrics = compute_window_metrics([], **window(60))
    assert metrics.availability_pct is None
    assert metrics.avg_latency_ms is None
    assert metrics.insufficient_data is True
    assert metrics.data_note


def test_fully_blocked_window_is_not_reported_as_uptime():
    from app.modules.checks.constants import BLOCKED_BY_SECURITY_POLICY_PREFIX

    rows = [
        row(i, is_up=False, latency_ms=0.0, error_message=f"{BLOCKED_BY_SECURITY_POLICY_PREFIX} 10.0.0.{i}")
        for i in range(5)
    ]
    metrics = compute_window_metrics(rows, **window(60))
    assert metrics.measured_checks == 0
    assert metrics.blocked_checks == 5
    assert metrics.availability_pct is None
    assert metrics.insufficient_data is True


def test_single_measured_check_is_flagged_as_insufficient():
    metrics = compute_window_metrics([row(0)], **window(60))
    assert metrics.measured_checks == 1
    assert metrics.measured_checks < MINIMUM_MEASURED_CHECKS
    assert metrics.insufficient_data is True
    # The number is still reported - it is real - but the artifact must say
    # that one check cannot characterise an incident.
    assert metrics.availability_pct == 100.0


def test_all_up_window_reports_full_availability():
    rows = [row(i) for i in range(5)]
    metrics = compute_window_metrics(rows, **window(60))
    assert metrics.availability_pct == 100.0
    assert metrics.insufficient_data is False


# ── latency ─────────────────────────────────────────────────────────────────


def test_latency_statistics_use_measured_checks_only():
    rows = [
        row(0, latency_ms=100.0),
        row(1, latency_ms=300.0),
        row(2, is_up=False, latency_ms=0.0),  # failure: absence, not "fast"
        row(3, latency_ms=None),
    ]
    metrics = compute_window_metrics(rows, **window(60))
    assert metrics.avg_latency_ms == pytest.approx(200.0)
    assert metrics.min_latency_ms == pytest.approx(100.0)
    assert metrics.max_latency_ms == pytest.approx(300.0)


def test_percentiles_use_nearest_rank_and_are_deterministic():
    rows = [row(i, latency_ms=float(value)) for i, value in enumerate(range(1, 21))]
    metrics = compute_window_metrics(rows, **window(60))
    assert metrics.p50_latency_ms == 10.0  # ceil(0.50 * 20) = 10th value
    assert metrics.p95_latency_ms == 19.0  # ceil(0.95 * 20) = 19th value
    assert metrics.avg_latency_ms == pytest.approx(10.5)


def test_single_measurement_makes_every_percentile_that_value():
    metrics = compute_window_metrics([row(0, latency_ms=123.0), row(1, latency_ms=None)], **window(60))
    assert metrics.p50_latency_ms == 123.0
    assert metrics.p95_latency_ms == 123.0


def test_no_latency_measurement_leaves_statistics_none():
    rows = [
        row(0, is_up=False, latency_ms=0.0),
        row(1, is_up=False, latency_ms=None),
    ]
    metrics = compute_window_metrics(rows, **window(60))
    assert metrics.avg_latency_ms is None
    assert metrics.p95_latency_ms is None
    assert metrics.down_checks == 2


# ── failure runs and observation points ─────────────────────────────────────


def test_longest_failure_run_counts_the_worst_consecutive_stretch():
    rows = [
        row(0),
        row(1, is_up=False, latency_ms=None),
        row(2, is_up=False, latency_ms=None),
        row(3),
        row(4, is_up=False, latency_ms=None),
    ]
    metrics = compute_window_metrics(rows, **window(60))
    assert metrics.longest_failure_run == 2


def test_blocked_probe_neither_extends_nor_breaks_a_failure_run():
    from app.modules.checks.constants import BLOCKED_BY_SECURITY_POLICY_PREFIX

    rows = [
        row(0, is_up=False, latency_ms=None),
        row(1, is_up=False, latency_ms=0.0, error_message=f"{BLOCKED_BY_SECURITY_POLICY_PREFIX} 10.0.0.9"),
        row(2, is_up=False, latency_ms=None),
    ]
    metrics = compute_window_metrics(rows, **window(60))
    assert metrics.longest_failure_run == 2


def test_observation_points_are_reported_in_first_seen_order_without_duplicates():
    rows = [row(0, region="edge-2"), row(1, region="edge-1"), row(2, region="edge-2")]
    metrics = compute_window_metrics(rows, **window(60))
    assert metrics.observation_points == ("edge-2", "edge-1")


# ── payload ─────────────────────────────────────────────────────────────────


def test_as_dict_is_json_serialisable_with_a_stable_key_order():
    rows = [row(0), row(1, is_up=False, latency_ms=None)]
    payload = compute_window_metrics(rows, **window(60)).as_dict()
    encoded = json.dumps(payload, sort_keys=True)
    assert encoded == json.dumps(json.loads(encoded), sort_keys=True)
    assert payload["availability_pct"] == 50.0
    assert payload["blocked_checks_excluded"] == 0
    assert payload["window_seconds"] == 3600.0


# ── SLA impact ──────────────────────────────────────────────────────────────


def test_sla_impact_is_target_minus_measured():
    rows = [row(i) for i in range(9)] + [row(9, is_up=False, latency_ms=None)]
    metrics = compute_window_metrics(rows, **window(60))
    impact = compute_sla_impact(metrics, target_uptime_pct=100.0)
    assert impact.measured_availability_pct == pytest.approx(90.0)
    assert impact.impact_pct == pytest.approx(10.0)
    assert impact.exceeded_allowance is True


def test_sla_impact_is_floored_at_zero_when_availability_exceeds_the_target():
    rows = [row(i) for i in range(10)]
    metrics = compute_window_metrics(rows, **window(60))
    impact = compute_sla_impact(metrics, target_uptime_pct=99.0)
    assert impact.impact_pct == 0.0
    assert impact.exceeded_allowance is False


def test_sla_impact_is_not_invented_when_nothing_was_measured():
    metrics = compute_window_metrics([], **window(60))
    impact = compute_sla_impact(metrics, target_uptime_pct=100.0)
    assert impact.impact_pct is None
    assert impact.measured_availability_pct is None
    assert impact.basis


def test_sla_impact_states_its_basis_with_the_window_it_used():
    rows = [row(0), row(30, is_up=False, latency_ms=None)]
    metrics = compute_window_metrics(rows, **window(60))
    impact = compute_sla_impact(metrics, target_uptime_pct=100.0)
    assert "2 measured checks" in impact.basis
    assert "3600s" in impact.basis
