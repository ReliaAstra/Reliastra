"""app.core.fx_reference — backward-compatibility alias.

Canonical home: ``app.modules.billing.fx_reference``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.modules.billing.fx_reference import (  # noqa: F401
    FX_REFERENCE_DISCLAIMER,
    PRODUCT_CURRENCY,
    annotations,
    cached_rate,
    current_rate,
    datetime,
    fx_reference_enabled,
    fx_reference_payload,
    httpx,
    json,
    logger,
    logging,
    payment_currency,
    settings,
    time,
    timezone,
)

__all__ = [
    "FX_REFERENCE_DISCLAIMER",
    "PRODUCT_CURRENCY",
    "annotations",
    "cached_rate",
    "current_rate",
    "datetime",
    "fx_reference_enabled",
    "fx_reference_payload",
    "httpx",
    "json",
    "logger",
    "logging",
    "payment_currency",
    "settings",
    "time",
    "timezone",

]
