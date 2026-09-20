"""app.core.payment_disclosure — backward-compatibility alias.

Canonical home: ``app.modules.billing.disclosure``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.modules.billing.disclosure import (  # noqa: F401
    MONTHLY,
    PaymentPrice,
    annotations,
    currency_info,
    currency_payload,
    current_rate,
    fx_reference_payload,
    resolve_payment_price,
    resolve_payment_price_async,
)

__all__ = [
    "MONTHLY",
    "PaymentPrice",
    "annotations",
    "currency_info",
    "currency_payload",
    "current_rate",
    "fx_reference_payload",
    "resolve_payment_price",
    "resolve_payment_price_async",

]
