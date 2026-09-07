from enum import Enum

QUORUM_WINDOW_SECONDS: int = 60
QUORUM_MIN_REGIONS: int = 2
CONSECUTIVE_RECOVERY_CHECKS: int = 2

# ── Failure classification contract ─────────────────────────────────────────
# ``CheckResult.error_message`` is the only place a probe failure is recorded,
# so its prefixes are a contract, not free text. The classifier in
# ``CheckService.classify_check_state`` and anything that renders check state
# must agree on these. Changing a prefix here changes what an operator sees.
#: An SSRF-policy rejection (private/loopback/link-local/metadata target).
#: This is NOT an endpoint outage: RELIASTRA refused to send the probe.
BLOCKED_BY_SECURITY_POLICY_PREFIX: str = "URL blocked by security policy"
#: Same policy, enforced on a redirect hop.
REDIRECT_BLOCKED_BY_SECURITY_POLICY_PREFIX: str = (
    "Redirect blocked by security policy"
)
#: Too many redirect hops - an endpoint problem, not a policy rejection.
TOO_MANY_REDIRECTS_PREFIX: str = "Too many redirects"


class CheckState(str, Enum):
    """Where a dependency is in the check pipeline.

    The point of this enum is to make "the vendor is down" and "RELIASTRA never
    managed to probe it" different, nameable states. An empty history alone
    cannot tell them apart.
    """

    #: No CheckResult has ever been written and the dependency is not due yet.
    NEVER_CHECKED = "never_checked"
    #: Due for a probe; waiting for the next Beat cycle to dispatch it.
    AWAITING_SCHEDULE = "awaiting_scheduled_execution"
    #: A task was published to the broker and has not been picked up.
    QUEUED = "queued"
    #: A worker is running the probe right now.
    EXECUTING = "executing"
    #: Last probe succeeded.
    SUCCESSFUL = "successful"
    #: Last probe reached the target and it failed (status/timeout/error).
    TARGET_FAILED = "target_failed"
    #: Last probe was refused by the SSRF policy - an endpoint configuration
    #: problem, never a vendor outage.
    BLOCKED_BY_SECURITY_POLICY = "blocked_by_security_policy"
    #: RELIASTRA tried to publish the probe and could not (broker down, ...).
    DISPATCH_FAILED = "dispatch_failed"
    #: The scheduler/worker/broker are not proven alive, so no probe could
    #: have run.
    SCHEDULER_UNAVAILABLE = "scheduler_unavailable"


#: States that mean "the target itself is the problem".
TARGET_STATES = frozenset(
    {CheckState.SUCCESSFUL, CheckState.TARGET_FAILED}
)

#: States that mean "RELIASTRA's own pipeline is the problem".
INFRASTRUCTURE_STATES = frozenset(
    {
        CheckState.DISPATCH_FAILED,
        CheckState.SCHEDULER_UNAVAILABLE,
    }
)
