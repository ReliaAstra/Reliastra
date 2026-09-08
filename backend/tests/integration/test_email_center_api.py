"""API tests for the Admin Email Center.

Covers authorization, sender eligibility gating, validation, delivery
(success + provider failure), idempotency, audit records, templates, and
the guarantee that no response leaks the Resend API key.

Resend is stubbed at ``app.modules.email_center.resend_client`` - these
tests never touch the network.
"""

from __future__ import annotations

import base64
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.config import settings
from app.modules.email_center import resend_client
from tests.helpers import make_admin_headers, register_and_verify


def _verified_snapshot() -> resend_client.ResendDomainsSnapshot:
    import time

    return resend_client.ResendDomainsSnapshot(
        domains=[
            resend_client.ResendDomainInfo(id="d_1", name="reliastra.com", status="verified")
        ],
        fetched_at=time.time(),
    )


def _pending_snapshot() -> resend_client.ResendDomainsSnapshot:
    import time

    return resend_client.ResendDomainsSnapshot(
        domains=[
            resend_client.ResendDomainInfo(id="d_1", name="reliastra.com", status="pending")
        ],
        fetched_at=time.time(),
    )


def _stub_resend(monkeypatch, *, snapshot, send_result=None, api_key: str = "re_test-key-123"):
    async def _fake_fetch_domains(*, force_refresh: bool = False):
        return snapshot

    monkeypatch.setattr(resend_client, "fetch_domains", _fake_fetch_domains)
    monkeypatch.setattr(resend_client, "_api_key", lambda: api_key)
    if send_result is not None:
        monkeypatch.setattr(
            resend_client, "send_email", AsyncMock(return_value=send_result)
        )
    return snapshot


def _no_secret_leak(body: Any) -> None:
    text = str(body)
    assert "re_test-key-123" not in text
    assert "RESEND_API_KEY" not in text


@pytest.mark.asyncio
async def test_non_admin_cannot_access_email_center(async_client, db_session):
    # Configure the admin console first so rejections are auth (401/403),
    # not "console disabled".
    await make_admin_headers(db_session)
    user = await register_and_verify(
        async_client,
        {"email": "customer@example.com", "password": "Password123!", "full_name": "Customer"},
    )
    headers = {"Authorization": f"Bearer {user['tokens']['access_token']}"}
    for method, path in [
        ("get", "/v1/admin/email-center/status"),
        ("get", "/v1/admin/email-center/senders"),
        ("post", "/v1/admin/email-center/send"),
        ("get", "/v1/admin/email-center/messages"),
        ("get", "/v1/admin/email-center/templates"),
    ]:
        res = await getattr(async_client, method)(path, headers=headers)
        assert res.status_code in (401, 403), (method, path, res.text)

    res = await async_client.get("/v1/admin/email-center/status")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_admin_status_and_senders_verified(async_client, db_session, monkeypatch):
    headers = await make_admin_headers(db_session)
    _stub_resend(monkeypatch, snapshot=_verified_snapshot())

    res = await async_client.get("/v1/admin/email-center/status", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["connected"] is True
    assert body["sending_domain"] == "reliastra.com"
    assert body["domain_status"] == "verified"
    assert body["sender_identities_verified"] == body["sender_identities_total"] > 0
    assert body["last_checked_at"] is not None
    _no_secret_leak(body)

    res = await async_client.get("/v1/admin/email-center/senders", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    emails = [s["email"] for s in body["senders"]]
    assert "finance@reliastra.com" in emails
    assert "support@reliastra.com" in emails
    for sender in body["senders"]:
        assert sender["verified"] is True
        assert sender["status"] == "verified"
        assert sender["domain"] == "reliastra.com"
    _no_secret_leak(body)


@pytest.mark.asyncio
async def test_senders_not_verified_when_domain_pending(async_client, db_session, monkeypatch):
    headers = await make_admin_headers(db_session)
    _stub_resend(monkeypatch, snapshot=_pending_snapshot())

    res = await async_client.get("/v1/admin/email-center/senders", headers=headers)
    assert res.status_code == 200, res.text
    for sender in res.json()["senders"]:
        assert sender["verified"] is False
        assert sender["status"] == "not_verified"


@pytest.mark.asyncio
async def test_add_sender_rejected_when_domain_unverified(async_client, db_session, monkeypatch):
    headers = await make_admin_headers(db_session)
    _stub_resend(monkeypatch, snapshot=_pending_snapshot())

    res = await async_client.post(
        "/v1/admin/email-center/senders",
        headers=headers,
        json={"email": "newalias@reliastra.com", "name": "New Alias"},
    )
    assert res.status_code == 422, res.text
    assert "Resend" in res.json()["error"]["message"]


@pytest.mark.asyncio
async def test_add_sender_rejects_foreign_domain(async_client, db_session, monkeypatch):
    headers = await make_admin_headers(db_session)
    _stub_resend(monkeypatch, snapshot=_verified_snapshot())

    res = await async_client.post(
        "/v1/admin/email-center/senders",
        headers=headers,
        json={"email": "someone@gmail.com", "name": "Someone"},
    )
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_send_rejected_for_unverified_sender(async_client, db_session, monkeypatch):
    headers = await make_admin_headers(db_session)
    _stub_resend(monkeypatch, snapshot=_pending_snapshot())

    res = await async_client.post(
        "/v1/admin/email-center/send",
        headers=headers,
        json={
            "sender": "finance@reliastra.com",
            "to": ["customer@example.com"],
            "subject": "Hello",
            "text": "body",
        },
    )
    assert res.status_code == 422, res.text
    assert "Resend" in res.json()["error"]["message"]


@pytest.mark.asyncio
async def test_send_rejects_invalid_recipient(async_client, db_session, monkeypatch):
    headers = await make_admin_headers(db_session)
    _stub_resend(monkeypatch, snapshot=_verified_snapshot())

    res = await async_client.post(
        "/v1/admin/email-center/send",
        headers=headers,
        json={
            "sender": "finance@reliastra.com",
            "to": ["not-an-email"],
            "subject": "Hello",
            "text": "body",
        },
    )
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_send_success_creates_audit_record(async_client, db_session, monkeypatch):
    headers = await make_admin_headers(db_session)
    _stub_resend(
        monkeypatch,
        snapshot=_verified_snapshot(),
        send_result=resend_client.ResendSendResult(ok=True, resend_id="re_abc123", status_code=200),
    )

    res = await async_client.post(
        "/v1/admin/email-center/send",
        headers=headers,
        json={
            "sender": "finance@reliastra.com",
            "to": ["Customer@Example.com", "second@example.com"],
            "cc": ["copy@example.com"],
            "reply_to": "support@reliastra.com",
            "subject": "Your invoice",
            "text": "plain body",
            "html": "<p>html body</p><script>alert(1)</script>",
            "attachments": [
                {
                    "filename": "note.txt",
                    "content_base64": base64.b64encode(b"hello").decode(),
                    "content_type": "text/plain",
                }
            ],
            "idempotency_key": "test-key-success-1",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "sent"
    assert body["provider_message_id"] == "re_abc123"
    _no_secret_leak(body)

    # The provider received the display-name From and sanitized HTML.
    sent_kwargs = resend_client.send_email.await_args.kwargs
    assert sent_kwargs["sender"] == "Reliastra Finance <finance@reliastra.com>"
    assert "alert(1)" not in (sent_kwargs["html"] or "")
    assert sent_kwargs["to"] == ["Customer@example.com", "second@example.com"]
    assert sent_kwargs["attachments"][0]["filename"] == "note.txt"

    # Audit record persisted with provider id.
    res = await async_client.get("/v1/admin/email-center/messages", headers=headers)
    assert res.status_code == 200, res.text
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["provider_message_id"] == "re_abc123"
    assert items[0]["status"] == "sent"
    assert items[0]["recipients"]["cc"] == ["copy@example.com"]

    res = await async_client.get(
        f"/v1/admin/email-center/messages/{items[0]['id']}", headers=headers
    )
    assert res.status_code == 200, res.text
    detail = res.json()
    assert detail["sender"] == "finance@reliastra.com"
    assert detail["attachments_meta"][0]["filename"] == "note.txt"
    assert detail["failure_reason"] is None
    _no_secret_leak(detail)


@pytest.mark.asyncio
async def test_send_idempotent_replay(async_client, db_session, monkeypatch):
    headers = await make_admin_headers(db_session)
    _stub_resend(
        monkeypatch,
        snapshot=_verified_snapshot(),
        send_result=resend_client.ResendSendResult(ok=True, resend_id="re_dup1", status_code=200),
    )
    payload = {
        "sender": "support@reliastra.com",
        "to": ["customer@example.com"],
        "subject": "Hello",
        "text": "body",
        "idempotency_key": "test-key-dup-1",
    }
    first = await async_client.post("/v1/admin/email-center/send", headers=headers, json=payload)
    second = await async_client.post("/v1/admin/email-center/send", headers=headers, json=payload)
    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert resend_client.send_email.await_count == 1

    res = await async_client.get("/v1/admin/email-center/messages", headers=headers)
    assert res.json()["total"] == 1


@pytest.mark.asyncio
async def test_send_provider_failure_recorded_with_friendly_error(
    async_client, db_session, monkeypatch
):
    headers = await make_admin_headers(db_session)
    _stub_resend(
        monkeypatch,
        snapshot=_verified_snapshot(),
        send_result=resend_client.ResendSendResult(
            ok=False, status_code=422, error_code="invalid_sender",
            technical_detail="HTTP 422: ...",
        ),
    )
    res = await async_client.post(
        "/v1/admin/email-center/send",
        headers=headers,
        json={
            "sender": "finance@reliastra.com",
            "to": ["customer@example.com"],
            "subject": "Hello",
            "text": "body",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "failed"
    assert body["provider_message_id"] is None
    assert "Resend" in body["message"]
    assert "traceback" not in body["message"].lower()

    res = await async_client.get(
        f"/v1/admin/email-center/messages/{body['id']}", headers=headers
    )
    assert res.json()["failure_code"] == "invalid_sender"
    _no_secret_leak(res.json())


@pytest.mark.asyncio
async def test_templates_crud_and_kora_seed(async_client, db_session, monkeypatch):
    headers = await make_admin_headers(db_session)
    _stub_resend(monkeypatch, snapshot=_verified_snapshot())

    res = await async_client.get("/v1/admin/email-center/templates", headers=headers)
    assert res.status_code == 200, res.text
    templates = res.json()
    kora = next(t for t in templates if "Kora" in t["name"])
    assert kora["subject"] == "Request for USD Virtual Account and International Payment Collection"
    assert "admin_name" in kora["variables"]
    assert "USD virtual bank account" in kora["text_body"]
    assert kora["is_system"] is True

    # Render with variables.
    res = await async_client.post(
        "/v1/admin/email-center/templates/render",
        headers=headers,
        json={"template_id": kora["id"], "variables": {"admin_name": "Ada"}},
    )
    assert res.status_code == 200, res.text
    rendered = res.json()
    assert "Ada" in rendered["text_body"]
    assert "{{admin_name}}" not in rendered["text_body"]
    assert rendered["missing_variables"] == []

    # Create / duplicate / delete.
    res = await async_client.post(
        "/v1/admin/email-center/templates",
        headers=headers,
        json={
            "name": "Custom Template",
            "subject": "Hi {{name}}",
            "text_body": "Hello {{name}}",
            "html_body": "<p>Hello {{name}}</p><script>evil()</script>",
        },
    )
    assert res.status_code == 201, res.text
    created = res.json()
    assert created["variables"] == ["name"]
    assert "evil()" not in created["html_body"]

    res = await async_client.post(
        f"/v1/admin/email-center/templates/{created['id']}/duplicate", headers=headers
    )
    assert res.status_code == 201, res.text
    assert "(copy)" in res.json()["name"]

    res = await async_client.delete(
        f"/v1/admin/email-center/templates/{created['id']}", headers=headers
    )
    assert res.status_code == 204, res.text


@pytest.mark.asyncio
async def test_test_send_marks_record(async_client, db_session, monkeypatch):
    headers = await make_admin_headers(db_session)
    _stub_resend(
        monkeypatch,
        snapshot=_verified_snapshot(),
        send_result=resend_client.ResendSendResult(ok=True, resend_id="re_test1", status_code=200),
    )
    res = await async_client.post(
        "/v1/admin/email-center/test",
        headers=headers,
        json={"sender": "hello@reliastra.com", "to": "qa@example.com"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "sent"

    res = await async_client.get("/v1/admin/email-center/messages", headers=headers)
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["is_test"] is True
    assert items[0]["subject"].startswith("[Test]")
