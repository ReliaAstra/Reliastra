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


# ── Seed templates ────────────────────────────────────────────────────────
# Stored as plain data (editable + deletable from the Admin UI). Variables
# use the safe {{name}} substitution - never a template engine.

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

_SEED_TEMPLATES: tuple[dict, ...] = (
    {
        "name": "Kora - USD International Payments Request",
        "description": "Outreach to Kora support requesting USD virtual account and international payment collection.",
        "subject": "Request for USD Virtual Account and International Payment Collection",
        "text_body": _KORA_TEXT,
        "html_body": _KORA_HTML,
    },
    {
        "name": "Welcome Email",
        "description": "Welcome a new customer to Reliastra.",
        "subject": "Welcome to Reliastra, {{customer_name}}",
        "text_body": (
            "Hello {{customer_name}},\n\nWelcome to Reliastra. Your workspace for "
            "{{company_name}} is ready, and you can connect your first dependency "
            "from the dashboard.\n\nIf you need anything, reply to this email and "
            "our team will help.\n\n- The Reliastra Team"
        ),
        "html_body": (
            '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;'
            'color:#1f2937;line-height:1.65;max-width:640px;">'
            "<p>Hello {{customer_name}},</p>"
            "<p>Welcome to <strong>Reliastra</strong>. Your workspace for {{company_name}} is ready, "
            "and you can connect your first dependency from the dashboard.</p>"
            "<p>If you need anything, reply to this email and our team will help.</p>"
            "<p>- The Reliastra Team</p></div>"
        ),
    },
    {
        "name": "Billing Notification",
        "description": "Notify a customer about an invoice or billing event.",
        "subject": "Billing update for {{company_name}} - {{invoice_id}}",
        "text_body": (
            "Hello {{customer_name}},\n\nThis is a billing notification regarding "
            "invoice {{invoice_id}} for {{company_name}}.\n\nAmount due: {{amount_due}}\n"
            "Due date: {{due_date}}\n\nYou can review and pay from your Reliastra "
            "billing page. Reply to this email with any questions.\n\n- Reliastra Billing"
        ),
        "html_body": (
            '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;'
            'color:#1f2937;line-height:1.65;max-width:640px;">'
            "<p>Hello {{customer_name}},</p>"
            "<p>This is a billing notification regarding invoice <strong>{{invoice_id}}</strong> "
            "for {{company_name}}.</p>"
            "<p><strong>Amount due:</strong> {{amount_due}}<br>"
            "<strong>Due date:</strong> {{due_date}}</p>"
            "<p>You can review and pay from your Reliastra billing page. "
            "Reply to this email with any questions.</p>"
            "<p>- Reliastra Billing</p></div>"
        ),
    },
    {
        "name": "System Alert",
        "description": "Operational alert notification for internal or customer follow-up.",
        "subject": "[Reliastra] {{alert_title}}",
        "text_body": (
            "Reliastra system alert\n\n{{alert_title}}\n\n{{alert_details}}\n\n"
            "Detected at: {{detected_at}}\n\n- Reliastra Operations"
        ),
        "html_body": (
            '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;'
            'color:#1f2937;line-height:1.65;max-width:640px;">'
            "<p><strong>Reliastra system alert</strong></p>"
            "<p><strong>{{alert_title}}</strong></p>"
            "<p>{{alert_details}}</p>"
            "<p>Detected at: {{detected_at}}</p>"
            "<p>- Reliastra Operations</p></div>"
        ),
    },
    {
        "name": "Partner Invitation",
        "description": "Invite a company to the Reliastra partner program.",
        "subject": "Invitation: partner with Reliastra",
        "text_body": (
            "Hello {{partner_name}},\n\nI'd like to invite {{company_name}} to partner "
            "with Reliastra. Our partners earn recurring revenue by bringing "
            "reliability intelligence to their customers.\n\nYou can start here: "
            "https://reliastra.com/partners\n\nHappy to walk you through the program "
            "on a short call.\n\n- {{admin_name}}\nReliastra Partnerships"
        ),
        "html_body": (
            '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;'
            'color:#1f2937;line-height:1.65;max-width:640px;">'
            "<p>Hello {{partner_name}},</p>"
            "<p>I&rsquo;d like to invite {{company_name}} to partner with <strong>Reliastra</strong>. "
            "Our partners earn recurring revenue by bringing reliability intelligence to "
            "their customers.</p>"
            '<p>You can start here: <a href="https://reliastra.com/partners">'
            "https://reliastra.com/partners</a></p>"
            "<p>Happy to walk you through the program on a short call.</p>"
            "<p>- {{admin_name}}<br>Reliastra Partnerships</p></div>"
        ),
    },
)


class EmailTemplates:
    """Template CRUD and seeding (stateless; takes ``db`` per call)."""

    async def ensure_seed_templates(self, db: AsyncSession) -> None:
        count = (await db.execute(select(func.count(EmailCenterTemplate.id)))).scalar() or 0
        if count:
            return
        for seed in _SEED_TEMPLATES:
            db.add(
                EmailCenterTemplate(
                    name=seed["name"],
                    description=seed.get("description"),
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
