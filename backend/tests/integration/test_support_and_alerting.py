"""Regression tests for the support-routing and in-dashboard alerting fixes.

These lock down behaviour that was previously broken:

* the public "Contact support" form reached the live admin queue (it used to
  write to a frontend-only table that nothing ever read);
* a ticket submitted from an address with no account still gets the reply,
  by email, instead of the answer silently disappearing;
* a dependency going down produces a notification the customer can actually
  see in the product (the alert channels used to be email/Slack/PagerDuty/
  webhook only, so an org with no configured channel heard nothing at all);
* the inbox belongs to one person — another user, and an organization API
  key, must not be able to read it.
"""

import uuid

import pytest
from sqlalchemy import select

from app.modules.admin.models import FeedbackTicket
from app.modules.dependencies.models import Dependency
from app.modules.incidents.service import incident_service
from tests.helpers import register_and_verify


async def _register(async_client, email, full_name):
    """Create an account and clear the email-verification hard gate.

    ``POST /v1/auth/register`` issues no tokens any more — the session only
    exists after the OTP step — so this goes through the shared helper.
    """
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
        "org_id": body["organization"]["id"],
    }


async def _make_admin(db_session, user_id):
    from app.modules.users.models import User

    row = (
        await db_session.execute(select(User).where(User.id == user_id))
    ).scalar_one()
    row.is_system_admin = True
    await db_session.commit()


# ── Public support intake ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_public_form_reaches_the_admin_queue(async_client, db_session):
    """A web-form message must land in the same queue the admin works."""
    admin = await _register(async_client, "psf-admin@example.com", "PSF Admin")
    await _make_admin(db_session, admin["user_id"])

    res = await async_client.post(
        "/v1/support/tickets",
        json={
            "name": "Ada Visitor",
            "email": "ada.visitor@example.com",
            "subject": "Monitoring looks wrong",
            "message": "My dependency is down but Reliastra still shows it green.",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["success"] is True
    assert body["ticket_number"].startswith("FB-")
    assert body["status"] == "open"

    queue = await async_client.get(
        "/v1/admin/support/tickets", headers=admin["headers"]
    )
    assert queue.status_code == 200, queue.text
    subjects = [t["subject"] for t in queue.json()["items"]]
    assert "Monitoring looks wrong" in subjects

    # The admin can open it and see the visitor's message as the ticket body.
    created = (
        await db_session.execute(
            select(FeedbackTicket).where(
                FeedbackTicket.ticket_number == body["ticket_number"]
            )
        )
    ).scalar_one()
    assert created.source == "web"
    assert created.email == "ada.visitor@example.com"
    assert "still shows it green" in created.body


@pytest.mark.asyncio
async def test_public_form_links_an_existing_account(async_client, db_session):
    """Same address as a registered user ⇒ the ticket is attributed to them,
    which is what lets an admin reply reach their in-dashboard feed."""
    user = await _register(async_client, "linked@example.com", "Linked User")

    res = await async_client.post(
        "/v1/support/tickets",
        json={
            "name": "Linked User",
            # Deliberately different case — matching must be case-insensitive.
            "email": "Linked@Example.com",
            "subject": "Billing question",
            "message": "I was charged twice for the same month.",
        },
    )
    assert res.status_code == 201, res.text
    ticket_number = res.json()["ticket_number"]

    row = (
        await db_session.execute(
            select(FeedbackTicket).where(
                FeedbackTicket.ticket_number == ticket_number
            )
        )
    ).scalar_one()
    assert row.user_id == uuid.UUID(user["user_id"])


@pytest.mark.asyncio
async def test_public_form_validates_input(async_client):
    res = await async_client.post(
        "/v1/support/tickets",
        json={"name": "X", "email": "not-an-email", "subject": "s", "message": "too short"},
    )
    assert res.status_code == 422


# ── Reply reaches an unlinked requester ──────────────────────────────────


@pytest.mark.asyncio
async def test_reply_to_unlinked_ticket_is_emailed(async_client, db_session, mocker):
    """No account ⇒ no in-app feed, so the reply must go out by email."""
    admin = await _register(async_client, "unl-admin@example.com", "Unl Admin")
    await _make_admin(db_session, admin["user_id"])

    res = await async_client.post(
        "/v1/support/tickets",
        json={
            "name": "No Account",
            "email": "noaccount@example.com",
            "subject": "Pre-sales question",
            "message": "Do you monitor gRPC endpoints as well as HTTP?",
        },
    )
    assert res.status_code == 201, res.text
    ticket_number = res.json()["ticket_number"]

    row = (
        await db_session.execute(
            select(FeedbackTicket).where(
                FeedbackTicket.ticket_number == ticket_number
            )
        )
    ).scalar_one()
    assert row.user_id is None

    send = mocker.patch(
        "app.infrastructure.email.email_client.send_email", return_value=True
    )

    res = await async_client.post(
        f"/v1/admin/support/tickets/{row.id}/reply",
        json={"body": "Yes — gRPC health checks are supported.", "is_internal_note": False},
        headers=admin["headers"],
    )
    assert res.status_code == 200, res.text

    recipients = [call.kwargs.get("to_email") for call in send.call_args_list]
    assert "noaccount@example.com" in recipients


@pytest.mark.asyncio
async def test_internal_note_never_leaves_the_team(async_client, db_session, mocker):
    admin = await _register(async_client, "note-admin@example.com", "Note Admin")
    await _make_admin(db_session, admin["user_id"])

    res = await async_client.post(
        "/v1/support/tickets",
        json={
            "name": "No Account",
            "email": "notes@example.com",
            "subject": "Churn risk",
            "message": "Considering cancelling after the last outage.",
        },
    )
    assert res.status_code == 201, res.text
    ticket_number = res.json()["ticket_number"]
    row = (
        await db_session.execute(
            select(FeedbackTicket).where(
                FeedbackTicket.ticket_number == ticket_number
            )
        )
    ).scalar_one()

    send = mocker.patch(
        "app.infrastructure.email.email_client.send_email", return_value=True
    )
    res = await async_client.post(
        f"/v1/admin/support/tickets/{row.id}/reply",
        json={"body": "Offer them a credit internally.", "is_internal_note": True},
        headers=admin["headers"],
    )
    assert res.status_code == 200, res.text
    # send_email is sync and dispatched through asyncio.to_thread, so the
    # assertion is on call_count, not await_count.
    assert send.call_count == 0


# ── Degradation reaches the dashboard ────────────────────────────────────


@pytest.mark.asyncio
async def test_dependency_outage_notifies_the_customer_in_dashboard(
    async_client, db_session
):
    """The whole point: a real incident must show up in the user's inbox."""
    user = await _register(async_client, "outage@example.com", "Outage Owner")

    dependency = Dependency(
        org_id=uuid.UUID(user["org_id"]),
        name="Payments API",
        endpoint_url="https://api.payments.example/health",
    )
    db_session.add(dependency)
    await db_session.commit()

    inbox_before = await async_client.get(
        "/v1/notifications/inbox", headers=user["headers"]
    )
    assert inbox_before.status_code == 200, inbox_before.text
    assert inbox_before.json()["total"] == 0

    # The real production path: quorum failure -> incident -> alert dispatch.
    await incident_service.check_and_create_incident(
        db_session,
        org_id=uuid.UUID(user["org_id"]),
        dependency_id=dependency.id,
        error_message="Quorum confirmed failure across 3 regions",
    )
    await db_session.commit()

    inbox = await async_client.get(
        "/v1/notifications/inbox", headers=user["headers"]
    )
    assert inbox.status_code == 200, inbox.text
    payload = inbox.json()
    assert payload["total"] == 1, payload
    assert payload["unread"] == 1

    item = payload["items"][0]
    assert item["event"] == "dependency_alert"
    assert item["title"] == "Service Degradation Detected"
    assert item["is_read"] is False
    # Deep-links straight to the incident page in the console.
    assert item["action_url"] and item["action_url"].startswith("/incidents/")


@pytest.mark.asyncio
async def test_alert_reaches_every_org_member(async_client, db_session):
    """An org with no email/Slack/PagerDuty config must still be alerted."""
    owner = await _register(async_client, "teamowner@example.com", "Team Owner")
    owner_headers = {**owner["headers"], "X-Organization-ID": owner["org_id"]}

    # Sanity: this org has configured zero alert channels.
    configs = await async_client.get(
        "/v1/notifications/configs", headers=owner_headers
    )
    assert configs.status_code == 200, configs.text
    assert configs.json() == []

    dependency = Dependency(
        org_id=uuid.UUID(owner["org_id"]),
        name="Search API",
        endpoint_url="https://api.search.example/ping",
    )
    db_session.add(dependency)
    await db_session.commit()

    await incident_service.check_and_create_incident(
        db_session,
        org_id=uuid.UUID(owner["org_id"]),
        dependency_id=dependency.id,
        error_message="All checks failing",
    )
    await db_session.commit()

    count = await async_client.get(
        "/v1/notifications/inbox/unread-count", headers=owner["headers"]
    )
    assert count.status_code == 200, count.text
    assert count.json()["unread"] == 1


@pytest.mark.asyncio
async def test_inbox_is_private_to_the_user(async_client, db_session):
    one = await _register(async_client, "inbox-one@example.com", "Inbox One")
    two = await _register(async_client, "inbox-two@example.com", "Inbox Two")

    dependency = Dependency(
        org_id=uuid.UUID(one["org_id"]),
        name="Ledger API",
        endpoint_url="https://api.ledger.example/status",
    )
    db_session.add(dependency)
    await db_session.commit()
    await incident_service.check_and_create_incident(
        db_session,
        org_id=uuid.UUID(one["org_id"]),
        dependency_id=dependency.id,
        error_message="Down",
    )
    await db_session.commit()

    mine = await async_client.get("/v1/notifications/inbox", headers=one["headers"])
    assert mine.json()["total"] == 1

    theirs = await async_client.get("/v1/notifications/inbox", headers=two["headers"])
    assert theirs.json()["total"] == 0

    # … and one user cannot dismiss another's notification.
    notification_id = mine.json()["items"][0]["id"]
    res = await async_client.delete(
        f"/v1/notifications/inbox/{notification_id}", headers=two["headers"]
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_marking_the_inbox_read_clears_the_unread_count(
    async_client, db_session
):
    user = await _register(async_client, "readme@example.com", "Read Me")

    dependency = Dependency(
        org_id=uuid.UUID(user["org_id"]),
        name="Mail API",
        endpoint_url="https://api.mail.example/health",
    )
    db_session.add(dependency)
    await db_session.commit()
    await incident_service.check_and_create_incident(
        db_session,
        org_id=uuid.UUID(user["org_id"]),
        dependency_id=dependency.id,
        error_message="Down",
    )
    await db_session.commit()

    res = await async_client.post(
        "/v1/notifications/inbox/read", json={}, headers=user["headers"]
    )
    assert res.status_code == 200, res.text
    assert res.json()["unread"] == 0

    listing = await async_client.get(
        "/v1/notifications/inbox", headers=user["headers"]
    )
    assert listing.json()["items"][0]["is_read"] is True
