"""Loader for the compiled transactional email design system.

The nine message classes are authored as React Email components under
``frontend/src/emails`` and compiled to HTML + plain text by
``frontend/scripts/compile-email-templates.ts``, which writes
``compiled_templates.json`` next to this module.

Why a build step rather than hand-authored strings:

* One source of truth. The admin Email Center, the send path, the backend seeds
  and the design preview harness all render the same bytes.
* The compiler runs every body through a port of this module's own sanitizer
  allowlist and asserts the result is a *fixed point* - sanitizing it again is a
  no-op. That is what makes "the markup you reviewed is the markup that sends"
  a checkable claim instead of an aspiration. ``test_compiled_templates.py``
  asserts the same property from the Python side against the real sanitizer.
* Variables are declared with a required flag and a source binding, so the
  admin UI can refuse to send a message whose provenance fields were never
  filled, instead of letting a template send with a blank checksum.

The JSON is read once at import and validated. A malformed or missing artefact
degrades to an empty catalogue rather than an import-time crash: the Email
Center must keep working for hand-authored templates even if the frontend was
never built.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

_COMPILED_PATH = Path(__file__).with_name("compiled_templates.json")

#: Audiences the design system distinguishes. Used to decide whether a class may
#: ever be addressed outside RELIASTRA, and to label it in the admin UI.
AUDIENCES = frozenset({"customer", "prospect", "vendor", "internal"})


@dataclass(frozen=True)
class CompiledVariable:
    """A declared ``{{variable}}`` and the contract attached to it."""

    name: str
    required: bool
    description: str
    #: Dotted API path that populates this field, when it comes from live data
    #: rather than from an operator. Drives both the admin "bind" affordance and
    #: the provenance block printed in the email.
    bound: str | None = None
    machine: bool = False


@dataclass(frozen=True)
class CompiledClass:
    """One message class as emitted by the compiler."""

    id: str
    name: str
    description: str
    audience: str
    subject: str
    preview_text: str
    html: str
    text: str
    variables: tuple[str, ...]
    permitted_senders: tuple[str, ...]
    purpose: str
    verifiable: bool
    variable_specs: tuple[CompiledVariable, ...] = ()

    @property
    def required_variables(self) -> tuple[str, ...]:
        return tuple(v.name for v in self.variable_specs if v.required)


@dataclass(frozen=True)
class CompiledCatalogue:
    classes: tuple[CompiledClass, ...] = ()
    generated_by: str = ""
    #: Populated when the artefact was present but rejected. Never raised: a
    #: broken design-system build must not take the Email Center down with it.
    load_error: str | None = None

    def by_id(self, class_id: str) -> CompiledClass | None:
        for item in self.classes:
            if item.id == class_id:
                return item
        return None

    def for_audience(self, audience: str) -> tuple[CompiledClass, ...]:
        return tuple(c for c in self.classes if c.audience == audience)


def _coerce_variables(raw: Any) -> tuple[CompiledVariable, ...]:
    if not isinstance(raw, (list, tuple)):
        return ()
    out: list[CompiledVariable] = []
    for item in raw:
        if not isinstance(item, dict) or not item.get("name"):
            continue
        out.append(
            CompiledVariable(
                name=str(item["name"]),
                required=bool(item.get("required", False)),
                description=str(item.get("description", "")),
                bound=str(item["bound"]) if item.get("bound") else None,
                machine=bool(item.get("machine", False)),
            )
        )
    return tuple(out)


def _coerce(raw: dict[str, Any]) -> CompiledClass:
    missing = [
        key
        for key in ("id", "name", "subject", "html", "text")
        if not raw.get(key)
    ]
    if missing:
        raise ValueError(f"compiled class {raw.get('id')!r} missing {missing}")

    audience = str(raw.get("audience", "customer"))
    if audience not in AUDIENCES:
        raise ValueError(f"compiled class {raw['id']!r} has unknown audience {audience!r}")

    return CompiledClass(
        id=str(raw["id"]),
        name=str(raw["name"]),
        description=str(raw.get("description", "")),
        audience=audience,
        subject=str(raw["subject"]),
        preview_text=str(raw.get("preview_text", "")),
        html=str(raw["html"]),
        text=str(raw["text"]),
        variables=tuple(str(v) for v in raw.get("variables", ())),
        permitted_senders=tuple(
            s.strip().lower() for s in raw.get("permitted_senders", ()) if s.strip()
        ),
        purpose=str(raw.get("purpose", "")),
        verifiable=bool(raw.get("verifiable", False)),
        variable_specs=_coerce_variables(raw.get("variable_specs")),
    )


@lru_cache(maxsize=1)
def load_catalogue() -> CompiledCatalogue:
    """Read and validate ``compiled_templates.json`` once per process."""
    try:
        raw = _COMPILED_PATH.read_text(encoding="utf-8")
    except OSError as exc:
        return CompiledCatalogue(load_error=f"artefact unreadable: {exc}")

    try:
        parsed = json.loads(raw)
        classes = tuple(_coerce(item) for item in parsed.get("classes", ()))
    except (ValueError, TypeError, AttributeError) as exc:
        return CompiledCatalogue(load_error=f"artefact invalid: {exc}")

    seen: set[str] = set()
    for item in classes:
        if item.id in seen:
            return CompiledCatalogue(load_error=f"duplicate class id {item.id!r}")
        seen.add(item.id)

    return CompiledCatalogue(
        classes=classes,
        generated_by=str(parsed.get("_generated", "")),
    )


def seed_definitions() -> list[dict[str, Any]]:
    """Compiled classes shaped for :data:`_SEED_TEMPLATES`."""
    return [
        {
            "name": item.name,
            "description": item.description,
            "subject": item.subject,
            "text_body": item.text,
            "html_body": item.html,
            "class_id": item.id,
        }
        for item in load_catalogue().classes
    ]


def class_for_sender(sender: str, *, class_id: str) -> CompiledClass | None:
    """The class if ``sender`` is permitted to send it, else ``None``.

    Callers use the ``None`` to distinguish "this class is not approved for that
    alias" from "there is no such class", because the two need different
    operator-facing messages.
    """
    item = load_catalogue().by_id(class_id)
    if item is None:
        return None
    if sender.strip().lower() in item.permitted_senders:
        return item
    return None


__all__ = [
    "AUDIENCES",
    "CompiledCatalogue",
    "CompiledClass",
    "CompiledVariable",
    "class_for_sender",
    "load_catalogue",
    "seed_definitions",
]
