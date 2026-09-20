"""app.core.circuit_breaker — backward-compatibility alias.

Canonical home: ``app.platform.resilience.circuit_breaker``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.resilience.circuit_breaker import (  # noqa: F401
    Any,
    CircuitBreaker,
    FAILURE_THRESHOLD,
    HALF_OPEN_INTERVAL_SECONDS,
    PROBE_LEASE_SECONDS,
    SUCCESS_THRESHOLD,
    annotations,
    circuit_breaker,
    json,
    logger,
    logging,
    time,
    uuid,
)

__all__ = [
    "Any",
    "CircuitBreaker",
    "FAILURE_THRESHOLD",
    "HALF_OPEN_INTERVAL_SECONDS",
    "PROBE_LEASE_SECONDS",
    "SUCCESS_THRESHOLD",
    "annotations",
    "circuit_breaker",
    "json",
    "logger",
    "logging",
    "time",
    "uuid",

]
