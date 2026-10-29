"""Prospect AI service: parsing, prompt construction, drafting, sending.

Design rules carried over from the evidence system:

* The model sees only pre-researched evidence (:class:`LeadEvidence`). It
  writes the email; it never researches, invents, or inflates claims.
* Drafting is reviewer-triggered and bounded (max 8 leads per call) so one
  click cannot silently burn the platform LLM budget.
* Sending reuses the Email Center pipeline - sender eligibility, provider
  normalization, idempotency and the audit record all come from
  :class:`EmailService`, never re-implemented here.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from app.core.exceptions import ValidationException
from app.modules.email_center.schemas import SendEmailRequest
from app.modules.email_center.templates import render_variables
from app.modules.prospect_ai.models import ProspectLead

logger = logging.getLogger(__name__)

MAX_COMPANY_LENGTH = 255
MAX_DOMAIN_LENGTH = 253
# Deliverability floor: a fresh sending domain that fires hundreds of cold
# emails on day one burns its own reputation. The cap is deliberately low;
# raise it deliberately, not per-batch.
DAILY_SEND_CAP = 20
LEAD_TEMPLATE_VARIABLES = (
    "company", "contact_name", "role", "domain", "website", "product",
    "external_dependencies", "pain_signal", "outreach_hook",
)


def normalize_domain(value: str | None) -> str | None:
    """Best-effort domain extraction from a URL or bare domain."""
    if not value:
        return None
    text = value.strip().lower()
    if not text:
        return None
    if "://" not in text:
        text = f"https://{text}"
    try:
        host = (urlparse(text).hostname or "").strip()
    except ValueError:
        return None
    host = host.removeprefix("www.")
    if not host or "." not in host or len(host) > MAX_DOMAIN_LENGTH:
        return None
    return host


def parse_prospects(json_text: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Parse a prospect report. Returns ``(prospects, meta)``.

    Accepts a bare array of prospects or an object with a ``prospects``
    array (the daily-report shape, whose other keys become ``meta``).
    Raises :class:`ValidationException` on unusable input.
    """
    try:
        parsed = json.loads(json_text)
    except json.JSONDecodeError as exc:
        raise ValidationException(f"Report is not valid JSON: {exc.msg}") from exc
    if isinstance(parsed, list):
        prospects, meta = parsed, {}
    elif isinstance(parsed, dict):
        prospects = parsed.get("prospects")
        meta = {k: v for k, v in parsed.items() if k != "prospects"}
        if prospects is None:
            raise ValidationException(
                "JSON object has no 'prospects' array. Expected the daily-report shape."
            )
    else:
        raise ValidationException("Report must be a JSON array or object.")
    if not isinstance(prospects, list) or not prospects:
        raise ValidationException("No prospects found in the report.")
    if len(prospects) > 500:
        raise ValidationException("Report too large: max 500 prospects per import.")
    clean: list[dict[str, Any]] = []
    for index, item in enumerate(prospects):
        if not isinstance(item, dict):
            raise ValidationException(f"Prospect #{index + 1} is not an object.")
        clean.append(item)
    return clean, meta


def _field(prospect: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = prospect.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if value is not None and not isinstance(value, (dict, list)):
            return str(value).strip() or None
    return None


def lead_from_prospect(prospect: dict[str, Any]) -> ProspectLead | None:
    """Map one report prospect to a lead row. Returns None when unusable
    (no company and no domain)."""
    company = _field(prospect, "company", "company_name", "name")
    website = _field(prospect, "website", "url", "site")
    domain = normalize_domain(website) or normalize_domain(_field(prospect, "domain"))
    if not company and not domain:
        return None
    rank_raw = _field(prospect, "rank")
    try:
        rank = int(re.sub(r"[^\d]", "", rank_raw)) if rank_raw else None
    except ValueError:
        rank = None
    contact_email = _field(prospect, "contact_email", "email")
    if contact_email and ("@" not in contact_email or len(contact_email) > 320):
        contact_email = None
    raw_copy = dict(prospect)
    return ProspectLead(
        rank=rank,
        company=(company or domain or "Unknown")[:MAX_COMPANY_LENGTH],
        product=_field(prospect, "product"),
        website=(website or None),
        domain=domain or company_or_slug(company or ""),
        contact_name=_field(prospect, "contact_name", "technical_person", "person"),
        role=_field(prospect, "role", "title"),
        contact_email=contact_email,
        why_this_person=_field(prospect, "why_this_person"),
        external_dependencies=_field(prospect, "external_dependencies"),
        evidence=_field(prospect, "evidence"),
        pain_signal=_field(prospect, "pain_signal"),
        why_reliastra_is_relevant=_field(prospect, "why_reliastra_is_relevant"),
        outreach_hook=_field(prospect, "outreach_hook"),
        verdict=_field(prospect, "verdict")[:255] if _field(prospect, "verdict") else None,
        raw=raw_copy,
        draft_status="pending",
    )


def company_or_slug(company: str) -> str:
    slug = re.sub(r"[^a-z0-9.-]+", "-", company.strip().lower()).strip("-.")
    return (slug or "unknown")[:MAX_DOMAIN_LENGTH]


def build_prompt(lead: ProspectLead, tone: str | None, lint_issues: list[str] | None = None) -> str:
    """Backward-compatible alias for the v2 drafting prompt."""
    from app.modules.prospect_ai.drafting import build_prompt_v2

    return build_prompt_v2(lead, tone, lint_issues)


def parse_draft(text: str | None) -> tuple[str, str] | None:
    """Extract ``(subject, body)`` from a model reply. Tolerates fenced or
    trailing prose around the JSON object. Returns None when unusable."""
    from app.modules.prospect_ai.drafting import parse_v2

    parsed = parse_v2(text)
    if parsed is None:
        return None
    return parsed["subject"], parsed["body"]


async def draft_lead(
    lead: ProspectLead, tone: str | None, db: Any
) -> ProspectLead:
    """Generate and persist a draft for one lead (v2 two-stage prompt + lint).

    One lint-informed retry: if the first draft fails the deterministic
    lint, the corrected issues are appended to the prompt and the model
    gets exactly one more attempt. A second failure records every issue -
    a failed draft is data, not a silent skip.
    """
    from app.modules.ai_integration.service import call_llm
    from app.modules.prospect_ai.drafting import build_prompt_v2, lint_draft, parse_v2
    from app.modules.prospect_ai.provider import resolve_drafting_models

    models = await resolve_drafting_models(db)
    if not models:
        raise ValidationException(
            "No LLM available: no active AI provider profile and no "
            "RELIASTRA_AI_* platform configuration."
        )

    def empty_reply_error(result: dict[str, Any]) -> str:
        finish = result.get("finish_reason")
        if finish == "length":
            return (
                "Model spent its whole token budget without answering "
                f"(finish_reason={finish}). Raise max tokens on the profile "
                "or pick a model that emits JSON instead of reasoning text."
            )
        suffix = f" (finish_reason={finish})" if finish else ""
        return (
            "Model returned no text"
            f"{suffix}. Check the provider model name, quota and key."
        )

    # Walk the chain: the saved profile first, the platform provider second.
    # A provider that errors, returns nothing, or returns something that is
    # not a draft is a failed *attempt*, not a failed lead - the next model
    # gets the same prompt. Only when every model has failed is the lead
    # marked failed, and the last reason is what the reviewer sees.
    parsed: dict[str, Any] | None = None
    lint_issues: list[str] = []
    last_error = "No model produced a draft."
    for model in models:
        try:
            result = await call_llm(model, build_prompt_v2(lead, tone))
            if not (result.get("text") or "").strip():
                last_error = empty_reply_error(result)
                logger.warning(
                    "Prospect draft: %s/%s returned no text (%s)",
                    model.provider_type, model.model_name, result.get("finish_reason"),
                )
                continue
            parsed = parse_v2(result.get("text"))
            if parsed is None:
                last_error = (
                    "Model reply was not usable JSON with subject/body "
                    f"({model.model_name})."
                )
                logger.warning(
                    "Prospect draft: %s/%s reply was not usable JSON",
                    model.provider_type, model.model_name,
                )
                continue
            lint_issues, _warnings = lint_draft(parsed["subject"], parsed["body"], lead)
            if lint_issues:
                retry = await call_llm(model, build_prompt_v2(lead, tone, lint_issues))
                retried = parse_v2(retry.get("text"))
                if retried is not None:
                    parsed = retried
                    lint_issues, _warnings = lint_draft(
                        parsed["subject"], parsed["body"], lead
                    )
            break
        except ValidationException as exc:
            # Endpoint refused by the SSRF/safety boundary: a config error for
            # this provider, not a reason to abandon the chain.
            last_error = f"LLM endpoint failed safety validation: {exc}"
            logger.warning("Prospect draft: %s rejected: %s", model.model_name, exc)
            parsed = None
            continue
        except Exception as exc:
            last_error = str(exc)[:1000]
            logger.warning(
                "Prospect draft failed for lead %s via %s: %s",
                lead.id, model.model_name, exc,
            )
            parsed = None
            continue

    if parsed is None:
        lead.draft_status = "failed"
        lead.draft_error = last_error
        return lead
    lead.draft_subject = parsed["subject"]
    lead.draft_body = parsed["body"]
    lead.draft_angle = parsed.get("angle")
    lead.draft_rejected_angles = parsed.get("rejected_angles")
    lead.draft_status = "ready"
    # A draft that still fails the lint after its corrective retry is NOT
    # hidden - it lands in review with every issue listed, because the
    # human, not the model, is the final gate. Nothing can be sent without
    # an explicit approve regardless.
    lead.draft_error = (
        "lint issues: " + "; ".join(issue[:140] for issue in lint_issues[:5])
        if lint_issues
        else None
    )
    lead.drafted_at = datetime.now(timezone.utc)
    return lead


def lead_email_variables(lead: ProspectLead) -> dict[str, str]:
    """Lead fields a studio template may reference as {{variables}}."""
    variables: dict[str, str] = {}
    for field in LEAD_TEMPLATE_VARIABLES:
        value = getattr(lead, field, None)
        if isinstance(value, str) and value.strip():
            variables[field] = value.strip()
    if lead.contact_name:
        first = lead.contact_name.strip().split(" ", 1)[0]
        if first:
            variables["first_name"] = first
    return variables


def build_send_request(
    lead: ProspectLead,
    sender: str,
    reply_to: str | None,
    *,
    template_html: str | None = None,
) -> SendEmailRequest:
    """Build the Email Center payload for an approved lead draft.

    ``template_html`` (the studio template's HTML body) wraps the optional
    design layer: lead fields render into its {{variables}} (HTML-escaped)
    while the AI's text draft stays the plain-text body. Without a
    template the draft sends as plain text, exactly as reviewed.
    """
    if not lead.contact_email:
        raise ValidationException("This lead has no contact email - it cannot be sent.")
    if lead.draft_status == "sent":
        raise ValidationException("Draft was already sent.")
    if lead.draft_status != "approved":
        raise ValidationException(
            "Only approved drafts can be sent - approve it in the "
            "inspector (or approve the selection) first."
        )
    subject = (lead.draft_subject or "").strip()
    body = (lead.draft_body or "").strip()
    if not subject or not body:
        raise ValidationException("Draft is empty - generate or write one before sending.")
    payload = SendEmailRequest(
        sender=sender,
        to=[lead.contact_email],
        reply_to=reply_to,
        subject=subject,
        text=body,
        idempotency_key=f"prospect-ai-{lead.id}",
    )
    if template_html:
        variables = lead_email_variables(lead)
        payload.html = render_variables(template_html, variables, escape_html=True)
        payload.template_id = None
    return payload


def _daily_send_cap() -> int:
    """Deliverability cap, overridable via PROSPECT_DAILY_SEND_CAP."""
    from app.config import settings

    return max(1, int(getattr(settings, "PROSPECT_DAILY_SEND_CAP", DAILY_SEND_CAP)))


async def count_sent_today(db: Any) -> int:
    """Drafts sent since local midnight UTC."""
    from sqlalchemy import func, select

    midnight = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = await db.execute(
        select(func.count()).select_from(ProspectLead).where(
            ProspectLead.sent_at.is_not(None),
            ProspectLead.sent_at >= midnight,
        )
    )
    return int(rows.scalar() or 0)


def sends_remaining_today(sent_today: int) -> int:
    return max(0, _daily_send_cap() - sent_today)
