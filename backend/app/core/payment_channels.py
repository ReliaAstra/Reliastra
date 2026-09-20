"""app.core.payment_channels — backward-compatibility alias.

Canonical home: ``app.modules.billing.channels``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.modules.billing.channels import (  # noqa: F401
    CARD_NETWORKS,
    CHANNELS_BY_CURRENCY,
    COUNTRY_RESTRICTED_CHANNELS,
    CardNetwork,
    ChannelPolicy,
    GLOBALLY_AVAILABLE_CHANNELS,
    GLOBAL_CARD_NETWORKS,
    INTERNATIONAL_CARD_DESCRIPTION,
    INTERNATIONAL_CARD_LABEL,
    INTERNATIONAL_CARD_METHOD_ID,
    Iterable,
    PAYMENT_PROVIDER,
    PAYMENT_PROVIDER_DISPLAY,
    PAYSTACK_CHANNELS,
    annotations,
    channel_policy_summary,
    checkout_channels,
    dataclass,
    field,
    logger,
    logging,
    method_is_enabled,
    payment_currency,
    payment_method_descriptors,
    resolve_checkout_channels,
    settings,
    settled_channel_is_acceptable,
)

__all__ = [
    "CARD_NETWORKS",
    "CHANNELS_BY_CURRENCY",
    "COUNTRY_RESTRICTED_CHANNELS",
    "CardNetwork",
    "ChannelPolicy",
    "GLOBALLY_AVAILABLE_CHANNELS",
    "GLOBAL_CARD_NETWORKS",
    "INTERNATIONAL_CARD_DESCRIPTION",
    "INTERNATIONAL_CARD_LABEL",
    "INTERNATIONAL_CARD_METHOD_ID",
    "Iterable",
    "PAYMENT_PROVIDER",
    "PAYMENT_PROVIDER_DISPLAY",
    "PAYSTACK_CHANNELS",
    "annotations",
    "channel_policy_summary",
    "checkout_channels",
    "dataclass",
    "field",
    "logger",
    "logging",
    "method_is_enabled",
    "payment_currency",
    "payment_method_descriptors",
    "resolve_checkout_channels",
    "settings",
    "settled_channel_is_acceptable",

]
