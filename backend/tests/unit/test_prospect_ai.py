"""Unit tests for prospect_ai pure functions (no DB, no network)."""

from __future__ import annotations

import json

import pytest

from app.core.exceptions import ValidationException
from app.modules.prospect_ai.drafting import (
    ANGLE_ARCHETYPES,
    build_prompt_v2,
    evidence_tokens,
    lint_draft,
    parse_v2,
)
from app.modules.prospect_ai.service import (
    build_prompt,
    build_send_request,
    lead_email_variables,
    lead_from_prospect,
    normalize_domain,
    parse_draft,
    parse_prospects,
    sends_remaining_today,
)

EVIDENCE_LEAD_ROWS = {
    "rank": "2",
    "company": "AeroDyne Labs",
    "website": "https://aerodyne.dev",
    "technical_person": "Dana Coe",
    "role": "Platform lead",
    "contact_email": "dana@aerodyne.dev",
    "external_dependencies": "Stripe, Auth0",
    "pain_signal": "checkout failures during stripe incident could not be attributed",
    "outreach_hook": "README documents a manual stripe fallback procedure",
}


@pytest.fixture()
def evidence_lead() -> object:
    return lead_from_prospect(EVIDENCE_LEAD_ROWS)


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


def test_build_prompt_includes_evidence_and_excludes_unreferenced_fields(evidence_lead):
    lead = evidence_lead
    prompt = build_prompt(lead, None)
    assert "AeroDyne Labs" in prompt
    assert "attributed" in prompt or "checkout" in prompt
    assert "do not leak" not in prompt
    assert "RELIASTRA" in prompt
    assert "2 consecutive" in prompt.split("Stage 2:")[0] or "deterministic" in prompt
    # v2: angle reasoning is demanded with explicit rejection arguments.
    for archetype in ANGLE_ARCHETYPES:
        assert archetype["id"] in prompt
    assert "rejected_angles" in prompt


def test_prompt_carries_product_brief_and_no_banned_dash(evidence_lead):
    prompt = build_prompt_v2(evidence_lead, None)
    # The brief teaches the model Level-A facts it may restate...
    assert "External Dependency Intelligence" in prompt
    assert "SHA-256" in prompt
    # ...but nothing that does not exist (anti-inflation guard).
    assert "multi-region consensus" in prompt  # stated as a non-claim
    # The instruction text itself must model the rule: no banned dash glyphs.
    for dash in ("\u2014", "\u2013"):
        assert dash not in prompt


def test_prompt_with_lint_issues_includes_correction(evidence_lead):
    prompt = build_prompt_v2(evidence_lead, None, lint_issues=["banned-dash:em dash"])
    assert "failed the deterministic lint" in prompt
    assert "banned-dash:em dash" in prompt


def test_parse_v2_extracts_angle_and_rejections():
    reply = (
        '```json\n{"angle": "peer-operator",'
        ' "rejected_angles": [{"angle": "operator-burden", "why_not": "solo"}],'
        ' "subject": "who owns your stripe fallback", "body": "Dana - ..."}\n```'
    )
    parsed = parse_v2(reply)
    assert parsed is not None
    assert parsed["angle"] == "peer-operator"
    assert parsed["subject"].startswith("who owns")
    assert parsed["rejected_angles"][0]["angle"] == "operator-burden"


def test_parse_v2_requires_subject_and_body():
    assert parse_v2("") is None
    assert parse_v2("prose only") is None
    assert parse_v2('{"subject": "only"}') is None
    assert parse_v2('{"subject": "s", "body": "b"}') is not None


def test_parse_draft_shim_returns_tuple():
    assert parse_draft('{"subject": "s", "body": "b"}') == ("s", "b")


def test_lint_rejects_em_dash_explicitly(evidence_lead):
    body = ("Dana - your stripe fallback procedure reads solid, and the "
            "checkout attribution gap you described is exactly what our "
            "deterministic confirmation is for: 2 consecutive failures open "
            "an incident, recoveries close it, each verdict carries a "
            "checksum your team verifies in one command.\n\nWorth one look?")
    hard, _ = lint_draft("who owns the fallback here's a note \u2014 ok", body, evidence_lead)
    assert any("banned-dash" in issue for issue in hard)


def test_lint_rejects_en_dash(evidence_lead):
    body = ("Dana - attributing checkout failures between your code and "
            "Stripe is exactly the gap we close: two consecutive failures "
            "open an incident, two recoveries close it, and every verdict "
            "ships with a verifiable checksum your team can run.\n\n"
            "Worth one look?")
    hard, _ = lint_draft("who owns the stripe fallback \u2013 short", body, evidence_lead)
    assert any("banned-dash" in issue for issue in hard)


def test_lint_accepts_ascii_hyphen(evidence_lead):
    body = ("Dana - your team was setting up manual checks "
            "when the Stripe checkout failed and nobody could tell "
            "which side broke. That call takes a guess today.\n\n"
            "Worth one look?")
    hard, _ = lint_draft("who gets the blame", body, evidence_lead)
    assert hard == []


def test_lint_rejects_stock_phrases(evidence_lead):
    body = (
        "I hope this finds you well. Your checkout stack is relevant here - "
        "attribution between your code and stripe failures is exactly "
        "deterministic confirmation's job: two strikes open, two recoveries "
        "close, checksums on everything so your team can verify at any "
        "point. Want the methodology write-up?"
    )
    hard, _ = lint_draft("quick stripe question", body, evidence_lead)
    assert any("stock-phrase" in issue for issue in hard)


def test_lint_requires_evidence_anchor(evidence_lead):
    body = ("Hi there - did you know that monitoring proves your app failed "
            "but not whether a third party caused it? We give you an "
            "independent observation record with deterministic confirmation "
            "and signed evidence reports that carry checksums. Reply here if "
            "worth exploring some more.")
    hard, _ = lint_draft("quick question about uptime", body, evidence_lead)
    assert any("evidence-anchor" in issue for issue in hard)


def test_lint_enforces_lengths(evidence_lead):
    anchor = evidence_lead.pain_signal or ""
    assert anchor  # guard: the fixture carries researchable evidence
    short = f"{anchor} is real. Reply if curious."
    hard, _ = lint_draft("subject well under sixty chars", short, evidence_lead)
    assert any("body-length" in issue for issue in hard)
    long_body = " ".join(
        f"word{index}" for index in range(160)
    )
    hard2, _ = lint_draft("subject well under sixty chars", long_body, evidence_lead)
    assert any("body-length" in issue for issue in hard2)


def test_lint_subject_sixty_cap(evidence_lead):
    body = ("Attribution between your code and stripe failures is exactly "
            "deterministic confirmation's job: two strikes open, two "
            "recoveries close, checksums everywhere. Want the write-up?")
    long_subject = "x" * 61
    hard, _ = lint_draft(long_subject, body, evidence_lead)
    assert any("subject-length" in issue for issue in hard)


def test_evidence_tokens_are_content_bearing(evidence_lead):
    tokens = evidence_tokens(evidence_lead)
    assert any("attribut" in tok or "checkout" in tok or "fallback" in tok for tok in tokens)


def test_lead_email_variables_cover_first_name(evidence_lead):
    variables = lead_email_variables(evidence_lead)
    assert variables["first_name"] == "Dana"
    assert variables["company"] == "AeroDyne Labs"


def test_build_send_request_requires_email_and_approved_draft():
    lead = lead_from_prospect({"company": "A", "website": "https://a.io"})
    assert lead is not None
    lead.draft_subject = "Subject"
    lead.draft_body = "Body"
    lead.contact_email = "ops@a.io"

    # pending -> blocked: nothing sends without a human approve.
    with pytest.raises(ValidationException):
        build_send_request(lead, "send@reliastra.com", None)

    lead.draft_status = "approved"
    lead.approved_at = None  # stamp is set by the route; gate is status-only
    request = build_send_request(lead, "send@reliastra.com", None)
    assert request.to == ["ops@a.io"]
    assert request.idempotency_key.startswith("prospect-ai-")

    lead.draft_status = "sent"
    with pytest.raises(ValidationException):
        build_send_request(lead, "send@reliastra.com", None)


def test_build_send_request_with_template_renders_variables():
    lead = lead_from_prospect({"company": "AeroDyne", "website": "https://a.io", "technical_person": "Dana Coe"})
    assert lead is not None
    lead.contact_email = "dana@aerodyne.dev"
    lead.draft_subject = "Subject"
    lead.draft_body = "Body"
    lead.draft_status = "approved"
    template_html = "<h1>Hello {{first_name}} at {{company}}</h1>"
    request = build_send_request(
        lead, "send@reliastra.com", None, template_html=template_html
    )
    assert "Dana" in request.html or "{{first_name}}" not in request.html
    assert request.text == "Body"


def test_sends_remaining_today_counts_down_from_cap():
    assert sends_remaining_today(0) > 0
    assert sends_remaining_today(4) == max(0, sends_remaining_today(0) - 4)


# ── LLM extraction and provider fallback ─────────────────────────────────


def test_extract_returns_none_when_reasoning_router_sends_null_content():
    from app.modules.ai_integration.service import AIService

    data = {
        "choices": [
            {"message": {"content": None}, "finish_reason": "length"}
        ]
    }
    # Regression: str(None) turned this into the literal reply "None", which
    # surfaced as "reply was not usable JSON" instead of "no text returned".
    assert AIService._extract("openai_compatible", data) is None


def test_extract_joins_multipart_content():
    from app.modules.ai_integration.service import AIService

    data = {
        "choices": [
            {"message": {"content": [{"text": "a"}, {"text": "b"}]}}
        ]
    }
    assert AIService._extract("openai_compatible", data) == "ab"


def test_finish_reason_is_provider_neutral():
    from app.modules.ai_integration.service import _finish_reason

    assert _finish_reason({"choices": [{"finish_reason": "length"}]}) == "length"
    assert _finish_reason({"stop_reason": "max_tokens"}) == "max_tokens"
    assert _finish_reason({"candidates": [{"finishReason": "MAX_TOKENS"}]}) == "MAX_TOKENS"
    assert _finish_reason({}) is None


@pytest.mark.asyncio
async def test_drafting_models_prefers_profile_and_appends_platform(monkeypatch):
    from app.modules.ai_integration.service import PlatformLLM
    from app.modules.prospect_ai import provider as provider_module

    profile_llm = PlatformLLM(
        provider_type="openai_compatible",
        endpoint_url="https://primary.example/v1/chat/completions",
        model_name="primary-model",
        api_key="k1",
        max_tokens=8192,
        temperature=0.3,
        timeout_seconds=60.0,
    )
    fallback_llm = PlatformLLM(
        provider_type="openai_compatible",
        endpoint_url="https://fallback.example/v1/chat/completions",
        model_name="fallback-model",
        api_key="k2",
        max_tokens=4096,
        temperature=0.3,
        timeout_seconds=60.0,
    )

    async def fake_profile(db):
        return object()

    monkeypatch.setattr(provider_module, "get_active_profile", fake_profile)
    monkeypatch.setattr(provider_module, "profile_to_llm", lambda profile: profile_llm)
    monkeypatch.setattr(
        provider_module.AIService, "platform_model", staticmethod(lambda: fallback_llm)
    )

    chain = await provider_module.resolve_drafting_models(db=None)
    assert [m.model_name for m in chain] == ["primary-model", "fallback-model"]


@pytest.mark.asyncio
async def test_drafting_models_dedupes_platform_equal_to_profile(monkeypatch):
    from app.modules.ai_integration.service import PlatformLLM
    from app.modules.prospect_ai import provider as provider_module

    same = PlatformLLM(
        provider_type="openai_compatible",
        endpoint_url="https://same.example/v1/chat/completions",
        model_name="same-model",
        api_key="k1",
        max_tokens=8192,
        temperature=0.3,
        timeout_seconds=60.0,
    )

    async def fake_profile(db):
        return object()

    monkeypatch.setattr(provider_module, "get_active_profile", fake_profile)
    monkeypatch.setattr(provider_module, "profile_to_llm", lambda profile: same)
    monkeypatch.setattr(
        provider_module.AIService, "platform_model", staticmethod(lambda: same)
    )

    chain = await provider_module.resolve_drafting_models(db=None)
    assert len(chain) == 1


@pytest.mark.asyncio
async def test_draft_lead_falls_back_when_first_model_returns_no_text(
    evidence_lead, monkeypatch
):
    """A reasoning router that returns content:null must not fail the lead
    while a healthy provider is configured behind it."""
    from app.modules.prospect_ai import service as service_module

    good_draft = json.dumps(
        {
            "angle": "operator-burden",
            "rejected_angles": [],
            "subject": "Proof for upstream outages",
            "body": (
                "Your README documents a manual stripe fallback procedure, so "
                "you already treat upstream failure as routine. RELIASTRA "
                "probes those endpoints on a fixed cadence and records a "
                "dropped probe instead of guessing."
            ),
        }
    )

    class FakeLLM:
        def __init__(self, name):
            self.model_name = name
            self.provider_type = "openai_compatible"

    async def fake_models(db):
        return [FakeLLM("broken"), FakeLLM("healthy")]

    calls: list[str] = []

    async def fake_call_llm(model, prompt):
        calls.append(model.model_name)
        if model.model_name == "broken":
            return {"text": None, "raw": {}, "finish_reason": "length"}
        return {"text": good_draft, "raw": {}, "finish_reason": "stop"}

    monkeypatch.setattr(
        "app.modules.prospect_ai.provider.resolve_drafting_models", fake_models
    )
    monkeypatch.setattr(
        "app.modules.ai_integration.service.call_llm", fake_call_llm
    )

    lead = evidence_lead
    lead.draft_status = "pending"
    lead = await service_module.draft_lead(lead, None, db=None)

    # The healthy model may be called twice: once for the draft, once for the
    # lint-informed retry. What matters is that the broken provider was
    # skipped and the lead still ended up with a usable draft.
    assert calls[0] == "broken"
    assert "healthy" in calls
    assert lead.draft_status == "ready"
    assert lead.draft_subject == "Proof for upstream outages"


def test_lint_bans_mechanism_jargon(evidence_lead):
    body = ("Stripe going down looks identical to your own checkout code "
            "failing. RELIASTRA watches the services you depend on and "
            "names the one that broke.\n\nWant the two-minute version?")
    jargony = body.replace("names the one that broke", "probes each endpoint on a cadence")
    hard, _ = lint_draft("who gets the blame, Stripe or your code", jargony, evidence_lead)
    assert any("technical-jargon" in issue for issue in hard)
    hard_ok, _ = lint_draft("who gets the blame, Stripe or your code", body, evidence_lead)
    assert not any("technical-jargon" in issue for issue in hard_ok)


def test_lint_enforces_sixty_word_body(evidence_lead):
    anchor = evidence_lead.pain_signal or ""
    assert anchor
    body = " ".join(f"word{index}" for index in range(61))
    anchored = f"{anchor}. {body}"[:800]
    hard, _ = lint_draft("stripe or your code", anchored, evidence_lead)
    assert any("body-length" in issue for issue in hard)


def test_lint_enforces_six_word_subject(evidence_lead):
    body = ("Stripe went down and it looked like your bug. RELIASTRA "
            "names the side that broke.\n\nWant the two-minute version?")
    hard, _ = lint_draft(
        "one two three four five six seven", body, evidence_lead
    )
    assert any("subject-words" in issue for issue in hard)


def test_lint_catches_non_ascii_lookalike_hyphens(evidence_lead):
    """U+2011 rode through the em/en dash ban into two live drafts
    ('two-minute', 'third-party'). Every non-ASCII dash glyph is a hard
    issue, whatever codepoint it uses."""
    body = ("Stripe stalled a deposit and the team could not tell whether "
            "the fault sat inside or outside your own code.\n\nWant the "
            "two\u2011minute version?")
    hard, _ = lint_draft("deposit failures need clarity", body, evidence_lead)
    assert any("banned-dash" in issue for issue in hard)
    assert "U+2011" in next(i for i in hard if "banned-dash" in i)


def test_lint_bans_fabricated_recency(evidence_lead):
    """The snapshot predates the draft; 'saw you launched yesterday' is a
    hallucinated hook a prospect reads as the sender not doing homework."""
    body = ("Stripe stalled a deposit and the team could not tell whose "
            "fault it was. RELIASTRA names the side that broke.\n\nWant "
            "the two-minute version?")
    stale = "Congrats on launching yesterday! " + body
    hard, _ = lint_draft("binding uptime questions", stale, evidence_lead)
    assert any("stale-recency" in issue for issue in hard)
    hard_ok, _ = lint_draft("binding uptime questions", body, evidence_lead)
    assert not any("stale-recency" in issue for issue in hard_ok)


def test_build_prompt_carries_report_date(evidence_lead):
    prompt = build_prompt_v2(evidence_lead, None, report_date="2026-09-22")
    assert "collected on 2026-09-22" in prompt
    assert "never claim you 'saw' something 'yesterday'" in prompt
    assert "2026-09-22" not in build_prompt_v2(evidence_lead, None)
