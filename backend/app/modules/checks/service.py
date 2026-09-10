import asyncio
import logging
import time
import urllib.parse
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.circuit_breaker import circuit_breaker
from app.core.exceptions import (
    ResourceNotFoundException,
    ServiceUnavailableException,
    ValidationException,
)
from app.core.metrics import (
    check_latency,
    checks_dispatch_failures_total,
    checks_dispatch_skipped_total,
    checks_scheduled_total,
    checks_total,
)
from app.core.ssrf_protection import (
    pinned_transport_for,
    resolve_pinned_target_async,
)
from app.modules.checks.constants import (
    BLOCKED_BY_SECURITY_POLICY_PREFIX,
    INFRASTRUCTURE_STATES,
    REDIRECT_BLOCKED_BY_SECURITY_POLICY_PREFIX,
    TARGET_STATES,
    TOO_MANY_REDIRECTS_PREFIX,
    CheckState,
)
from app.modules.checks.detection import (
    CheckOutcome,
    DetectionDecision,
    ObservationTopology,
    evaluate_detection,
    policy_from_settings,
)
from app.modules.checks.models import CheckResult
from app.modules.checks.repository import CheckRepository
from app.modules.checks.schemas import CheckResultResponse
from app.modules.dependencies.models import Dependency
from app.modules.dependencies.repository import DependencyRepository
from app.modules.dependencies.service import dependency_service

logger = logging.getLogger(__name__)

# FIX 2: module-level pooled HTTP client - one pool shared by every check
# instead of a fresh httpx.AsyncClient() (and fresh TCP/TLS handshakes) per
# probe. Used for IP-literal targets; hostname targets use the pinned
# transports from ssrf_protection (which keep their own pooled connections).
_http_client: httpx.AsyncClient | None = None

# Maximum redirect hops followed by a single check.
_MAX_REDIRECTS = 5


def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
            timeout=httpx.Timeout(30.0),
        )
    return _http_client


async def close_http_client() -> None:
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None


class CheckService:
    def __init__(
        self,
        repository: CheckRepository = CheckRepository(),
        dep_repository: DependencyRepository = DependencyRepository(),
    ) -> None:
        self.repository = repository
        self.dep_repository = dep_repository

    @staticmethod
    async def _enqueue_observation_outbox(
        session: AsyncSession,
        result: CheckResult,
        endpoint_url: str,
        method: str,
    ) -> None:
        """FIX 9: transactional outbox for the observation dual-write.

        The observation is written to ``observation_outbox`` in the SAME
        transaction as the check result. A separate Celery task
        (``app.modules.observations.tasks.process_outbox``) drains the outbox
        every 10s - the evidence stream can never silently lose events, and a
        failing observation write can never roll back the check result.
        """
        from app.modules.observations.models import OutboxEvent
        from app.modules.observations.schemas import ObservationCreateDTO

        error_type = None
        if result.error_message:
            error_type = (
                result.error_message.split(":", 1)[0]
                .strip()
                .lower()
                .replace(" ", "_")[:50]
            )
        dto = ObservationCreateDTO(
            timestamp=result.executed_at,
            source_type="customer_check",
            source_id=result.dependency_id,
            org_id=result.org_id,
            region=result.region,
            endpoint_url=endpoint_url,
            latency_ms=result.latency_ms,
            response_time_ms=result.latency_ms,
            status_code=result.status_code,
            error_type=error_type,
            error_message=result.error_message,
            metadata={
                "method": method,
                "is_up": result.is_up,
                "quorum_confirmed": result.quorum_confirmed,
                "check_result_id": str(result.id),
            },
        )
        event = OutboxEvent(
            event_type="observation_created",
            payload=dto.model_dump_json(),
            created_at=datetime.now(timezone.utc),
        )
        session.add(event)
        await session.flush()

    async def list_results_for_dependency(
        self,
        session: AsyncSession,
        dependency_id: uuid.UUID,
        limit: int = 50,
    ) -> list[CheckResultResponse]:
        results = await self.repository.list_for_dependency(
            session, dependency_id, limit=limit
        )
        return [CheckResultResponse.model_validate(r) for r in results]

    async def list_results_for_org(
        self, session: AsyncSession, org_id: uuid.UUID, limit: int = 50
    ) -> list[CheckResultResponse]:
        results = await self.repository.list_for_org(session, org_id, limit=limit)
        return [CheckResultResponse.model_validate(r) for r in results]

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
        from app.infrastructure.redis_client import safe_redis_ping
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

                    execute_check_task.delay(str(dep.id), region)
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

    async def _record_blocked_result(
        self,
        session: AsyncSession,
        dep_id: uuid.UUID,
        org_id: uuid.UUID,
        region: str,
        url: str,
        method: str,
        reason: str,
        result_id: uuid.UUID | None = None,
    ) -> CheckResult:
        result = await self.repository.create(
            session=session,
            dependency_id=dep_id,
            org_id=org_id,
            region=region,
            latency_ms=0.0,
            is_up=False,
            status_code=None,
            error_message=f"{BLOCKED_BY_SECURITY_POLICY_PREFIX}: {reason}",
            quorum_confirmed=False,
            result_id=result_id,
        )
        await self._enqueue_observation_outbox(session, result, url, method)
        return result

    async def execute_check(
        self,
        session: AsyncSession,
        dependency_id: uuid.UUID,
        region: str,
        result_id: uuid.UUID | None = None,
    ) -> CheckResult | None:
        dep = await self.dep_repository.get_by_id(session, dependency_id)
        if not dep or not dep.is_active:
            return None
        org_id = dep.org_id

        # Pipeline position: a worker is now running this probe. Cleared once a
        # result exists; TTL-bounded so a killed worker cannot leave the state
        # stuck on "executing". Best-effort - never affects the probe.
        from app.modules.checks.scheduler_health import (
            clear_check_dispatched,
            clear_check_executing,
            record_check_executing,
        )

        await record_check_executing(dependency_id, region)
        dep_dto = await dependency_service.get_dependency_config_internal(
            session, dependency_id, org_id=org_id
        )

        method = dep_dto.method
        url = dep_dto.endpoint_url
        headers = dep_dto.headers or {}
        timeout = float(dep_dto.timeout_seconds or 10.0)
        expected_codes = (
            dep_dto.expected_status_codes if dep_dto.expected_status_codes else [200]
        )

        latency_ms = 0.0
        status_code: int | None = None
        is_up = False
        error_message: str | None = None

        from app.modules.checks.http_probe import observe_http
        observed = await observe_http(url, method, headers, timeout, expected_codes, dependency_id)
        latency_ms, status_code, is_up, error_message = (
            observed.latency_ms, observed.status_code, observed.is_up, observed.error_message
        )
        if error_message and error_message.startswith(BLOCKED_BY_SECURITY_POLICY_PREFIX):
            result = await self._record_blocked_result(session, dependency_id, org_id, region, url, method, error_message.removeprefix(BLOCKED_BY_SECURITY_POLICY_PREFIX + ': '), result_id=result_id)
            await clear_check_executing(dependency_id)
            await clear_check_dispatched(dependency_id)
            return result

        result = await self.repository.create(
            session=session,
            dependency_id=dependency_id,
            org_id=org_id,
            region=region,
            latency_ms=latency_ms,
            is_up=is_up,
            status_code=status_code,
            error_message=error_message,
            quorum_confirmed=False,
            result_id=result_id,
        )

        # FIX 3: atomic detection. Lock the dependency row so concurrent
        # checks for the same dependency serialize here and cannot interleave
        # "read recent results" with "write confirmation / open incident".
        lock_stmt = (
            select(Dependency).where(Dependency.id == dependency_id).with_for_update()
        )
        await session.execute(lock_stmt)

        decision = await self._evaluate_detection(
            session=session,
            dependency_id=dependency_id,
            result=result,
            is_up=is_up,
            region=region,
        )

        # `quorum_confirmed` is the detector-confirmation flag on the row. Under
        # a single observation point it records "this failure cleared the
        # consecutive-failure rule"; under multi it records "N independent
        # points agreed". The column name predates the topology split; the
        # meaning is "the detector confirmed this result", never "a human
        # agreed".
        if decision.confirmed != result.quorum_confirmed:
            result.quorum_confirmed = decision.confirmed
            session.add(result)
            await session.flush()

        if decision.open_incident:
            from app.modules.incidents.service import incident_service

            await incident_service.check_and_create_incident(
                session=session,
                org_id=org_id,
                dependency_id=dependency_id,
                error_message=error_message or "Detector confirmed failure",
                detection=decision.as_metadata(),
                # The outage began with the first failure of the run, not with
                # the check that crossed the threshold.
                started_at=decision.run_started_at,
            )
        elif decision.resolve_incident:
            from app.modules.incidents.repository import IncidentRepository
            from app.modules.incidents.service import incident_service

            open_incident = await IncidentRepository.get_open_for_dependency(
                session, dependency_id
            )
            if open_incident:
                await incident_service.resolve_incident(
                    session=session,
                    incident_id=open_incident.id,
                    org_id=open_incident.org_id,
                    detection=decision.as_metadata(),
                )
        else:
            logger.info(
                "No incident transition for dep %s in %s: %s",
                dependency_id,
                region,
                decision.reason,
            )

        await self._enqueue_observation_outbox(session, result, url, method)

        # FIX 8: feed the circuit breaker so dead dependencies stop consuming
        # worker capacity (fails open when Redis is unavailable).
        if is_up:
            await circuit_breaker.record_success(dependency_id)
        else:
            await circuit_breaker.record_failure(dependency_id)

        # FIX 12: Prometheus instrumentation.
        checks_total.labels(region=region, status="up" if is_up else "down").inc()
        check_latency.labels(region=region).observe(latency_ms / 1000.0)

        await clear_check_executing(dependency_id)
        # The task has now been consumed and produced an outcome, so the
        # scheduler may dispatch this dependency again. Cleared here rather
        # than at task start so the marker covers the whole in-flight window.
        await clear_check_dispatched(dependency_id)
        return result


    async def _evaluate_detection(
        self,
        *,
        session: AsyncSession,
        dependency_id: uuid.UUID,
        result: CheckResult,
        is_up: bool,
        region: str,
    ) -> DetectionDecision:
        """Gather the facts and ask the pure policy what they mean.

        Two bounded reads, both on the same dependency and both inside the row
        lock taken by the caller:

        * ``history`` - the last N results, which is all a consecutive-run rule
          can ever need. Read regardless of elapsed time so a slow check
          interval can still confirm and still recover.
        * ``window`` - only for the multi-observation quorum, which is about
          agreement *at the same moment*, so it is bounded in time.

        The just-written result is excluded from both and passed separately as
        ``current``: it is already flushed, so it would otherwise be counted
        twice and every threshold would be off by one.
        """
        from app.modules.incidents.repository import IncidentRepository

        policy = policy_from_settings(settings)

        stored = await self.repository.list_for_dependency(
            session, dependency_id, limit=policy.history_limit()
        )
        history = [
            CheckOutcome(
                is_up=row.is_up,
                observation_point=row.region,
                executed_at=row.executed_at,
            )
            for row in reversed(stored)
            if row.id != result.id
        ]

        window = history
        if policy.topology is ObservationTopology.MULTI:
            recent = await self.repository.list_recent_for_dependency(
                session, dependency_id, window_seconds=policy.quorum_window_seconds
            )
            window = [
                CheckOutcome(
                    is_up=row.is_up,
                    observation_point=row.region,
                    executed_at=row.executed_at,
                )
                for row in reversed(recent)
                if row.id != result.id
            ]

        open_incident = await IncidentRepository.get_open_for_dependency(
            session, dependency_id
        )

        return evaluate_detection(
            policy=policy,
            current=CheckOutcome(
                is_up=is_up,
                observation_point=region,
                executed_at=result.executed_at,
            ),
            history=history,
            window=window,
            has_open_incident=open_incident is not None,
            now=datetime.now(timezone.utc),
        )

    # ── Diagnostics ─────────────────────────────────────────────────────────

    @staticmethod
    def classify_check_state(
        *,
        last_result: CheckResult | None,
        dispatch_failure: dict[str, Any] | None,
        markers: dict[str, Any] | None,
        pipeline_status: str,
        is_due: bool,
    ) -> tuple[CheckState, str]:
        """Decide where a dependency is in the check pipeline.

        Pure function of its inputs so the precedence rules are testable
        without Redis, a broker or a database.

        The ordering is deliberate. A dependency that has a result *and* a
        newer dispatch failure reports the dispatch failure, because that is
        the thing an operator has to act on. A queued or executing probe is
        reported ahead of "scheduler unavailable", because it proves the
        pipeline is in fact moving.
        """
        markers = markers or {}
        executing = markers.get("executing")
        dispatched = markers.get("dispatched")

        last_executed_at = getattr(last_result, "executed_at", None)

        def _failure_is_newer() -> bool:
            if not dispatch_failure:
                return False
            if last_executed_at is None:
                return True
            try:
                failed_at = datetime.fromisoformat(dispatch_failure.get("at", ""))
            except ValueError:
                return True
            if failed_at.tzinfo is None:
                failed_at = failed_at.replace(tzinfo=timezone.utc)
            return failed_at >= last_executed_at

        if _failure_is_newer():
            return CheckState.DISPATCH_FAILED, (
                "RELIASTRA could not publish this probe to the Celery broker "
                f"({dispatch_failure.get('reason', 'unknown')}). The dependency "
                "is still due and will be retried; no probe reached the target."
            )

        if last_result is not None:
            message = last_result.error_message or ""
            if message.startswith(
                (
                    BLOCKED_BY_SECURITY_POLICY_PREFIX,
                    REDIRECT_BLOCKED_BY_SECURITY_POLICY_PREFIX,
                )
            ):
                return CheckState.BLOCKED_BY_SECURITY_POLICY, (
                    "The probe was refused by RELIASTRA's SSRF policy, not by "
                    "the target. Loopback, private (RFC1918), link-local and "
                    "cloud-metadata addresses are never probed."
                )
            if last_result.is_up:
                return CheckState.SUCCESSFUL, (
                    f"Last probe succeeded ({last_result.latency_ms:.0f} ms)."
                )
            return CheckState.TARGET_FAILED, (
                f"Last probe reached the target and failed: {message or 'unknown error'}"
            )

        if executing:
            return CheckState.EXECUTING, (
                f"A worker is probing region {executing.get('region', 'unknown')} now."
            )

        if dispatched:
            return CheckState.QUEUED, (
                "A probe is queued on the broker waiting for a worker. A queue "
                "that never drains means no Celery worker is consuming."
            )

        if pipeline_status != "healthy":
            return CheckState.SCHEDULER_UNAVAILABLE, (
                "The check pipeline is not proven alive "
                f"(pipeline status: {pipeline_status}), so no probe could have "
                "run. Check Celery Beat, the Celery worker and Redis."
            )

        if is_due:
            return CheckState.AWAITING_SCHEDULE, (
                "The dependency is due and the scheduler is healthy; the probe "
                "goes out on the next Beat cycle."
            )

        return CheckState.NEVER_CHECKED, "No probe has run for this dependency yet."

    async def get_check_state(
        self,
        session: AsyncSession,
        dependency_id: uuid.UUID,
        org_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Assemble the diagnostic view for one dependency.

        Answers the question an empty dashboard cannot: is the target down, or
        did RELIASTRA never get a probe out?
        """
        from app.modules.checks.scheduler_health import (
            read_check_markers,
            read_dispatch_failure,
            read_pipeline_health,
        )

        dep = await self.dep_repository.get_by_id(session, dependency_id)
        if not dep:
            raise ResourceNotFoundException("Dependency not found")
        if dep.org_id != org_id:
            # Same cross-tenant rule the rest of the module uses: do not
            # confirm existence of another organization's dependency.
            logger.warning(
                "Cross-tenant check-state request dep=%s caller_org=%s",
                dependency_id,
                org_id,
            )
            raise ResourceNotFoundException("Dependency not found")

        recent = await self.repository.list_for_dependency(
            session, dependency_id, limit=1
        )
        last_result = recent[0] if recent else None

        pipeline = await read_pipeline_health()
        dispatch_failure = await read_dispatch_failure(dependency_id)
        markers = await read_check_markers(dependency_id)
        now = datetime.now(timezone.utc)
        is_due = bool(dep.next_check_at and dep.next_check_at <= now)

        state, detail = self.classify_check_state(
            last_result=last_result,
            dispatch_failure=dispatch_failure,
            markers=markers,
            pipeline_status=pipeline["status"],
            is_due=is_due,
        )

        success_at, failure_at = (await session.execute(select(
            func.max(case((CheckResult.is_up.is_(True), CheckResult.executed_at))),
            func.max(case((CheckResult.is_up.is_(False), CheckResult.executed_at))),
        ).where(CheckResult.dependency_id == dependency_id, CheckResult.org_id == org_id))).one()
        return {
            "is_stale": bool(last_result and (now - last_result.executed_at).total_seconds() > max(90, dep.check_interval_seconds * 3)),
            "last_success_at": success_at,
            "last_failure_at": failure_at,
            "dependency_id": str(dependency_id),
            "state": state.value,
            "detail": detail,
            "is_target_problem": state in TARGET_STATES,
            "is_infrastructure_problem": state in INFRASTRUCTURE_STATES,
            "is_active": dep.is_active,
            "next_check_at": dep.next_check_at.isoformat() if dep.next_check_at else None,
            "is_due": is_due,
            "check_interval_seconds": dep.check_interval_seconds,
            "regions": dep.regions or [],
            "last_result": (
                {
                    "executed_at": last_result.executed_at.isoformat(),
                    "region": last_result.region,
                    "is_up": last_result.is_up,
                    "latency_ms": last_result.latency_ms,
                    "status_code": last_result.status_code,
                    "error_message": last_result.error_message,
                }
                if last_result
                else None
            ),
            "last_dispatch_failure": dispatch_failure,
            "queued": markers.get("dispatched"),
            "executing": markers.get("executing"),
            "pipeline": {
                "status": pipeline["status"],
                "scheduler": pipeline["scheduler"]["status"],
                "worker": pipeline["worker"]["status"],
                "broker": pipeline["broker"]["status"],
            },
        }

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
                async_result = execute_check_task.delay(str(dep.id), target_region)
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


check_service = CheckService()
