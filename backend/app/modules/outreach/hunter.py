"""Deterministic hunter: kill-first rules, extraction, drafting.

No LLM in V1. Everything here is regex/keyword based and unit-tested.
An LLM pass can be layered later ONLY for survivors of the kill rules.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# ── Kill signals ──────────────────────────────────────────────────────────

WHALE_MARKERS = (
    "fortune 500",
    "digital transformation",
    "global presence",
    "offices in",
    "our offices",
    "enterprise solutions",
    "publicly traded",
    "ftse ",
    "nasdaq",
)

FREELANCER_MARKERS = (
    "i'm a freelance",
    "i am a freelance",
    "about me",
    "hire me",
    "one-man",
    "one man studio",
    "solo designer",
    "solo developer",
)

# Language proving the agency already sells what RELIASTRA protects.
RETAINER_MARKERS = (
    "care plan",
    "care-plan",
    "maintenance plan",
    "support retainer",
    "monthly maintenance",
    "ongoing support",
    "ongoing maintenance",
    "managed website",
    "managed hosting",
    "website maintenance",
    "maintenance package",
    "support package",
    "hosting & updates",
    "updates monthly",
)

SIZE_RE = re.compile(r"(\d{2,4})\s*\+?\s*(people|employees|team members|staff|professionals)", re.IGNORECASE)
TEAM_OF_RE = re.compile(r"team of (\d{1,4})", re.IGNORECASE)
HOST_RE = re.compile(r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$")
LINKEDIN_SIZE_RE = re.compile(r"(\d+)\s*-\s*(\d+)\s*employees", re.IGNORECASE)
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
MAILTO_RE = re.compile(r"mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})", re.IGNORECASE)
PRICE_RE = re.compile(r"([$£€])\s?(\d{2,4})\s?(?:/|per\s+)?\s?(?:mo|month|/mo)", re.IGNORECASE)
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
OG_SITE_RE = re.compile(
    r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)', re.IGNORECASE
)

# Never auto-contact these.
ROLE_PREFIX_BLOCKLIST = frozenset(
    {"noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "postmaster"}
)

# Hosts that are never agency candidates (social, giants, file/image hosts).
HOST_BLOCKLIST = frozenset(
    {
        "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
        "youtube.com", "youtu.be", "tiktok.com", "pinterest.com", "dribbble.com",
        "behance.net", "github.com", "wordpress.org", "wordpress.com",
        "shopify.com", "webflow.com", "wix.com", "squarespace.com", "hubspot.com",
        "clutch.co", "designrush.com", "goodfirms.co", "trustpilot.com",
        "google.com", "yelp.com", "amazon.com", "duckduckgo.com",
    }
)

# Killer queries, rotated one per day (free DDG html ground, tiny volume).
DISCOVERY_QUERIES = (
    '"website care plans" web design agency',
    'site:.co.uk "website care plans"',
    '"website maintenance plans" pricing wordpress agency',
    '"support retainer" shopify agency maintenance',
    'site:.ie "website care plans"',
    'site:.com.au "website care plans"',
    'site:.co.nz "website maintenance" agency',
)


@dataclass
class HunterVerdict:
    keep: bool
    kill_reason: str | None = None
    size_band: str | None = None
    retainer_signals: list[str] = field(default_factory=list)


def normalize_domain(url_or_domain: str) -> str:
    raw = (url_or_domain or "").strip().lower()
    if not raw:
        return ""
    if "://" not in raw:
        raw = "https://" + raw
    try:
        host = urlparse(raw).hostname or ""
    except Exception:
        return ""
    if host.startswith("www."):
        host = host[4:]
    host = host.strip().lower()
    if not HOST_RE.match(host):
        return ""
    return host


def strip_tags(html: str) -> str:
    text = re.sub(r"<script.*?</script>", " ", html or "", flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def judge(text: str) -> HunterVerdict:
    """Kill-first: whales and freelancers die here, before any model call."""
    lowered = (text or "").lower()

    for marker in WHALE_MARKERS:
        if marker in lowered:
            return HunterVerdict(keep=False, kill_reason=f"whale:{marker}")

    size_band: str | None = None
    sizes: list[int] = []
    for match in SIZE_RE.finditer(text or ""):
        try:
            sizes.append(int(match.group(1)))
        except ValueError:
            continue
    for match in TEAM_OF_RE.finditer(text or ""):
        try:
            sizes.append(int(match.group(1)))
        except ValueError:
            continue
    for match in LINKEDIN_SIZE_RE.finditer(text or ""):
        try:
            sizes.append(int(match.group(2)))
        except ValueError:
            continue
    if sizes:
        biggest = max(sizes)
        if biggest > 100:
            return HunterVerdict(
                keep=False, kill_reason=f"size:{biggest}>100", size_band=f"~{biggest}"
            )
        size_band = "51-100" if biggest > 50 else "5-50" if biggest >= 5 else "<5"

    retainer_signals = sorted({m for m in RETAINER_MARKERS if m in lowered})
    if not retainer_signals:
        for marker in FREELANCER_MARKERS:
            if marker in lowered:
                return HunterVerdict(
                    keep=False, kill_reason=f"freelancer:{marker}", size_band=size_band
                )
        return HunterVerdict(
            keep=False, kill_reason="no-retainer-language", size_band=size_band
        )
    return HunterVerdict(keep=True, size_band=size_band, retainer_signals=retainer_signals)


def extract_emails(html: str, domain: str) -> list[str]:
    """Public addresses only. Never invent; never return role-blocklisted ones."""
    found: list[str] = []
    seen: set[str] = set()
    candidates = MAILTO_RE.findall(html or "") + EMAIL_RE.findall(strip_tags(html or ""))
    for raw in candidates:
        email = raw.strip().lower()
        local, _, host = email.partition("@")
        if not host or local in ROLE_PREFIX_BLOCKLIST:
            continue
        if email.endswith((".png", ".jpg", ".gif", ".webp", ".svg")):
            continue
        if email not in seen:
            seen.add(email)
            found.append(email)
    # Prefer same-team addresses (any host), then same-domain ones first.
    found.sort(key=lambda e: (e.partition("@")[2] != domain, e))
    return found[:5]


def extract_agency_name(html: str) -> str | None:
    og = OG_SITE_RE.search(html or "")
    if og:
        return og.group(1).strip()[:255]
    title = TITLE_RE.search(html or "")
    if title:
        name = re.sub(r"\s+", " ", title.group(1)).strip()
        # "ALT Agency | Web Design Birmingham" -> "ALT Agency"
        name = re.split(r"\s*[|\-–—]\s*", name)[0].strip()
        return name[:255] or None
    return None


def extract_care_plan_tiers(text: str) -> str | None:
    hits = [f"{m.group(1)}{m.group(2)}/mo" for m in PRICE_RE.finditer(text or "")]
    if not hits:
        return None
    return ", ".join(dict.fromkeys(hits)[:6])


def extract_social(html: str) -> tuple[str | None, str | None]:
    linkedin: str | None = None
    x_url: str | None = None
    for match in re.finditer(r'href=["\'](https?://[^"\']+)["\']', html or "", re.IGNORECASE):
        url = match.group(1)
        low = url.lower()
        if "linkedin.com/company/" in low and linkedin is None:
            linkedin = url.split("?")[0][:1024]
        elif ("x.com/" in low or "twitter.com/" in low) and x_url is None and "/intent/" not in low and "/share" not in low:
            x_url = url.split("?")[0][:1024]
    return linkedin, x_url


def build_draft(agency_name: str | None, tiers: str | None, signals: list[str]) -> tuple[str, str, str]:
    name = agency_name or "there"
    plan_bit = f" ({tiers})" if tiers else ""
    subject = f"Your care plans{plan_bit} + proving uptime to clients"
    signal = signals[0] if signals else "ongoing support"
    body = (
        f"Hi {name} team,\n\n"
        f"Saw you sell {signal} on monthly plans — so when a client site breaks "
        "because Stripe/Cloudflare/hosting blips, your team gets the blame first.\n\n"
        "Reliastra watches client sites' third-party dependencies and produces "
        "timestamped evidence showing whether an outage was the vendor or your code — "
        "built for small agencies defending retainers, not enterprise NOCs.\n\n"
        "Worth a 15-min look? I can run a free check against one client site.\n\n"
        "— Reliastra\n"
        "P.S. Happy to start with a single site; no platform change needed."
    )
    angle = f"care-plan '{signal}'" + (f" tiers {tiers}" if tiers else "")
    return subject, body, angle


# ── Discovery (free grounds, no API keys) ─────────────────────────────

DDG_HTML_URL = "https://html.duckduckgo.com/html/"
UDDG_RE = re.compile(r"uddg=([^&\"']+)", re.IGNORECASE)
HREF_RE = re.compile(r'href=["\'](https?://[^"\']+)["\']', re.IGNORECASE)


def extract_ddg_results(html: str) -> list[str]:
    """Unwrap DuckDuckGo html-ground redirect links into destination URLs."""
    from urllib.parse import unquote

    out: list[str] = []
    seen: set[str] = set()
    for match in UDDG_RE.finditer(html or ""):
        try:
            url = unquote(match.group(1))
        except Exception as exc:
            logger.debug("Skipping undecodable DDG link: %s", exc)
            continue
        if not url.lower().startswith(("http://", "https://")):
            continue
        domain = normalize_domain(url)
        if not domain or domain in HOST_BLOCKLIST or domain in seen:
            continue
        seen.add(domain)
        out.append(url[:1024])
    return out


def extract_outbound_candidates(html: str, own_host: str) -> list[str]:
    """External links from a directory/listing page that could be agencies."""
    out: list[str] = []
    seen: set[str] = set()
    own = (own_host or "").lower()
    if own.startswith("www."):
        own = own[4:]
    for match in HREF_RE.finditer(html or ""):
        url = match.group(1).split("#")[0]
        domain = normalize_domain(url)
        if not domain or domain in seen:
            continue
        if domain == own or domain in HOST_BLOCKLIST:
            continue
        if domain.endswith(tuple("." + b for b in HOST_BLOCKLIST)):
            continue
        seen.add(domain)
        out.append(url[:1024])
    return out


def discovery_query_for_today(override: str | None = None) -> str:
    """One killer query per day (rotation keeps free-ground volume tiny)."""
    from datetime import datetime, timezone

    queries = [q.strip() for q in (override or "").split("\n") if q.strip()]
    pool = queries or list(DISCOVERY_QUERIES)
    return pool[datetime.now(timezone.utc).date().toordinal() % len(pool)]
