"""app.infrastructure.email_layout — backward-compatibility alias.

Canonical home: ``app.platform.integrations.email_layout``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.integrations.email_layout import (  # noqa: F401
    Any,
    BRAND,
    BRAND_TAGLINE,
    FOOTER_MARKER,
    FOOTER_SEPARATOR,
    SUPPORT_EMAIL,
    TRANSACTIONAL_SUPPORT_FOOTER,
    annotations,
    content_html,
    ensure_footer_html,
    ensure_footer_text,
    ensure_transactional_footer,
    escape,
    footer_html,
    footer_text,
    frontend_url,
    html,
    public_origin,
    re,
    render_email,
    render_html,
    render_text,
    settings,
    site_url,
    _BODY_WIDTH_PX,
    _CLOSE_BODY,
    _FULL_DOCUMENT,
    _STYLE,
    _standalone,
)

__all__ = [
    "Any",
    "BRAND",
    "BRAND_TAGLINE",
    "FOOTER_MARKER",
    "FOOTER_SEPARATOR",
    "SUPPORT_EMAIL",
    "TRANSACTIONAL_SUPPORT_FOOTER",
    "annotations",
    "content_html",
    "ensure_footer_html",
    "ensure_footer_text",
    "ensure_transactional_footer",
    "escape",
    "footer_html",
    "footer_text",
    "frontend_url",
    "html",
    "public_origin",
    "re",
    "render_email",
    "render_html",
    "render_text",
    "settings",
    "site_url",

]
