"""Behavioral tests for the analytics funnel + geo resolver (no DB/Redis)."""
from app.infrastructure.ipgeo import (
    country_from_headers,
    hash_ip,
    is_public_ip,
)
from app.modules.analytics.service import AnalyticsService


class FakeRedis:
    """Minimal async redis covering the funnel operations."""

    def __init__(self):
        self.starts = {}
        self.open = set()
        self.counters = {}

    def pipeline(self, transaction=False):
        return FakePipeline(self)

    async def smembers(self, key):
        return set(self.open)

    async def hgetall(self, key):
        if key.startswith("an:co:start:"):
            org = key.split(":")[-1]
            return self.starts.get(org, {})
        return self.countries if hasattr(self, "countries") else {}

    async def pfcount(self, *keys):
        return 0

    async def srem(self, key, member):
        if member in self.open:
            self.open.discard(member)
            return 1
        return 0


class FakePipeline:
    def __init__(self, redis):
        self.r = redis
        self.ops = []

    def hset(self, key, mapping=None, **kw):
        async def run():
            self.r.starts[key.split(":")[-1]] = dict(mapping or {})
        self.ops.append(run)

    def sadd(self, key, member):
        async def run():
            self.r.open.add(member)
        self.ops.append(run)

    def incr(self, key):
        async def run():
            self.r.counters[key] = self.r.counters.get(key, 0) + 1
        self.ops.append(run)

    def delete(self, key):
        async def run():
            self.r.starts.pop(key.split(":")[-1], None)
        self.ops.append(run)

    def expire(self, *a, **kw):
        async def run():
            pass
        self.ops.append(run)

    def hincrby(self, *a, **kw):
        async def run():
            pass
        self.ops.append(run)

    def pfadd(self, *a, **kw):
        async def run():
            pass
        self.ops.append(run)

    async def execute(self):
        for op in self.ops:
            await op()
        self.ops = []


def _patch_redis(monkeypatch, fake):
    monkeypatch.setattr(
        'app.modules.analytics.service.get_redis', lambda: fake
    )


import asyncio


def test_checkout_start_then_convert(monkeypatch):
    fake = FakeRedis()
    _patch_redis(monkeypatch, fake)
    svc = AnalyticsService()

    asyncio.run(svc.record_checkout_started(
        "org-1", email="ceo@acme.com", plan="pro",
        amount_minor=3900, reference="ref_123", user_id="u-9",
    ))
    assert fake.starts["org-1"]["email"] == "ceo@acme.com"
    assert "org-1" in fake.open
    assert fake.counters.get("an:co:started:total") == 1

    # Conversion removes lead and counts once...
    asyncio.run(svc.record_checkout_converted("org-1"))
    assert "org-1" not in fake.open
    assert fake.counters.get("an:co:converted:total") == 1

    # ...and a duplicate (webhook + verify) must NOT double-count.
    asyncio.run(svc.record_checkout_converted("org-1"))
    assert fake.counters.get("an:co:converted:total") == 1


def test_abandoned_leads_exposed_for_outreach(monkeypatch):
    fake = FakeRedis()
    _patch_redis(monkeypatch, fake)
    svc = AnalyticsService()

    asyncio.run(svc.record_checkout_started(
        "org-2", email="founder@globex.io", plan="pro",
        amount_minor=3900, reference="ref_456",
    ))
    # org-2 never converts -> appears in abandoned list with contact info
    leads = asyncio.run(svc.abandoned_checkouts())
    match = [l for l in leads if l["org_id"] == "org-2"]
    assert match and match[0]["email"] == "founder@globex.io"
    assert match[0]["amount_minor"] == 3900
    assert match[0]["reference"] == "ref_456"


def test_geo_helpers():
    h = {"cf-ipcountry": "NG"}
    assert country_from_headers(h) == "NG"
    assert country_from_headers({}) is None
    assert country_from_headers({"cf-ipcountry": "XX"}) is None  # redacted
    assert hash_ip("1.2.3.4") != hash_ip("1.2.3.5")
    assert len(hash_ip("1.2.3.4")) == 32
    assert not is_public_ip("127.0.0.1")
    assert not is_public_ip("10.0.0.1")
    assert not is_public_ip("not-an-ip")
    assert is_public_ip("8.8.8.8")
