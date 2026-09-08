"""Strict allowlist HTML sanitizer for admin-composed email bodies.

No third-party dependency: implemented on ``html.parser`` so the Email
Center adds zero new packages. Anything not on the allowlist is dropped
(tags are unwrapped, attributes are stripped).

Rules:

* ``script``, ``style``, ``iframe``, ``object``, ``embed``, ``form``,
  ``link``, ``meta``, ``base`` and friends are removed *with their content*.
* Event-handler attributes (``on*``), ``srcset`` and ``formaction`` are
  always stripped.
* ``href``/``src`` accept only ``http``, ``https``, ``mailto`` and ``cid``.
* ``style`` attributes are kept but scrubbed of ``expression()``,
  ``javascript:``/``vbscript:``/``data:text/html`` payloads and CSS imports.
"""

from __future__ import annotations

import html
import re
from html.parser import HTMLParser

ALLOWED_TAGS = frozenset(
    {
        "a", "abbr", "b", "blockquote", "br", "caption", "code", "col",
        "colgroup", "div", "em", "figcaption", "figure", "h1", "h2", "h3",
        "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre",
        "small", "span", "strong", "sub", "sup", "table", "tbody", "td",
        "tfoot", "th", "thead", "tr", "u", "ul",
    }
)

#: Tags whose *content* is dangerous and must be dropped entirely.
DROP_WITH_CONTENT = frozenset(
    {
        "script", "style", "iframe", "object", "embed", "applet", "form",
        "input", "button", "select", "textarea", "link", "meta", "base",
        "noscript", "template", "frame", "frameset", "canvas", "audio",
        "video", "source", "track",
    }
)

ALLOWED_ATTRS = frozenset(
    {
        "href", "src", "alt", "title", "width", "height", "align",
        "valign", "colspan", "rowspan", "cellpadding", "cellspacing",
        "border", "style", "class", "id", "target", "rel",
    }
)

VOID_TAGS = frozenset({"br", "hr", "img", "col"})

_SAFE_URL_RE = re.compile(r"^(?:https?|mailto|cid):", re.IGNORECASE)
_UNSAFE_STYLE_RE = re.compile(
    r"(expression\s*\(|javascript\s*:|vbscript\s*:|data\s*:\s*text/html|@import|behavior\s*:|"
    r"-moz-binding|url\s*\(\s*['\"]?\s*javascript\s*:)",
    re.IGNORECASE,
)


def _clean_url(value: str) -> str | None:
    cleaned = value.strip().replace("\x00", "")
    # Block encoded/obfuscated javascript: URLs.
    collapsed = re.sub(r"[\s\x00-\x1f]+", "", html.unescape(cleaned)).lower()
    if collapsed.startswith(("javascript:", "vbscript:", "data:text/html")):
        return None
    if _SAFE_URL_RE.match(cleaned):
        return cleaned
    # Relative anchors (#...) are harmless; bare relative URLs are dropped.
    if cleaned.startswith("#"):
        return cleaned
    return None


def _clean_style(value: str) -> str | None:
    cleaned = value.strip().replace("\x00", "")
    if not cleaned or len(cleaned) > 4000:
        return None
    if _UNSAFE_STYLE_RE.search(html.unescape(cleaned)):
        return None
    return cleaned


class _Sanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self._out: list[str] = []
        self._drop_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in DROP_WITH_CONTENT:
            self._drop_depth += 1
            return
        if self._drop_depth:
            return
        if tag not in ALLOWED_TAGS:
            return
        safe_attrs: list[str] = []
        for raw_name, raw_value in attrs:
            name = (raw_name or "").lower().strip()
            if not name or name.startswith("on") or name not in ALLOWED_ATTRS:
                continue
            value = raw_value or ""
            if name in {"href", "src"}:
                cleaned = _clean_url(value)
                if cleaned is None:
                    continue
                value = cleaned
            elif name == "style":
                cleaned = _clean_style(value)
                if cleaned is None:
                    continue
                value = cleaned
            elif name == "target" and value.lower() not in {"_blank", "_self", "_top"}:
                continue
            safe_attrs.append(f' {name}="{html.escape(value, quote=True)}"')
        if tag == "a" and not any(a.startswith(" href=") for a in safe_attrs):
            # Anchor without a safe destination becomes plain text.
            return
        if tag in VOID_TAGS:
            self._out.append(f"<{tag}{''.join(safe_attrs)}>")
        else:
            self._out.append(f"<{tag}{''.join(safe_attrs)}>")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in DROP_WITH_CONTENT:
            self._drop_depth = max(0, self._drop_depth - 1)
            return
        if self._drop_depth:
            return
        if tag in ALLOWED_TAGS and tag not in VOID_TAGS:
            self._out.append(f"</{tag}>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_data(self, data: str) -> None:
        if self._drop_depth:
            return
        self._out.append(html.escape(data, quote=False))

    def handle_entityref(self, name: str) -> None:
        if self._drop_depth:
            return
        self._out.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if self._drop_depth:
            return
        self._out.append(f"&#{name};")

    def handle_comment(self, data: str) -> None:
        # Comments are dropped (they can hide conditional-IE payloads).
        return None

    def get_html(self) -> str:
        return "".join(self._out)


def sanitize_html(value: str | None) -> str:
    """Return the allowlisted HTML for ``value`` (``""`` when empty)."""
    if not value:
        return ""
    parser = _Sanitizer()
    try:
        parser.feed(value)
        parser.close()
    except Exception:
        # On malformed input, fall back to escaped text - never raw HTML.
        return html.escape(value, quote=False)
    return parser.get_html()


def html_to_text_preview(value: str | None, limit: int = 500) -> str:
    """Best-effort plain-text excerpt of an HTML body for log previews."""
    if not value:
        return ""
    text = re.sub(r"(?is)<(br|p|div|tr|li|h[1-6])[^>]*>", "\n", value)
    text = re.sub(r"(?s)<[^>]*>", "", text)
    text = html.unescape(text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text if len(text) <= limit else text[:limit] + "…"
