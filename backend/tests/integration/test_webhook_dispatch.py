"""Webhook events are dispatched from the product lifecycle.

The delivery engine, the retry schedule and the subscription API all existed
before this test did; what did not exist was a single call site. An incident
could open, resolve and produce an evidence artifact with every subscribed
endpoint silent, and nothing anywhere recorded that as a defect.

So these tests assert the wiring rather than the engine, and they assert it at
the commit boundary, which is where the interesting mistakes live:

* the three incident lifecycle events reach the delivery task, with the ids a
  consumer needs to act on them;
* nothing is enqueued before the transaction commits, because an announced
  incident that rolls back is a page for something that never happened;
* the envelope is the shape the test-delivery endpoint sends, so one parser
  covers both paths;
* dispatch is non-fatal, because a customer's unreachable endpoint must not be
  able to roll back an incident;
* the retry sweep is registered and scheduled, because a retry record that
  nothing drains is indistinguishable from a lost event.
"""

import uuid

import pytest

from app.modules.incidents.constants import IncidentSeverity
from app.modules.incidents.schemas import IncidentUpdateRequest


def _capture_dispatches(mocker) -> list[tuple[str, str, dict]]:
    """Record every enqueued delivery, at the Celery boundary."""
    sent: list[tuple[str, str, dict]] = []

    def fake_delay(org_id, event_type, payload):
        sent.append((org_id, event_type, payload))

    mocker.patch("app.modules.webhooks.tasks.deliver_event.delay", side_effect=fake_delay)
    return sent


@pytest.mark.asyncio
async def test_incident_lifecycle_dispatches_events_on_commit(
    async_client, auth_data, db_session, mocker
):
    sent = _capture_dispatches(mocker)
    # Evidence generation is published from the incident's own after-commit hook.
    mocker.patch("app.modules.evidence.tasks.generate_evidence_report.apply_async")

    headers = auth_data["headers"]
    org_id = auth_data["org_id"]
    dep_res = await async_client.post(
        "/v1/dependencies",
        headers=headers,
        json={"name": "Dispatch dep", "endpoint_url": "https://dispatch.example.com"},
    )
    dep_id = dep_res.json()["id"]

    from app.modules.incidents.service import incident_service

    incident = await incident_service.check_and_create_incident(
        db_session,
        org_id=org_id,
        dependency_id=dep_id,
        error_message="500 Internal Error",
        detection={"rule": "single.consecutive_failures", "required": 2},
    )
    # Nothing may be announced before the row it describes is durable.
    assert sent == []

    await db_session.commit()

    opened = [entry for entry in sent if entry[1] == "incident.opened"]
    assert len(opened) == 1, f"expected one incident.opened dispatch, saw {sent}"
    org_sent, _, payload = opened[0]
    assert org_sent == str(org_id)
    assert payload["event"] == "incident.opened"
    assert payload["data"]["incident_id"] == str(incident.id)
    assert payload["data"]["dependency_id"] == str(incident.dependency_id)
    assert payload["data"]["detection"]["rule"] == "single.consecutive_failures"

    await incident_service.update_incident(
        db_session,
        org_id=org_id,
        inc_id=incident.id,
        request=IncidentUpdateRequest(severity=IncidentSeverity.CRITICAL),
    )
    await db_session.commit()

    updated = [entry for entry in sent if entry[1] == "incident.updated"]
    assert len(updated) == 1
    assert updated[0][2]["data"]["changed"] == ["severity"]
    assert updated[0][2]["data"]["severity"] == "critical"

    await incident_service.resolve_incident(db_session, incident.id, org_id=org_id)
    await db_session.commit()

    resolved = [entry for entry in sent if entry[1] == "incident.resolved"]
    assert len(resolved) == 1
    assert resolved[0][2]["data"]["incident_id"] == str(incident.id)
    assert resolved[0][2]["data"]["resolved_at"] is not None
    # Resolution is its own event; a consumer must not also receive "updated".
    assert len([entry for entry in sent if entry[1] == "incident.updated"]) == 1


@pytest.mark.asyncio
async def test_a_rolled_back_incident_announces_nothing(
    async_client, auth_data, db_session, mocker
):
    sent = _capture_dispatches(mocker)
    mocker.patch("app.modules.evidence.tasks.generate_evidence_report.apply_async")

    headers = auth_data["headers"]
    dep_res = await async_client.post(
        "/v1/dependencies",
        headers=headers,
        json={"name": "Rollback dep", "endpoint_url": "https://rollback.example.com"},
    )
    dep_id = dep_res.json()["id"]

    from app.modules.incidents.service import incident_service

    await incident_service.check_and_create_incident(
        db_session,
        org_id=auth_data["org_id"],
        dependency_id=dep_id,
        error_message="500 Internal Error",
    )
    await db_session.rollback()

    assert sent == [], "an incident that never committed must not be announced"


def test_dispatch_envelope_matches_the_test_delivery_shape():
    from app.modules.webhooks.dispatch import build_payload

    payload = build_payload("incident.opened", {"incident_id": "abc"})
    assert set(payload) == {"event", "timestamp", "data"}
    assert payload["event"] == "incident.opened"
    assert payload["data"] == {"incident_id": "abc"}
    assert payload["timestamp"].endswith("+00:00")


def test_after_commit_dispatch_falls_back_when_the_hook_is_unavailable(mocker):
    """A session without the after_commit machinery still gets its event.

    The hook is registered on a real engine's session; a mock session cannot
    carry it. Dropping the event silently would be the worse failure, so the
    dispatch happens immediately instead.
    """
    from app.modules.webhooks import dispatch

    sent = mocker.patch.object(dispatch, "dispatch_event")
    mocker.patch(
        "app.infrastructure.after_commit.dispatch_after_commit",
        side_effect=AttributeError("no sync session"),
    )

    dispatch.dispatch_event_after_commit(
        object(), uuid.uuid4(), "incident.opened", {"incident_id": "abc"}
    )

    assert sent.call_count == 1


def test_dispatch_never_raises_when_the_broker_is_unreachable(mocker):
    from app.modules.webhooks import dispatch

    mocker.patch(
        "app.modules.webhooks.tasks.deliver_event.delay",
        side_effect=RuntimeError("broker down"),
    )

    # The fact being recorded matters more than its notification.
    dispatch.dispatch_event(
        uuid.uuid4(), "incident.opened", {"incident_id": "abc"}
    )


def test_retry_sweep_is_registered_and_scheduled():
    from app.infrastructure.celery_app import celery_app

    entry = celery_app.conf.beat_schedule.get("webhook-delivery-retry")
    assert entry is not None, "no scheduled sweep drains retrying deliveries"
    assert entry["task"] == "app.modules.webhooks.tasks.retry_pending_deliveries"
    assert "app.modules.webhooks.tasks" in celery_app.conf.include
