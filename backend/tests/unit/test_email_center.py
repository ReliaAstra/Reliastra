"""Unit tests for the Admin Email Center.

Pure-function coverage (no DB): HTML sanitization, template variable
rendering/extraction, Resend error classification + friendly copy, and
attachment validation. API-level tests live in
``tests/integration/test_email_center_api.py``.
"""

from __future__ import annotations

import base64

import pytest

from app.core.exceptions import ValidationException
from app.modules.email_center import resend_client
from app.modules.email_center.sanitize import sanitize_html
from app.modules.email_center.schemas import AttachmentInput
from app.modules.email_center.service import (
    _validate_attachments,
    extract_variables,
    normalize_email,
    normalize_email_list,
    render_variables,
)


# ── Email validation ──────────────────────────────────────────────────────


def test_normalize_email_accepts_valid():
    # email_validator lowercases the domain; the local part keeps its case.
    assert normalize_email("  Finance@Reliastra.COM ") == "Finance@reliastra.com"


def test_normalize_email_rejects_invalid():
    for bad in ["", "not-an-email", "a@b", "@x.com", "a@@b.com", "x" * 400 + "@a.com"]:
        with pytest.raises(ValidationException):
            normalize_email(bad)


def test_normalize_email_list_dedupes_case_insensitively():
    result = normalize_email_list(["A@x.com", "a@X.com", "b@x.com"], field="To")
    assert result == ["A@x.com", "b@x.com"]


def test_normalize_email_list_reports_field():
    with pytest.raises(ValidationException, match="CC"):
        normalize_email_list(["bad-address"], field="CC")


# ── Template variables ────────────────────────────────────────────────────


def test_extract_variables_in_order_unique():
    subject = "Hello {{customer_name}} ({{customer_name}})"
    body = "Invoice {{invoice_id}} for {{company_name}}."
    assert extract_variables(subject, body) == ["customer_name", "invoice_id", "company_name"]


def test_extract_variables_ignores_invalid_placeholders():
    assert extract_variables("{{9bad}} {{no-close {{also bad}} {{ok_name}}") == ["ok_name"]


def test_render_variables_plain_text():
    assert (
        render_variables("Hi {{name}}, {{missing}}!", {"name": "Ada"}, escape_html=False)
        == "Hi Ada, {{missing}}!"
    )


def test_render_variables_html_escapes_values():
    rendered = render_variables(
        "<p>{{name}}</p>", {"name": "<img src=x onerror=alert(1)>"}, escape_html=True
    )
    assert "<img" not in rendered
    assert "&lt;img" in rendered


def test_render_variables_no_code_execution():
    # Anything that is not {{identifier}} is left untouched - there is no
    # expression evaluation, attribute access, or filter pipeline.
    evil = "{{ 7*7 }} {{ name|upper }} {{ [].__class__ }} ${name} <%= name %>"
    assert render_variables(evil, {"name": "x"}, escape_html=False) == evil


# ── HTML sanitization ─────────────────────────────────────────────────────


def test_sanitize_keeps_safe_markup():
    raw = '<p>Hello <strong>world</strong> <a href="https://x.com">link</a></p>'
    assert sanitize_html(raw) == raw


def test_sanitize_strips_scripts_with_content():
    raw = '<p>hi</p><script>alert(document.cookie)</script><p>bye</p>'
    assert sanitize_html(raw) == "<p>hi</p><p>bye</p>"


def test_sanitize_strips_event_handlers_and_iframes():
    raw = '<p onload="evil()" onclick="evil()">x</p><iframe src="https://evil.com"></iframe>'
    assert sanitize_html(raw) == "<p>x</p>"


def test_sanitize_blocks_javascript_urls():
    raw = '<a href="javascript:alert(1)">click</a><a href="  JaVaScRiPt:alert(1)">x</a>'
    out = sanitize_html(raw)
    assert "javascript" not in out.lower()
    assert "<a" not in out  # unsafe anchors degrade to text


def test_sanitize_allows_mailto_and_cid():
    raw = '<a href="mailto:a@b.com">m</a><img src="cid:logo">'
    assert sanitize_html(raw) == raw


def test_sanitize_scrubs_dangerous_style_but_keeps_safe():
    safe = '<p style="color:#333;line-height:1.6">x</p>'
    assert sanitize_html(safe) == safe
    evil = '<p style="color:expression(alert(1))">x</p>'
    assert "expression" not in sanitize_html(evil)


def test_sanitize_escapes_bare_text():
    assert sanitize_html("a < b & c") == "a &lt; b &amp; c"


def test_sanitize_empty_and_none():
    assert sanitize_html("") == ""
    assert sanitize_html(None) == ""


# ── Resend error classification ───────────────────────────────────────────


@pytest.mark.parametrize(
    ("status", "body", "expected"),
    [
        (401, "invalid api key", "auth_failed"),
        (403, "forbidden", "auth_failed"),
        (429, "rate limit exceeded", "rate_limited"),
        (422, '{"message":"The `from` domain is not verified"}', "domain_not_verified"),
        (422, '{"message":"Invalid `from` address"}', "invalid_sender"),
        (422, '{"message":"Invalid `to` field"}', "invalid_recipient"),
        (422, '{"message":"something else"}', "validation_error"),
        (500, "oops", "provider_unavailable"),
        (503, "oops", "provider_unavailable"),
        (400, "bad request", "provider_error"),
    ],
)
def test_classify_send_error(status, body, expected):
    assert resend_client._classify_send_error(status, body) == expected


def test_friendly_errors_are_human_readable_and_credential_free():
    for code in [
        "missing_api_key", "auth_failed", "domain_not_verified", "invalid_sender",
        "invalid_recipient", "validation_error", "rate_limited", "timeout",
        "network_error", "provider_unavailable", "provider_error", "unknown_code",
    ]:
        message = resend_client.friendly_error(code)
        assert isinstance(message, str) and len(message) > 20
        lowered = message.lower()
        assert "re_" not in lowered and "traceback" not in lowered
    # The sender-rejection copy must guide the admin to Resend verification.
    assert "verify" in resend_client.friendly_error("invalid_sender").lower()
    assert "resend" in resend_client.friendly_error("invalid_sender").lower()


# ── Attachments ───────────────────────────────────────────────────────────


def test_validate_attachments_ok():
    payload = AttachmentInput(
        filename="invoice.pdf",
        content_base64=base64.b64encode(b"%PDF-data").decode(),
        content_type="application/pdf",
    )
    payloads, meta = _validate_attachments([payload])
    assert payloads[0]["filename"] == "invoice.pdf"
    assert payloads[0]["content"] == list(b"%PDF-data")
    assert meta[0] == {"filename": "invoice.pdf", "size_bytes": 9, "content_type": "application/pdf"}


def test_validate_attachments_rejects_bad_base64():
    with pytest.raises(ValidationException, match="base64"):
        _validate_attachments([AttachmentInput(filename="a.bin", content_base64="!!!not-base64!!!")])


def test_validate_attachments_rejects_oversize_file():
    big = base64.b64encode(b"x" * (8_000_000 + 1)).decode()
    with pytest.raises(ValidationException, match="8 MB"):
        _validate_attachments([AttachmentInput(filename="big.bin", content_base64=big)])


def test_validate_attachments_rejects_oversize_total():
    one_mb = base64.b64encode(b"x" * 1_000_000).decode()
    items = [AttachmentInput(filename=f"f{i}.bin", content_base64=one_mb) for i in range(21)]
    with pytest.raises(ValidationException, match="20 MB"):
        _validate_attachments(items)
