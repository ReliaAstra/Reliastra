"""Redis-backed circuit breaker for dependency checks.

Dead dependencies previously consumed worker capacity: every scheduled check
spent a full ``timeout_seconds`` waiting on an endpoint that never answers.
The breaker collapses that load:

* **closed**   - checks dispatch normally.
* **open**     - after ``FAILURE_THRESHOLD`` (3) consecutive *expensive*
  failures, checks are no longer dispatched. A half-open probe is attempted at
  most once per ``HALF_OPEN_INTERVAL_SECONDS`` (60s).
* **half-open** - a probe succeeded; the breaker requires
  ``SUCCESS_THRESHOLD`` (2) consecutive successes before closing again.

State is a small JSON document per dependency under ``reliastra:circuit:<id>``.
The half-open probe uses a ``SETNX`` lease so multiple scheduler instances
never fire duplicate probes. Every operation fails open (dispatch is allowed)
when Redis is unavailable - a Redis outage must not silence all monitoring.

**What counts as a failure, and why it matters.** Only *expensive* failures
open the circuit: a transport-level failure where no HTTP response came back,
which is what actually burns ``timeout_seconds`` of a worker. An HTTP response
that merely carried an unexpected status never opens it.

The breaker used to count every ``is_up=False``. The incident detector opens an
incident at 2 consecutive failures and the breaker tripped at 3 - so a
*confirmed, ongoing outage* tripped its own circuit one check after being
declared, and was then probed at most once per 60s instead of once per
interval. The load-shaving feature was suppressing observation of the exact
dependency this product exists to observe, and it did so precisely when
observation mattered most. The suppressed checks wrote no rows, so the
availability denominator quietly became a biased sample of the worst part of
the outage.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any

logger = logging.getLogger(__name__)

FAILURE_THRESHOLD = 3
SUCCESS_THRESHOLD = 2
HALF_OPEN_INTERVAL_SECONDS = 60.0
PROBE_LEASE_SECONDS = 60

_STATE_KEY_PREFIX = "reliastra:circuit"
_PROBE_KEY_PREFIX = "reliastra:circuit:probe"

#: Error types where no HTTP response was received. See the module docstring.
_TRANSPORT_ERROR_TYPES = frozenset(
    {"dns_error", "tls_error", "connection_error", "timeout", "no_response", "unknown"}
)


def is_expensive_failure(*, status_code: int | None, error_type: str | None) -> bool:
    """Did this outcome burn a full ``timeout_seconds`` waiting for a response?

    True for transport failures - a worker blocked on an unanswered socket.
    False when the far end answered and simply said no, which costs a round
    trip and must never throttle how often we look.
    """
    if status_code is not None:
        return False
    if error_type is None:
        return True
    return str(error_type).lower() in _TRANSPORT_ERROR_TYPES


def _state_key(dependency_id: uuid.UUID | str) -> str:
    return f"{_STATE_KEY_PREFIX}:{dependency_id}"


def _probe_key(dependency_id: uuid.UUID | str) -> str:
    return f"{_PROBE_KEY_PREFIX}:{dependency_id}"


def _empty_state() -> dict[str, Any]:
    return {
        "state": "closed",
        "failures": 0,
        "successes": 0,
        "opened_at": None,
    }


class CircuitBreaker:
    """Dependency-scoped circuit breaker with Redis persistence."""

    def __init__(self, redis_client: Any | None = None) -> None:
        self._redis = redis_client

    def _client(self) -> Any:
        if self._redis is not None:
            return self._redis
        from app.platform.integrations.redis import get_redis

        return get_redis()

    async def _load(self, dependency_id: uuid.UUID | str) -> dict[str, Any]:
        try:
            raw = await self._client().get(_state_key(dependency_id))
        except Exception:
            return _empty_state()
        if not raw:
            return _empty_state()
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return _empty_state()

    async def _save(self, dependency_id: uuid.UUID | str, state: dict[str, Any]) -> bool:
        try:
            await self._client().set(
                _state_key(dependency_id), json.dumps(state)
            )
            return True
        except Exception as exc:
            logger.debug("Circuit breaker state write failed: %s", exc)
            return False

    async def should_dispatch(self, dependency_id: uuid.UUID | str) -> bool:
        """Return True when a check for *dependency_id* may be dispatched.

        Open circuits only allow one half-open probe per
        ``HALF_OPEN_INTERVAL_SECONDS`` window (guarded by a Redis lease).
        Redis failures fail open.
        """
        try:
            state = await self._load(dependency_id)
        except Exception:
            return True  # fail open

        if state.get("state") != "open":
            return True

        opened_at = float(state.get("opened_at") or 0.0)
        if time.time() - opened_at < HALF_OPEN_INTERVAL_SECONDS:
            return False

        # Half-open probe: only one scheduler may fire the probe.
        try:
            acquired = await self._client().set(
                _probe_key(dependency_id),
                "1",
                nx=True,
                ex=PROBE_LEASE_SECONDS,
            )
            return bool(acquired)
        except Exception:
            return True  # fail open

    async def record_success(self, dependency_id: uuid.UUID | str) -> None:
        await self._record(dependency_id, success=True)

    async def record_failure(self, dependency_id: uuid.UUID | str) -> None:
        await self._record(dependency_id, success=False)

    async def record_outcome(
        self,
        dependency_id: uuid.UUID | str,
        *,
        is_up: bool,
        status_code: int | None = None,
        error_type: str | None = None,
    ) -> None:
        """Feed one probe outcome to the breaker.

        Successes always clear the failure count - a dependency that answered
        must be observed on the next interval. Failures only count when they
        were expensive, per :func:`is_expensive_failure`.
        """
        if is_up:
            await self.record_success(dependency_id)
            return
        if is_expensive_failure(status_code=status_code, error_type=error_type):
            await self.record_failure(dependency_id)
            return
        # A cheap failure still tells us the host is reachable and answering.
        # Reset the streak so a run of 503s cannot leave the circuit open after
        # the dependency has already recovered.
        await self.record_success(dependency_id)

    async def _record(
        self, dependency_id: uuid.UUID | str, success: bool
    ) -> None:
        try:
            state = await self._load(dependency_id)
            if success:
                state["failures"] = 0
                state["successes"] = int(state.get("successes", 0)) + 1
                if state["successes"] >= SUCCESS_THRESHOLD:
                    state.update(
                        {
                            "state": "closed",
                            "successes": 0,
                            "opened_at": None,
                        }
                    )
                    try:
                        await self._client().delete(_probe_key(dependency_id))
                    except Exception:
                        pass
            else:
                state["successes"] = 0
                state["failures"] = int(state.get("failures", 0)) + 1
                if state["failures"] >= FAILURE_THRESHOLD:
                    state.update(
                        {
                            "state": "open",
                            "opened_at": time.time(),
                        }
                    )
            await self._save(dependency_id, state)
        except Exception as exc:
            logger.debug("Circuit breaker record failed: %s", exc)


circuit_breaker = CircuitBreaker()
