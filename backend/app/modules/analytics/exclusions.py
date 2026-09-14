"""Which visits the traffic analytics must *not* count, and why.

The admin panel's pageview / unique-visitor numbers are an acquisition
metric. Counting the people who build and run the product against it makes
every derived number wrong: the founder refreshing their own landing page
inflates pageviews, staff traffic skews the country breakdown, and the
signup-to-visitor conversion rate gets punished by dashboard reloads that
were never marketing traffic at all.

Three independent filters, in precedence order:

``excluded-network``
    ``ANALYTICS_EXCLUDE_NETWORKS`` - explicit IPs/CIDRs (office egress, a
    static home IP, staging boxes). The operator's own machine belongs here.
``opt-out``
    ``ANALYTICS_OPT_OUT_COOKIE`` present in the request (or the equivalent
    ``X-Reliastra-Analytics-Opt-Out`` header the frontend proxy forwards when
    it terminates cookies the backend never sees). Follows the browser
    everywhere, which is what a residential IP that changes nightly cannot
    do.
``internal-path``
    Paths under ``ANALYTICS_EXCLUDE_PATH_PREFIXES`` (``/admin`` by default).
    Defense in depth: a beacon that fires from an internal surface is a bug,
    and the counter should not notice.
``internal-ip``
    Loopback / RFC1918 / link-local / CGNAT socket peers - local development,
    container health checks, anything talking to the API directly. Applied
    only when the request carries **no** ``X-Forwarded-For``: behind a load
    balancer the socket peer is the proxy, so treating it as internal would
    silently drop 100% of production traffic. A misconfiguration of that
    shape must fail loud, not empty.

Nothing here raises and nothing here stores an IP: the decision is made, the
raw address is discarded, and the reason is kept only as a counter name.
"""

from __future__ import annotations

import ipaddress
import logging
from dataclasses import dataclass
from typing import Any, Iterable

from app.config import settings
from app.infrastructure.ipgeo import is_public_ip

logger = logging.getLogger(__name__)

_OPT_OUT_VALUES = frozenset({"1", "true", "yes", "on"})

#: Header the frontend proxy sets when it recognizes its own opt-out cookie,
#: so the filter still applies on paths where cookies are not forwarded.
OPT_OUT_HEADER = "x-reliastra-analytics-opt-out"

#: Header on the response, for verifying a filter in devtools without a debug
#: build. Carries a reason label only - never an IP, never a visitor key.
DECISION_HEADER = "X-Reliastra-Analytics"


@dataclass(frozen=True)
class ExclusionDecision:
    """The outcome of one beacon request. ``reason`` is a stable label."""

    excluded: bool
    reason: str = ""

    def header_value(self) -> str:
        return f"excluded:{self.reason}" if self.excluded else "counted"


def split_list(raw: str | None) -> list[str]:
    """Comma/space separated config string to a de-duplicated, ordered list."""
    seen: list[str] = []
    for chunk in (raw or "").replace(",", " ").split():
        value = chunk.strip()
        if value and value not in seen:
            seen.append(value)
    return seen


def normalize_ip(ip: str | None) -> str | None:
    """Return a canonical address string, or ``None`` when it is not an IP.

    IPv4-mapped IPv6 (``::ffff:203.0.113.24``, what many proxies hand
    through) collapses to the v4 address so a single CIDR covers both.
    """
    if not ip:
        return None
    candidate = ip.strip().strip("[]")
    if not candidate:
        return None
    try:
        address = ipaddress.ip_address(candidate)
    except ValueError:
        return None
    mapped = getattr(address, "ipv4_mapped", None)
    return str(mapped or address)


def parse_networks(tokens: Iterable[str]) -> list[Any]:
    """Parse configured IPs/CIDRs, dropping anything invalid with a warning.

    A typo in operational config must not take analytics down, and it must not
    silently do nothing either - hence the log line.
    """
    networks: list[Any] = []
    for token in tokens:
        try:
            networks.append(ipaddress.ip_network(token, strict=False))
        except ValueError:
            logger.warning(
                "analytics: ignoring invalid ANALYTICS_EXCLUDE_NETWORKS entry %r",
                token,
            )
    return networks


def _is_parsable(token: str) -> bool:
    """Same test as :func:`parse_networks` without the warning (for reports)."""
    try:
        ipaddress.ip_network(token, strict=False)
    except ValueError:
        return False
    return True


#: Ranges the stdlib does not classify as private on every supported Python
#: (100.64.0.0/10 is CGNAT - and the network Tailscale hands out - while
#: Python only folded it into ``is_private`` in later releases). Both are
#: "not a visitor" by definition, so they are checked explicitly rather than
#: depending on the interpreter's version.
_EXTRA_INTERNAL_NETWORKS = (
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("fc00::/7"),
)


def is_internal_ip(ip: str | None) -> bool:
    """True when the address cannot belong to a visitor out on the internet.

    Delegates to :func:`app.infrastructure.ipgeo.is_public_ip` so "is this a
    real client" has exactly one definition in the codebase (the country
    resolver uses the same one), then adds the ranges that definition
    classifies inconsistently across the supported Python versions.

    An unparseable address is NOT internal: treating it as such would let a
    proxy that mangles ``X-Forwarded-For`` switch analytics off silently.
    """
    canonical = normalize_ip(ip)
    if canonical is None:
        return False
    if not is_public_ip(canonical):
        return True
    address = ipaddress.ip_address(canonical)
    return any(address in network for network in _EXTRA_INTERNAL_NETWORKS)


# Parsed networks/prefixes are cached per raw config string: Settings are
# immutable at runtime, so the key changes only across a restart.
_NETWORK_CACHE: dict[str, list[Any]] = {}


def _excluded_networks(raw: str) -> list[Any]:
    cached = _NETWORK_CACHE.get(raw)
    if cached is None:
        cached = parse_networks(split_list(raw))
        _NETWORK_CACHE[raw] = cached
    return cached


def matches_excluded_network(ip: str | None, networks: Iterable[Any]) -> bool:
    canonical = normalize_ip(ip)
    if canonical is None:
        return False
    address = ipaddress.ip_address(canonical)
    return any(address in network for network in networks)


def _cookie_value(headers: Any, name: str) -> str | None:
    """Read one cookie out of a ``Cookie`` header without a cookie dependency.

    Deliberately lenient: ``SimpleCookie`` chokes on the quoted and malformed
    pairs real browsers send, and a failed parse here must never turn into a
    failed request.
    """
    header = headers.get("cookie") if headers is not None else None
    if not header:
        return None
    for part in header.split(";"):
        key, sep, value = part.strip().partition("=")
        if sep and key.strip().lower() == name.lower():
            return value.strip().strip('"')
    return None


def opted_out(headers: Any) -> bool:
    """Whether this request is from a browser the operator excluded."""
    if headers is None:
        return False
    name = getattr(settings, "ANALYTICS_OPT_OUT_COOKIE", "") or ""
    marker = (headers.get(OPT_OUT_HEADER) or "").strip().lower()
    if marker in _OPT_OUT_VALUES:
        return True
    if name:
        cookie = (_cookie_value(headers, name) or "").strip().lower()
        if cookie in _OPT_OUT_VALUES:
            return True
    return False


def is_internal_path(path: str | None, prefixes: Iterable[str] | None = None) -> bool:
    """Whether a reported path belongs to an internal surface.

    Segment-exact: ``/admin`` and ``/admin/anything`` are internal, ``/adminx``
    is not. Same rule keeps ``/agency`` (a product surface) from being
    swallowed by a hypothetical ``/agencies`` prefix and vice versa.
    """
    if not path:
        return False
    configured = list(prefixes) if prefixes is not None else split_list(
        getattr(settings, "ANALYTICS_EXCLUDE_PATH_PREFIXES", "")
    )
    # Only the path matters: a query string cannot change which surface this is.
    target = path.split("?", 1)[0].split("#", 1)[0]
    if not target.startswith("/"):
        target = "/" + target
    for prefix in configured:
        cleaned = prefix.rstrip("/")
        if not cleaned:
            continue
        if not cleaned.startswith("/"):
            cleaned = "/" + cleaned
        if target == cleaned or target.startswith(cleaned + "/"):
            return True
    return False


def should_exclude_visit(
    ip: str | None,
    *,
    path: str | None = None,
    headers: Any = None,
    behind_proxy: bool = False,
) -> ExclusionDecision:
    """Decide whether one beacon is counted. First matching reason wins."""
    networks = _excluded_networks(getattr(settings, "ANALYTICS_EXCLUDE_NETWORKS", "") or "")
    if networks and matches_excluded_network(ip, networks):
        return ExclusionDecision(True, "excluded-network")

    if opted_out(headers):
        return ExclusionDecision(True, "opt-out")

    if is_internal_path(path):
        return ExclusionDecision(True, "internal-path")

    if getattr(settings, "ANALYTICS_EXCLUDE_INTERNAL_IPS", True) and not behind_proxy:
        if is_internal_ip(ip):
            return ExclusionDecision(True, "internal-ip")

    return ExclusionDecision(False)


def exclusion_state() -> dict[str, Any]:
    """Operator-facing summary, surfaced by the admin analytics overview."""
    networks = split_list(getattr(settings, "ANALYTICS_EXCLUDE_NETWORKS", "") or "")
    invalid = [token for token in networks if not _is_parsable(token)]
    return {
        "opt_out_cookie": getattr(settings, "ANALYTICS_OPT_OUT_COOKIE", ""),
        "excluded_networks": networks,
        "excluded_networks_invalid": invalid,
        "excluded_path_prefixes": split_list(
            getattr(settings, "ANALYTICS_EXCLUDE_PATH_PREFIXES", "")
        ),
        "internal_ip_filter": bool(
            getattr(settings, "ANALYTICS_EXCLUDE_INTERNAL_IPS", True)
        ),
    }
