"""Integration-test defaults for the live exchange rate.

The NGN charge is now the USD product price converted at the live rate fetched
from ``app.core.fx_reference``. Integration tests must not reach the public
rate source, so the fetch is stubbed to a fixed, contract-testing rate of
1322.0 NGN/USD - the figure the bug report names - giving deterministic prices:

    Pro monthly  $39.00  -> 3900 x 1322  = 5,155,800 kobo = ₦51,558.00
    Pro annual   $390.00 -> 39000 x 1322 = 51,558,000 kobo = ₦515,580.00

Caching is neutralised too (both Redis and the process-local cache), so every
FX read resolves through the stub and no test can inherit another test's rate.
Tests that exercise the FX source itself monkeypatch ``_fetch_rate`` on top of
this and so override the stub for their own duration.
"""

from __future__ import annotations

import pytest

#: NGN per 1 USD. Chosen to match the bug report's ~₦1,322 rate exactly.
FX_RATE = 1322.0


async def _fixed_rate_payload(*_args, **_kwargs) -> dict:
    return {
        "available": True,
        "source_currency": "USD",
        "payment_currency": "NGN",
        "rate": FX_RATE,
        "source_timestamp": "Sun, 30 Aug 2026 00:00:00 +0000",
        "retrieved_at": "2026-08-30T00:00:00Z",
        "provider": "ExchangeRate-API",
        "provider_url": "https://www.exchangerate-api.com",
        "source_url": "https://open.er-api.com/v6/latest/USD",
        "label": "Exchange rate (converts your USD price to NGN)",
        "disclaimer": (
            "Your charge is the USD price converted to NGN at the market rate "
            "shown here. The rate is provided by the named source and is "
            "refreshed periodically."
        ),
    }


@pytest.fixture(autouse=True)
def _fixed_fx_rate(monkeypatch):
    from app.core import fx_reference

    async def _none(*_args, **_kwargs):
        return None

    async def _noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(fx_reference, "_fetch_rate", _fixed_rate_payload)
    monkeypatch.setattr(fx_reference, "_cache_read", _none)
    monkeypatch.setattr(fx_reference, "_cache_store", _noop)
    fx_reference._memory_cache = None
    yield
    fx_reference._memory_cache = None
