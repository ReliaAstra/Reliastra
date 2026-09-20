"""Publishing probes to the Celery broker (the "when", never the "how").

Two entry points, one guarantee each:

* ``schedule_due_checks`` — the Beat tick. Scans at most 500 due
  dependencies and publishes one ``execute_check`` task per dep/region pair.
  It never probes inline (FIX 4), never advances ``next_check_at`` for work
  it did not enqueue (Proof 4), and never hot-loops a dead broker.
* ``trigger_manual_check`` — the on-demand diagnostic. Publishes exactly the
  task Beat would publish, through the same broker, so "the manual trigger
  works" is proof the whole path works.

Neither method executes a probe: the worker in ``probe.py`` owns that.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.platform.observability.context import get_request_id
from app.platform.observability.metrics import (
    checks_dispatch_failures_total,
    checks_dispatch_skipped_total,
    checks_scheduled_total,
)
from app.platform.observability.tracing import task_context_kwargs
from app.platform.resilience.circuit_breaker import circuit_breaker
from app.platform.web.errors import (
    ResourceNotFoundException,
    ServiceUnavailableException,
    ValidationException,
)
from app.modules.dependencies.repository import DependencyRepository

logger = logging.getLogger(__name__)


class CheckDispatcher:
    """Beat scheduling and manual triggers. Holds no probe logic."""

    def __init__(
        self, dep_repository: DependencyRepository = DependencyRepository()
    ) -> None:
        self.dep_repository = dep_repository

    async def schedule_due_checks(self, session: AsyncSession) -> int:
        """Celery Beat-driven scheduling: dispatch one Celery task per check.

        Reads at most 500 due dependencies and fires ``execute_check.delay()``
        for each dep/region pair.  Each check runs in its own Celery worker, so
        a slow endpoint never blocks other probes.

        Circuit breaker (FIX 8) is consulted before dispatch - open circuits
        skip enqueue but still advance ``next_check_at`` to avoid a busy loop.
        ``next_check_at`` is advanced **only after successful enqueue** so a
        Redis/broker failure never silently loses a check (Proof 4).

        Two guards keep a broken broker from becoming a hot loop:

        * A broker pre-flight probe runs before the due-dependency scan. With
          the broker unreachable, a cycle would otherwise attempt one failing
          publish per due dep/region pair every ``CHECK_SCHEDULE_SECONDS``
          (up to 500 × regions failed publishes per cycle, each potentially
          blocking on a connection timeout). The cycle is skipped instead and
          reported through ``checks_dispatch_failures_total{reason="broker_unavailable"}``.
        * ``CHECK_DISPATCH_FAIL_FAST`` stops the cycle after the first publish
          failure, which covers a broker that dies mid-cycle.

        Neither guard advances ``next_check_at``: an undispatched check stays
        due, so the dependency is retried on the next cycle rather than having
        a missed probe silently forgiven.
        """
        from app.platform.integrations.redis import safe_redis_ping
        from app.modules.checks.scheduler_health import (
            is_check_dispatched,
            record_check_dispatched,
            record_dispatch_failure,
            sanitize_broker_url,
        )

        now = datetime.now(timezone.utc)

        # ── Broker pre-flight ───────────────────────────────────────────────
        # Redis is the broker AND the result backend (see celery_app). If it
        # is unreachable, nothing can be published, so do not even read the
        # table: the failure is reported once per cycle, loudly, with a metric
        # an alert can fire on.
        if not await safe_redis_ping():
            checks_dispatch_failures_total.labels(
                region="*", reason="broker_unavailable"
            ).inc()
            logger.error(
                "Check dispatch skipped: Celery broker/result backend is "
                "unreachable (REDIS_URL=%s). Due dependencies stay due and "
                "will be retried on the next Beat cycle "
                "(CHECK_SCHEDULE_SECONDS=%s). No checks are executing.",
                sanitize_broker_url(settings.REDIS_URL),
                settings.CHECK_SCHEDULE_SECONDS,
            )
            return 0

        due_deps = await self.dep_repository.get_due_dependencies(session, limit=500)
        if not due_deps:
            logger.info("No due dependencies to dispatch")
            return 0
        # Batch circuit-breaker checks concurrently so 500 deps don't cost
        # 500×1.5 s when Redis is unreachable (fail-open wall < 2 s).
        try:
            breaker_raw = await asyncio.gather(
                *[circuit_breaker.should_dispatch(d.id) for d in due_deps],
                return_exceptions=True,
            )
        except Exception:  # pragma: no cover - gather itself should not raise
            breaker_raw = [True] * len(due_deps)
        breaker_allow: list[bool] = []
        for val in breaker_raw:
            if isinstance(val, Exception):
                logger.debug("Circuit breaker check failed fail-open: %s", val)
                breaker_allow.append(True)
            else:
                breaker_allow.append(bool(val))

        dispatched = 0
        skipped_circuit = 0
        skipped_inflight = 0
        dispatch_failures = 0
        broker_failed = False
        for dep, allow_dispatch in zip(due_deps, breaker_allow):
            if broker_failed:
                # Fail-fast: the broker died mid-cycle. Every remaining
                # dependency stays due for the next cycle.
                break
            regions = dep.regions or ["us-east", "eu-west"]
            # FIX 8 / Proof 5: respect circuit breaker before dispatch.
            if not allow_dispatch:
                logger.info(
                    "Skipping dispatch for dep %s: circuit open",
                    dep.id,
                )
                dep.next_check_at = now + timedelta(
                    seconds=dep.check_interval_seconds
                )
                skipped_circuit += 1
                continue

            # Duplicate-dispatch guard. The previous task for this dependency
            # was published but has not completed yet - a worker picked it up
            # and the probe is still running, or the task is still sitting in
            # the broker waiting to be consumed.
            #
            # Republishing anyway would run two concurrent probes against the
            # same target for the same interval. That is easy to hit when a
            # target is slow: a probe that takes longer than
            # CHECK_SCHEDULE_SECONDS would otherwise overlap itself on every
            # cycle, multiplying load on a dependency that is already
            # struggling. It cannot happen through a *dead* worker, because
            # schedule_due_checks is itself a worker task - a dead worker
            # schedules nothing at all.
            #
            # Leaving next_check_at untouched means the dependency is picked
            # up again as soon as the in-flight marker clears, so no probe is
            # silently forgiven.
            if await is_check_dispatched(dep.id):
                skipped_inflight += 1
                for region in regions:
                    checks_dispatch_skipped_total.labels(
                        region=region, reason="previous_task_in_flight"
                    ).inc()
                continue

            # Proof 4: only advance next_check_at after every region enqueued ok.
            dispatch_ok = True
            dispatched_for_dep = 0
            for region in regions:
                try:
                    from app.modules.checks.tasks import execute_check as execute_check_task

                    execute_check_task.delay(
                        str(dep.id),
                        region,
                        request_id=get_request_id(),
                        **task_context_kwargs(),
                    )
                    dispatched_for_dep += 1
                    checks_scheduled_total.labels(region=region).inc()
                    # Best-effort marker: this is what lets the state endpoint
                    # report "queued" instead of "never checked" while a task
                    # sits in the broker. A marker write failure must never
                    # affect the dispatch that just succeeded.
                    await record_check_dispatched(dep.id, region)
                except Exception as exc:
                    reason = type(exc).__name__
                    dispatch_failures += 1
                    checks_dispatch_failures_total.labels(
                        region=region, reason=reason
                    ).inc()
                    # Per-dependency marker so the diagnostic endpoint can tell
                    # "never probed" apart from "probed dispatch failed".
                    await record_dispatch_failure(
                        dep.id, region, reason, str(exc)
                    )
                    # Deliberately NOT logging exc_info with request context:
                    # only the exception type and its own message are safe.
                    logger.error(
                        "Failed to enqueue check for dep %s region %s: %s: %s - "
                        "next_check_at left due (%s) so the next Beat cycle "
                        "retries it; no CheckResult was written",
                        dep.id,
                        region,
                        reason,
                        str(exc)[:200],
                        dep.next_check_at.isoformat()
                        if dep.next_check_at
                        else "unset",
                    )
                    dispatch_ok = False
                    broker_failed = settings.CHECK_DISPATCH_FAIL_FAST
                    break
            if dispatch_ok:
                dep.next_check_at = now + timedelta(
                    seconds=dep.check_interval_seconds
                )
                dispatched += dispatched_for_dep
            else:
                # Enqueue failed mid-dep: dispatched_for_dep may be >0 (partial
                # dispatch). Count what was enqueued but keep next_check_at
                # due so the next beat retries promptly instead of losing the
                # check until the full interval passes.
                dispatched += dispatched_for_dep
        await session.flush()

        logger.info(
            "Dispatched %s checks across %s due dependencies "
            "(%s skipped by circuit breaker, %s skipped because a previous "
            "task is still in flight, %s dispatch failures)",
            dispatched,
            len(due_deps),
            skipped_circuit,
            skipped_inflight,
            dispatch_failures,
        )
        return dispatched

    async def trigger_manual_check(
        self,
        session: AsyncSession,
        dependency_id: uuid.UUID,
        org_id: uuid.UUID,
        region: str | None = None,
    ) -> dict[str, Any]:
        """Enqueue the production ``execute_check`` task on demand.

        A diagnostic, not a second scheduler: it publishes exactly the task
        Beat would publish, through the same broker, with the same SSRF policy
        applied by the worker. It never probes inline and never bypasses
        Celery, so "the manual trigger works" is proof the whole path works.

        ``next_check_at`` is deliberately left untouched - the Beat schedule
        stays the single authority on when a dependency is next probed.
        """
        from app.modules.checks.scheduler_health import (
            record_check_dispatched,
            record_dispatch_failure,
        )
        from app.modules.checks.tasks import execute_check as execute_check_task

        dep = await self.dep_repository.get_by_id(session, dependency_id)
        if not dep:
            raise ResourceNotFoundException("Dependency not found")
        if dep.org_id != org_id:
            logger.warning(
                "Cross-tenant manual check trigger dep=%s caller_org=%s",
                dependency_id,
                org_id,
            )
            raise ResourceNotFoundException("Dependency not found")
        if not dep.is_active:
            raise ValidationException(
                "Monitoring is paused for this dependency; resume it before "
                "triggering a check."
            )

        configured = dep.regions or ["us-east", "eu-west"]
        if region:
            if region not in configured:
                raise ValidationException(
                    f"Region '{region}' is not configured for this dependency.",
                    details={"configured_regions": configured},
                )
            regions = [region]
        else:
            regions = list(configured)

        queued: list[dict[str, Any]] = []
        for target_region in regions:
            try:
                # The on-demand trigger runs inside the API request, so the
                # worker joins the caller's trace: one id from click to probe.
                async_result = execute_check_task.delay(
                    str(dep.id),
                    target_region,
                    request_id=get_request_id(),
                    **task_context_kwargs(),
                )
            except Exception as exc:
                reason = type(exc).__name__
                checks_dispatch_failures_total.labels(
                    region=target_region, reason=reason
                ).inc()
                await record_dispatch_failure(
                    dep.id, target_region, reason, str(exc)
                )
                logger.error(
                    "Manual check trigger could not enqueue dep %s region %s: "
                    "%s: %s",
                    dep.id,
                    target_region,
                    reason,
                    str(exc)[:200],
                )
                # The broker URL stays in the server log above: it is internal
                # topology and has no place in a tenant-facing error body.
                raise ServiceUnavailableException(
                    "The check could not be queued: the Celery broker is "
                    "unavailable. No probe was executed. Verify Redis and the "
                    "Celery worker, then retry.",
                    details={"reason": reason},
                ) from exc
            checks_scheduled_total.labels(region=target_region).inc()
            await record_check_dispatched(dep.id, target_region)
            queued.append(
                {
                    "region": target_region,
                    "task_id": str(getattr(async_result, "id", "") or ""),
                    "state": getattr(async_result, "state", None),
                }
            )

        return {
            "dependency_id": str(dep.id),
            "queued": queued,
            "regions": regions,
            "note": (
                "Queued on the Celery broker. The worker applies the same SSRF "
                "policy as scheduled checks; next_check_at was not changed."
            ),
        }
