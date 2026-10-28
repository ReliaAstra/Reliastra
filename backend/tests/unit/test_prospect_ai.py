"""Unit tests for prospect_ai pure functions (no DB, no network)."""

from __future__ import annotations

import json

import pytest

from app.core.exceptions import ValidationException
from app.modules.prospect_ai.service import (
    build_prompt,
    build_send_request,
    lead_from_prospect,
    normalize_domain,
    parse_draft,
    parse_prospects,
)


def test_normalize_domain_handles_urls_and_bare_hosts():
    assert normalize_domain("https://www.autovinreveal.com/pricing") == "autovinreveal.com"
    assert normalize_domain("HTTP://Example.COM/") == "example.com"
    assert normalize_domain("example.co.uk") == "example.co.uk"
    assert normalize_domain("") is None
    assert normalize_domain(None) is None
    assert normalize_domain("not a domain") is None


def test_parse_prospects_accepts_bare_array():
    prospects, meta = parse_prospects(json.dumps([{"company": "A"}, {"company": "B"}]))
    assert len(prospects) == 2
    assert meta == {}


def test_parse_prospects_accepts_daily_report_shape():
    report = {
        "report": "RELIASTRA Daily Prospect Report",
        "report_date": "2026-09-22",
        "prospects": [{"company": "A"}],
        "summary": {"intro": "45 qualified prospects"},
    }
    prospects, meta = parse_prospects(json.dumps(report))
    assert len(prospects) == 1
    assert meta["report_date"] == "2026-09-22"
    assert meta["summary"]["intro"].startswith("45 qualified")


def test_parse_prospects_rejects_garbage():
    with pytest.raises(ValidationException):
        parse_prospects("not json at all")
    with pytest.raises(ValidationException):
        parse_prospects(json.dumps({"no_prospects_key": True}))
    with pytest.raises(ValidationException):
        parse_prospects(json.dumps([]))


def test_lead_from_prospect_maps_evidence_fields():
    lead = lead_from_prospect(
        {
            "rank": "1",
            "company": "AutoVinReveal",
            "website": "https://www.autovinreveal.com",
            "technical_person": "Oyeniyi Oyetunji",
            "role": "Solo founder / operator",
            "contact_email": "support@autovinreveal.com",
            "pain_signal": 'README verbatim: "provider-switching and fallback logic"',
            "external_dependencies": "Stripe, Supabase",
            "verdict": "HIGH" + "x" * 300,
        }
    )
    assert lead is not None
    assert lead.domain == "autovinreveal.com"
    assert lead.rank == 1
    assert lead.contact_name == "Oyeniyi Oyetunji"
    assert lead.pain_signal and "provider-switching" in lead.pain_signal
    assert lead.verdict and len(lead.verdict) <= 255


def test_lead_from_prospect_requires_company_or_domain():
    assert lead_from_prospect({"note": "no identity at all"}) is None


def test_lead_from_prospect_drops_invalid_email():
    lead = lead_from_prospect({"company": "A", "contact_email": "definitely-not-an-email"})
    assert lead is not None
    assert lead.contact_email is None


def test_parse_draft_extracts_fenced_json():
    reply = "Here is the draft:\n```json\n{\"subject\": \"s\", \"body\": \"b\"}\n```\nDone."
    assert parse_draft(reply) == ("s", "b")


def test_parse_draft_extracts_embedded_json():
    reply = 'noise before {"subject": "s", "body": "b"} noise after'
    assert parse_draft(reply) == ("s", "b")


def test_parse_draft_rejects_unusable_replies():
    assert parse_draft("") is None
    assert parse_draft("plain prose, no json") is None
    assert parse_draft('{"subject": "s"}') is None  # missing body


def test_build_prompt_includes_evidence_and_excludes_unreferenced_fields():
    lead = lead_from_prospect(
        {
            "company": "Acme",
            "website": "https://acme.io",
            "pain_signal": "vendors switch silently",
            "secret_internal_note": "do not leak",
        }
    )
    assert lead is not None
    prompt = build_prompt(lead, None)
    assert "Acme" in prompt
    assert "vendors switch silently" in prompt
    assert "do not leak" not in prompt
    assert "Do not invent" in prompt


def test_build_send_request_requires_email_and_unsent_draft():
    lead = lead_from_prospect({"company": "A", "website": "https://a.io"})
    assert lead is not None
    lead.draft_subject = "Subject"
    lead.draft_body = "Body"
    with pytest.raises(ValidationException):
        build_send_request(lead, "send@reliastra.com", None)

    lead.contact_email = "ops@a.io"
    request = build_send_request(lead, "send@reliastra.com", None)
    assert request.to == ["ops@a.io"]
    assert request.idempotency_key.startswith("prospect-ai-")

    lead.draft_status = "sent"
    with pytest.raises(ValidationException):
        build_send_request(lead, "send@reliastra.com", None)
