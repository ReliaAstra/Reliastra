"""The compiled email design system must satisfy three invariants.

1. **Sanitizer fixed point.** Every compiled body is already reduced to the
   allowlist, so re-sanitizing it changes nothing. This is what makes the
   promise "the markup you reviewed in the preview harness is the markup that
   sends" checkable rather than aspirational - and it is also what makes the
   stored template and the delivered body byte-identical, since ``messages.send``
   sanitizes again on every delivery.

2. **Idempotent sanitizer.** ``sanitize_html`` applied twice equals applied
   once. This is the property the fixed point above depends on, and it did not
   hold before character references were preserved in attribute values.

3. **No credential material.** Nothing that must never leave the admin console
   may appear in a stored template.
"""

from __future__ import annotations

import pytest

from app.modules.email_center.compiled import load_catalogue
from app.modules.email_center.sanitize import ALLOWED_TAGS, sanitize_html
from app.modules.email_center.templates import _SEED_TEMPLATES

catalogue = load_catalogue()
CLASS_IDS = [c.id for c in catalogue.classes]


def test_artefact_loaded() -> None:
    """A missing or invalid artefact must be loud here, not silent in prod."""
    assert catalogue.load_error is None, catalogue.load_error
    assert len(catalogue.classes) == 9, CLASS_IDS


def test_every_class_is_distinct_and_addressed() -> None:
    ids = [c.id for c in catalogue.classes]
    assert len(set(ids)) == len(ids)
    for item in catalogue.classes:
        assert item.audience in {"customer", "prospect", "vendor", "internal"}
        assert item.permitted_senders, f"{item.id} declares no permitted sender"
        for sender in item.permitted_senders:
            assert sender.endswith("@reliastra.com"), (item.id, sender)


def test_every_class_declares_a_contract() -> None:
    for item in catalogue.classes:
        assert item.subject.strip(), f"{item.id} has no subject"
        assert item.variables, f"{item.id} declares no variables"
        assert item.required_variables, f"{item.id} has no required variables"
        for spec in item.variable_specs:
            assert spec.description, f"{item.id}.{spec.name} is undocumented"


def test_classes_claiming_verifiability_ship_the_path_to_verify() -> None:
    """A class that says "check this" must print an address to check it at.

    Without this, the design system could ship an evidence email that asserts a
    document is verifiable while carrying no verification reference - the exact
    failure an evidence product exists to prevent.
    """
    for item in catalogue.classes:
        if not item.verifiable:
            continue
        assert "verification_url" in item.required_variables, item.id


@pytest.mark.parametrize("class_id", CLASS_IDS)
def test_html_is_a_sanitizer_fixed_point(class_id: str) -> None:
    item = catalogue.by_id(class_id)
    assert item is not None
    once = sanitize_html(item.html)
    assert once == item.html, (
        f"{class_id}: compiled HTML is not sanitizer-stable. The compiler must "
        f"emit pre-sanitized markup, not markup the backend has to clean."
    )
    assert sanitize_html(once) == once


@pytest.mark.parametrize("class_id", CLASS_IDS)
def test_html_uses_only_allowlisted_tags(class_id: str) -> None:
    item = catalogue.by_id(class_id)
    assert item is not None
    import re

    for tag in re.findall(r"<\s*/?\s*([a-zA-Z][a-zA-Z0-9]*)", item.html):
        assert tag.lower() in ALLOWED_TAGS, f"{class_id}: disallowed tag {tag}"


@pytest.mark.parametrize("class_id", CLASS_IDS)
def test_no_credential_material_in_a_stored_template(class_id: str) -> None:
    item = catalogue.by_id(class_id)
    assert item is not None
    for forbidden in ("re_", "RESEND_API", "api_key", "apiKey", "Bearer ", "sk_"):
        assert forbidden not in item.html, f"{class_id} leaks {forbidden!r}"
        assert forbidden not in item.text, f"{class_id} leaks {forbidden!r}"


@pytest.mark.parametrize("class_id", CLASS_IDS)
def test_multipart_bodies_are_both_present_and_substantive(class_id: str) -> None:
    """Every class ships a real text alternative.

    A text part that is empty, or that is the HTML with tags stripped into one
    unreadable line, trains recipients to distrust the plain-text alternative
    and is worse than none.
    """
    item = catalogue.by_id(class_id)
    assert item is not None
    assert len(item.text) > 400, f"{class_id}: text part too short"
    assert "\n" in item.text, f"{class_id}: text part is a single block"
    assert "<" not in item.text.split("\n")[0], f"{class_id}: leaked markup into text"
    # The compliance footer must survive into the text part: several
    # jurisdictions require the purpose statement in the message body itself.
    assert "Reliastra" in item.text, f"{class_id}: text part names no sender"


@pytest.mark.parametrize("class_id", CLASS_IDS)
def test_footer_states_the_sending_address(class_id: str) -> None:
    """Commercial mail needs a physical sending address in the body."""
    item = catalogue.by_id(class_id)
    assert item is not None
    if item.audience == "internal":
        pytest.skip("internal operational mail is not commercial correspondence")
    assert "Lagos" in item.html or "Lagos" in item.text, class_id


def test_seed_set_is_the_design_system_plus_one_legacy_template() -> None:
    names = {s["name"] for s in _SEED_TEMPLATES}
    for item in catalogue.classes:
        assert item.name in names, f"{item.name} missing from seeds"
    legacy = names - {c.name for c in catalogue.classes}
    assert legacy == {"Kora - USD International Payments Request"}, legacy


def test_compiled_seeds_carry_the_class_marker() -> None:
    """Compiled seeds are tagged so the picker can tell them from hand-authored."""
    from app.modules.email_center.templates import _seed_description

    compiled = [s for s in _SEED_TEMPLATES if s.get("class_id")]
    assert len(compiled) == len(catalogue.classes)
    for seed in compiled:
        description = _seed_description(seed) or ""
        assert description.startswith(f"[{seed['class_id']}]"), seed["name"]
        assert len(description) <= 500, "description must fit the column"

    # A legacy seed has no class marker and keeps its description verbatim.
    assert _seed_description({"description": "plain", "class_id": None}) == "plain"
    assert _seed_description({"description": "", "class_id": None}) is None


# ── Sanitizer idempotency ──────────────────────────────────────────────────


def test_sanitize_is_idempotent_for_character_references() -> None:
    """A ``&#x27;`` in a CSS font stack must survive re-sanitization.

    React emits single quotes in style attributes as ``&#x27;``. Escaping the
    ampersand unconditionally turned them into ``&amp;#x27;``, and because the
    admin UI loads a stored template back into the compose box and re-submits
    it, the damage compounded on every send until the stored body and the sent
    body were different documents.
    """
    html = (
        '<table><tr><td style="font-family:\'Segoe UI\',Roboto,sans-serif">'
        'Auth0 &amp; Cloudflare</td></tr></table>'
    )
    once = sanitize_html(html)
    twice = sanitize_html(once)
    assert once == twice
    assert "Segoe UI" in once
    assert "&amp;amp;" not in once


def test_sanitize_still_strips_the_things_it_must() -> None:
    html = (
        '<div onclick="steal()"><script>alert(1)</script>'
        '<a href="javascript:alert(1)">x</a>'
        '<a href="https://reliastra.com">y</a></div>'
    )
    out = sanitize_html(html)
    assert "script" not in out
    assert "onclick" not in out
    assert "javascript:" not in out
    assert "https://reliastra.com" in out
