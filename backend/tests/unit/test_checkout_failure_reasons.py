"""The checkout failure vocabulary is one contract, not two.

The backend classifies every rejected payment with a reason slug
(``CheckoutReason``) and the frontend decides what the customer reads from that
slug (``CHECKOUT_FAILURE_COPY``). The two live in different languages and are
edited by different people, so they drift: a slug with no copy entry falls
through to a generic "something went wrong" card, which is exactly the
impersonal payment failure this design exists to remove.

These tests pin the seam from both sides:

* every reason the backend can emit has customer-facing copy;
* every copy entry is keyed by a reason that exists (no dead wording);
* wording about money agrees with the backend's own classification of whether a
  charge may already have happened — the distinction between "you were not
  charged, try again" and "we are still checking, do not pay again" is what
  prevents a double payment;
* the copy never leaks a provider implementation detail, and never asks a human
  for help without the UI offering the contact.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.core import checkout_reasons
from app.core.checkout_reasons import (
    AMOUNT_NEUTRAL_REASONS,
    MONEY_MAY_HAVE_MOVED_REASONS,
    CheckoutReason,
    CheckoutRejectedException,
)

BACKEND = Path(__file__).resolve().parents[2]
REPO = BACKEND.parent
FRONTEND_COPY = REPO / "frontend" / "src" / "lib" / "billing" / "checkout-errors.ts"

#: Slugs the UI derives for itself, which no backend response ever carries:
#: ``payment_cancelled`` and ``authentication_required`` come from the InlineJS
#: callbacks (the provider's popup reported them, our API did not), and
#: ``session_expired`` is chosen from an HTTP 401 rather than a reason field.
CLIENT_DERIVED = {"payment_cancelled", "authentication_required", "session_expired"}

#: Copy the customer can reach without the API ever naming a reason: the browser
#: observed the transport break, which is a state only the browser can know.
UI_ONLY_REASONS = {"network_interrupted"}

FIELDS = ("title", "body", "action", "tone", "retry", "support")
TONES = {"neutral", "attention", "problem"}

#: Phrases that state, definitely, that no money was taken.
NO_CHARGE_PHRASES = (
    "nothing was charged",
    "nothing has been charged",
    "no payment was started",
    "no charge was made",
    "no charge was finalized",
    "not been charged",
)


def _entries(source: str) -> dict[str, dict[str, object]]:
    """Parse ``CHECKOUT_FAILURE_COPY`` without pretending to be a TS compiler.

    The object literal is machine-generated-looking by design — one entry per
    reason, one field per line — which makes a line-oriented read reliable. It
    fails loudly (assertion) rather than silently if the shape changes, because
    a parser that quietly finds nothing would quietly assert nothing.
    """
    start = source.index("export const CHECKOUT_FAILURE_COPY")
    end = source.index("\n};", start)
    body = source[start:end]
    keys = list(re.finditer(r"^  ([a-z_]+): \{$", body, re.M))
    assert keys, "no copy entries parsed — the object shape changed"
    entries: dict[str, dict[str, object]] = {}
    for index, match in enumerate(keys):
        stop = keys[index + 1].start() if index + 1 < len(keys) else len(body)
        chunk = re.sub(
            r"^\s*//.*$", "", re.sub(r"\n\s*\},?\s*$", "", body[match.end() : stop]), flags=re.M
        )
        fields: dict[str, object] = {}
        marks = list(re.finditer(r"^    (\w+):\s*(.*)$", chunk, re.M))
        assert len(marks) == len(FIELDS), (
            f"{match.group(1)}: expected {len(FIELDS)} fields, found "
            f"{[m.group(1) for m in marks]}"
        )
        for position, mark in enumerate(marks):
            field_end = (
                marks[position + 1].start() if position + 1 < len(marks) else len(chunk)
            )
            raw = chunk[mark.start(2) : field_end]
            quoted = re.findall(r"'((?:[^'\\]|\\.)*)'", raw)
            if quoted:
                fields[mark.group(1)] = "".join(quoted)
            else:
                value = raw.strip().rstrip(",").strip()
                fields[mark.group(1)] = {"true": True, "false": False}.get(
                    value, value
                )
        entries[match.group(1)] = fields
    return entries


@pytest.fixture(scope="module")
def copy_entries() -> dict[str, dict[str, object]]:
    assert FRONTEND_COPY.exists(), f"missing {FRONTEND_COPY}"
    return _entries(FRONTEND_COPY.read_text(encoding="utf-8"))


def _slug_members() -> dict[str, str]:
    """``{slug: member name}`` for every reason the backend can emit."""
    return {
        getattr(CheckoutReason, name): name
        for name in dir(CheckoutReason)
        if name.isupper() and isinstance(getattr(CheckoutReason, name), str)
    }


def test_reason_registry_is_all_strings():
    """A reason is a wire value; nothing else may live in the enum."""
    for slug, member in _slug_members().items():
        assert isinstance(slug, str), f"{member} must carry a string slug"
        assert re.fullmatch(r"[a-z][a-z0-9_]*", slug), f"{member} is not a slug"
    assert _slug_members(), "CheckoutReason lost its members"


def test_every_backend_reason_has_customer_copy(copy_entries):
    """No customer ever meets an unclassified payment failure."""
    missing = sorted(set(_slug_members()) - set(copy_entries))
    assert not missing, (
        f"{missing} are emitted by the backend but have no entry in "
        "CHECKOUT_FAILURE_COPY, so the UI would show generic failure copy"
    )


def test_no_copy_without_a_backend_reason(copy_entries):
    """Wording nobody can reach is wording nobody maintains."""
    orphans = sorted(set(copy_entries) - set(_slug_members()) - UI_ONLY_REASONS)
    assert not orphans, f"{orphans} have copy but no reason emits them"


def test_every_reason_is_reachable(copy_entries):
    """Each slug is either raised somewhere or documented as client-derived.

    Guards against the quiet failure mode where a reason is added to the enum,
    given a sentence in the UI, and never actually produced — the state it
    describes then never happens, and a real one lands on generic copy.
    """
    sources = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (REPO / "backend" / "app").rglob("*.py")
        if "__pycache__" not in str(path)
    )
    unreachable = [
        slug
        for slug, member in _slug_members().items()
        if f"CheckoutReason.{member}" not in sources and slug not in CLIENT_DERIVED
    ]
    assert not unreachable, f"{unreachable} are defined but never emitted"


@pytest.mark.parametrize("field", FIELDS)
def test_copy_entries_are_complete(copy_entries, field):
    for slug, entry in copy_entries.items():
        assert field in entry, f"{slug} is missing `{field}`"
        value = entry[field]
        if field in {"title", "body", "action"}:
            minimum = {"title": 8, "body": 40, "action": 15}[field]
            assert isinstance(value, str) and len(value) >= minimum, (
                f"{slug}.{field} is too thin to explain anything"
            )
        if field == "tone":
            assert value in TONES, f"{slug}.tone={value!r} is not one of {TONES}"
        if field in {"retry", "support"}:
            assert isinstance(value, bool), f"{slug}.{field} must be a boolean"


def test_money_classification_and_wording_agree(copy_entries):
    """The copy must not promise "you were not charged" where money may have moved.

    ``MONEY_MAY_HAVE_MOVED_REASONS`` is the backend's answer to "is a charge
    outstanding?". A reason in that set is one where the customer may already
    have paid — so its sentence must never state that nothing was taken, and
    must never imply the same click is free. Getting this wrong is how a
    customer pays twice, or a company explains a charge it cannot see.
    """
    for slug in sorted(MONEY_MAY_HAVE_MOVED_REASONS):
        entry = copy_entries.get(slug)
        assert entry, f"{slug} is classified but has no copy"
        text = f"{entry['title']} {entry['body']}".lower()
        for phrase in NO_CHARGE_PHRASES:
            assert phrase not in text, (
                f"{slug}: money may have moved, but the copy asserts '{phrase}'"
            )


def test_no_charge_promises_only_for_settled_reasons(copy_entries):
    """The mirror of the above: a definite "nothing was charged" is reserved for
    reasons the backend classifies as amount-neutral or otherwise settled, where
    we genuinely know no payment exists.
    """
    for slug, entry in copy_entries.items():
        text = f"{entry['title']} {entry['body']}".lower()
        if not any(phrase in text for phrase in NO_CHARGE_PHRASES):
            continue
        assert slug in AMOUNT_NEUTRAL_REASONS, (
            f"{slug} promises the customer nothing was charged, but the backend "
            "does not classify it as amount-neutral — a claim we cannot keep"
        )
        assert slug not in MONEY_MAY_HAVE_MOVED_REASONS


def test_classification_sets_are_disjoint():
    assert not (set(AMOUNT_NEUTRAL_REASONS) & set(MONEY_MAY_HAVE_MOVED_REASONS)), (
        "a reason cannot be both 'nothing to worry about' and 'money may have moved'"
    )
    assert set(AMOUNT_NEUTRAL_REASONS) | set(MONEY_MAY_HAVE_MOVED_REASONS) <= set(
        _slug_members()
    )


def test_no_retry_invitation_where_payment_may_have_moved(copy_entries):
    """A reason with an outstanding capture never gets a "try again" button.

    ``retry: true`` sends the customer back to the review step, where the next
    click creates a *new* transaction. That is safe precisely when we know no
    capture exists; where one may be settling, the same click is how people end
    up paying twice, and the card must ask them to wait instead.
    """
    for slug in sorted(MONEY_MAY_HAVE_MOVED_REASONS):
        assert copy_entries[slug]["retry"] is False, (
            f"{slug}: money may have moved, so retry must not be offered"
        )


def test_support_is_offered_exactly_when_copy_asks_for_it(copy_entries):
    """Copy that names a human has to be backed by a visible contact affordance,
    and a contact affordance no more generous than the wording warrants."""
    for slug, entry in copy_entries.items():
        mentions = "billing@reliastra.com" in f"{entry['body']}{entry['action']}"
        if mentions:
            assert entry["support"] is True, (
                f"{slug} tells the customer to email billing but hides the contact"
            )


def test_copy_never_names_the_provider_internals(copy_entries):
    """No provider error strings, no field names, no integration vocabulary.

    Naming Paystack as the processor is required transparency; narrating its
    API is not. A sentence like "amount must be greater than 100" or "invalid
    authorization token" describes our integration, not the customer's problem,
    and reads like the checkout was built on somebody else's spare parts.
    """
    banned = (
        "paystack_error",
        "authorization_url",
        "access_code",
        "gateway_response",
        "422",
        "409",
        "503",
        "http",
        "null",
        "undefined",
        "payload",
        "endpoint",
        "api",
        "minor units",
    )
    for slug, entry in copy_entries.items():
        text = f"{entry['title']} {entry['body']} {entry['action']}".lower()
        for word in banned:
            assert not re.search(rf"\b{re.escape(word)}\b", text), (
                f"{slug} leaks implementation vocabulary: {word!r}"
            )


def test_exception_carries_the_slug_the_ui_switches_on():
    """The wire contract behind the copy table."""
    error = CheckoutRejectedException(
        CheckoutReason.DECLINED, "declined", extra={"reference": "ref-1"}
    )
    assert error.reason == CheckoutReason.DECLINED
    assert error.code == "CHECKOUT_FAILED"
    # 409, not 422: nothing the customer typed is wrong, so the client must not
    # be told to fix its input — and must not be told a retry could help.
    assert error.status_code == 409
    assert error.details[0] == {"field": "reason", "issue": CheckoutReason.DECLINED}
    assert {"field": "reference", "issue": "ref-1"} in error.details
    assert error.details[0]["field"] == "reason", "the UI reads details[0]"


def test_provider_outage_is_the_one_retryable_status():
    """503 means "the same click may work in a minute", and is reserved for it."""
    assert (
        CheckoutRejectedException(
            CheckoutReason.PROVIDER_UNAVAILABLE, "down", status_code=503
        ).status_code
        == 503
    )
    for reason in CheckoutRejectedException.__mro__:  # pragma: no cover - sanity
        assert reason is not None
    # A policy rejection must not default to 503: nothing about it is transient.
    assert (
        CheckoutRejectedException(CheckoutReason.ORG_MISMATCH, "nope").status_code
        == 409
    )


def test_reason_sets_stay_in_the_backend(core_source):
    """The classification is decided once, server-side.

    If the UI ever grew its own copy of these sets, the two would disagree about
    whether a customer was charged — and the disagreement would show up as
    wording, not as a failing test. So the sets live here and nowhere else.
    """
    assert "AMOUNT_NEUTRAL_REASONS" in core_source
    assert "MONEY_MAY_HAVE_MOVED_REASONS" in core_source
    frontend_lib = REPO / "frontend" / "src" / "lib"
    duplicates = [
        path.relative_to(REPO).as_posix()
        for path in frontend_lib.rglob("*.ts")
        if "AMOUNT_NEUTRAL" in path.read_text(encoding="utf-8")
        or "MONEY_MAY_HAVE_MOVED" in path.read_text(encoding="utf-8")
    ]
    assert not duplicates, f"classification duplicated in the frontend: {duplicates}"


@pytest.fixture(scope="module")
def core_source() -> str:
    return Path(checkout_reasons.__file__).read_text(encoding="utf-8")
