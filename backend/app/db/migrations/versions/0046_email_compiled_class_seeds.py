"""Backfill the nine compiled email classes into existing installs.

``EmailTemplates.ensure_seed_templates`` only seeds an empty table, so any
database created before the transactional design system shipped keeps exactly
what it has - and the nine compiled classes never reach its "Use Template"
picker. That is the correct rule going forward (it must never resurrect a
template a human removed), but it strands every existing install one release
behind: the design system ships in the image while the dashboard cannot use it.

This migration closes that gap exactly once: it inserts each compiled class
whose ``name`` is absent, and skips every name that is already present. An
operator-edited or operator-deleted template is never touched - a row that
exists under the same name keeps its content, and a name the operator removed
is re-inserted only by this one migration, never again by the seeder.

The seed bytes come from the reviewed design artefact
``app/modules/email_center/compiled_templates.json`` (the same file
``compiled.seed_definitions`` reads), not from a copy pasted here, so the
migration cannot drift from what was reviewed. A missing artefact fails the
migration loudly: a release whose headline is these templates must not deploy
without them.
"""
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

import sqlalchemy as sa
from alembic import op

revision = '0046_email_compiled_class_seeds'
down_revision = '0045_dependencies_single_region'
branch_labels = None
depends_on = None

_VARIABLE_RE = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")


def _compiled_classes() -> list[dict]:
    artefact = (
        Path(__file__).resolve().parents[3]
        / "modules" / "email_center" / "compiled_templates.json"
    )
    try:
        parsed = json.loads(artefact.read_text(encoding="utf-8"))
    except OSError as exc:
        raise RuntimeError(f"email design artefact unreadable at {artefact}: {exc}")
    classes = parsed.get("classes", [])
    if len(classes) != 9:
        raise RuntimeError(
            f"expected 9 compiled email classes at {artefact}, found {len(classes)}"
        )
    return classes


def _variables(*texts: str | None) -> list[str]:
    found: list[str] = []
    for text in texts:
        if not text:
            continue
        for match in _VARIABLE_RE.finditer(text):
            name = match.group(1)
            if name not in found:
                found.append(name)
    return found


def _rows() -> list[dict]:
    now = datetime.now(timezone.utc)
    rows = []
    for item in _compiled_classes():
        for key in ("name", "subject", "html", "text"):
            if not item.get(key):
                raise RuntimeError(
                    f"compiled class {item.get('id')!r} missing {key!r}"
                )
        description = (item.get("description") or "").strip()
        if item.get("id"):
            description = f"[{item['id']}] {description}".strip()
        rows.append(
            {
                "id": uuid.uuid4(),
                "name": item["name"],
                "description": description or None,
                "subject": item["subject"],
                "text_body": item["text"],
                "html_body": item["html"],
                "variables": json.dumps(
                    _variables(item["subject"], item["text"], item["html"])
                ),
                "created_at": now,
                "updated_at": now,
            }
        )
    return rows


_INSERT = sa.text(
    "INSERT INTO email_center_templates "
    "(id, name, description, subject, text_body, html_body, variables, "
    "is_system, created_at, updated_at) "
    "SELECT :id, :name, :description, :subject, :text_body, :html_body, "
    "CAST(:variables AS jsonb), true, :created_at, :updated_at "
    "WHERE NOT EXISTS "
    "(SELECT 1 FROM email_center_templates WHERE lower(name) = lower(:name))"
)

# Downgrade removes only rows that still byte-match the seed: a template the
# operator edited afterwards is left alone, mirroring the upgrade's promise.
_DELETE = sa.text(
    "DELETE FROM email_center_templates "
    "WHERE name = :name AND is_system = true AND html_body = :html_body"
)


def upgrade() -> None:
    for row in _rows():
        op.execute(_INSERT.bindparams(**row))


def downgrade() -> None:
    for item in _compiled_classes():
        op.execute(
            _DELETE.bindparams(name=item["name"], html_body=item["html"])
        )
