"""Executing one probe (the "how" a dependency gets checked).

``ProbeRunner.execute`` is what the ``execute_check`` Celery task runs. One
call walks the full pipeline for a single dep/region pair:

1. load the dependency's probe config,
2. observe the target over HTTP (``http_probe.observe_http``),
3. record exactly one result row (``results.py``),
4. evaluate detection under a row lock (``detection.py`` is the pure rule;
   the gathering lives here),
5. open or resolve an incident, fan out to the evidence outbox,
6. feed the circuit breaker and Prometheus, clear the pipeline markers.

Steps 4–6 never run for a probe the SSRF policy refused: a blocked probe
records its failure and returns before any detection, incident or metric
code can mistake "we refused to probe" for "the target is down".
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.checks.constants import BLOCKED_BY_SECURITY_POLICY_PREFIX
from app.modules.checks.detection import (
    CheckOutcome,
    DetectionDecision,
    ObservationTopology,
    evaluate_detection,
    policy_from_settings,
)
from app.modules.checks.models import CheckResult
from app.modules.checks.repository import CheckRepository
from app.modules.checks.results import enqueue_observation_outbox, record_blocked_result
from app.modules.dependencies.models import Dependency
from app.modules.dependencies.repository import DependencyRepository
from app.modules.dependencies.service import dependency_service
from app.platform.observability.metrics import check_latency, checks_total
from app.platform.resilience.circuit_breaker import circuit_breaker

logger = logging.getLogger(__name__)


class ProbeRunner:
    """Runs probes. Publishes nothing — ``dispatch.py`` owns the broker."""

    def __init__(
        self,
        repository: CheckRepository = CheckRepository(),
        dep_repository: DependencyRepository = DependencyRepository(),
    ) -> None:
        self.repository = repository
        self.dep_repository = dep_repository

    async def execute(
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
            result = await record_blocked_result(session, self.repository, dependency_id, org_id, region, url, method, error_message.removeprefix(BLOCKED_BY_SECURITY_POLICY_PREFIX + ': '), result_id=result_id)
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

        await enqueue_observation_outbox(session, result, url, method)

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
