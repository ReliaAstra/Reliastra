"""The global-channel rule, in one place and enforced everywhere it is read.

RELIASTRA sells to customers worldwide, but Paystack's rails are national: card
works in every market, while ``bank``, ``ussd``, ``qr``, ``mobile_money`` and
``bank_transfer`` work only where Paystack supports them — Nigeria above all. A
checkout that shows a Nigerian bank transfer to a customer in Berlin is not a
cosmetic bug: it is a payment screen that cannot be completed, and a product
that looks like it was configured for one country and shipped to all of them.

So the rule lives in :mod:`app.core.payment_channels` and nothing else decides
it. These tests hold the four properties that matter:

* card is the only method a global customer is offered, by default, with no
  configuration;
* widening is fail-closed — an unknown token, an empty list, or a market the
  transaction currency does not serve can never reach Paystack;
* no surface can present a method the policy has not enabled, and no *request*
  can add one;
* a payment that did come back over an unoffered rail is detected and explained,
  while a payment whose shape we merely fail to recognise is never held against
  the customer.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.config import settings
from app.core.payment_channels import (
    CARD_NETWORKS,
    CHANNELS_BY_CURRENCY,
    COUNTRY_RESTRICTED_CHANNELS,
    GLOBAL_CARD_NETWORKS,
    GLOBALLY_AVAILABLE_CHANNELS,
    INTERNATIONAL_CARD_DESCRIPTION,
    INTERNATIONAL_CARD_LABEL,
    INTERNATIONAL_CARD_METHOD_ID,
    PAYSTACK_CHANNELS,
    channel_policy_summary,
    checkout_channels,
    method_is_enabled,
    payment_method_descriptors,
    resolve_checkout_channels,
    settled_channel_is_acceptable,
)

BACKEND = Path(__file__).resolve().parents[2]
REPO = BACKEND.parent

#: Everything in this list is a rail a customer in Nigeria can pay with. None of
#: them may appear in a default global checkout.
LOCAL_ONLY_CHANNELS = (
    "bank",
    "ussd",
    "qr",
    "mobile_money",
    "bank_transfer",
    "eft",
    "capitec_pay",
    "payattitude",
)


@pytest.fixture(autouse=True)
def _default_global_deployment(monkeypatch):
    """Every test starts from a plain deployment: no local opt-in, no override."""
    monkeypatch.setattr(settings, "PAYSTACK_CHECKOUT_CHANNELS", None)
    monkeypatch.setattr(settings, "PAYSTACK_ENABLE_LOCAL_CHANNELS", False)
    monkeypatch.setattr(settings, "PAYSTACK_DEFAULT_CHANNEL", "card")
    monkeypatch.setattr(settings, "PAYSTACK_CURRENCY", "NGN")


# ── The rule itself ──────────────────────────────────────────────────────────


def test_card_is_the_only_globally_available_channel():
    assert GLOBALLY_AVAILABLE_CHANNELS == {"card"}
    assert set(LOCAL_ONLY_CHANNELS).isdisjoint(GLOBALLY_AVAILABLE_CHANNELS)


def test_default_checkout_offers_card_and_nothing_else():
    policy = resolve_checkout_channels()
    assert policy.enabled == ("card",)
    assert checkout_channels() == ["card"]
    assert policy.card_enabled is True


def test_no_configured_value_still_means_card_only():
    """Unset is not "show everything".

    Paystack's own default for an omitted ``channels`` array is every method the
    dashboard has enabled, so an unset setting must resolve to a value here
    rather than be left out of the request.
    """
    assert settings.PAYSTACK_CHECKOUT_CHANNELS is None
    assert checkout_channels() == ["card"]


def test_local_rails_are_country_restricted_by_definition():
    """The names must be the API's names, not paraphrases of them."""
    for channel in LOCAL_ONLY_CHANNELS:
        assert channel in PAYSTACK_CHANNELS, f"{channel} is not a Paystack channel name"
        assert channel in COUNTRY_RESTRICTED_CHANNELS
        assert COUNTRY_RESTRICTED_CHANNELS[channel], f"{channel} claims no market"
    assert PAYSTACK_CHANNELS == {
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
    }, "the documented channel list changed; re-read the API reference"


def test_currency_table_only_promises_rails_that_work_there():
    for currency, channels in CHANNELS_BY_CURRENCY.items():
        assert "card" in channels, f"{currency} must always accept card"
        assert channels <= PAYSTACK_CHANNELS
        for channel in channels - GLOBALLY_AVAILABLE_CHANNELS:
            markets = COUNTRY_RESTRICTED_CHANNELS.get(channel, ())
            assert markets, f"{channel} is enabled for {currency} with no market claim"


# ── Fail-closed resolution ───────────────────────────────────────────────────


@pytest.mark.parametrize("junk", ["not_a_channel", "paypal", "paypal,bitcoin"])
def test_unknown_configuration_is_dropped_not_forwarded(junk, monkeypatch):
    """A typo must not become a Paystack error page — or a method nobody checked.

    Values this deployment does not recognise are discarded and reported through
    ``channel_policy_summary``; the checkout continues on card, because the safe
    interpretation of a broken setting is the narrow one.
    """
    monkeypatch.setattr(settings, "PAYSTACK_CHECKOUT_CHANNELS", [junk])
    assert checkout_channels() == ["card"]
    summary = channel_policy_summary()
    assert summary["enabled"] == ["card"]
    assert summary["rejected"], "a dropped channel must be visible to an operator"


def test_a_blank_setting_reads_as_unset(monkeypatch):
    """``PAYSTACK_CHECKOUT_CHANNELS=`` is an operator writing nothing, not an
    operator asking for nothing — so it falls back to the default rather than
    producing an empty (and therefore wide-open) request."""
    monkeypatch.setattr(settings, "PAYSTACK_CHECKOUT_CHANNELS", [""])
    assert checkout_channels() == ["card"]
    assert channel_policy_summary()["rejected"] == []


def test_local_channels_stay_out_without_an_opt_in(monkeypatch):
    """Naming a local rail is not the same as enabling one.

    The operator has to say they are running a checkout for that market; a
    forgotten environment variable must not silently expose a Nigerian bank
    transfer to every customer on earth.
    """
    monkeypatch.setattr(
        settings, "PAYSTACK_CHECKOUT_CHANNELS", ["card", "bank", "ussd"]
    )
    assert checkout_channels() == ["card"]
    rejected = {item["channel"] for item in channel_policy_summary()["rejected"]}
    assert rejected == {"bank", "ussd"}


def test_opt_in_widens_only_inside_the_currency_it_belongs_to(monkeypatch):
    """The flag is a market statement, not a master switch.

    Mobile money is enabled for a GHS deployment because that is where the rail
    works; asking for it in Naira changes nothing, because RELIASTRA's NGN
    customers are international cardholders. Neither reading is a judgement about
    Nigeria — it is what a checkout can honestly offer the people in front of it.
    """
    monkeypatch.setattr(settings, "PAYSTACK_ENABLE_LOCAL_CHANNELS", True)

    monkeypatch.setattr(settings, "PAYSTACK_CURRENCY", "GHS")
    monkeypatch.setattr(settings, "PAYSTACK_CHECKOUT_CHANNELS", ["card", "mobile_money"])
    assert checkout_channels() == ["card", "mobile_money"]

    monkeypatch.setattr(settings, "PAYSTACK_CURRENCY", "NGN")
    monkeypatch.setattr(settings, "PAYSTACK_CHECKOUT_CHANNELS", ["card", "bank", "ussd"])
    assert checkout_channels() == ["card"]

    # The same opt-in in a market where the rail does not exist still excludes
    # it: the flag says "serve local methods", not "serve every method".
    monkeypatch.setattr(settings, "PAYSTACK_CURRENCY", "USD")
    monkeypatch.setattr(settings, "PAYSTACK_CHECKOUT_CHANNELS", ["card", "bank"])
    assert checkout_channels() == ["card"]


def test_card_first_order_is_kept(monkeypatch):
    """Paystack highlights the first enabled channel; it must be the promised one."""
    monkeypatch.setattr(settings, "PAYSTACK_ENABLE_LOCAL_CHANNELS", True)
    monkeypatch.setattr(settings, "PAYSTACK_CURRENCY", "GHS")
    monkeypatch.setattr(settings, "PAYSTACK_CHECKOUT_CHANNELS", ["mobile_money", "card"])
    assert checkout_channels()[0] == "card"


def test_an_all_rejected_request_still_offers_card(monkeypatch):
    """Never launch a checkout with an empty ``channels`` array."""
    monkeypatch.setattr(
        settings, "PAYSTACK_CHECKOUT_CHANNELS", ["not_a_channel", "paypal"]
    )
    assert checkout_channels() == ["card"]


def test_configuration_is_normalised_not_rejected_for_style(monkeypatch):
    monkeypatch.setattr(
        settings, "PAYSTACK_CHECKOUT_CHANNELS", ["  Card ", "MOBILE-MONEY", "card"]
    )
    policy = resolve_checkout_channels()
    assert policy.requested == ("card", "mobile_money")
    assert policy.enabled == ("card",)  # mobile money needs the opt-in


# ── What the UI may show ─────────────────────────────────────────────────────


def test_descriptors_are_exactly_the_enabled_channels():
    methods = payment_method_descriptors()
    assert [m["channel"] for m in methods] == checkout_channels()
    assert [m["id"] for m in methods] == [INTERNATIONAL_CARD_METHOD_ID]
    for method in methods:
        assert method["handles_card_data"] == "provider"
        assert method["provider"] == "Paystack"
        assert method["label"] and method["description"]


def test_global_card_method_only_promises_networks_that_work_everywhere():
    method = payment_method_descriptors()[0]
    assert method["networks"] == list(GLOBAL_CARD_NETWORKS)
    assert "Visa" in method["networks"] and "Mastercard" in method["networks"]
    restricted = {n["name"] for n in method["restricted_networks"]}
    assert restricted == {n.name for n in CARD_NETWORKS if not n.globally_supported}
    assert "Verve" in restricted, "a Nigeria-only brand must be labelled, not offered"


@pytest.mark.parametrize(
    "banned",
    [
        pytest.param(re.compile(r"\b(bank transfer|ussd|mobile money|qr code)\b", re.I), id="local rails"),
        pytest.param(re.compile(r"(PCI|PCI-DSS|tokeni[sz]e|gateway)", re.I), id="integration jargon"),
        pytest.param(re.compile(r"free|guarantee[d]? refund", re.I), id="over-claiming"),
    ],
)
def test_method_wording_sells_nothing_the_policy_has_not_enabled(banned):
    """The description is a promise about the payment, so it is constrained.

    Naming a rail here would advertise a method the checkout refuses to open;
    naming the integration would move Paystack's compliance work onto the
    customer's screen.
    """
    for method in payment_method_descriptors():
        text = f"{method['label']} {method['description']}"
        assert not banned.search(text), f"method wording contains: {text!r}"


def test_a_customer_cannot_choose_a_method_that_is_not_enabled():
    assert method_is_enabled(INTERNATIONAL_CARD_METHOD_ID) is True
    assert method_is_enabled("") is True  # no choice made: the default applies
    assert method_is_enabled("card") is True
    for channel in LOCAL_ONLY_CHANNELS:
        assert method_is_enabled(channel) is False, f"{channel} must not be selectable"
    assert method_is_enabled("apple_pay") is False


def test_method_choice_does_not_widen_the_request(monkeypatch):
    """Even a hand-edited ``payment_method`` cannot put a local rail on the wire."""
    monkeypatch.setattr(settings, "PAYSTACK_CHECKOUT_CHANNELS", ["card"])
    assert method_is_enabled("mobile_money") is False
    assert checkout_channels() == ["card"]


def test_international_card_identity_is_a_single_definition():
    """The frontend switches on this id; a rename on one side breaks checkout."""
    assert INTERNATIONAL_CARD_METHOD_ID == "international_card"
    assert INTERNATIONAL_CARD_LABEL == "International card"
    assert len(INTERNATIONAL_CARD_DESCRIPTION) > 60
    frontend = REPO / "frontend" / "src"
    hits = [
        path.relative_to(REPO).as_posix()
        for path in list(frontend.rglob("*.ts")) + list(frontend.rglob("*.tsx"))
        if INTERNATIONAL_CARD_METHOD_ID in path.read_text(encoding="utf-8")
    ]
    assert hits, "the checkout UI must use the method id the backend issues"


# ── What a settled payment may report ────────────────────────────────────────


@pytest.mark.parametrize("channel", ["card", "CARD", " card ", None, "", "unknown-rail"])
def test_a_payment_is_never_held_for_a_field_we_cannot_read(channel):
    """Absent or unrecognised ``channel`` settles as acceptable.

    Paystack has not always populated this field, and its vocabulary has changed
    before. A customer who genuinely paid must not be locked out of their
    subscription because one display field of a provider response differs from
    what we expected — the guard exists to catch a rail we refused to offer, not
    to punish a schema we do not control.
    """
    acceptable, reason = settled_channel_is_acceptable(channel)
    assert acceptable is True
    assert reason is None


@pytest.mark.parametrize("channel", LOCAL_ONLY_CHANNELS)
def test_a_settled_local_rail_is_refused_and_explained(channel):
    acceptable, reason = settled_channel_is_acceptable(channel)
    assert acceptable is False
    assert channel in reason
    assert "not enabled" in reason


def test_apple_pay_is_read_as_the_card_rail_it_is():
    """Express wallets settle with the card brand recorded as the channel."""
    assert settled_channel_is_acceptable("apple_pay")[0] is True


def test_a_local_rail_becomes_acceptable_only_when_the_deployment_enables_it(
    monkeypatch,
):
    """The guard follows the policy rather than hard-coding card.

    A Ghana-facing deployment that has opted into mobile money must not have its
    own customers' valid payments rejected by a rule written for global buyers.
    """
    monkeypatch.setattr(settings, "PAYSTACK_ENABLE_LOCAL_CHANNELS", True)
    monkeypatch.setattr(settings, "PAYSTACK_CURRENCY", "GHS")
    monkeypatch.setattr(settings, "PAYSTACK_CHECKOUT_CHANNELS", ["card", "mobile_money"])
    assert settled_channel_is_acceptable("mobile_money") == (True, None)
    # A rail outside that market stays refused even with the flag on.
    assert settled_channel_is_acceptable("eft")[0] is False


# ── Operator visibility ──────────────────────────────────────────────────────


def test_summary_states_the_decision_and_its_reasons(monkeypatch):
    monkeypatch.setattr(settings, "PAYSTACK_CHECKOUT_CHANNELS", ["card", "eft"])
    summary = channel_policy_summary()
    assert summary["currency"] == "NGN"
    assert summary["enabled"] == ["card"]
    assert summary["requested"] == ["card", "eft"]
    assert summary["raw_card_allowed"] is False
    assert summary["card_enabled"] is True
    [rejection] = summary["rejected"]
    assert rejection["channel"] == "eft"
    # The operator is told which fact stopped it, in terms they can act on: the
    # market the rail belongs to, not a stack trace.
    assert "not available for NGN" in rejection["reason"]
    assert "ZA" in rejection["reason"]

    # With the local opt-in on, the *policy* becomes the reason instead.
    monkeypatch.setattr(settings, "PAYSTACK_ENABLE_LOCAL_CHANNELS", False)
    monkeypatch.setattr(settings, "PAYSTACK_CURRENCY", "ZAR")
    monkeypatch.setattr(settings, "PAYSTACK_CHECKOUT_CHANNELS", ["card", "eft"])
    [zar_rejection] = channel_policy_summary()["rejected"]
    assert "global checkout" in zar_rejection["reason"]


def test_raw_card_data_is_never_permitted():
    """The one constraint a configuration change must not be able to undo.

    RELIASTRA has no PCI attestation, so collecting card data is not a
    preference. ``raw_card_allowed`` exists as a permanently False field so a
    future surface has to contradict it deliberately rather than by omission.
    """
    assert resolve_checkout_channels().raw_card_allowed is False
    app = REPO / "backend" / "app"
    sources = [
        path
        for path in app.rglob("*.py")
        if "__pycache__" not in str(path)
        and re.search(r"\b(card_number|cvv|cvc|exp_month|pan)\b", path.read_text("utf-8"), re.I)
        and "modules/billing" in str(path)
    ]
    assert not sources, f"billing code appears to touch raw card fields: {sources}"


def test_no_frontend_surface_hard_codes_a_channel_list():
    """Method availability is answered by the quote, never by a constant.

    A literal ``['card']`` in the checkout UI would keep offering a global
    experience after an operator narrowed or widened the policy — the two would
    disagree about what the customer may pay with, and only one of them would be
    the transaction actually opened at Paystack.
    """
    checkout_ui = REPO / "frontend" / "src" / "components" / "checkout"
    offenders = [
        path.name
        for path in checkout_ui.glob("*.tsx")
        if re.search(r"channels\s*=\s*\[\s*'card'", path.read_text(encoding="utf-8"))
    ]
    assert not offenders, f"channel list hard-coded in {offenders}"
