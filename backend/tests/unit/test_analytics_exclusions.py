"""Internal-traffic exclusions for the visit beacon.

These counters are the admin panel's only view of acquisition, so the tests
pin the behaviour that makes them trustworthy: the operator's own machine is
never counted, and no filter may silently drop real traffic.
"""
from __future__ import annotations

import asyncio

from app.config import settings
from app.modules.analytics.exclusions import (
    is_internal_ip,
    is_internal_path,
    normalize_ip,
    opted_out,
    parse_networks,
    should_exclude_visit,
    split_list,
)

try:  # starlette ships with FastAPI; the Headers type is what the route passes.
    from starlette.datastructures import Headers
except Exception:  # pragma: no cover - exercised only in stripped environments
    class Headers(dict):  # type: ignore[no-redef]
        def get(self, key, default=None):  # type: ignore[override]
            return dict.get(self, key.lower(), default)


def _configure(**overrides):
    """Set analytics settings for one test, returning a restore callable."""
    previous = {key: getattr(settings, key) for key in overrides}
    for key, value in overrides.items():
        setattr(settings, key, value)

    def restore() -> None:
        for key, value in previous.items():
            setattr(settings, key, value)

    return restore


# ── Helpers ──────────────────────────────────────────────────────────────────


def test_split_list_accepts_commas_spaces_and_duplicates():
    assert split_list(" 1.2.3.4, 5.6.7.0/24 ,,1.2.3.4 ") == ["1.2.3.4", "5.6.7.0/24"]
    assert split_list(None) == []
    assert split_list("") == []


def test_normalize_ip_collapses_v4_mapped_v6():
    assert normalize_ip("::ffff:203.0.113.24") == "203.0.113.24"
    assert normalize_ip("[2001:db8::1]") == "2001:db8::1"
    assert normalize_ip("not-an-ip") is None
    assert normalize_ip("") is None


def test_invalid_cidr_is_dropped_not_fatal(caplog):
    assert parse_networks(["203.0.113.0/24", "garbage", ""]) == parse_networks(
        ["203.0.113.0/24"]
    )


def test_internal_addresses_are_internal():
    for ip in ("127.0.0.1", "::1", "10.1.2.3", "192.168.0.9", "169.254.1.1", "100.64.5.6"):
        assert is_internal_ip(ip), ip
    # Addresses a real visitor can actually hold, and that must never be
    # treated as internal just because they look synthetic.
    for ip in ("8.8.8.8", "1.1.1.1", "151.101.0.1", "102.89.68.1"):
        assert not is_internal_ip(ip), ip
    assert not is_internal_ip("garbage")
    assert not is_internal_ip("unknown_ip")


def test_path_match_is_segment_exact():
    assert is_internal_path("/admin", ["/admin"])
    assert is_internal_path("/admin/audit?tab=x", ["/admin"])
    assert not is_internal_path("/administrator", ["/admin"])
    assert not is_internal_path("/agencies", ["/agency"])
    assert not is_internal_path(None, ["/admin"])


# ── The decision ─────────────────────────────────────────────────────────────


def test_configured_network_wins_over_everything_else():
    restore = _configure(ANALYTICS_EXCLUDE_NETWORKS="8.8.8.8, 9.9.0.0/16")
    try:
        assert should_exclude_visit("8.8.8.8").reason == "excluded-network"
        assert should_exclude_visit("::ffff:8.8.8.8").reason == "excluded-network"
        assert should_exclude_visit("9.9.4.4").reason == "excluded-network"
        assert not should_exclude_visit("9.10.0.1").excluded
    finally:
        restore()


def test_browser_opt_out_cookie_excludes_regardless_of_ip():
    restore = _configure(ANALYTICS_OPT_OUT_COOKIE="reliastra_analytics_optout")
    try:
        headers = Headers({"cookie": "theme=dark; reliastra_analytics_optout=1"})
        decision = should_exclude_visit("8.8.8.8", headers=headers)
        assert decision.excluded and decision.reason == "opt-out"
        assert opted_out(headers)
        assert not opted_out(Headers({"cookie": "theme=dark"}))
        assert opted_out(Headers({"x-reliastra-analytics-opt-out": "true"}))
        # A stale cookie set to 0 must not opt anybody out.
        assert not opted_out(Headers({"cookie": "reliastra_analytics_optout=0"}))
    finally:
        restore()


def test_internal_surfaces_are_never_pageviews():
    restore = _configure(ANALYTICS_EXCLUDE_PATH_PREFIXES="/admin")
    try:
        decision = should_exclude_visit("8.8.8.8", path="/admin/growth")
        assert decision.excluded and decision.reason == "internal-path"
        assert not should_exclude_visit("8.8.8.8", path="/pricing").excluded
    finally:
        restore()


def test_local_socket_peers_are_dropped_only_without_a_proxy():
    """Behind a load balancer the peer address IS the proxy.

    Applying the internal-IP rule there would exclude every real visitor, so
    the filter is conditional on the request arriving directly.
    """
    restore = _configure(ANALYTICS_EXCLUDE_INTERNAL_IPS=True)
    try:
        assert should_exclude_visit("127.0.0.1").reason == "internal-ip"
        assert not should_exclude_visit("127.0.0.1", behind_proxy=True).excluded
        assert not should_exclude_visit("8.8.8.8").excluded
    finally:
        restore()

    restore = _configure(ANALYTICS_EXCLUDE_INTERNAL_IPS=False)
    try:
        assert not should_exclude_visit("127.0.0.1").excluded
    finally:
        restore()


# ── Recording the drop ───────────────────────────────────────────────────────


class CountingRedis:
    def __init__(self):
        self.counters: dict[str, int] = {}
        self.hash: dict[str, int] = {}

    def pipeline(self, transaction=False):
        return CountingPipeline(self)


class CountingPipeline:
    def __init__(self, redis):
        self.r = redis

    def incr(self, key):
        self.r.counters[key] = self.r.counters.get(key, 0) + 1

    def hincrby(self, key, field, amount):
        self.r.hash[f"{key}:{field}"] = self.r.hash.get(f"{key}:{field}", 0) + amount

    def expire(self, *a, **kw):
        pass

    async def execute(self):
        return []


def test_excluded_visits_increment_exclusion_counters_only(monkeypatch):
    from app.modules.analytics import service as service_module

    fake = CountingRedis()
    monkeypatch.setattr("app.infrastructure.redis_client.get_redis", lambda: fake)

    asyncio.run(service_module.analytics_service.record_excluded("opt-out"))

    day_keys = [k for k in fake.counters if k.startswith("an:pv:excluded:")]
    assert "an:pv:excluded:total" in day_keys
    assert not [k for k in fake.counters if k.startswith("an:pv:") and "excluded" not in k]
    assert fake.hash["an:pv:excluded:reasons:opt-out"] == 1


def test_record_excluded_survives_a_dead_redis(monkeypatch):
    from app.modules.analytics import service as service_module

    def boom():
        raise RuntimeError("redis down")

    monkeypatch.setattr("app.infrastructure.redis_client.get_redis", boom)
    asyncio.run(service_module.analytics_service.record_excluded("internal-ip"))
