"""Prospect AI drafting v2: two-stage reasoning, anti-generic lint.

The persona is a senior sales engineer who has actually read the research
report. The prompt forces the model to argue for an angle *and* against
the alternatives before it writes a word - a draft that cannot defend its
angle choice is, in practice, a template with tokens, and this module is
built to make that outcome fail a gate instead of reaching an inbox.

Determinism boundary: everything expensive to get wrong is checked in
code, not in the model. The lint rejects stock phrases, banned dash
characters (an em dash or en dash in prose is a word-processor artifact,
not email craft), over-length subjects/bodies, and drafts with no anchor
in the researched evidence. A failing lint triggers one corrective retry;
a failing retry is recorded, not silently shipped.

Product facts in ``RELIASTRA_BRIEF`` are Level-A claims only - the same
facts the public observatory states - so the model can explain the
product accurately but cannot widen scope or invent telemetry.
"""

from __future__ import annotations

import re
from typing import Any

from app.modules.prospect_ai.models import ProspectLead
from app.modules.prospect_ai.schemas import LeadEvidence

# ── Product brief (Level-A facts the model may restate) ──────────────────

RELIASTRA_BRIEF = """\
RELIASTRA - what it is, factually:
- Category: External Dependency Intelligence. Tagline: "Infrastructure you can prove."
- Thesis: your own monitoring proves YOUR app failed; it cannot tell you whether the
  fault was internal or a third-party API's. RELIASTRA creates that independent
  observation record.
- How it works: instrument the external endpoints a product depends on (Auth0,
  Cloudflare, Stripe, OpenAI, Twilio, etc.), probe on a fixed cadence, and confirm
  failures deterministically - 2 consecutive failures open an incident, 2 consecutive
  recoveries resolve it. A dropped probe is recorded as missing, never silently
  folded into "up" or "down".
- Attribution: five weighted signals sum to 1.0 and produce a verdict. >= 75 means
  vendor failure with confidence. A verdict of "unknown" is a valid, published result -
  the system would rather return unknown than guess.
- Evidence: every conclusion ships as verifiable evidence - SHA-256 checksums and an
  Ed25519 signature bound to the organization, with a public verification path.
- Honest scope: the public observatory is one observation point. RELIASTRA states
  what was observed, from where, over what window - and what it cannot conclude.
  No multi-region consensus claims.

What RELIASTRA is NOT (never claim these): blocks incidents from happening, predicts
outages, offers multi-cloud consensus, or replaces the vendor's own status page as a
source of truth about the vendor."""
AngleArchetype = dict[str, str]

ANGLE_ARCHETYPES: list[AngleArchetype] = [
    {
        "id": "peer-operator",
        "label": "Infrastructure peer",
        "use_when": "the contact is an infra/platform/SRE lead who owns uptime "
        "and vendor decisions personally - write as a technical peer, "
        "mechanism-first, zero sales framing.",
    },
    {
        "id": "operator-burden",
        "label": "Solo operator burden",
        "use_when": "the prospect is a small team or solo founder wearing the "
        "ops hat themselves - write around what one person cannot watch "
        "at 3am, concrete and brief.",
    },
    {
        "id": "multi-client-agency",
        "label": "Agency / multi-tenant operator",
        "use_when": "the company runs infrastructure for OTHER companies "
        "(agency, MSP, consultant) - their dependency failures land on "
        "many clients at once, and evidence reports protect their "
        "credibility, not just uptime.",
    },
    {
        "id": "observed-fact",
        "label": "First-touch observation",
        "use_when": "evidence is thin but a specific, factual detail from "
        "their stack or public posture is worth one short, honest note - "
        "underwrite the email with their fact, not RELIASTRA's.",
    },
]

_SENTENCE_END = re.compile(r"[.!?]")
_WORD = re.compile(r"[A-Za-z][A-Za-z0-9'-]*")
# Dashes banned in prose: em dash, en dash, horizontal bar, minus sign, and
# every lookalike the model has substituted - soft hyphen, U+2010/2011/2012,
# fullwidth hyphen. A plain ASCII hyphen-minus is legitimate craft; the rest
# are the residue of an LLM drafting into a word processor's habits. They
# survive a copy-paste into mail clients and render differently per font.
NON_ASCII_DASH_RE = re.compile(
    "["
    "\u00ad\u1806\u2010\u2011\u2012\u2013\u2014\u2015"
    "\u2212\u2e3a\u2e3b\ufe58\ufe63\uff0d"
    "]"
)

# Recency the model asserts without knowing it. The research predates the
# email, sometimes by weeks; "congrats on the launch yesterday" is a
# fabricated hook, and a prospect who launched a month ago reads it as the
# sender not doing their homework. Relative-time claims are allowed only
# when the evidence itself carries the date.
FRESHNESS_RE = re.compile(
    r"\b(yesterday|tonight|just\s+(launched|shipped|shipped out|released|announced|went\s+live|published)|"
    r"(this|last)\s+(morning|afternoon|evening|week|month)|recently\s+(launched|shipped|released)|"
    r"fresh\s+off|i\s+saw\s+you\s+launched|days\s+ago|hours\s+ago)\b",
    re.IGNORECASE,
)

STOCK_PHRASES = (
    "i hope this finds you well",
    "i hope this email finds you",
    "hope you're doing well",
    "hope you are doing well",
    "trust you are well",
    "i hope you're well",
    "wanted to reach out",
    "i'm reaching out",
    "just checking in",
    "just following up",
    "circle back",
    "touch base",
    "quick question",
    "gentle reminder",
    "as per my last email",
    "at your earliest convenience",
    "revolutionize",
    "game-changer",
    "cutting-edge",
    "state-of-the-art",
    "seamlessly",
    "seamless integration",
    "best-in-class",
    "world-class",
    "synergy",
    "skyrocket",
    "unlock the power",
    "take your",
    "elevate your",
    "let me know if you're interested",
    "i'd love to pick your brain",
    "coding",
    "sorry to bother you",
)

STOP_TOKENS = {
    "about", "above", "after", "again", "against", "because", "before", "below",
    "between", "company", "during", "found", "their", "there", "these", "those",
    "through", "under", "until", "using", "which", "while", "would", "should",
    "could", "where", "reported", "reports", "report", "product", "team",
}

_EVIDENCE_SOURCES = ("pain_signal", "outreach_hook", "evidence", "why_reliastra_is_relevant")


def evidence_tokens(lead: ProspectLead | LeadEvidence) -> set[str]:
    """Content-bearing lowercase tokens from the researched evidence."""
    out: set[str] = set()
    for attr in _EVIDENCE_SOURCES:
        value = getattr(lead, attr, None)
        if not value:
            continue
        for match in _WORD.findall(value.lower()):
            if len(match) >= 6 and match not in STOCK_PHRASES and match not in STOP_TOKENS:
                out.add(match)
    return out


# Jargon that should never appear in a first-touch cold email. The product's
# mechanism is real and explained on reply; the OPEN reads as a vendor email
# the moment these words show up. Kept to terms a founder never uses about
# their own business.
TECH_EMAIL_TERMS = re.compile(
    r"\b(endpoint|endpoints|probe|probes|probing|payload|payloads|webhook|webhooks|"
    r"cadence|consecutive|checksum|checksums|sha-256|sha256|ed25519|signature|"
    r"signatures|incident|incidents|ingest|idempotency|deterministic|verdict|verdicts)\b",
    re.IGNORECASE,
)


def lint_draft(
    subject: str, body: str, lead: ProspectLead | LeadEvidence
) -> tuple[list[str], list[str]]:
    """Deterministic quality gate.

    Returns ``(hard_issues, warnings)``. Hard issues mean the draft is
    unacceptable and (if a retry is still pending) must be regenerated;
    warnings are surfaced to the human reviewer only.
    """
    hard: list[str] = []
    warnings: list[str] = []
    text = f"{subject}\n{body}"

    for match in NON_ASCII_DASH_RE.finditer(text):
        symbol = match.group(0)
        hard.append(
            f"banned-dash:{symbol!r} - a non-ASCII dash (U+{ord(symbol):04X}) "
            "appeared in the draft. Replace it with an ASCII hyphen or rephrase."
        )

    lowered = text.lower()
    for phrase in STOCK_PHRASES:
        if phrase in lowered:
            hard.append(f"stock-phrase: \u201c{phrase}\u201d")

    # The research snapshot predates the draft, sometimes by weeks. A date
    # recency the model invented is a factual error a prospect instantly
    # notices, so it is a hard regenerate.
    for match in FRESHNESS_RE.finditer(text):
        hit = match.group(0)
        hard.append(
            f"stale-recency: \u201c{hit}\u201d - the research predates this email, "
            "possibly by weeks; do not assert recency the evidence does not state."
        )

    subject_clean = subject.strip()
    if len(subject_clean) > 45:
        hard.append(f"subject-length: {len(subject_clean)} chars (max 45).")
    subject_words = len(subject_clean.split())
    if subject_words > 6:
        hard.append(f"subject-words: {subject_words} (max 6).")
    if subject_clean.endswith(("!", "?")) or subject_clean.isupper():
        warnings.append("subject tone reads like marketing copy.")

    # The first touch sells the conversation, not the architecture. A
    # methodology term here makes the email read like a vendor doc.
    for match in TECH_EMAIL_TERMS.finditer(text):
        term = match.group(0)
        hard.append(
            f"technical-jargon: \u201c{term}\u201d - rewrite in plain words; "
            "the mechanism is explained on reply, not in the first touch."
        )

    words = body.split()
    if len(words) > 60:
        hard.append(f"body-length: {len(words)} words (max 60).")
    if len(words) < 30:
        hard.append(f"body-length: {len(words)} words - thin for 3 beats "
                    "(30-60 required).")

    paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
    if len(paragraphs) > 3:
        hard.append(f"paragraphs: {len(paragraphs)} (max 3).")

    anchors = evidence_tokens(lead)
    if anchors:
        body_lower = body.lower()
        hits = [tok for tok in anchors if tok in body_lower]
        if not hits:
            hard.append(
                "evidence-anchor: no researched detail appears in the body. "
                "Reference at least one concrete fact from the evidence."
            )

    company = (getattr(lead, "company", "") or "").strip().lower()
    if company and len(company) > 3 and company not in body.lower() and company not in subject.lower():
        warnings.append("the prospect's name does not appear in the email.")

    if body.count("reliastra") + subject.count("reliastra") > 4:
        warnings.append("too RELIASTRA-heavy; the subject is the prospect, not us.")

    if "?" not in body and not re.search(r"\b(worth|open to|interested)\b", body.lower()):
        warnings.append("no clear single-call-to-action found.")

    return hard, warnings


RETRY_INSTRUCTION = (
    "Your previous draft failed the deterministic lint. Regenerate it from "
    "the same evidence, fixing ONLY these issues:\n{issues}\n\n"
    "Rules that do not change: em dashes and en dashes are banned - use "
    "plain ASCII hyphens; no stock outreach phrases; subject under 60 "
    "characters; body 40-140 words, at most 3 paragraphs; at least one "
    "concrete detail from the evidence must appear in the body."
)


def build_prompt_v2(
    lead: ProspectLead,
    tone: str | None,
    lint_issues: list[str] | None = None,
    report_date: str | None = None,
) -> str:
    """The v2 drafting prompt: persona, brief, angle reasoning, output contract."""
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
        report_date=report_date,
    )
    evidence_json = json_dumps(evidence.model_dump())
    angles = "\n".join(
        f'- {a["id"]} ({a["label"]}): {a["use_when"]}' for a in ANGLE_ARCHETYPES
    )
    tone_line = (
        f"Tone: {tone.strip()} - but never at the cost of factual discipline."
        if tone
        else "Tone: direct, engineering-respectful, zero hype."
    )
    lint_block = ""
    if lint_issues:
        lint_block = RETRY_INSTRUCTION.format(issues="\n".join(f"- {i}" for i in lint_issues))

    age_line = (
        f"\nEvidence age: this research was collected on {report_date}. "
        "Whatever the date, it may be days or weeks before you write. Treat "
        "every item as context you already know, never as breaking news: "
        "never claim you 'saw' something 'yesterday', that something 'just "
        "launched', 'just shipped', or happened 'this week' or 'recently' "
        "unless the evidence itself says so. Timelessness is required - their "
        "issue #3906 or their README is a fact, not a headline.\n"
        ""
    ) if report_date else "\nEvidence age: the research predates your writing, possibly by weeks - same rule: never assert freshness ('yesterday', 'just launched', 'recently').\n"

    return f"""You are Emmanuel, founder of RELIASTRA, the engineer who built it and carries its pager in person. Write ONE first-touch cold email, by hand, from your own personal address to one technical human at one company. Voice: first person singular throughout - "I built", "I keep watch", "I can show you". Never "we", never a company voice, never sales-team framing. The pipeline appends your name and signature; do not sign.

Buyer knowledge - RELIASTRA, the product you sell:
{RELIASTRA_BRIEF}

Why you sell it well: you have personally carried a pager for third-party dependencies. You know the specific humiliation of "our app is down" when the truth is "Stripe's API is down for everyone and we had no way to prove it in the moment". You under-promise, show mechanism instead of adjectives, and you would rather a prospect reply "not now, this is sharp" than a vague "circle back later".

Angle selection - reason first:
{angles}

Stage 1 (this reasoning goes in your output): pick ONE angle and reject the others, saying what only you know from this evidence - not generic reasons.

Stage 2: write the email. Mechanics of a great first-touch cold email:
- Open with THEIR situation - a paraphrase of the strongest concrete evidence item (at most 1 detail; a quote-like paraphrase of their own engineering posture is more credible than any product claim).
- One plain sentence about what RELIASTRA does: it watches the outside services a product depends on and, when something stops working, says whether the fault is theirs or inside their own system. That is the whole pitch. Skip the methodology: the words endpoint, probe, payload, webhook, cadence, consecutive, checksum, signature, SHA, Ed25519, incident, ingest, deterministic, and verdict never appear in a first touch - the closing question can offer to explain the mechanism if they ask, and the reply does that.
- One low-pressure, specific call to action as a short question (e.g. "want the two-minute version of how it works?"), never "15 minutes to pick your brain".
- {tone_line}
- Hard bans: em dash (U+2014), en dash (U+2013), any long typographic dash - use ASCII hyphens only; stock phrases like "I hope this finds you well" or "wanted to reach out"; invented metrics, incidents, customers, or vendor claims; emoji; signature block (the pipeline appends one).
- subject: under 45 characters, at most 6 words, a plain statement - not clickbait, not a question mark hook, no product name.
- body: plain text, 30-60 words total, at most 2 short paragraphs and the closing question on its own line - three beats, no more: their situation, the one-sentence RELIASTRA line, the question. Short BEATS precise: if detail competes with brevity, cut the detail. Never generic - if you cannot anchor the opener in this evidence, make it shorter and sharper, not vaguer.

Output - ONLY this JSON object, nothing else:
{{"angle": "<archetype id>", "rejected_angles": [{{"angle": "<id>", "why_not": "<evidence-specific reason>"}} for the other three], "subject": "<subject>", "body": "<body>"}}

Prospect evidence (the ONLY facts you may use):
{evidence_json}
{age_line}
{lint_block}"""


def json_dumps(data: dict[str, Any]) -> str:
    import json

    return json.dumps(data, ensure_ascii=False, indent=1)


def parse_v2(text: str | None) -> dict[str, Any] | None:
    """Extract the v2 output object from a model reply.

    Tolerates fenced or surrounded JSON. ``subject``/``body`` are required;
    ``angle``/``rejected_angles`` are recorded when present but tolerated
    absent from older providers - the lint, not the shape, is the gate.
    """
    if not text or not text.strip():
        return None
    candidate = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", candidate, re.DOTALL)
    if fence:
        candidate = fence.group(1)
    else:
        brace = re.search(r"\{.*\}", candidate, re.DOTALL)
        if brace:
            candidate = brace.group(0)
    import json

    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    subject = data.get("subject")
    body = data.get("body")
    if not isinstance(subject, str) or not isinstance(body, str):
        return None
    subject = subject.strip()[:500]
    body = body.strip()
    if not subject or not body:
        return None
    angle = data.get("angle")
    rejected = data.get("rejected_angles")
    return {
        "subject": subject,
        "body": body,
        "angle": angle.strip()[:64] if isinstance(angle, str) and angle.strip() else None,
        "rejected_angles": rejected if isinstance(rejected, list) else None,
    }
