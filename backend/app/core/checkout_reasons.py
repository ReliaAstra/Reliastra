"""app.core.checkout_reasons — backward-compatibility alias.

Canonical home: ``app.modules.billing.checkout_reasons``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.modules.billing.checkout_reasons import (  # noqa: F401
    AMOUNT_NEUTRAL_REASONS,
    Any,
    AppException,
    CheckoutReason,
    CheckoutRejectedException,
    ClassVar,
    MONEY_MAY_HAVE_MOVED_REASONS,
    ValidationException,
    annotations,
)

__all__ = [
    "AMOUNT_NEUTRAL_REASONS",
    "Any",
    "AppException",
    "CheckoutReason",
    "CheckoutRejectedException",
    "ClassVar",
    "MONEY_MAY_HAVE_MOVED_REASONS",
    "ValidationException",
    "annotations",

]
