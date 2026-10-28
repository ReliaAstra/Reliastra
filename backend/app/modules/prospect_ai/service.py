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
from app.modules.ai_integration.service import AIService
from app.modules.email_center.schemas import SendEmailRequest
from app.modules.prospect_ai.models import ProspectLead
from app.modules.prospect_ai.schemas import LeadEvidence

logger = logging.getLogger(__name__)

MAX_COMPANY_LENGTH = 255
MAX_DOMAIN_LENGTH = 253

_DRAFT_INSTRUCTION = (
    "You write first-touch cold emails for RELIASTRA, an independent "
    "external-dependency monitoring product. RELIASTRA observes the third-party "
    "APIs a SaaS product depends on, confirms outages deterministically (two "
    "consecutive failures open an incident, two consecutive recoveries close "
    "it), and issues verifiable evidence.\n\n"
    "Write a cold email using ONLY the evidence supplied. Do not invent "
    "metrics, incidents, vendor claims, customer names, or facts. If an "
    "evidence field is empty, do not reference that topic. Reference at most "
    "one or two concrete evidence details - specificity beats volume.\n\n"
    "Requirements:\n"
    "- subject: under 60 characters, lowercase-friendly, no clickbait, no emoji\n"
    "- body: plain text, under 140 words, 3 short paragraphs max\n"
    "- open with a specific observation about the prospect, not about RELIASTRA\n"
    "- close with one low-pressure call to action\n"
    "- no signature block; the send pipeline appends the operator signature\n"
    '- Return ONLY a JSON object: {"subject": str, "body": str}'
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


def build_prompt(lead: ProspectLead, tone: str | None) -> str:
    evidence = LeadEvidence(
        rank=lead.rank,
        company=lead.company,
        product=lead.product,
        website=lead.website,
        contact_name=lead.contact_name,
        role=lead.role,
        external_dependencies=lead.external_dependencies,
        evidence=lead.evidence,
        pain_signal=lead.pain_signal,
        why_reliastra_is_relevant=lead.why_reliastra_is_relevant,
        outreach_hook=lead.outreach_hook,
        verdict=lead.verdict,
    )
    evidence_json = json.dumps(evidence.model_dump(), ensure_ascii=False, indent=1)
    tone_line = (
        f"Tone: {tone.strip()} - but never at the cost of factual discipline."
        if tone
        else "Tone: direct, engineering-respectful, zero hype."
    )
    return (
        f"{_DRAFT_INSTRUCTION}\n\n"
        f"{tone_line}\n\n"
        f"Prospect evidence:\n{evidence_json}"
    )


def parse_draft(text: str | None) -> tuple[str, str] | None:
    """Extract ``(subject, body)`` from a model reply. Tolerates fenced or
    trailing prose around the JSON object. Returns None when unusable."""
    if not text or not text.strip():
        return None
    candidate = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", candidate, re.DOTALL)
    if fence:
        candidate = fence.group(1)
    else:
        brace = re.search(r"\{.*\}", candidate, re.DOTALL)
        if brace:
            candidate = brace.group(0)
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    subject = data.get("subject")
    body = data.get("body")
    if not isinstance(subject, str) or not isinstance(body, str):
        return None
    subject = subject.strip()[:500]
    body = body.strip()
    if not subject or not body:
        return None
    return subject, body


async def draft_lead(lead: ProspectLead, tone: str | None) -> ProspectLead:
    """Generate and persist a draft for one lead via the platform LLM."""
    service = AIService()
    model = service.platform_model()
    if model is None:
        raise ValidationException(
            "The RELIASTRA-managed LLM is not configured (RELIASTRA_AI_* settings)."
        )
    try:
        result = await service._call_model(model, build_prompt(lead, tone))
        parsed = parse_draft(result.get("text"))
    except ValidationException:
        lead.draft_status = "failed"
        lead.draft_error = "LLM endpoint failed safety validation"
        raise
    except Exception as exc:
        logger.warning("Prospect draft failed for lead %s: %s", lead.id, exc)
        lead.draft_status = "failed"
        lead.draft_error = str(exc)[:1000]
        return lead
    if parsed is None:
        lead.draft_status = "failed"
        lead.draft_error = "Model reply was not usable JSON with subject/body"
        return lead
    subject, body = parsed
    lead.draft_subject = subject
    lead.draft_body = body
    lead.draft_status = "ready"
    lead.draft_error = None
    lead.drafted_at = datetime.now(timezone.utc)
    return lead


def build_send_request(lead: ProspectLead, sender: str, reply_to: str | None) -> SendEmailRequest:
    """Build the Email Center payload for a reviewed lead draft."""
    if not lead.contact_email:
        raise ValidationException("This lead has no contact email - it cannot be sent.")
    if lead.draft_status == "sent":
        raise ValidationException("Draft was already sent.")
    subject = (lead.draft_subject or "").strip()
    body = (lead.draft_body or "").strip()
    if not subject or not body:
        raise ValidationException("Draft is empty - generate or write one before sending.")
    return SendEmailRequest(
        sender=sender,
        to=[lead.contact_email],
        reply_to=reply_to,
        subject=subject,
        text=body,
        idempotency_key=f"prospect-ai-{lead.id}",
    )
