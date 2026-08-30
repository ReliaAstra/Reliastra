"""Payment-disclosure composition — display layer, never a pricing input.

``app.core.payment_pricing`` resolves what is charged. This module wraps that
resolution with everything a *screen* additionally shows: the canonical
disclosure paragraph (already inside ``currency_info``) and the cached FX
reference estimate. The separation is deliberate — modules on the charge path
(``payment_pricing``, ``permissions``) must not import FX code, while request
handlers building responses import it from here. A guard test in
``tests/unit/test_payment_pricing_catalog.py`` enforces the direction.
"""

from __future__ import annotations

from app.core.fx_reference import fx_reference_payload
from app.core.payment_pricing import currency_info


async def currency_payload() -> dict:
    """``currency_info()`` plus the FX reference, for async request handlers.

    Attached here because every payment surface already fetches this one
    object; that keeps the estimate's label, source and timestamp identical on
    the pricing page, the upgrade modal, the billing page and the pre-payment
    confirmation. The FX value is display-only and never consulted by price
    resolution.
    """
    payload = currency_info()
    payload["fx_reference"] = await fx_reference_payload()
    return payload
