"""One-shot, commit-bound side effects.

A Celery task that reads a row must not be published before the transaction
that wrote the row has committed. Publishing inside the transaction is the bug
this module exists to remove: the broker hands the task to a worker in
milliseconds, the worker's separate connection cannot see the uncommitted row,
and the task either fails or - worse - succeeds against a *partial* view and
persists an artifact built from an incomplete incident window.

The previous workaround was ``countdown=5``, a sleep that happened to be longer
than the commit usually takes. This replaces it with the actual guarantee: the
callback runs on ``after_commit``, so it fires exactly once, only on success,
and never after a rollback.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def dispatch_after_commit(session: AsyncSession, callback: Callable[[], None]) -> None:
    """Run *callback* once, after the session's current transaction commits.

    The listener removes itself before invoking the callback, so a session that
    commits many times in its lifetime runs the effect exactly once. If the
    transaction rolls back the callback never runs - which is the correct
    behaviour for "queue work that depends on this write".

    Exceptions raised by *callback* are logged and swallowed: the transaction
    has already committed, so raising would surface a delivery problem as a
    data error and could roll back work that is already durable. Callers that
    need to recover from a failed dispatch do it out of band (the evidence
    pipeline reconciles stuck states from a periodic task).
    """
    sync_session = session.sync_session

    @event.listens_for(sync_session, "after_commit", once=True)
    def _run(_session) -> None:  # pragma: no cover - thin wrapper
        try:
            callback()
        except Exception:
            logger.exception(
                "after-commit side effect failed; the transaction is already "
                "committed and will be reconciled out of band"
            )


__all__ = ["dispatch_after_commit"]
