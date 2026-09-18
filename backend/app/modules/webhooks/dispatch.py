"""Event dispatch for webhook subscribers.

The delivery engine (``WebhookService.deliver_webhook``) has always existed;
nothing called it. An incident could open, resolve and produce an evidence
artifact while every subscribed endpoint stayed silent, because the three call
sites that turn a product event into a delivery were never written. This module
is those call sites' entry point.

Three rules, and each exists because of a failure mode that would otherwise be
silent:

**Dispatch must never fail the caller.** An incident is opened by the detector
inside the check pipeline; an evidence artifact is generated inside a worker.
Neither may be rolled back because a customer's endpoint is unreachable, or
because the broker is down. Dispatch therefore enqueues and swallows - the same
shape as the in-app alert and email dispatch next to it - and logs what it
could not do.

**Delivery happens off the request path.** The delivery engine performs a
synchronous HTTP POST with a ten-second timeout. Doing that inside the check
pipeline or an API request would let one slow consumer stall the product. The
task queue is where that belongs, and ``retry_pending_deliveries`` already
knows how to catch anything that fails.

**The payload shape is fixed here.** ``event``, ``timestamp`` and ``data``, the
same envelope the test-delivery endpoint sends, so a consumer writes one parser
and both paths satisfy it. The delivery id travels in the
``X-Reliastra-Delivery`` header rather than in an envelope that has already been
serialised.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


def build_payload(event_type: str, data: dict[str, Any]) -> dict[str, Any]:
    """The envelope every delivery carries."""
    return {
        "event": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }


def dispatch_event(
    org_id: uuid.UUID | str, event_type: str, data: dict[str, Any]
) -> None:
    """Enqueue delivery of one event to every subscribed endpoint.

    Never raises: the caller is in the middle of recording a fact, and the fact
    is more important than its notification.
    """
    payload = build_payload(event_type, data)
    try:
        from app.modules.webhooks.tasks import deliver_event

        deliver_event.delay(str(org_id), event_type, payload)
    except Exception as exc:  # pragma: no cover - broker outages, import cycles
        logger.warning(
            "Webhook dispatch failed for org %s event %s: %s", org_id, event_type, exc
        )


def dispatch_event_after_commit(
    session: Any, org_id: uuid.UUID | str, event_type: str, data: dict[str, Any]
) -> None:
    """Dispatch once the surrounding transaction has actually committed.

    The lifecycle callers are inside a transaction: the incident row, the audit
    entry and the notification are all written and then committed together. An
    event enqueued *before* that commit can announce an incident that is then
    rolled back - a customer's pager firing for a failure the product decided
    never happened - and it can be delivered so fast that a consumer reads back
    a record the database does not have yet.

    So the enqueue is registered on the session's ``after_commit`` hook, the
    same mechanism evidence generation uses. If the hook cannot be registered
    (a mock session in a unit test, an engine without the event API), the
    dispatch happens immediately rather than being dropped: a notification that
    may be early is better than one that is silently lost.
    """
    try:
        from app.infrastructure.after_commit import dispatch_after_commit

        dispatch_after_commit(
            session, lambda: dispatch_event(org_id, event_type, data)
        )
    except Exception as exc:  # pragma: no cover - defensive, see docstring
        logger.debug("after_commit hook unavailable (%s); dispatching now", exc)
        dispatch_event(org_id, event_type, data)
