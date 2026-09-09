"""Live FX rate: sourced, timestamped, labelled - and the basis of the charge.

The rate converts the $19 list price into the NGN charge. These tests pin the
honesty rules of that panel:

* the payload carries the provider name, a human-checkable URL, the source's
  own timestamp plus the fetch timestamp, and the disclaimer stating the rate
  is the basis of the conversion;
* it is only produced while the payment currency differs from the product
  currency (a USD deployment has no FX question to answer);
* failure ⇒ `None`, never a stale, zero or guessed rate;
* results are cached (Redis when present) instead of fetched per request.
"""

from __future__ import annotations

import json

import httpx
import pytest

from app.config import settings
from app.core import fx_reference
from app.core.payment_pricing import FX_REFERENCE_DISCLAIMER


@pytest.fixture(autouse=True)
def _clear_cache():
    fx_reference._memory_cache = None
    yield
    fx_reference._memory_cache = None


def _transport(payload, status=200):
    """Stand-in for the rate source."""

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json=payload)

    return httpx.MockTransport(handler)


@pytest.fixture()
def mock_httpx(monkeypatch):
    """Swap AsyncClient so requests hit a MockTransport, not the network."""
    holder: dict[str, object] = {}

    class _Client(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = holder["transport"]
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _Client)
    return holder


@pytest.mark.asyncio
async def test_reference_payload_is_sourced_and_timestamped(mock_httpx, monkeypatch):
    mock_httpx["transport"] = _transport(
        {
            "base_code": "USD",
            "rates": {"NGN": 1650.1234, "GHS": 15.0},
            "time_last_update_utc": "Wed, 13 Aug 2025 00:40:32 +0000",
        }
    )
    fx = await fx_reference.fx_reference_payload()
    assert fx is not None
    assert fx["rate"] == 1650.1234
    assert fx["source_currency"] == "USD"
    assert fx["payment_currency"] == "NGN"
    # Verifiable source + both timestamps, per the product spec.
    assert fx["provider"] == settings.FX_REFERENCE_PROVIDER
    assert fx["provider_url"].startswith("https://")
    assert fx["source_url"] == settings.FX_REFERENCE_URL
    assert fx["source_timestamp"] == "Wed, 13 Aug 2025 00:40:32 +0000"
    assert fx["retrieved_at"].endswith("Z")
    # It names the conversion it drives - in the label and in the disclaimer.
    assert "exchange rate" in fx["label"].lower()
    assert "converted" in fx["disclaimer"].lower()
    assert fx["disclaimer"] == FX_REFERENCE_DISCLAIMER


@pytest.mark.asyncio
async def test_absent_on_error_never_invented(mock_httpx):
    """A dead source hides the panel; nothing falls back to a rate."""
    mock_httpx["transport"] = _transport({"nope": True}, status=503)
    assert await fx_reference.fx_reference_payload() is None
    # second call uses the short failure cache and still returns None
    assert await fx_reference.fx_reference_payload() is None


@pytest.mark.asyncio
async def test_wrong_base_currency_is_refused(mock_httpx):
    """A quote not denominated in USD would mislabel the estimate - reject it."""
    mock_httpx["transport"] = _transport(
        {"base": "EUR", "rates": {"NGN": 999.0}, "time_last_update_utc": ""}
    )
    assert await fx_reference.fx_reference_payload() is None


@pytest.mark.asyncio
async def test_missing_target_rate_is_refused(mock_httpx):
    mock_httpx["transport"] = _transport({"base": "USD", "rates": {"EUR": 0.9}})
    assert await fx_reference.fx_reference_payload() is None


@pytest.mark.asyncio
async def test_result_is_cached_across_calls(mock_httpx):
    calls = {"n": 0}

    async def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(
            200,
            json={"base": "USD", "rates": {"NGN": 1600.0}, "time_last_update_utc": "x"},
        )

    mock_httpx["transport"] = httpx.MockTransport(handler)
    first = await fx_reference.fx_reference_payload()
    second = await fx_reference.fx_reference_payload()
    assert first and second
    assert first["rate"] == second["rate"] == 1600.0
    assert calls["n"] == 1, "the second read must hit the cache"


@pytest.mark.asyncio
async def test_hidden_when_currencies_match(mock_httpx, monkeypatch):
    """A USD-settling deployment has no FX gap to explain."""
    monkeypatch.setattr(settings, "PAYSTACK_CURRENCY", "USD")
    assert await fx_reference.fx_reference_payload() is None


@pytest.mark.asyncio
async def test_feature_flag_turns_it_off(mock_httpx, monkeypatch):
    monkeypatch.setattr(settings, "FX_REFERENCE_ENABLED", False)
    assert await fx_reference.fx_reference_payload() is None


@pytest.mark.asyncio
async def test_currency_payload_embeds_reference_and_resolves_amounts(mock_httpx):
    """The shared disclosure object carries the rate and the converted amounts."""
    mock_httpx["transport"] = _transport(
        {"base": "USD", "rates": {"NGN": 1611.0}, "time_last_update_utc": "y"}
    )
    from app.core.payment_disclosure import currency_payload

    payload = await currency_payload()
    assert payload["fx_reference"]["rate"] == 1611.0
    # The amounts are the USD price converted at that same rate:
    # 1900 cents x 1611 = 3,060,900 kobo = ₦30,609.00.
    assert payload["plan_payment_amounts"]["pro"]["monthly"] == "\u20a630,609.00 (NGN)"
    assert payload["checkout_ready"] is True
    assert json.loads(json.dumps(payload))  # serializable for the API layer


@pytest.mark.asyncio
async def test_current_rate_returns_the_rate_used_for_pricing(mock_httpx, monkeypatch):
    """``current_rate`` is the number pricing consumes."""
    from app.core import fx_reference

    mock_httpx["transport"] = _transport(
        {"base": "USD", "rates": {"NGN": 1322.0}, "time_last_update_utc": "z"}
    )
    assert await fx_reference.current_rate() == 1322.0


@pytest.mark.asyncio
async def test_current_rate_is_none_when_the_source_is_down(mock_httpx):
    from app.core import fx_reference

    mock_httpx["transport"] = _transport({"nope": True}, status=503)
    assert await fx_reference.current_rate() is None


@pytest.mark.asyncio
async def test_cached_rate_reads_without_io(mock_httpx):
    """The synchronous cache read serves the email renderers."""
    from app.core import fx_reference

    mock_httpx["transport"] = _transport(
        {"base": "USD", "rates": {"NGN": 1322.0}, "time_last_update_utc": "z"}
    )
    # Nothing cached yet -> None, without touching the network.
    assert fx_reference.cached_rate() is None
    await fx_reference.fx_reference_payload()
    assert fx_reference.cached_rate() == 1322.0
