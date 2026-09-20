"""app.core.ssrf_protection — backward-compatibility alias.

Canonical home: ``app.platform.security.ssrf``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.security.ssrf import (  # noqa: F401
    PinnedTarget,
    annotations,
    close_pinned_transports,
    httpcore,
    httpx,
    ipaddress,
    is_url_safe,
    is_url_safe_async,
    logger,
    logging,
    pinned_transport_for,
    resolve_pinned_target,
    resolve_pinned_target_async,
    socket,
    ssl,
    urllib,
    validate_outbound_url,
)

__all__ = [
    "PinnedTarget",
    "annotations",
    "close_pinned_transports",
    "httpcore",
    "httpx",
    "ipaddress",
    "is_url_safe",
    "is_url_safe_async",
    "logger",
    "logging",
    "pinned_transport_for",
    "resolve_pinned_target",
    "resolve_pinned_target_async",
    "socket",
    "ssl",
    "urllib",
    "validate_outbound_url",

]
