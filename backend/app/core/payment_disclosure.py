"""Payment-disclosure composition - the async glue between rate and price.

``app.core.payment_pricing`` resolves what is charged, given an exchange rate.
This module fetches the live rate and feeds it into that resolution, and wraps
the result with everything a *screen* additionally shows: the canonical
disclosure paragraph (inside ``currency_info``) and the FX reference payload.
The separation is deliberate - the charge path's sync core never imports FX
code, while the request handlers that build responses resolve through here.
"""

from __future__ import annotations

from app.core.fx_reference import current_rate, fx_reference_payload
from app.core.payment_pricing import (
    MONTHLY,
    PaymentPrice,
    currency_info,
    resolve_payment_price,
)


async def currency_payload() -> dict:
    """``currency_info()`` plus the FX reference, for async request handlers.

    The live rate is fetched once and passed into ``currency_info`` so the
    ``checkout_ready`` flag and the ``plan_payment_amounts`` map are the same
    numbers the checkout will charge - and the embedded ``fx_reference`` is the
    very cache entry the rate came from, so the displayed rate and the charge
    can never disagree.
    """
    rate = await current_rate()
    payload = currency_info(rate=rate)
    payload["fx_reference"] = await fx_reference_payload()
    return payload


async def resolve_payment_price_async(
    plan: str, interval: str = MONTHLY
) -> PaymentPrice:
    """Resolve a plan's product + payment price against the live FX rate.

    For a non-USD processing currency this fetches (or reads the cached) rate
    and converts the USD list price; for a USD deployment the rate is ``None``
    and the product price is charged directly. The quote and the transaction
    both resolve through here, so the amount a customer approves is the amount
    Paystack is asked to collect.
    """
    rate = await current_rate()
    return resolve_payment_price(plan, interval, rate=rate)
