"""Integration tests for the email-only support desk.

These pin the loop that replaced the live conversation surface:

* a customer's message from the console (or the public form) is stored on a
  ``feedback_tickets`` row, the team is *emailed*, and the writer gets a
  receipt-by-email that states what happens next;
* an admin answer is emailed to the requester - the reply endpoint reports the
  delivery fact, not just that a row was written;
* internal notes stay internal;
* the admin console can ask "anything new since X?" and get a truthful,
  cheap answer, which is what raises the Chrome notification;
* the live conversation endpoints are gone, not merely hidden.

Outbound mail is captured by the autouse ``otp_test_harness`` fixture in
``conftest`` (nothing touches a socket), so assertions are made on what was
actually handed to the mail client.
"""

import uuid

import pytest
from sqlalchemy import select

from app.config import settings
from app.modules.admin.models import FeedbackTicket
from tests.helpers import make_admin_headers, register_and_verify


async def _register(async_client, email: str, full_name: str):
    body = await register_and_verify(
        async_client,
        {
            "email": email,
            "password": "SecurePassword123!",
            "full_name": full_name,
            "org_name": f"{full_name} Org",
        },
    )
    return {
        "headers": {"Authorization": f"Bearer {body['tokens']['access_token']}"},
        "user_id": body["user"]["id"],
    }


def _emails_to(sent: list[dict], recipient: str) -> list[dict]:
    return [m for m in sent if m["to_email"] == recipient]


# ── Console intake ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_console_support_email_alerts_the_team_and_confirms_receipt(
    async_client, db_session, otp_test_harness, monkeypatch
):
    """One message in ⇒ ticket row + admin alert email + receipt email."""
    monkeypatch.setattr(settings, "SUPPORT_NOTIFICATION_EMAILS", "ops@example.com")
    user = await _register(async_client, "writer@example.com", "Wri Ter")
    otp_test_harness.clear()

    res = await async_client.post(
        "/v1/support/requests",
        json={
            "subject": "Monitor says up, vendor says down",
            "message": "The OpenAI record shows Responding while their status page reports an outage.",
            "category": "monitoring",
        },
        headers=user["headers"],
    )
    assert res.status_code == 201, res.text
    receipt = res.json()
    assert receipt["ticket_number"].startswith("FB-")
    assert receipt["category"] == "monitoring"
    assert receipt["confirmation_sent_to"] == "writer@example.com"
    assert receipt["admin_notified"] is True
    assert receipt["support_email"] == settings.SUPPORT_EMAIL

    # The request is on a real queue row the admin inbox reads.
    row = (
        await db_session.execute(
            select(FeedbackTicket).where(
                FeedbackTicket.ticket_number == receipt["ticket_number"]
            )
        )
    ).scalar_one()
    assert row.source == "console_email"
    assert row.user_id == uuid.UUID(user["user_id"])

    # The team was alerted, with the deep link to answer from.
    alerts = _emails_to(otp_test_harness, "ops@example.com")
    assert len(alerts) == 1, otp_test_harness
    assert receipt["ticket_number"] in alerts[0]["subject"]
    assert f"/admin/support/{row.id}" in alerts[0]["body"]
    assert alerts[0]["reply_to"] == settings.SUPPORT_EMAIL

    # The writer was told, in writing, what happens next.
    confirmations = _emails_to(otp_test_harness, "writer@example.com")
    assert len(confirmations) == 1, otp_test_harness
    assert receipt["ticket_number"] in confirmations[0]["body"]


@pytest.mark.asyncio
async def test_console_support_email_validates_input(async_client):
    user = await _register(async_client, "short@example.com", "Short Note")

    res = await async_client.post(
        "/v1/support/requests",
        json={"subject": "Hi", "message": "too short"},
        headers=user["headers"],
    )
    assert res.status_code == 422, res.text

    res = await async_client.post(
        "/v1/support/requests",
        json={
            "subject": "A real subject",
            "message": "A message that is long enough to be a real request.",
            "category": "not-a-category",
        },
        headers=user["headers"],
    )
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_console_support_email_requires_a_session(async_client):
    """Anonymous callers use the public form; the console path is authenticated."""
    res = await async_client.post(
        "/v1/support/requests",
        json={
            "subject": "No session",
            "message": "This request carries no credentials at all.",
        },
    )
    assert res.status_code in (401, 403), res.text


@pytest.mark.asyncio
async def test_public_form_still_alerts_the_team(async_client, otp_test_harness):
    """The marketing-site form reaches the same queue *and* the same alert."""
    otp_test_harness.clear()
    res = await async_client.post(
        "/v1/support/tickets",
        json={
            "name": "Ada Visitor",
            "email": "ada.visitor@example.com",
            "subject": "Pre-sales question",
            "message": "Do you monitor gRPC endpoints as well as HTTP?",
        },
    )
    assert res.status_code == 201, res.text
    alerts = _emails_to(otp_test_harness, settings.SUPPORT_EMAIL)
    assert len(alerts) == 1, otp_test_harness
    assert res.json()["ticket_number"] in alerts[0]["subject"]


# ── Admin reply ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_admin_reply_is_emailed_to_the_requester(
    async_client, db_session, otp_test_harness
):
    user = await _register(async_client, "answered@example.com", "An Swered")
    ticket_number = (
        await async_client.post(
            "/v1/support/requests",
            json={
                "subject": "Evidence report missing an incident",
                "message": "The February report does not include the 14:00 outage.",
            },
            headers=user["headers"],
        )
    ).json()["ticket_number"]
    row = (
        await db_session.execute(
            select(FeedbackTicket).where(
                FeedbackTicket.ticket_number == ticket_number
            )
        )
    ).scalar_one()

    admin_headers = await make_admin_headers(db_session)
    otp_test_harness.clear()

    res = await async_client.post(
        f"/v1/admin/support/tickets/{row.id}/reply",
        json={
            "body": "The 14:00 outage was below the evidence threshold; the record states why.",
            "is_internal_note": False,
        },
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["emailed"] is True
    assert payload["emailed_to"] == "answered@example.com"
    assert payload["is_internal_note"] is False

    replies = _emails_to(otp_test_harness, "answered@example.com")
    assert len(replies) == 1, otp_test_harness
    assert "below the evidence threshold" in replies[0]["body"]
    assert ticket_number in replies[0]["subject"]

    # And the answer is on the ticket's email history, so the next admin sees
    # what was already said.
    workspace = await async_client.get(
        f"/v1/admin/support/tickets/{row.id}", headers=admin_headers
    )
    assert workspace.status_code == 200, workspace.text
    bodies = [m["body"] for m in workspace.json()["messages"]]
    assert any("below the evidence threshold" in body for body in bodies)


@pytest.mark.asyncio
async def test_internal_note_is_recorded_but_never_emailed(
    async_client, db_session, otp_test_harness
):
    user = await _register(async_client, "quiet@example.com", "Qui Et")
    ticket_number = (
        await async_client.post(
            "/v1/support/requests",
            json={
                "subject": "Churn risk",
                "message": "Considering cancelling after the last outage window.",
            },
            headers=user["headers"],
        )
    ).json()["ticket_number"]
    row = (
        await db_session.execute(
            select(FeedbackTicket).where(
                FeedbackTicket.ticket_number == ticket_number
            )
        )
    ).scalar_one()

    admin_headers = await make_admin_headers(db_session)
    otp_test_harness.clear()

    res = await async_client.post(
        f"/v1/admin/support/tickets/{row.id}/reply",
        json={"body": "Offer a credit internally.", "is_internal_note": True},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["emailed"] is False
    assert res.json()["emailed_to"] is None
    assert otp_test_harness == []


# ── New-email signal for browser notifications ───────────────────────────


@pytest.mark.asyncio
async def test_alerts_endpoint_reports_new_emails_and_outstanding_replies(
    async_client, db_session
):
    admin_headers = await make_admin_headers(db_session)
    user = await _register(async_client, "signal@example.com", "Sig Nal")

    baseline = await async_client.get(
        "/v1/admin/support/alerts", headers=admin_headers
    )
    assert baseline.status_code == 200, baseline.text
    cursor = baseline.json()["server_time"]
    before = baseline.json()["awaiting_reply_count"]

    created = await async_client.post(
        "/v1/support/requests",
        json={
            "subject": "New incident not on the record",
            "message": "The vendor page lists nothing for this morning's failure.",
        },
        headers=user["headers"],
    )
    assert created.status_code == 201, created.text
    ticket_number = created.json()["ticket_number"]

    res = await async_client.get(
        "/v1/admin/support/alerts",
        params={"since": cursor},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["new_count"] >= 1
    assert body["awaiting_reply_count"] == before + 1
    assert any(item["ticket_number"] == ticket_number for item in body["latest"])
    assert all(item["admin_url"].endswith(item["id"]) for item in body["latest"])


@pytest.mark.asyncio
async def test_alerts_endpoint_is_admin_only(async_client):
    res = await async_client.get("/v1/admin/support/alerts")
    assert res.status_code in (401, 403), res.text


# ── The live surface stays removed ───────────────────────────────────────


@pytest.mark.asyncio
async def test_live_conversation_endpoints_are_gone(async_client):
    """A thread a customer has to watch is not a support channel.

    The partner/console conversation API (list, thread, post message) was
    deleted rather than hidden: these paths must not come back without the
    same review that removed them.
    """
    user = await _register(async_client, "nostream@example.com", "No Stream")
    ticket_id = uuid.uuid4()

    res = await async_client.get(
        "/v1/partners/support/tickets", headers=user["headers"]
    )
    assert res.status_code == 404, res.text

    res = await async_client.get(
        f"/v1/partners/support/tickets/{ticket_id}", headers=user["headers"]
    )
    assert res.status_code == 404, res.text

    res = await async_client.post(
        f"/v1/partners/support/tickets/{ticket_id}/messages",
        json={"body": "Anyone there?"},
        headers=user["headers"],
    )
    assert res.status_code == 404, res.text
