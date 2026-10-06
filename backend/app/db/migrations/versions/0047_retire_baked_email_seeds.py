"""Retire the baked compiled-template rows inserted by 0046.

Migration 0046 backfilled the nine compiled classes so existing installs could
use them, but the seed bytes carry the compile step's preview fixtures as
literal content (example checksums, example URLs). Sending one of those rows
mails demonstration data as though it were a live measurement - the exact
failure the design system exists to prevent.

Composing from a class now renders the components with operator-bound values
at compose time, so the baked rows have no remaining job. This migration
deletes exactly the rows that still byte-match the compiled artefact: a row
the operator edited afterwards is left alone, and a row the operator deleted
stays deleted. The match is evaluated against the artefact on disk, so a
mismatch fails safe (rows kept) rather than deleting content it cannot
recognise.
"""
import json
from pathlib import Path

import sqlalchemy as sa
from alembic import op

revision = '0047_retire_baked_email_seeds'
down_revision = '0046_email_compiled_class_seeds'
branch_labels = None
depends_on = None


def _seed_rows() -> list[dict]:
    artefact = (
        Path(__file__).resolve().parents[3]
        / "modules" / "email_center" / "compiled_templates.json"
    )
    try:
        parsed = json.loads(artefact.read_text(encoding="utf-8"))
    except OSError as exc:
        raise RuntimeError(f"email design artefact unreadable at {artefact}: {exc}")
    rows = []
    for item in parsed.get("classes", []):
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
                "name": item["name"],
                "description": description or None,
                "subject": item["subject"],
                "text_body": item["text"],
                "html_body": item["html"],
            }
        )
    if len(rows) != 9:
        raise RuntimeError(f"expected 9 compiled email classes, found {len(rows)}")
    return rows


_DELETE = sa.text(
    "DELETE FROM email_center_templates "
    "WHERE name = :name AND is_system = true AND html_body = :html_body"
)

_INSERT = sa.text(
    "INSERT INTO email_center_templates "
    "(id, name, description, subject, text_body, html_body, variables, "
    "is_system, created_at, updated_at) "
    "SELECT gen_random_uuid(), :name, :description, :subject, :text_body, "
    ":html_body, CAST(:variables AS jsonb), true, now(), now() "
    "WHERE NOT EXISTS "
    "(SELECT 1 FROM email_center_templates WHERE lower(name) = lower(:name))"
)


def upgrade() -> None:
    for row in _seed_rows():
        op.execute(
            _DELETE.bindparams(name=row["name"], html_body=row["html_body"])
        )


def downgrade() -> None:
    import re

    variable_re = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")
    for row in _seed_rows():
        found: list[str] = []
        for text in (row["subject"], row["text_body"], row["html_body"]):
            for match in variable_re.finditer(text or ""):
                if match.group(1) not in found:
                    found.append(match.group(1))
        op.execute(
            _INSERT.bindparams(
                name=row["name"],
                description=row["description"],
                subject=row["subject"],
                text_body=row["text_body"],
                html_body=row["html_body"],
                variables=json.dumps(found),
            )
        )
