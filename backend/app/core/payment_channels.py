"""Payment-channel policy for RELIASTRA's global checkout.

Why this module exists
----------------------
Paystack's Checkout shows a different set of payment methods depending on the
merchant account, the transaction currency and the dashboard preferences. Its
own documentation states the rule plainly:

    "Card payment channels are available on all Paystack accounts, while the
    other payment channels are only available in countries where they're
    supported."
    — https://paystack.com/docs/payments/payment-channels/

RELIASTRA sells to customers worldwide, so a checkout that inherits whatever
the dashboard happens to enable would present a Nigerian storefront to a buyer
in Berlin: USSD codes they cannot use, "Pay with Bank" tied to a Nigerian
account number, QR and mobile-money rails that cannot settle their card. That
is not merely untidy — it advertises a payment method, the customer picks it,
and it then fails. So RELIASTRA does not inherit the dashboard configuration;
it *declares* the channel set on every ``transaction/initialize`` call, and
this module is the single place that declaration is defined.

The contract
------------
* ``resolve_checkout_channels()`` returns the ``channels`` array sent to
  Paystack. It is **fail-closed to card-only**: an unknown, empty or
  country-restricted entry never reaches the provider, it is dropped and
  logged.
* ``checkout_payment_methods()`` returns the *customer-facing* method list.
  It is derived from the same resolution, so the UI can never advertise a
  method the transaction does not actually enable, and the transaction can
  never enable a method the UI does not show.
* ``settled_channel_is_acceptable()`` is the post-payment guard: a payment that
  came back over a rail this checkout never offered is refused rather than
  quietly honoured.

Card networks are a separate axis and are documented the same way. Paystack
supports Visa and Mastercard across all of its markets, while Verve is Nigeria
and American Express is Nigeria, South Africa and Kenya
(``payment-channels/#cards``). RELIASTRA's global copy therefore promises only
Visa and Mastercard. Verve and Amex are *not* refusals of the customer's card
— a Verve card that Paystack accepts on the ``card`` channel will still be
charged — they are simply not claimed in the interface, because promising a
network that a given customer's card may not carry is exactly the surprise
this checkout is built to avoid.

Nothing here converts currencies, prices plans, or touches amounts; pricing
lives in :mod:`app.core.payment_pricing`.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from dataclasses import dataclass, field

from app.config import settings
from app.core.payment_pricing import (
    PAYMENT_PROVIDER,
    PAYMENT_PROVIDER_DISPLAY,
    payment_currency,
)

logger = logging.getLogger(__name__)


# ── Paystack's own vocabulary ────────────────────────────────────────────────
#: Every value Paystack accepts in the ``channels`` array of
#: ``POST /transaction/initialize``. Anything else is a typo, not a channel —
#: sending an unknown string risks the whole initialization failing, which is
#: why :func:`resolve_checkout_channels` filters against this set.
#: https://paystack.com/docs/api/transaction/#initialize
PAYSTACK_CHANNELS: frozenset[str] = frozenset(
    {
        "card",
        "bank",
        "apple_pay",
        "ussd",
        "qr",
        "mobile_money",
        "bank_transfer",
        "eft",
        "capitec_pay",
        "payattitude",
    }
)

#: Channels safe for a customer anywhere in the world. ``card`` is the only
#: one: it is the channel Paystack documents as available on all accounts and
#: all markets. ``apple_pay`` is deliberately *absent* — it is an express
#: wallet layered on a card rather than a settlement channel of its own, its
#: availability is not documented as global for NGN accounts, and Paystack
#: exposes it through ``paymentRequest`` element mounting rather than the plain
#: popup. Enabling it is a per-account verification task (see
#: ``PAYSTACK_CHECKOUT_CHANNELS``), not a default.
GLOBALLY_AVAILABLE_CHANNELS: frozenset[str] = frozenset({"card"})

#: Country-restricted rails, with where they actually work. The value is only
#: documentation for operators and for support answers — the enforcement is
#: that none of these appear in a global checkout unless the operator
#: explicitly opts in for a deployment that really has those customers.
COUNTRY_RESTRICTED_CHANNELS: dict[str, tuple[str, ...]] = {
    "bank": ("NG",),  # Pay with Bank — Nigerian internet banking + OTP
    "ussd": ("NG",),  # USSD — Nigerian bank shortcodes, bank-specific
    "qr": ("NG",),  # QR code — Nigerian bank apps
    "eft": ("ZA",),  # South African instant bank EFT
    "capitec_pay": ("ZA",),  # Capitec app approval
    "mobile_money": ("GH", "KE", "TZ"),  # M-Pesa / MTN MoMo / Airtel Money
    "bank_transfer": ("NG", "GH"),  # Pay with Transfer (temporary account)
    "payattitude": ("CI",),  # Orange Money / MTN / Moov / Wave (francophone)
    "invoice": ("NG", "GH"),  # Invoice method (legacy dashboard option)
}

#: Markets whose customers may legitimately need a local rail. Keyed by the
#: *processing currency*, because that is what RELIASTRA's checkout actually
#: knows about a transaction (there is no billing-country field on
#: ``transaction/initialize``). A deployment that adds a Ghanaian entity and
#: charges in GHS can opt in to mobile money; the NGN deployment cannot.
CHANNELS_BY_CURRENCY: dict[str, frozenset[str]] = {
    # Nigeria has the most local rails of any market and is still card-only, on
    # purpose: RELIASTRA's NGN charges come from international cardholders who
    # cannot open a Nigerian bank session, and there is no billing-country field
    # on a transaction to identify anybody who could. A customer whose context
    # genuinely supports a local rail is served by the entity charging in their
    # own currency, not by loosening this row.
    "NGN": frozenset({"card"}),
    "GHS": frozenset({"card", "mobile_money"}),
    "KES": frozenset({"card", "mobile_money"}),
    "ZAR": frozenset({"card", "eft", "capitec_pay"}),
    "USD": frozenset({"card"}),
    "XOF": frozenset({"card", "payattitude"}),
}


@dataclass(frozen=True)
class CardNetwork:
    """A card brand, and where Paystack actually supports it."""

    name: str
    globally_supported: bool = True
    markets: tuple[str, ...] = ()

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "globally_supported": self.globally_supported,
            "markets": list(self.markets) if self.markets else ["all"],
        }


#: Paystack card-network support by market (payment-channels/#cards). Visa and
#: Mastercard are the two RELIASTRA shows a global customer.
CARD_NETWORKS: tuple[CardNetwork, ...] = (
    CardNetwork("Visa"),
    CardNetwork("Mastercard"),
    CardNetwork("Verve", globally_supported=False, markets=("NG",)),
    CardNetwork("American Express", globally_supported=False, markets=("NG", "ZA", "KE")),
)

#: Networks advertised to a global buyer — the union of what every Paystack
#: market accepts, intersected with the card channel actually enabled. Kept as
#: a tuple of display strings so the frontend and the emails can share one
#: wording ("Visa · Mastercard") instead of each inventing their own.
GLOBAL_CARD_NETWORKS: tuple[str, ...] = tuple(
    network.name for network in CARD_NETWORKS if network.globally_supported
)

#: The single payment method a global RELIASTRA checkout offers today.
INTERNATIONAL_CARD_METHOD_ID = "international_card"

#: Display copy for that method. Deliberately spare: a method row that reads
#: like a fintech brochure makes an infrastructure buyer suspicious.
INTERNATIONAL_CARD_LABEL = "International card"
INTERNATIONAL_CARD_DESCRIPTION = (
    "Visa and Mastercard issued anywhere in the world, including cards billed "
    "in USD. Charged securely by Paystack — RELIASTRA never sees your card "
    "number, expiry or CVC."
)


@dataclass(frozen=True)
class ChannelPolicy:
    """The resolved channel decision for the active deployment.

    ``requested`` is what the operator asked for; ``enabled`` is what is
    actually sent to Paystack; ``rejected`` explains what was dropped and why,
    which is what an operator reads when checkout behaves oddly.
    """

    enabled: tuple[str, ...] = ("card",)
    requested: tuple[str, ...] = ("card",)
    rejected: tuple[tuple[str, str], ...] = ()
    currency: str = "NGN"
    #: True when a card channel is present — the one condition under which
    #: RELIASTRA may offer self-serve checkout at all (see ``raw_card_allowed``).
    card_enabled: bool = True
    #: Raw card *data* handling: RELIASTRA never collects it. Retained as an
    #: explicit False so no surface can "forget" the constraint.
    raw_card_allowed: bool = False
    networks: tuple[str, ...] = field(default_factory=lambda: GLOBAL_CARD_NETWORKS)

    def as_dict(self) -> dict:
        return {
            "channels": list(self.enabled),
            "card_enabled": self.card_enabled,
            "raw_card_allowed": self.raw_card_allowed,
            "currency": self.currency,
        }


def _normalize(values: Iterable[object] | None) -> tuple[str, ...]:
    """Lowercase, strip, dedupe, preserve order. Never raises."""
    seen: dict[str, None] = {}
    for value in values or ():
        token = str(value).strip().lower().replace("-", "_").replace(" ", "_")
        if token:
            seen.setdefault(token, None)
    return tuple(seen)


def resolve_checkout_channels() -> ChannelPolicy:
    """The ``channels`` array to send Paystack, and the reasoning behind it.

    Read from ``PAYSTACK_CHECKOUT_CHANNELS`` so an operator can widen the set
    for a specific entity without a code change. The resolution is fail-closed:

    * nothing configured  -> ``["card"]`` (RELIASTRA's declared default);
    * an unknown token    -> dropped, logged;
    * a country-restricted token -> dropped unless
      ``PAYSTACK_ENABLE_LOCAL_CHANNELS`` is on *and* the active processing
      currency is one where that rail actually works;
    * a list with no usable entry -> ``["card"]``. Checkout never runs with an
      empty channel array: an empty list is what a misconfiguration would
      produce, and silently showing the dashboard's full method list is the
      failure mode this module exists to prevent.
    """
    currency = payment_currency()
    configured = settings.PAYSTACK_CHECKOUT_CHANNELS
    requested = _normalize(configured) if configured else ()
    if not requested:
        requested = _normalize([settings.PAYSTACK_DEFAULT_CHANNEL])
    if not requested:
        requested = ("card",)

    allowed_for_currency = CHANNELS_BY_CURRENCY.get(
        currency, GLOBALLY_AVAILABLE_CHANNELS
    )
    local_opt_in = bool(settings.PAYSTACK_ENABLE_LOCAL_CHANNELS)

    enabled: list[str] = []
    rejected: list[tuple[str, str]] = []
    for channel in requested:
        if channel not in PAYSTACK_CHANNELS:
            rejected.append(
                (channel, "not a Paystack checkout channel (see the Initialize "
                 "Transaction API reference)")
            )
            continue
        if channel in GLOBALLY_AVAILABLE_CHANNELS:
            enabled.append(channel)
            continue
        if channel not in allowed_for_currency:
            rejected.append(
                (channel, f"not available for {currency} transactions — "
                 f"Paystack restricts it to "
                 f"{', '.join(COUNTRY_RESTRICTED_CHANNELS.get(channel, ('restricted markets',)))}")
            )
            continue
        if not local_opt_in:
            rejected.append(
                (channel, "a local payment method; RELIASTRA's global checkout "
                 "stays card-only until PAYSTACK_ENABLE_LOCAL_CHANNELS=true")
            )
            continue
        enabled.append(channel)

    if not enabled:
        if rejected:
            logger.error(
                "PAYSTACK_CHECKOUT_CHANNELS resolved to nothing usable (%s); "
                "falling back to card-only checkout. Fix the setting to restore "
                "the intended methods.",
                "; ".join(f"{name}: {why}" for name, why in rejected),
            )
        enabled = ["card"]

    # Order matters less than presence, but card first keeps Paystack's own
    # default tab on the method the customer was promised.
    enabled.sort(key=lambda name: (name != "card", name))
    return ChannelPolicy(
        enabled=tuple(enabled),
        requested=requested,
        rejected=tuple(rejected),
        currency=currency,
        card_enabled="card" in enabled,
        networks=GLOBAL_CARD_NETWORKS if "card" in enabled else (),
    )


def checkout_channels() -> list[str]:
    """Just the array for ``transaction/initialize`` (a fresh list each call)."""
    return list(resolve_checkout_channels().enabled)


def payment_method_descriptors() -> list[dict]:
    """The customer-facing method list for the checkout UI.

    One entry per enabled channel, built here rather than in a component so the
    checkout page, the pricing API and the receipt emails state the same thing.
    ``networks`` lists only the card brands Paystack supports in every market —
    the UI is not trusted to know which brands are safe to promise.
    """
    policy = resolve_checkout_channels()
    methods: list[dict] = []
    for channel in policy.enabled:
        if channel == "card":
            methods.append(
                {
                    "id": INTERNATIONAL_CARD_METHOD_ID,
                    "channel": "card",
                    "label": INTERNATIONAL_CARD_LABEL,
                    "description": INTERNATIONAL_CARD_DESCRIPTION,
                    "networks": list(policy.networks),
                    "restricted_networks": [
                        network.as_dict()
                        for network in CARD_NETWORKS
                        if not network.globally_supported
                    ],
                    "provider": PAYMENT_PROVIDER,
                    "provider_display": PAYMENT_PROVIDER_DISPLAY,
                    "supports_international": True,
                    # The customer is leaving RELIASTRA's page for the
                    # provider's secure payment experience: card data never
                    # touches a RELIASTRA form or server.
                    "handles_card_data": "provider",
                }
            )
        else:
            # A locally-enabled rail (a future GHS mobile-money deployment).
            # Marked as market-specific so the UI labels it honestly instead of
            # presenting it as a global option.
            methods.append(
                {
                    "id": channel,
                    "channel": channel,
                    "label": channel.replace("_", " ").title(),
                    "description": (
                        f"Available for {policy.currency} payments only, "
                        "where Paystack supports this method."
                    ),
                    "networks": [],
                    "restricted_networks": [],
                    "provider": PAYMENT_PROVIDER,
                    "provider_display": PAYMENT_PROVIDER_DISPLAY,
                    "supports_international": False,
                    "markets": list(COUNTRY_RESTRICTED_CHANNELS.get(channel, ())),
                    "handles_card_data": "provider",
                }
            )
    return methods


def method_is_enabled(method_id: str) -> bool:
    """Is the method the UI is about to show actually enabled upstream?

    The checkout page accepts no client-side choice of channel — but it does
    echo the one it displayed, so the backend can refuse a mismatch rather
    than launch a payment through a method nobody was told about.
    """
    policy = resolve_checkout_channels()
    if method_id in ("", INTERNATIONAL_CARD_METHOD_ID, "card"):
        return policy.card_enabled
    return method_id in policy.enabled


def settled_channel_is_acceptable(channel: object) -> tuple[bool, str | None]:
    """Post-payment guard: was this paid through a rail we actually offered?

    Returns ``(acceptable, reason)``.

    What is refused is one specific, actionable case: a payment that reports
    coming back over a rail RELIASTRA's global checkout declined to offer (a
    Nigerian bank transfer on a worldwide plan), which means the transaction
    did not follow this checkout's policy and belongs to a human to reconcile.

    Anything else is accepted. An absent value is accepted because Paystack's
    verify response has not always populated ``channel``; an unrecognised value
    is accepted because the gateway adds methods, and refusing to activate a
    subscription over a channel name this build has never seen would punish a
    customer for a vendor changelog. Whether the payment is *ours* is decided by
    the amount, currency, reference and organization checks — this guard only
    notices a rail we consciously excluded.
    """
    if channel is None or str(channel).strip() == "":
        return True, None
    normalized = _normalize([channel])
    if not normalized:
        return True, None
    settled = normalized[0]
    enabled = set(resolve_checkout_channels().enabled)
    if settled in enabled:
        return True, None
    # ``card``-derived express wallets settle with the card brand recorded as
    # the channel on some Paystack responses; accept anything the card rail
    # covers rather than rejecting a real card payment.
    if settled in {"apple_pay"} and "card" in enabled:
        return True, None
    if settled not in PAYSTACK_CHANNELS:
        logger.warning(
            "Paystack reported a payment channel this build does not know (%s); "
            "accepting it, since the amount and ownership checks are what decide "
            "whether the payment belongs to this organization.",
            settled,
        )
        return True, None
    # A documented Paystack rail this deployment refused to enable.
    return (
        False,
        f"settled over the {settled} channel, which is not enabled for "
        f"RELIASTRA's global checkout",
    )


def channel_policy_summary() -> dict:
    """Operator-visible policy state, for admin surfaces and health output.

    Not customer-facing: it names rejected configuration, which is a support
    concern, not something to print on a checkout screen.
    """
    policy = resolve_checkout_channels()
    return {
        "currency": policy.currency,
        "enabled": list(policy.enabled),
        "requested": list(policy.requested),
        "rejected": [{"channel": name, "reason": why} for name, why in policy.rejected],
        "card_enabled": policy.card_enabled,
        "raw_card_allowed": policy.raw_card_allowed,
        "local_channels_enabled": bool(settings.PAYSTACK_ENABLE_LOCAL_CHANNELS),
    }
