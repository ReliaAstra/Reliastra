"""Integration tests for partner notifications, the payout fixes, and the
partner ↔ admin support desk.

Covers the behaviour added on top of the v1 referral program:

* the dashboard exposes a *withdrawable* balance distinct from "pending";
* marking a payout paid requires a transaction reference and notifies the
  partner (in-app + email per preference);
* referral signups and commissions notify the partner;
* notification preferences are persisted server-side;
* partner support conversations land in the admin support queue and admin
  replies flow back to the partner.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.config import settings
from app.modules.partners.commissions import commission_service
from app.modules.partners.constants import CommissionStatus
from app.modules.partners.models import PartnerCommission, PartnerProfile
from app.modules.users.models import User


async def _register(async_client, email, full_name, ref_code=None):
    payload = {
        "email": email,
        "password": "SecurePassword123!",
        "full_name": full_name,
        "org_name": f"{full_name} Org",
    }
    if ref_code:
        payload["ref_code"] = ref_code
    res = await async_client.post("/v1/auth/register", json=payload)
    assert res.status_code == 201, res.text
    body = res.json()
    return {
        "token": body["tokens"]["access_token"],
        "headers": {"Authorization": f"Bearer {body['tokens']['access_token']}"},
        "user_id": body["user"]["id"],
        "org_id": body["organization"]["id"],
    }


async def _activate_partner(async_client, headers):
    res = await async_client.post(
        "/v1/partners/apply", json={"agree_terms": True}, headers=headers
    )
    assert res.status_code == 201, res.text
    return res.json()


async def _make_admin(db_session, user_id):
    row = (
        await db_session.execute(select(User).where(User.id == user_id))
    ).scalar_one()
    row.is_system_admin = True
    await db_session.commit()


async def _release_commissions(db_session, partner_id):
    """Fast-forward the hold period so commissions become payable."""
    rows = (
        (
            await db_session.execute(
                select(PartnerCommission).where(
                    PartnerCommission.partner_id == partner_id
                )
            )
        )
        .scalars()
        .all()
    )
    for commission in rows:
        commission.status = CommissionStatus.PAYABLE.value
        commission.payable_at = datetime.now(timezone.utc) - timedelta(days=1)
    await db_session.commit()


async def _partner_id(db_session, user_id) -> uuid.UUID:
    return (
        await db_session.execute(
            select(PartnerProfile).where(PartnerProfile.user_id == uuid.UUID(user_id))
        )
    ).scalar_one().id


# ── Dashboard balance semantics ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_dashboard_separates_payable_from_pending(async_client, db_session):
    """`payable_balance_minor` must exclude held and reserved commissions."""
    partner = await _register(async_client, "bal@example.com", "Bal Kof")
    profile = await _activate_partner(async_client, partner["headers"])
    customer = await _register(
        async_client, "balcust@example.com", "Bal Cust", ref_code=profile["referral_code"]
    )
    await commission_service.record_payment(
        db_session,
        organization_id=customer["org_id"],
        collected_minor=50_000,
        currency="USD",
        payment_reference="bal-1",
        paid_at=datetime.now(timezone.utc),
    )
    await db_session.commit()

    # Still inside the hold period: earned, but not withdrawable.
    res = await async_client.get("/v1/partners/dashboard", headers=partner["headers"])
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["pending_commission_minor"] > 0
    assert body["payable_balance_minor"] == 0
    assert body["minimum_payout_minor"] == settings.PARTNER_MINIMUM_PAYOUT_MINOR

    # After the hold elapses the same money becomes withdrawable.
    await _release_commissions(db_session, await _partner_id(db_session, partner["user_id"]))
    res = await async_client.get("/v1/partners/dashboard", headers=partner["headers"])
    body = res.json()
    assert body["payable_balance_minor"] == body["pending_commission_minor"] > 0

    # Reserving it in a payout removes it from the withdrawable balance.
    await async_client.put(
        "/v1/partners/payout-settings",
        json={"payout_method": "crypto_usdc", "wallet_address": "0xabc", "network": "Ethereum"},
        headers=partner["headers"],
    )
    res = await async_client.post(
        "/v1/partners/payouts/request", headers=partner["headers"]
    )
    assert res.status_code == 201, res.text

    res = await async_client.get("/v1/partners/dashboard", headers=partner["headers"])
    body = res.json()
    assert body["payable_balance_minor"] == 0
    assert body["in_transit_minor"] > 0


# ── Payout settlement ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_mark_paid_requires_reference_and_notifies_partner(
    async_client, db_session
):
    admin = await _register(async_client, "payadmin@example.com", "Pay Admin")
    await _make_admin(db_session, admin["user_id"])
    admin_headers = {"Authorization": f"Bearer {admin['token']}"}

    partner = await _register(async_client, "paid@example.com", "Paid Kof")
    profile = await _activate_partner(async_client, partner["headers"])
    customer = await _register(
        async_client, "paidcust@example.com", "Paid Cust", ref_code=profile["referral_code"]
    )
    await commission_service.record_payment(
        db_session,
        organization_id=customer["org_id"],
        collected_minor=80_000,
        currency="USD",
        payment_reference="paid-1",
        paid_at=datetime.now(timezone.utc),
    )
    await db_session.commit()
    await _release_commissions(db_session, await _partner_id(db_session, partner["user_id"]))

    await async_client.put(
        "/v1/partners/payout-settings",
        json={
            "payout_method": "bank",
            "bank_details": {"bank_name": "First Bank", "account_number": "1234567890"},
        },
        headers=partner["headers"],
    )
    payout = (
        await async_client.post("/v1/partners/payouts/request", headers=partner["headers"])
    ).json()

    # Without a transaction reference the settlement is rejected.
    res = await async_client.post(
        f"/v1/admin/partners/payouts/{payout['id']}/process",
        json={"action": "mark_paid"},
        headers=admin_headers,
    )
    assert res.status_code == 422, res.text

    # With one, the payout settles.
    res = await async_client.post(
        f"/v1/admin/partners/payouts/{payout['id']}/process",
        json={"action": "mark_paid", "transaction_reference": "TX-9911"},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "paid"

    # The partner sees it in their own payout list …
    res = await async_client.get("/v1/partners/payouts", headers=partner["headers"])
    item = res.json()["items"][0]
    assert item["status"] == "paid"
    assert item["transaction_reference"] == "TX-9911"

    # … and was notified, with the destination masked to the last four digits.
    res = await async_client.get(
        "/v1/partners/notifications", headers=partner["headers"]
    )
    assert res.status_code == 200, res.text
    events = {n["event"]: n for n in res.json()["items"]}
    assert "partner_payout_paid" in events
    paid_note = events["partner_payout_paid"]
    assert "TX-9911" in paid_note["body"]
    assert "••••7890" in paid_note["body"]
    assert "1234567890" not in paid_note["body"]
    assert res.json()["unread"] >= 1


@pytest.mark.asyncio
async def test_failed_payout_returns_balance_and_notifies(async_client, db_session):
    admin = await _register(async_client, "failadmin@example.com", "Fail Admin")
    await _make_admin(db_session, admin["user_id"])
    admin_headers = {"Authorization": f"Bearer {admin['token']}"}

    partner = await _register(async_client, "fail@example.com", "Fail Kof")
    profile = await _activate_partner(async_client, partner["headers"])
    customer = await _register(
        async_client, "failcust@example.com", "Fail Cust", ref_code=profile["referral_code"]
    )
    await commission_service.record_payment(
        db_session,
        organization_id=customer["org_id"],
        collected_minor=60_000,
        currency="USD",
        payment_reference="fail-1",
        paid_at=datetime.now(timezone.utc),
    )
    await db_session.commit()
    await _release_commissions(db_session, await _partner_id(db_session, partner["user_id"]))

    await async_client.put(
        "/v1/partners/payout-settings",
        json={"payout_method": "crypto_usdt", "wallet_address": "TXyz", "network": "Tron"},
        headers=partner["headers"],
    )
    payout = (
        await async_client.post("/v1/partners/payouts/request", headers=partner["headers"])
    ).json()

    res = await async_client.post(
        f"/v1/admin/partners/payouts/{payout['id']}/process",
        json={"action": "mark_failed"},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text

    # Money is withdrawable again and the partner knows why.
    dashboard = (
        await async_client.get("/v1/partners/dashboard", headers=partner["headers"])
    ).json()
    assert dashboard["payable_balance_minor"] > 0

    events = {
        n["event"]
        for n in (
            await async_client.get(
                "/v1/partners/notifications", headers=partner["headers"]
            )
        ).json()["items"]
    }
    assert "partner_payout_failed" in events


# ── Notification feed & preferences ──────────────────────────────────────


@pytest.mark.asyncio
async def test_referral_and_commission_notifications(async_client, db_session):
    partner = await _register(async_client, "notif@example.com", "Notif Kof")
    profile = await _activate_partner(async_client, partner["headers"])

    customer = await _register(
        async_client,
        "notifcust@example.com",
        "Notif Cust",
        ref_code=profile["referral_code"],
    )

    res = await async_client.get(
        "/v1/partners/notifications", headers=partner["headers"]
    )
    assert res.status_code == 200, res.text
    signup = [
        n for n in res.json()["items"] if n["event"] == "partner_referral_signup"
    ]
    assert signup, res.text
    # The referred customer's address is masked in the partner's feed.
    assert "notifcust@example.com" not in signup[0]["body"]
    assert "n***@example.com" in signup[0]["body"]

    await commission_service.record_payment(
        db_session,
        organization_id=customer["org_id"],
        collected_minor=10_000,
        currency="USD",
        payment_reference="notif-1",
        paid_at=datetime.now(timezone.utc),
    )
    await db_session.commit()

    res = await async_client.get(
        "/v1/partners/notifications", headers=partner["headers"]
    )
    events = [n["event"] for n in res.json()["items"]]
    assert "partner_commission_earned" in events


@pytest.mark.asyncio
async def test_notification_read_and_preferences(async_client, db_session):
    partner = await _register(async_client, "prefs@example.com", "Prefs Kof")
    profile = await _activate_partner(async_client, partner["headers"])
    await _register(
        async_client, "prefcust@example.com", "Pref Cust", ref_code=profile["referral_code"]
    )

    # Defaults: email on for program events, marketing off, browser off.
    res = await async_client.get(
        "/v1/partners/notification-preferences", headers=partner["headers"]
    )
    assert res.status_code == 200, res.text
    prefs = res.json()
    assert prefs["email_payout"] is True
    assert prefs["email_marketing"] is False
    assert prefs["browser_enabled"] is False

    res = await async_client.put(
        "/v1/partners/notification-preferences",
        json={"email_marketing": True, "browser_enabled": True, "email_referral": False},
        headers=partner["headers"],
    )
    assert res.status_code == 200, res.text
    assert res.json()["email_marketing"] is True
    assert res.json()["browser_enabled"] is True
    assert res.json()["email_referral"] is False

    # …and they persist across requests.
    res = await async_client.get(
        "/v1/partners/notification-preferences", headers=partner["headers"]
    )
    assert res.json()["browser_enabled"] is True

    # Unread count drops to zero once the feed is marked read.
    unread = (
        await async_client.get(
            "/v1/partners/notifications/unread-count", headers=partner["headers"]
        )
    ).json()["unread"]
    assert unread >= 1

    res = await async_client.post(
        "/v1/partners/notifications/read", json={}, headers=partner["headers"]
    )
    assert res.status_code == 200, res.text
    assert res.json()["unread"] == 0


@pytest.mark.asyncio
async def test_notifications_are_private_to_the_partner(async_client, db_session):
    partner = await _register(async_client, "owner@example.com", "Owner Kof")
    profile = await _activate_partner(async_client, partner["headers"])
    await _register(
        async_client, "ownercust@example.com", "Owner Cust", ref_code=profile["referral_code"]
    )

    other = await _register(async_client, "other@example.com", "Other Kof")
    await _activate_partner(async_client, other["headers"])

    res = await async_client.get("/v1/partners/notifications", headers=other["headers"])
    assert res.status_code == 200, res.text
    assert res.json()["total"] == 0

    # Unauthenticated access is rejected outright.
    assert (await async_client.get("/v1/partners/notifications")).status_code == 401


# ── Admin → partner broadcast ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_admin_can_notify_all_partners(async_client, db_session):
    admin = await _register(async_client, "bcadmin@example.com", "Broadcast Admin")
    await _make_admin(db_session, admin["user_id"])
    admin_headers = {"Authorization": f"Bearer {admin['token']}"}

    one = await _register(async_client, "bc1@example.com", "BC One")
    await _activate_partner(async_client, one["headers"])
    two = await _register(async_client, "bc2@example.com", "BC Two")
    await _activate_partner(async_client, two["headers"])

    res = await async_client.post(
        "/v1/admin/partners/notify",
        json={
            "audience": "all",
            "title": "Commission rate update",
            "body": "Your rate increases to 35% next month.",
            "category": "announcement",
        },
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["recipients"] == 2

    for who in (one, two):
        feed = (
            await async_client.get("/v1/partners/notifications", headers=who["headers"])
        ).json()
        titles = [n["title"] for n in feed["items"]]
        assert "Commission rate update" in titles

    # Targeting a single partner only reaches that partner.
    partner_id = str(await _partner_id(db_session, one["user_id"]))
    res = await async_client.post(
        "/v1/admin/partners/notify",
        json={
            "audience": "selected",
            "partner_ids": [partner_id],
            "title": "Just for you",
            "body": "A note about your account.",
        },
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["recipients"] == 1

    two_titles = [
        n["title"]
        for n in (
            await async_client.get("/v1/partners/notifications", headers=two["headers"])
        ).json()["items"]
    ]
    assert "Just for you" not in two_titles


@pytest.mark.asyncio
async def test_broadcast_requires_system_admin(async_client):
    partner = await _register(async_client, "nope@example.com", "Nope Kof")
    await _activate_partner(async_client, partner["headers"])
    res = await async_client.post(
        "/v1/admin/partners/notify",
        json={"audience": "all", "title": "Hi", "body": "There"},
        headers=partner["headers"],
    )
    assert res.status_code == 403, res.text


# ── Support desk ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_partner_support_conversation_reaches_admin_and_back(
    async_client, db_session
):
    admin = await _register(async_client, "supadmin@example.com", "Support Admin")
    await _make_admin(db_session, admin["user_id"])
    admin_headers = {"Authorization": f"Bearer {admin['token']}"}

    partner = await _register(async_client, "sup@example.com", "Sup Kof")
    await _activate_partner(async_client, partner["headers"])

    # 1. Partner opens a conversation from the dashboard.
    res = await async_client.post(
        "/v1/partners/support/tickets",
        json={"subject": "Payout not received", "message": "My USDT payout has not arrived."},
        headers=partner["headers"],
    )
    assert res.status_code == 201, res.text
    ticket = res.json()["ticket"]
    assert ticket["ticket_number"].startswith("PN-")
    assert res.json()["messages"][0]["sender_type"] == "user"

    # 2. It shows up in the admin support queue.
    res = await async_client.get(
        "/v1/admin/support/tickets", params={"category": "partner"}, headers=admin_headers
    )
    assert res.status_code == 200, res.text
    assert any(t["id"] == ticket["id"] for t in res.json()["items"])

    # 3. The admin replies …
    res = await async_client.post(
        f"/v1/admin/support/tickets/{ticket['id']}/reply",
        json={"body": "We re-sent it, check again in an hour.", "is_internal_note": False},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text

    # … and an internal note, which the partner must never see.
    res = await async_client.post(
        f"/v1/admin/support/tickets/{ticket['id']}/reply",
        json={"body": "Escalated to finance internally.", "is_internal_note": True},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text

    # 4. The partner's thread shows the reply, not the note.
    res = await async_client.get(
        f"/v1/partners/support/tickets/{ticket['id']}", headers=partner["headers"]
    )
    assert res.status_code == 200, res.text
    bodies = [m["body"] for m in res.json()["messages"]]
    assert "We re-sent it, check again in an hour." in bodies
    assert "Escalated to finance internally." not in bodies

    # 5. The partner is notified of the reply.
    events = [
        n["event"]
        for n in (
            await async_client.get(
                "/v1/partners/notifications", headers=partner["headers"]
            )
        ).json()["items"]
    ]
    assert "partner_support_reply" in events

    # 6. The partner can reply back and it reaches the same thread.
    res = await async_client.post(
        f"/v1/partners/support/tickets/{ticket['id']}/messages",
        json={"body": "Received, thank you."},
        headers=partner["headers"],
    )
    assert res.status_code == 201, res.text

    res = await async_client.get(
        f"/v1/admin/support/tickets/{ticket['id']}", headers=admin_headers
    )
    assert res.status_code == 200, res.text
    admin_bodies = [m["body"] for m in res.json()["messages"]]
    assert "Received, thank you." in admin_bodies


@pytest.mark.asyncio
async def test_partner_cannot_read_another_partners_conversation(async_client):
    one = await _register(async_client, "t1@example.com", "T One")
    await _activate_partner(async_client, one["headers"])
    two = await _register(async_client, "t2@example.com", "T Two")
    await _activate_partner(async_client, two["headers"])

    ticket = (
        await async_client.post(
            "/v1/partners/support/tickets",
            json={"subject": "Private matter", "message": "This is confidential info."},
            headers=one["headers"],
        )
    ).json()["ticket"]

    res = await async_client.get(
        f"/v1/partners/support/tickets/{ticket['id']}", headers=two["headers"]
    )
    assert res.status_code == 404, res.text

    res = await async_client.post(
        f"/v1/partners/support/tickets/{ticket['id']}/messages",
        json={"body": "Sneaking in"},
        headers=two["headers"],
    )
    assert res.status_code == 404, res.text


@pytest.mark.asyncio
async def test_support_ticket_validates_message_length(async_client):
    partner = await _register(async_client, "short@example.com", "Short Kof")
    await _activate_partner(async_client, partner["headers"])
    res = await async_client.post(
        "/v1/partners/support/tickets",
        json={"subject": "Hi", "message": "too short"},
        headers=partner["headers"],
    )
    assert res.status_code == 422, res.text
