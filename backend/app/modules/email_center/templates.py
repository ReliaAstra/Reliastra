"""Email templates: storage plus safe ``{{variable}}`` rendering.

Substitution is regex-only - no template engine, no code execution.
Unknown variables are left intact; HTML bodies escape values.
"""

from __future__ import annotations

import html as html_module
import re
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictException, ResourceNotFoundException
from app.modules.email_center.compiled import seed_definitions
from app.modules.email_center.models import (
    EmailCenterTemplate,
)
from app.modules.email_center.sanitize import sanitize_html

VARIABLE_RE = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")


def extract_variables(*texts: str | None) -> list[str]:
    found: list[str] = []
    for text in texts:
        if not text:
            continue
        for match in VARIABLE_RE.finditer(text):
            name = match.group(1)
            if name not in found:
                found.append(name)
    return found


def render_variables(text: str, variables: dict[str, str], *, escape_html: bool) -> str:
    """Substitute ``{{name}}`` placeholders. Unknown names are left intact.

    ``escape_html=True`` HTML-escapes substituted values so a variable can
    never inject markup into an HTML body.
    """

    def _replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in variables:
            return match.group(0)
        value = str(variables[name])
        return html_module.escape(value, quote=True) if escape_html else value

    return VARIABLE_RE.sub(_replace, text or "")


# ── Legacy hand-authored seed ──────────────────────────────────────────────
# Superseded by the compiled design system, which carries enforced fields, a
# compliance footer and a multipart text body that these do not.
#
# "Welcome Email", "Billing Notification", "System Alert" and "Partner
# Invitation" each have a designed equivalent among the nine compiled classes.
# Seeding both would put fourteen templates in the picker, four of them
# visually inferior versions of a class that already exists.
#
# "Kora - USD International Payments Request" is kept: it is a specific piece of
# correspondence that was actually sent to a named vendor, not a generic
# template, and no class covers a one-off KYC thread.

_KORA_TEXT = """Hello Kora Support,

I'm currently onboarding Reliastra, a B2B SaaS platform providing infrastructure monitoring, reliability evidence, and trust tooling for businesses.

We are preparing to accept payments from customers outside Nigeria, primarily in USD, and I'd like to confirm the best Kora setup for this.

Specifically, I'd like to request access to:

- A USD virtual bank account for receiving international customer payments
- USD payment collection through the supported international payment rails
- The ability to hold and manage USD balances where applicable
- Guidance on converting or settling those funds to my Nigerian account
- Any additional KYC/KYB or business documentation required for activation

Reliastra is a software/SaaS business, and the expected payments will be legitimate subscription and service payments from international customers.

My Kora merchant account is currently showing a Cloudflare verification issue during onboarding, displaying a Ray ID. I would also appreciate assistance with completing the account activation.

Business: Reliastra
Website: https://reliastra.com
Use case: International SaaS/customer subscription payments
Primary settlement country: Nigeria

Please let me know the exact requirements and whether USD virtual account access can be enabled for my account.

Thank you,

{{admin_name}}
Founder, Reliastra
finance@reliastra.com"""

_KORA_HTML = """<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;line-height:1.65;max-width:640px;">
<p>Hello Kora Support,</p>
<p>I&rsquo;m currently onboarding <strong>Reliastra</strong>, a B2B SaaS platform providing infrastructure monitoring, reliability evidence, and trust tooling for businesses.</p>
<p>We are preparing to accept payments from customers outside Nigeria, primarily in USD, and I&rsquo;d like to confirm the best Kora setup for this.</p>
<p>Specifically, I&rsquo;d like to request access to:</p>
<ul>
<li>A USD virtual bank account for receiving international customer payments</li>
<li>USD payment collection through the supported international payment rails</li>
<li>The ability to hold and manage USD balances where applicable</li>
<li>Guidance on converting or settling those funds to my Nigerian account</li>
<li>Any additional KYC/KYB or business documentation required for activation</li>
</ul>
<p>Reliastra is a software/SaaS business, and the expected payments will be legitimate subscription and service payments from international customers.</p>
<p>My Kora merchant account is currently showing a Cloudflare verification issue during onboarding, displaying a Ray ID. I would also appreciate assistance with completing the account activation.</p>
<p><strong>Business:</strong> Reliastra<br><strong>Website:</strong> <a href="https://reliastra.com">https://reliastra.com</a><br><strong>Use case:</strong> International SaaS/customer subscription payments<br><strong>Primary settlement country:</strong> Nigeria</p>
<p>Please let me know the exact requirements and whether USD virtual account access can be enabled for my account.</p>
<p>Thank you,</p>
<p>{{admin_name}}<br>Founder, Reliastra<br><a href="mailto:finance@reliastra.com">finance@reliastra.com</a></p>
</div>"""

_LEGACY_SEEDS: tuple[dict, ...] = (
    {
        "name": "Kora - USD International Payments Request",
        "description": "Outreach to Kora support requesting USD virtual account and international payment collection.",
        "subject": "Request for USD Virtual Account and International Payment Collection",
        "text_body": _KORA_TEXT,
        "html_body": _KORA_HTML,
    },
)

#: The compiled transactional design system, rendered from
#: ``frontend/src/emails`` by ``npm run emails:compile``. These are the primary
#: seeds: they are the nine classes every outbound RELIASTRA message is
#: composed from.
_COMPILED_SEEDS: tuple[dict, ...] = tuple(seed_definitions())

#: Order matters only for the picker's alphabetisation, which sorts by name;
#: the split is here so the two provenance paths stay legible.
_SEED_TEMPLATES: tuple[dict, ...] = _COMPILED_SEEDS + _LEGACY_SEEDS


def _seed_description(seed: dict) -> str | None:
    """Prefix compiled seeds so the picker distinguishes them from hand-authored.

    ``name`` is already unique and human-readable, so the discriminator lives in
    the description rather than in a name the operator has to read twice.
    """
    base = (seed.get("description") or "").strip()
    class_id = seed.get("class_id")
    if class_id:
        return f"[{class_id}] {base}".strip()
    return base or None


class EmailTemplates:
    """Template CRUD and seeding (stateless; takes ``db`` per call)."""

    async def ensure_seed_templates(self, db: AsyncSession) -> None:
        """Seed the compiled design system plus the surviving legacy seed.

        Only runs on an empty table. An installation that already has templates
        keeps exactly what it has, including any the operator has edited or
        deleted - this must never resurrect a template a human removed.
        """
        count = (await db.execute(select(func.count(EmailCenterTemplate.id)))).scalar() or 0
        if count:
            return
        for seed in _SEED_TEMPLATES:
            db.add(
                EmailCenterTemplate(
                    name=seed["name"],
                    description=_seed_description(seed),
                    subject=seed["subject"],
                    text_body=seed.get("text_body", ""),
                    html_body=seed.get("html_body", ""),
                    variables=extract_variables(
                        seed["subject"], seed.get("text_body"), seed.get("html_body")
                    ),
                    is_system=True,
                )
            )
        await db.commit()

    async def list_templates(self, db: AsyncSession) -> list[EmailCenterTemplate]:
        await self.ensure_seed_templates(db)
        rows = (
            await db.execute(
                select(EmailCenterTemplate).order_by(EmailCenterTemplate.name)
            )
        ).scalars().all()
        return list(rows)

    async def get_template(self, db: AsyncSession, template_id: uuid.UUID) -> EmailCenterTemplate:
        row = await db.get(EmailCenterTemplate, template_id)
        if row is None:
            raise ResourceNotFoundException("Template not found.")
        return row

    async def create_template(
        self,
        db: AsyncSession,
        *,
        name: str,
        description: str | None,
        subject: str,
        text_body: str,
        html_body: str,
        created_by_admin_id: uuid.UUID | None,
    ) -> EmailCenterTemplate:
        existing = (
            await db.execute(
                select(EmailCenterTemplate).where(
                    func.lower(EmailCenterTemplate.name) == name.strip().lower()
                )
            )
        ).scalars().first()
        if existing is not None:
            raise ConflictException("A template with this name already exists.")
        clean_html = sanitize_html(html_body) if html_body else ""
        row = EmailCenterTemplate(
            name=name.strip(),
            description=(description or "").strip() or None,
            subject=subject.strip(),
            text_body=text_body or "",
            html_body=clean_html,
            variables=extract_variables(subject, text_body, clean_html),
            is_system=False,
            created_by_admin_id=created_by_admin_id,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    async def update_template(
        self,
        db: AsyncSession,
        template_id: uuid.UUID,
        *,
        name: str | None,
        description: str | None,
        subject: str | None,
        text_body: str | None,
        html_body: str | None,
    ) -> EmailCenterTemplate:
        row = await self.get_template(db, template_id)
        if name is not None and name.strip().lower() != row.name.lower():
            clash = (
                await db.execute(
                    select(EmailCenterTemplate).where(
                        func.lower(EmailCenterTemplate.name) == name.strip().lower()
                    )
                )
            ).scalars().first()
            if clash is not None:
                raise ConflictException("A template with this name already exists.")
            row.name = " ".join(name.split())
        if description is not None:
            row.description = description.strip() or None
        if subject is not None:
            row.subject = subject.strip()
        if text_body is not None:
            row.text_body = text_body
        if html_body is not None:
            row.html_body = sanitize_html(html_body)
        row.variables = extract_variables(row.subject, row.text_body, row.html_body)
        await db.commit()
        await db.refresh(row)
        return row

    async def delete_template(self, db: AsyncSession, template_id: uuid.UUID) -> None:
        row = await self.get_template(db, template_id)
        await db.delete(row)
        await db.commit()

    async def duplicate_template(
        self, db: AsyncSession, template_id: uuid.UUID, *, created_by_admin_id: uuid.UUID | None
    ) -> EmailCenterTemplate:
        source = await self.get_template(db, template_id)
        base = f"{source.name} (copy)"
        candidate = base
        suffix = 2
        while (
            await db.execute(
                select(EmailCenterTemplate.id).where(
                    func.lower(EmailCenterTemplate.name) == candidate.lower()
                )
            )
        ).scalars().first() is not None:
            candidate = f"{base} {suffix}"
            suffix += 1
        row = EmailCenterTemplate(
            name=candidate,
            description=source.description,
            subject=source.subject,
            text_body=source.text_body,
            html_body=source.html_body,
            variables=list(source.variables or []),
            is_system=False,
            created_by_admin_id=created_by_admin_id,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row
