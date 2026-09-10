"""Detection policy: the rule that decides whether an incident exists.

This is a pure function of the recorded checks, so it can be exercised
exhaustively - which is the point. Under a single observation point there is no
quorum to negotiate and no timing heuristic to second-guess: N consecutive
failures open an incident, M consecutive successes close it, and the same input
always produces the same decision.

The multi-topology cases are kept here too. That architecture is retained for a
real future fleet of independent points, and the tests pin the one property
that matters most: two scheduling labels emitted by one worker are not two
observation points, and the rule never pretends otherwise.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.modules.checks.detection import (
    CheckOutcome,
    DetectionPolicy,
    DetectionRule,
    ObservationTopology,
    evaluate_detection,
    policy_from_settings,
)

T0 = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)


def outcome(is_up: bool, *, minute: int = 0, point: str = "primary") -> CheckOutcome:
    return CheckOutcome(
        is_up=is_up, observation_point=point, executed_at=T0 + timedelta(minutes=minute)
    )


def run(is_up_values, *, point: str = "primary") -> list[CheckOutcome]:
    """A chronological history of checks, one minute apart."""
    return [
        outcome(value, minute=minute, point=point)
        for minute, value in enumerate(is_up_values)
    ]


SINGLE = DetectionPolicy(
    topology=ObservationTopology.SINGLE, failure_threshold=3, recovery_threshold=2
)
MULTI = DetectionPolicy(
    topology=ObservationTopology.MULTI,
    failure_threshold=1,
    recovery_threshold=1,
    min_observation_points=2,
    quorum_window_seconds=60,
)


# ── single topology: debouncing ─────────────────────────────────────────────


def test_a_transient_failure_below_the_threshold_opens_nothing():
    decision = evaluate_detection(
        policy=SINGLE,
        current=outcome(False),
        history=run([True, True]),
        has_open_incident=False,
    )
    assert decision.open_incident is False
    assert decision.confirmed is False
    assert decision.consecutive_failures == 1
    assert decision.required == 3


def test_the_threshold_is_exactly_the_configured_count():
    history = run([True, False, False])
    below = evaluate_detection(
        policy=SINGLE, current=outcome(False, minute=3), history=history,
        has_open_incident=False,
    )
    # history already holds two failures; the current check is the third.
    assert below.consecutive_failures == 3
    assert below.open_incident is True
    assert below.confirmed is True
    assert below.rule is DetectionRule.SINGLE_CONSECUTIVE_FAILURES


def test_the_check_just_below_the_threshold_does_not_open():
    decision = evaluate_detection(
        policy=SINGLE,
        current=outcome(False, minute=2),
        history=run([True, False]),
        has_open_incident=False,
    )
    assert decision.consecutive_failures == 2
    assert decision.open_incident is False


def test_a_success_resets_the_failure_run():
    decision = evaluate_detection(
        policy=SINGLE,
        current=outcome(False, minute=4),
        history=run([False, False, True, False]),
        has_open_incident=False,
    )
    assert decision.consecutive_failures == 2
    assert decision.open_incident is False


# ── single topology: idempotency ────────────────────────────────────────────


def test_further_failures_while_open_do_not_open_a_second_incident():
    decision = evaluate_detection(
        policy=SINGLE,
        current=outcome(False, minute=9),
        history=run([False] * 9),
        has_open_incident=True,
    )
    assert decision.confirmed is True
    assert decision.open_incident is False
    assert decision.resolve_incident is False


def test_a_recovery_signal_with_no_open_incident_does_not_resolve():
    decision = evaluate_detection(
        policy=SINGLE,
        current=outcome(True, minute=5),
        history=run([True, True, True, True]),
        has_open_incident=False,
    )
    assert decision.resolve_incident is False


def test_the_same_result_evaluated_twice_cannot_open_twice():
    """A scheduler retry or a duplicated task lands here a second time."""
    history = run([False, False])
    first = evaluate_detection(
        policy=SINGLE, current=outcome(False, minute=2), history=history,
        has_open_incident=False,
    )
    second = evaluate_detection(
        policy=SINGLE, current=outcome(False, minute=2), history=history,
        has_open_incident=True,
    )
    assert first.open_incident is True
    assert second.open_incident is False


# ── single topology: recovery and reopening ─────────────────────────────────


def test_consecutive_successes_resolve_the_incident():
    decision = evaluate_detection(
        policy=SINGLE,
        current=outcome(True, minute=12),
        history=run([False] * 10 + [True]),
        has_open_incident=True,
    )
    assert decision.resolve_incident is True
    assert decision.consecutive_successes == 2
    assert decision.rule is DetectionRule.SINGLE_CONSECUTIVE_SUCCESSES


def test_one_success_does_not_resolve():
    decision = evaluate_detection(
        policy=SINGLE,
        current=outcome(True, minute=11),
        history=run([False] * 10),
        has_open_incident=True,
    )
    assert decision.resolve_incident is False
    assert decision.consecutive_successes == 1


def test_a_new_outage_after_recovery_opens_a_new_incident():
    decision = evaluate_detection(
        policy=SINGLE,
        current=outcome(False, minute=22),
        history=run([False] * 8 + [True, True, True] + [False, False]),
        has_open_incident=False,
    )
    assert decision.open_incident is True
    assert decision.consecutive_failures == 3


def test_an_interleaved_success_prevents_a_false_recovery():
    decision = evaluate_detection(
        policy=SINGLE,
        current=outcome(True, minute=12),
        history=run([False] * 9 + [True, False]),
        has_open_incident=True,
    )
    assert decision.resolve_incident is False
    assert decision.consecutive_successes == 1


# ── single topology: labels are not observation points ──────────────────────


def test_two_labels_from_one_machine_are_not_independent_points():
    """The failure count comes from persistence, never from label variety."""
    history = [
        outcome(False, minute=0, point="us-east"),
        outcome(False, minute=1, point="eu-west"),
    ]
    decision = evaluate_detection(
        policy=SINGLE,
        current=outcome(False, minute=2, point="ap-south"),
        history=history,
        has_open_incident=False,
    )
    assert decision.open_incident is True
    # The decision is explained by the consecutive rule, not by agreement.
    assert decision.rule is DetectionRule.SINGLE_CONSECUTIVE_FAILURES
    assert decision.agreeing_points == ()
    metadata = decision.as_metadata()
    assert metadata["agreeing_observation_points"] == []
    assert metadata["rule"] == "single.consecutive_failures"


# ── multi topology: quorum, retained for a real fleet ───────────────────────


def test_multi_below_quorum_opens_nothing():
    window = [outcome(False, minute=0, point="us-east")]
    decision = evaluate_detection(
        policy=MULTI,
        current=outcome(False, minute=0, point="us-east"),
        history=window,
        window=window,
        has_open_incident=False,
        now=T0,
    )
    assert decision.open_incident is False


def test_multi_quorum_across_distinct_points_opens():
    window = [outcome(False, minute=0, point="us-east")]
    decision = evaluate_detection(
        policy=MULTI,
        current=outcome(False, minute=0, point="eu-west"),
        history=window,
        window=window,
        has_open_incident=False,
        now=T0,
    )
    assert decision.open_incident is True
    assert decision.rule is DetectionRule.MULTI_OBSERVATION_QUORUM
    assert set(decision.agreeing_points) == {"us-east", "eu-west"}
    assert decision.required == 2


def test_multi_repeat_from_the_same_point_is_not_a_second_opinion():
    window = [outcome(False, minute=0, point="us-east")]
    decision = evaluate_detection(
        policy=MULTI,
        current=outcome(False, minute=0, point="us-east"),
        history=window,
        window=window,
        has_open_incident=False,
        now=T0,
    )
    assert decision.open_incident is False
    assert decision.agreeing_points == ("us-east",)


def test_multi_recovery_needs_agreement_too():
    window = [outcome(True, minute=0, point="us-east")]
    decision = evaluate_detection(
        policy=MULTI,
        current=outcome(True, minute=0, point="eu-west"),
        history=window,
        window=window,
        has_open_incident=True,
        now=T0,
    )
    assert decision.resolve_incident is True
    assert decision.rule is DetectionRule.MULTI_RECOVERY_QUORUM


def test_multi_stale_window_does_not_count_towards_quorum():
    """Agreement means agreement *now*, not agreement across the day."""
    stale = [outcome(False, minute=-30, point="us-east")]
    decision = evaluate_detection(
        policy=MULTI,
        current=outcome(False, minute=0, point="eu-west"),
        history=stale,
        window=stale,
        has_open_incident=False,
        now=T0,
    )
    assert decision.open_incident is False


# ── policy construction ─────────────────────────────────────────────────────


class _Settings:
    def __init__(self, **kwargs):
        self.OBSERVATION_TOPOLOGY = kwargs.get("topology", "single")
        self.SINGLE_TOPOLOGY_FAILURE_CHECKS = kwargs.get("failure_threshold", 2)
        self.CONSECUTIVE_RECOVERY_CHECKS = kwargs.get("recovery_threshold", 2)
        self.QUORUM_MIN_REGIONS = kwargs.get("min_observation_points", 2)
        self.QUORUM_WINDOW_SECONDS = kwargs.get("quorum_window_seconds", 60)


def test_policy_defaults_to_single_topology():
    policy = policy_from_settings(_Settings())
    assert policy.topology is ObservationTopology.SINGLE
    assert policy.failure_threshold == 2


def test_policy_takes_the_multi_knobs_from_the_shared_constants():
    """Topology and the single-topology debounce come from settings; the quorum
    knobs are the long-standing constants in ``checks/constants.py``."""
    from app.modules.checks import constants

    policy = policy_from_settings(_Settings(topology="multi"))
    assert policy.topology is ObservationTopology.MULTI
    assert policy.min_observation_points == constants.QUORUM_MIN_REGIONS
    assert policy.quorum_window_seconds == constants.QUORUM_WINDOW_SECONDS
    assert policy.recovery_threshold == constants.CONSECUTIVE_RECOVERY_CHECKS


def test_history_limit_covers_the_longest_run_the_rules_need():
    single = policy_from_settings(_Settings(failure_threshold=3))
    assert single.history_limit() >= 3
    multi = policy_from_settings(_Settings(topology="multi"))
    assert multi.history_limit() >= (
        multi.recovery_threshold * multi.min_observation_points
    )


def test_decision_metadata_is_json_safe_and_self_describing():
    decision = evaluate_detection(
        policy=SINGLE,
        current=outcome(False, minute=3),
        history=run([False, False]),
        has_open_incident=False,
    )
    metadata = decision.as_metadata()
    assert metadata["confirmed"] is True
    assert metadata["required"] == 3
    assert metadata["consecutive_failures"] == 3
    assert isinstance(metadata["reason"], str) and metadata["reason"]
    import json

    assert json.loads(json.dumps(metadata)) == metadata


@pytest.mark.parametrize("failures", [1, 2, 3, 4, 5])
def test_the_rule_is_a_step_function_of_the_consecutive_count(failures):
    history = run([False] * (failures - 1)) if failures > 1 else run([True])
    decision = evaluate_detection(
        policy=SINGLE,
        current=outcome(False, minute=failures),
        history=history,
        has_open_incident=False,
    )
    assert decision.open_incident is (failures >= 3)


# ── the incident window must cover the whole outage ─────────────────────────


def test_an_opening_decision_reports_when_the_run_began():
    """The outage starts at the first failure, not at the confirming check.

    Without this the incident's ``started_at`` - and therefore the evidence
    window - begins one check interval late, and the artifact under-reports
    the outage it is meant to prove.
    """
    history = run([True, False, False])
    decision = evaluate_detection(
        policy=SINGLE,
        current=outcome(False, minute=3),
        history=history,
        has_open_incident=False,
    )
    assert decision.open_incident is True
    assert decision.consecutive_failures == 3
    assert decision.run_started_at == T0 + timedelta(minutes=1)
    assert decision.as_metadata()["run_started_at"] == (
        T0 + timedelta(minutes=1)
    ).isoformat()


def test_a_non_opening_decision_carries_no_start():
    decision = evaluate_detection(
        policy=SINGLE,
        current=outcome(False, minute=1),
        history=run([True]),
        has_open_incident=False,
    )
    assert decision.open_incident is False
    assert decision.run_started_at is None
    assert decision.as_metadata()["run_started_at"] is None


def test_a_recovery_decision_carries_no_start():
    decision = evaluate_detection(
        policy=SINGLE,
        current=outcome(True, minute=12),
        history=run([False] * 10 + [True]),
        has_open_incident=True,
    )
    assert decision.resolve_incident is True
    assert decision.run_started_at is None
