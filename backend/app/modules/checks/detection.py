"""Deterministic incident detection policy.

This module is the single place where "is this an incident?" is decided. It is
a **pure function of its inputs** - no database, no clock reads, no randomness,
no heuristics - so the rule can be tested exhaustively and replayed from stored
check results to reproduce a decision.

Two topologies are supported, because they answer genuinely different
questions:

``single``
    One observation point probes the dependency (the deployed reality: one
    host, one worker). There is no second opinion available, so the only
    honest confirmation signal is *persistence*: the same observation point
    failed N checks in a row. ``SINGLE_TOPOLOGY_FAILURE_CHECKS`` is the
    debounce that keeps a single dropped probe from becoming an incident.

``multi``
    A fleet of genuinely independent observation points. Confirmation is
    *agreement*: ``QUORUM_MIN_REGIONS`` distinct points reported failure inside
    ``QUORUM_WINDOW_SECONDS``.

The distinction matters and must not be blurred: two scheduling labels emitted
by one worker are one observation point wearing two names, and treating them as
a quorum would report a single machine's opinion as independent confirmation.
``region`` on a check result is an identity label for the probe that produced
the row; under ``single`` it carries no confirmation weight at all.

Timestamps are inputs, never read here, so a test can pin them exactly.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum


class ObservationTopology(str, Enum):
    """How many genuinely independent observation points exist."""

    SINGLE = "single"
    MULTI = "multi"


class DetectionRule(str, Enum):
    """Identifier of the rule that produced a decision.

    Persisted in the audit log and rendered in the evidence artifact so a
    reader can tell which rule fired without reverse-engineering the code.
    """

    SINGLE_CONSECUTIVE_FAILURES = "single.consecutive_failures"
    SINGLE_CONSECUTIVE_SUCCESSES = "single.consecutive_successes"
    MULTI_OBSERVATION_QUORUM = "multi.observation_quorum"
    MULTI_RECOVERY_QUORUM = "multi.recovery_quorum"
    NONE = "none"


@dataclass(frozen=True)
class CheckOutcome:
    """The facts the policy needs about one recorded check.

    ``observation_point`` is the probe identity (the ``region`` column). Under
    ``single`` topology it is recorded for traceability and deliberately
    ignored when counting confirmation.
    """

    is_up: bool
    observation_point: str
    executed_at: datetime


@dataclass(frozen=True)
class DetectionDecision:
    """What the caller must do, and why.

    ``confirmed`` records whether *this* check result is a detector-confirmed
    signal. It is independent of ``open_incident``: a confirmed failure during
    an already-open incident is still confirmed, it just must not open a second
    incident.
    """

    open_incident: bool = False
    resolve_incident: bool = False
    confirmed: bool = False
    rule: DetectionRule = DetectionRule.NONE
    reason: str = ""
    #: Consecutive failures ending with the current check (single topology).
    consecutive_failures: int = 0
    #: Consecutive successes ending with the current check (single topology).
    consecutive_successes: int = 0
    #: Distinct observation points that agreed (multi topology).
    agreeing_points: tuple[str, ...] = ()
    #: The threshold the rule required, so the decision is self-describing.
    required: int = 0
    #: When the confirmed run began - the first failure of the run for an
    #: opening decision. The caller stamps this as the incident's
    #: ``started_at`` so the incident window covers the whole outage rather
    #: than starting at the check that happened to cross the threshold.
    run_started_at: datetime | None = None

    def as_metadata(self) -> dict[str, object]:
        """Audit-log/evidence payload. JSON-safe and stable in key order."""
        return {
            "rule": self.rule.value,
            "reason": self.reason,
            "confirmed": self.confirmed,
            "consecutive_failures": self.consecutive_failures,
            "consecutive_successes": self.consecutive_successes,
            "agreeing_observation_points": list(self.agreeing_points),
            "required": self.required,
            "run_started_at": (
                self.run_started_at.isoformat() if self.run_started_at else None
            ),
        }


def _trailing_run(
    outcomes: Sequence[CheckOutcome], predicate
) -> int:
    """Length of the run of outcomes satisfying *predicate* at the end."""
    count = 0
    for outcome in reversed(outcomes):
        if not predicate(outcome):
            break
        count += 1
    return count


def _run_start(outcomes: Sequence[CheckOutcome], predicate) -> datetime | None:
    """``executed_at`` of the first outcome in the trailing run.

    The incident is opened on the check that *crosses the threshold*, but the
    outage began earlier - on the first failure of the run. Without this the
    incident window starts after the failures that proved it, and the evidence
    artifact under-reports the outage by (threshold - 1) check intervals.
    """
    start: datetime | None = None
    for outcome in reversed(outcomes):
        if not predicate(outcome):
            break
        start = outcome.executed_at
    return start


def _deduped(points: Sequence[str]) -> tuple[str, ...]:
    seen: list[str] = []
    for point in points:
        if point not in seen:
            seen.append(point)
    return tuple(seen)


@dataclass(frozen=True)
class DetectionPolicy:
    """The configured rule set. Constructed once from settings."""

    topology: ObservationTopology = ObservationTopology.SINGLE
    failure_threshold: int = 2
    recovery_threshold: int = 2
    min_observation_points: int = 2
    quorum_window_seconds: int = 60

    def history_limit(self) -> int:
        """How many stored results the caller must supply, newest-first.

        Enough for the longest consecutive run either rule can need. The multi
        quorum additionally needs every result inside ``quorum_window_seconds``,
        which the caller supplies separately as ``window``.
        """
        recovery_run = self.recovery_threshold * max(1, self.min_observation_points)
        return max(self.failure_threshold, recovery_run) + 1

    @property
    def recovery_window_size(self) -> int:
        """Multi-topology recovery needs this many results spanning N points."""
        return self.recovery_threshold * max(1, self.min_observation_points)


def evaluate_detection(
    *,
    policy: DetectionPolicy,
    current: CheckOutcome,
    history: Sequence[CheckOutcome],
    window: Sequence[CheckOutcome] | None = None,
    has_open_incident: bool,
    now: datetime | None = None,
) -> DetectionDecision:
    """Decide whether *current* opens an incident, resolves one, or neither.

    ``history`` is every stored result for the dependency **excluding**
    *current*, oldest first. ``window`` is the subset inside the quorum window
    (also excluding *current*, oldest first); it is only consulted by the multi
    rule and defaults to ``history`` when the caller supplies nothing.

    Idempotency is enforced here rather than left to the caller: a confirmed
    failure while an incident is already open returns ``open_incident=False``,
    and a recovery signal with no open incident returns ``resolve_incident``
    False. The caller still guards with database constraints, because two
    workers can both be told "open" for the same dependency.
    """
    window = history if window is None else window

    if policy.topology is ObservationTopology.SINGLE:
        return _evaluate_single(
            policy=policy,
            current=current,
            history=history,
            has_open_incident=has_open_incident,
        )
    return _evaluate_multi(
        policy=policy,
        current=current,
        window=window,
        history=history,
        has_open_incident=has_open_incident,
        now=now,
    )


def _evaluate_single(
    *,
    policy: DetectionPolicy,
    current: CheckOutcome,
    history: Sequence[CheckOutcome],
    has_open_incident: bool,
) -> DetectionDecision:
    series = [*history, current]

    if not current.is_up:
        failures = _trailing_run(series, lambda o: not o.is_up)
        confirmed = failures >= policy.failure_threshold
        if not confirmed:
            return DetectionDecision(
                rule=DetectionRule.SINGLE_CONSECUTIVE_FAILURES,
                reason=(
                    f"{failures} consecutive failed check(s); "
                    f"{policy.failure_threshold} required"
                ),
                consecutive_failures=failures,
                required=policy.failure_threshold,
            )
        if has_open_incident:
            return DetectionDecision(
                confirmed=True,
                rule=DetectionRule.SINGLE_CONSECUTIVE_FAILURES,
                reason=(
                    f"{failures} consecutive failed checks; incident already "
                    "open - not reopening"
                ),
                consecutive_failures=failures,
                required=policy.failure_threshold,
            )
        return DetectionDecision(
            open_incident=True,
            confirmed=True,
            rule=DetectionRule.SINGLE_CONSECUTIVE_FAILURES,
            reason=(
                f"{failures} consecutive failed checks from one observation "
                f"point (threshold {policy.failure_threshold})"
            ),
            consecutive_failures=failures,
            required=policy.failure_threshold,
            run_started_at=_run_start(series, lambda o: not o.is_up),
        )

    successes = _trailing_run(series, lambda o: o.is_up)
    if not has_open_incident:
        return DetectionDecision(
            rule=DetectionRule.SINGLE_CONSECUTIVE_SUCCESSES,
            reason="no open incident to resolve",
            consecutive_successes=successes,
            required=policy.recovery_threshold,
        )
    if successes < policy.recovery_threshold:
        return DetectionDecision(
            rule=DetectionRule.SINGLE_CONSECUTIVE_SUCCESSES,
            reason=(
                f"{successes} consecutive successful check(s); "
                f"{policy.recovery_threshold} required to resolve"
            ),
            consecutive_successes=successes,
            required=policy.recovery_threshold,
        )
    return DetectionDecision(
        resolve_incident=True,
        rule=DetectionRule.SINGLE_CONSECUTIVE_SUCCESSES,
        reason=(
            f"{successes} consecutive successful checks from one observation "
            f"point (threshold {policy.recovery_threshold})"
        ),
        consecutive_successes=successes,
        required=policy.recovery_threshold,
    )


def _evaluate_multi(
    *,
    policy: DetectionPolicy,
    current: CheckOutcome,
    window: Sequence[CheckOutcome],
    history: Sequence[CheckOutcome],
    has_open_incident: bool,
    now: datetime | None,
) -> DetectionDecision:
    if not current.is_up:
        reference = now or current.executed_at
        cutoff = reference - timedelta(seconds=policy.quorum_window_seconds)
        in_window = [o for o in window if o.executed_at >= cutoff]
        agreeing = _deduped(
            [o.observation_point for o in in_window if not o.is_up]
            + [current.observation_point]
        )
        if len(agreeing) < policy.min_observation_points:
            return DetectionDecision(
                rule=DetectionRule.MULTI_OBSERVATION_QUORUM,
                reason=(
                    f"{len(agreeing)} observation point(s) reported failure "
                    f"inside {policy.quorum_window_seconds}s; "
                    f"{policy.min_observation_points} required"
                ),
                agreeing_points=agreeing,
                required=policy.min_observation_points,
            )
        if has_open_incident:
            return DetectionDecision(
                confirmed=True,
                rule=DetectionRule.MULTI_OBSERVATION_QUORUM,
                reason=(
                    f"{len(agreeing)} observation points agreed; incident "
                    "already open - not reopening"
                ),
                agreeing_points=agreeing,
                required=policy.min_observation_points,
            )
        return DetectionDecision(
            open_incident=True,
            confirmed=True,
            rule=DetectionRule.MULTI_OBSERVATION_QUORUM,
            reason=(
                f"{len(agreeing)} independent observation points reported "
                f"failure inside {policy.quorum_window_seconds}s"
            ),
            agreeing_points=agreeing,
            required=policy.min_observation_points,
        )

    if not has_open_incident:
        return DetectionDecision(
            rule=DetectionRule.MULTI_RECOVERY_QUORUM,
            reason="no open incident to resolve",
            required=policy.recovery_window_size,
        )

    series = [*history, current][-policy.recovery_window_size :]
    agreeing = _deduped([o.observation_point for o in series if o.is_up])
    if (
        len(series) < policy.recovery_window_size
        or not all(o.is_up for o in series)
        or len(agreeing) < policy.min_observation_points
    ):
        return DetectionDecision(
            rule=DetectionRule.MULTI_RECOVERY_QUORUM,
            reason=(
                f"recovery quorum not met: {len(series)} consecutive "
                f"successful check(s) across {len(agreeing)} observation "
                f"point(s); {policy.recovery_window_size} across "
                f"{policy.min_observation_points} required"
            ),
            agreeing_points=agreeing,
            required=policy.recovery_window_size,
        )
    return DetectionDecision(
        resolve_incident=True,
        rule=DetectionRule.MULTI_RECOVERY_QUORUM,
        reason=(
            f"{len(series)} consecutive successful checks across "
            f"{len(agreeing)} independent observation points"
        ),
        agreeing_points=agreeing,
        required=policy.recovery_window_size,
    )


def policy_from_settings(settings) -> DetectionPolicy:
    """Build the policy from application settings.

    Imported lazily by callers that already hold ``settings``; kept as a
    function so tests can construct a policy without touching configuration.
    """
    from app.modules.checks.constants import (
        CONSECUTIVE_RECOVERY_CHECKS,
        QUORUM_MIN_REGIONS,
        QUORUM_WINDOW_SECONDS,
    )

    return DetectionPolicy(
        topology=ObservationTopology(settings.OBSERVATION_TOPOLOGY),
        failure_threshold=int(settings.SINGLE_TOPOLOGY_FAILURE_CHECKS),
        recovery_threshold=CONSECUTIVE_RECOVERY_CHECKS,
        min_observation_points=QUORUM_MIN_REGIONS,
        quorum_window_seconds=QUORUM_WINDOW_SECONDS,
    )


__all__ = [
    "CheckOutcome",
    "DetectionDecision",
    "DetectionPolicy",
    "DetectionRule",
    "ObservationTopology",
    "evaluate_detection",
    "policy_from_settings",
]
