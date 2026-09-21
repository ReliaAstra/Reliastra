"""Rate-limit identity for the web app's own server-side reads.

The public observatory is rendered server-side, so every read the web app makes
on a visitor's behalf arrives at the API from one socket address. Keyed by IP,
those reads shared a single 300/min bucket with every browser call the web app
proxied: one crawler walking the observatory could exhaust it for the whole
site, and the pages that failed were the ones the crawler came to read - which
is how a transient 429 turned into a record that could not be published.

These tests pin the replacement contract: the site's own reader is identified
by a shared secret and gets its own budget, and every other caller is limited
exactly as before.
"""

import pytest
from starlette.requests import Request

from app.config import settings
from app.platform.web import rate_limit as rl


def _make_request(headers: dict | None = None, client_host: str = "127.0.0.1") -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/v1/vendors",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": (client_host, 12345),
    }
    return Request(scope)


@pytest.fixture(autouse=True)
def _reset_mismatch_latch():
    """The mismatch warning is reported once per process; tests are not a process."""
    rl._reader_token_mismatch_reported = False
    yield
    rl._reader_token_mismatch_reported = False


@pytest.fixture
def limiter_calls(monkeypatch):
    """Record (budget, identity) for every rate-limit check instead of hitting Redis."""
    calls: list[tuple[str, str]] = []

    async def fake_check(self, identifier: str) -> bool:
        calls.append((self.key_prefix, identifier))
        return True

    monkeypatch.setattr(rl.SlidingWindowRateLimiter, "check", fake_check)
    # The IP-identity assertions below depend on how many proxy hops are
    # trusted, which is read from the environment at import time. Pin it so a
    # deployment's .env cannot change what these tests mean.
    monkeypatch.setattr(rl, "_TRUSTED_PROXY_HOPS", 1)
    return calls


def test_matching_reader_token_identifies_the_site(monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_READER_TOKEN", "reader-secret")
    request = _make_request({"x-reliastra-reader": "reader-secret"})
    assert rl.internal_reader_identity(request) == rl.INTERNAL_READER_IDENTITY


def test_absent_token_configuration_ignores_the_header(monkeypatch):
    """Unconfigured means the feature is off, not that any token is accepted."""
    monkeypatch.setattr(settings, "INTERNAL_READER_TOKEN", "")
    request = _make_request({"x-reliastra-reader": "anything"})
    assert rl.internal_reader_identity(request) is None


def test_wrong_token_is_not_the_reader(monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_READER_TOKEN", "reader-secret")
    request = _make_request({"x-reliastra-reader": "not-the-secret"})
    assert rl.internal_reader_identity(request) is None


def test_missing_header_is_not_the_reader(monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_READER_TOKEN", "reader-secret")
    assert rl.internal_reader_identity(_make_request({})) is None


def test_empty_header_is_not_the_reader(monkeypatch):
    """An empty secret must not match an empty configuration by accident."""
    monkeypatch.setattr(settings, "INTERNAL_READER_TOKEN", "reader-secret")
    assert rl.internal_reader_identity(_make_request({"x-reliastra-reader": ""})) is None


def test_a_prefix_of_the_token_is_not_the_reader(monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_READER_TOKEN", "reader-secret")
    request = _make_request({"x-reliastra-reader": "reader-secre"})
    assert rl.internal_reader_identity(request) is None


@pytest.mark.asyncio
async def test_reader_gets_its_own_budget(monkeypatch, limiter_calls):
    monkeypatch.setattr(settings, "INTERNAL_READER_TOKEN", "reader-secret")
    request = _make_request({"x-reliastra-reader": "reader-secret"}, client_host="127.0.0.1")

    await rl.enforce_public_read_limit(request)

    assert limiter_calls == [(rl.internal_reader_limiter.key_prefix, rl.INTERNAL_READER_IDENTITY)]
    # The reader must not consume the per-client public budget at all: that is
    # the whole point of giving it an identity.
    assert rl.public_vendor_limiter.key_prefix not in [budget for budget, _ in limiter_calls]


@pytest.mark.asyncio
async def test_ordinary_client_is_still_limited_by_ip(monkeypatch, limiter_calls):
    monkeypatch.setattr(settings, "INTERNAL_READER_TOKEN", "reader-secret")
    request = _make_request({"x-forwarded-for": "203.0.113.9"}, client_host="10.0.0.5")

    await rl.enforce_public_read_limit(request)

    assert limiter_calls == [(rl.public_vendor_limiter.key_prefix, "203.0.113.9")]


@pytest.mark.asyncio
async def test_a_client_cannot_claim_to_be_the_reader(monkeypatch, limiter_calls):
    """Presenting the header without the secret changes nothing."""
    monkeypatch.setattr(settings, "INTERNAL_READER_TOKEN", "reader-secret")
    request = _make_request(
        {"x-reliastra-reader": "guessed", "x-forwarded-for": "203.0.113.9"},
        client_host="10.0.0.5",
    )

    await rl.enforce_public_read_limit(request)

    assert limiter_calls == [(rl.public_vendor_limiter.key_prefix, "203.0.113.9")]


def test_reader_budget_is_larger_than_the_public_budget():
    """The reader renders pages for many visitors; it cannot share their ceiling.

    It is still bounded - a runaway render loop must not be able to read the
    database without limit.
    """
    assert rl.internal_reader_limiter.limit > rl.public_vendor_limiter.limit
    assert rl.internal_reader_limiter.limit <= 10_000
