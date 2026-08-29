"""Centralized layout + canonical footer for RELIASTRA transactional email.

Every automated email RELIASTRA sends to a user (welcome, verification,
password reset, one-time codes, subscription/payment/renewal notices, trial
and evaluation notices, billing notices, account/security notices and system
notifications) is rendered through this module.

Why this exists
---------------
Before this module every template re-declared its own ``<style>`` block, its
own header, and its own one-line footer. That made the support-and-appreciation
message impossible to keep consistent: adding it meant pasting a paragraph
into N templates, and each new template silently started without it.

Contract
--------
* ONE canonical support footer paragraph (:data:`TRANSACTIONAL_SUPPORT_FOOTER`).
* It renders in the email's *footer region* — visually separated from the
  message body by a rule and a tinted band — never inside ``.body``, so it can
  never sit under (or dilute) security-critical instructions such as
  "we will never ask for your password" or a link/code expiry note.
* It appears **exactly once** per email, in both the HTML and the plain-text
  part. :func:`ensure_footer_html` / :func:`ensure_footer_text` are idempotent
  (they key off :data:`FOOTER_MARKER`) so a template can never double-append it.
* No emojis, no slang, no marketing voice. Restrained, warm, professional.
* Text colours meet WCAG 2.1 AA on their backgrounds (verified: smallest
  pairing used is ``#6e6f78`` on ``#f9f9f9`` = 4.74:1).

Visual identity
---------------
The shell keeps the palette the existing templates already use (ink-navy
header, white card, ``#4361ee`` action button, tinted footer band) so this is
a consolidation of the design, not a redesign.
"""

from __future__ import annotations

import html
import re
from typing import Any

from app.config import settings

# ── Canonical copy ──────────────────────────────────────────────────────────

#: The single source of truth for the transactional support footer. Do not
#: restate this paragraph in a template — import it.
TRANSACTIONAL_SUPPORT_FOOTER = (
    "We truly value your trust and continued support. Should you experience any "
    "issues, require clarification, or need assistance with your account, please "
    "do not hesitate to reply directly to this email. Our support team is "
    "committed to ensuring a seamless experience and will respond promptly to "
    "your inquiry."
)

BRAND = "Reliastra"
BRAND_TAGLINE = "Reliastra — External Dependency Intelligence"
SUPPORT_EMAIL = "support@reliastra.com"

#: Sentinel that marks the canonical footer region. Used to guarantee the
#: footer appears exactly once per email.
FOOTER_MARKER = "reliastra-email-footer"

#: Plain-text separator for the footer region (ASCII only: safe in every mail
#: client and in text/plain forwarding).
FOOTER_SEPARATOR = "-" * 46

_BODY_WIDTH_PX = 480

_STYLE = f"""
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }}
    .container {{ max-width: {_BODY_WIDTH_PX}px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }}
    .header {{ background: #1a1a2e; color: #ffffff; padding: 24px; text-align: center; }}
    .header h1 {{ margin: 0; font-size: 22px; font-weight: 600; }}
    .body {{ padding: 32px; }}
    .body p {{ color: #333333; line-height: 1.6; margin: 0 0 16px; }}
    .body p:last-child {{ margin-bottom: 0; }}
    .body ul, .body ol {{ color: #333333; line-height: 1.6; margin: 0 0 16px; padding-left: 18px; }}
    .body li {{ margin: 6px 0; }}
    .body a {{ color: #2a3f9e; }}
    .note {{ font-size: 13px; color: #55565e; line-height: 1.6; }}
    .panel {{ background: #f6f8ff; border: 1px solid #e3e9ff; border-radius: 8px; padding: 16px 20px; margin: 0 0 16px; }}
    .button {{ display: inline-block; background: #4361ee; color: #ffffff !important; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; margin: 16px 0; }}
    .code {{ display: inline-block; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 32px; font-weight: 700; letter-spacing: 10px; color: #1a1a2e; background: #f1f3f9; border-radius: 10px; padding: 16px 24px; margin: 8px 0 16px; }}
    .center {{ text-align: center; }}
    .footer {{ padding: 22px 32px 26px; background: #f9f9f9; border-top: 1px solid #e8e8ef; text-align: center; }}
    .footer-brand {{ margin: 0 0 12px; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: #4a4b55; }}
    .footer-support {{ margin: 0 0 14px; font-size: 13px; line-height: 1.65; color: #55565e; }}
    .footer-note {{ margin: 0 0 14px; font-size: 12px; line-height: 1.6; color: #55565e; }}
    .footer-meta {{ margin: 0; font-size: 12px; line-height: 1.7; color: #6e6f78; }}
    .footer-meta a {{ color: #3b4a86; text-decoration: underline; }}
    .footer-rule {{ height: 1px; background: #e8e8ef; border: 0; margin: 0 0 18px; }}
"""


# ── Small helpers ───────────────────────────────────────────────────────────


def escape(value: Any) -> str:
    """HTML-escape interpolated user data (names, org names, vendor names).

    Transactional templates interpolate account data into HTML. Doing it raw
    lets a signup like ``<img onerror=…>`` inject markup into an email we send
    to a paying customer's inbox.
    """
    if value is None:
        return ""
    return html.escape(str(value), quote=True)


def public_origin() -> str:
    return (settings.RELIASTRA_PUBLIC_URL or "https://reliastra.com").rstrip("/")


def site_url(path: str = "") -> str:
    return f"{public_origin()}/{path.lstrip('/')}" if path else public_origin()


def frontend_url(path: str = "") -> str:
    """Frontend origin for action links (verification, reset, dashboard)."""
    base = settings.FRONTEND_BASE_URL or public_origin()
    base = base.rstrip("/")
    return f"{base}/{path.lstrip('/')}" if path else base


# ── Footer rendering (HTML) ─────────────────────────────────────────────────


def footer_html(
    *,
    note_html: str = "",
    unsubscribe_html: str = "",
    show_brand: bool = True,
) -> str:
    """Render the canonical footer region.

    ``note_html`` / ``unsubscribe_html`` are *additive* legal or preference
    lines (kept below the support paragraph so the support message stays the
    prominent part of the footer). Never put message content here — content
    belongs in :func:`content_html`.
    """
    parts = [
        f'<div class="footer" id="{FOOTER_MARKER}" role="contentinfo">'
    ]
    if show_brand:
        parts.append(f'<p class="footer-brand">{escape(BRAND_TAGLINE)}</p>')
    parts.append(
        '<p class="footer-support">' + escape(TRANSACTIONAL_SUPPORT_FOOTER) + "</p>"
    )
    if note_html:
        parts.append(f'<p class="footer-note">{note_html}</p>')
    site_host = public_origin().split("://", 1)[-1]
    meta = (
        f'<a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>'
        f'&nbsp;&middot;&nbsp;<a href="{site_url()}">{escape(site_host)}</a>'
    )
    if unsubscribe_html:
        meta += f"<br>{unsubscribe_html}"
    parts.append(f'<p class="footer-meta">{meta}</p>')
    parts.append("</div>")
    return "".join(parts)


def footer_text(*, note: str = "", unsubscribe: str = "", show_brand: bool = True) -> str:
    """Plain-text equivalent of :func:`footer_html`.

    The support paragraph is emitted unwrapped so the canonical sentence is
    byte-identical in the text and HTML parts (and greppable in tests).
    """
    lines = [FOOTER_SEPARATOR]
    if show_brand:
        lines.append(BRAND_TAGLINE)
    lines.append(TRANSACTIONAL_SUPPORT_FOOTER)
    if note:
        lines.append(note)
    meta = f"{SUPPORT_EMAIL} · {public_origin()}"
    if unsubscribe:
        meta += f"\n{unsubscribe}"
    lines.append(meta)
    return "\n\n".join(lines)


# ── Full-message rendering ──────────────────────────────────────────────────


def content_html(*, panel: str = "", paragraphs: list[str] | None = None) -> str:
    """Compose the message body from HTML fragments (still caller's content)."""
    chunks: list[str] = []
    if panel:
        chunks.append(f'<div class="panel">{panel}</div>')
    for paragraph in paragraphs or []:
        chunks.append(paragraph)
    return "".join(chunks)


def render_html(
    *,
    heading: str,
    body_html: str,
    footer_note_html: str = "",
    unsubscribe_html: str = "",
    preheader: str = "",
) -> str:
    """Wrap an HTML body fragment in the RELIASTRA transactional shell."""
    pre = (
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0">'
        f"{escape(preheader)}</div>" if preheader else ""
    )
    footer = footer_html(
        note_html=footer_note_html, unsubscribe_html=unsubscribe_html
    )
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escape(heading)}</title>
  <style>{_STYLE}</style>
</head>
<body>
  {pre}<div class="container">
    <div class="header">
      <h1>{escape(heading)}</h1>
    </div>
    <div class="body">
      {body_html}
    </div>
    {footer}
  </div>
</body>
</html>""".strip()


def render_text(*, body_text: str, footer_note: str = "", unsubscribe: str = "") -> str:
    """Plain-text counterpart of :func:`render_html`."""
    footer = footer_text(note=footer_note, unsubscribe=unsubscribe)
    return f"{body_text.strip()}\n\n{footer}".strip()


def render_email(
    *,
    heading: str,
    body_html: str,
    body_text: str,
    footer_note_html: str = "",
    footer_note_text: str = "",
    unsubscribe_html: str = "",
    unsubscribe_text: str = "",
    preheader: str = "",
) -> tuple[str, str]:
    """Render ``(plain_text, html_body)`` — the signature every template uses."""
    return (
        render_text(
            body_text=body_text,
            footer_note=footer_note_text,
            unsubscribe=unsubscribe_text,
        ),
        render_html(
            heading=heading,
            body_html=body_html,
            footer_note_html=footer_note_html,
            unsubscribe_html=unsubscribe_html,
            preheader=preheader,
        ),
    )


# ── Idempotent footer injection ─────────────────────────────────────────────
#
# Used for messages whose body is authored elsewhere (admin one-to-one email,
# a channel that already built its own document). They still get the footer,
# and they can never get it twice.

_FULL_DOCUMENT = re.compile(r"<\s*(?:!doctype\s+html|html[\s>])", re.IGNORECASE)
_CLOSE_BODY = re.compile(r"</\s*body\s*>", re.IGNORECASE)


def ensure_footer_text(body: str, *, note: str = "") -> str:
    """Append the plain-text footer unless it is already present."""
    if TRANSACTIONAL_SUPPORT_FOOTER in body:
        return body
    return f"{body.strip()}\n\n{footer_text(note=note)}" if body.strip() else footer_text(note=note)


def ensure_footer_html(html_body: str, *, note_html: str = "") -> str:
    """Guarantee *html_body* carries exactly one canonical footer region.

    * Already rendered by this module (marker present) → returned untouched.
    * A complete document authored elsewhere → footer injected before
      ``</body>`` (with the shared stylesheet) instead of being nested.
    * A fragment → wrapped in the shared shell with an empty heading-less
      header omitted (see :func:`_wrap_fragment`).
    """
    if FOOTER_MARKER in html_body or TRANSACTIONAL_SUPPORT_FOOTER in html_body:
        return html_body
    footer = footer_html(note_html=note_html)
    document = html_body.strip()
    if _FULL_DOCUMENT.search(document):
        # Inject our footer band + stylesheet into the foreign document so it
        # still looks like RELIASTRA and still contains the marker exactly once.
        if "</style>" in document:
            merged = document.replace("</style>", _STYLE + "</style>", 1)
        elif "<head>" in document:
            merged = document.replace(
                "<head>", f"<head><style>{_STYLE}</style>", 1
            )
        else:
            merged = _standalone(document, footer)
            return merged
        if _CLOSE_BODY.search(merged):
            merged = _CLOSE_BODY.sub(f"{footer}</body>", merged, count=1)
        else:
            merged = merged + footer
        return merged
    # A fragment (or empty): the footer is a sibling of `.body`, not content.
    return _standalone(document, footer)


def _standalone(body_inner_html: str, footer_region_html: str = "") -> str:
    """Minimal standalone document: content band + separated footer band."""
    body = f'<div class="body">\n      {body_inner_html}\n    </div>' if body_inner_html else ""
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>{_STYLE}</style>
</head>
<body>
  <div class="container">
    {body}
    {footer_region_html}
  </div>
</body>
</html>""".strip()


def ensure_transactional_footer(
    *, body_text: str, html_body: str | None = None
) -> tuple[str, str]:
    """Normalize a hand-authored message so both parts carry one footer.

    Used by paths whose body is written by a person (admin one-to-one email)
    rather than by a template: the canonical support-and-appreciation footer is
    appended once to the plain text, and either appended to a supplied HTML
    document or generated from the plain text when the author sent text only.
    Existing content, wording and markup are otherwise preserved.
    """
    text = ensure_footer_text(body_text or "")
    if html_body and html_body.strip():
        return text, ensure_footer_html(html_body)
    paragraphs = [p for p in re.split(r"\n\s*\n", (body_text or "").strip()) if p.strip()]
    inner = "".join(
        f"<p>{escape(p.strip()).replace(chr(10), '<br>')}</p>" for p in paragraphs
    )
    return text, ensure_footer_html(inner)
