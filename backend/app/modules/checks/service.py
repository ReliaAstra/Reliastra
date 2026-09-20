"""Front door of the checks module.

``CheckService`` is the module's stable public API — the router, the Celery
tasks and neighboring modules talk to it, and its method signatures are the
contract. It holds no pipeline logic itself; it wires the rooms behind the
door:

* ``dispatch.py`` (``CheckDispatcher``) — publishing probes: Beat scheduling
  and manual triggers.
* ``probe.py`` (``ProbeRunner``) — executing one probe: observe, record,
  detect, open/resolve incidents, feed the breaker and metrics.
* ``results.py`` — recording result rows (paired with their evidence-outbox
  events) and serving result reads.
* ``diagnostics.py`` (``CheckDiagnostics``) — the state endpoint's read
  model plus the pure ``classify_check_state`` precedence rules.
* ``http_probe.py`` — the single bounded, DNS-pinned HTTP execution path.
* ``detection.py`` — the pure "is this an incident?" policy.
* ``scheduler_health.py`` — heartbeats, in-flight markers, pipeline reads.

There is deliberately no shared HTTP pool here: every probe hop runs on its
own SSRF-pinned transport (see ``http_probe``), and one pooled client cannot
serve transports pinned to different targets. Each hop builds a fresh client
from the shared factory, which is what also gives probes trace propagation.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.checks.diagnostics import CheckDiagnostics, classify_check_state
from app.modules.checks.dispatch import CheckDispatcher
from app.modules.checks.models import CheckResult
from app.modules.checks.probe import ProbeRunner
from app.modules.checks.repository import CheckRepository
from app.modules.checks.results import (
    enqueue_observation_outbox,
    list_results_for_dependency,
    list_results_for_org,
)
from app.modules.checks.schemas import CheckResultResponse
from app.modules.dependencies.repository import DependencyRepository


class CheckService:
    """Stable façade over the check pipeline's focused collaborators."""

    #: Pure precedence rules, callable as ``CheckService.classify_check_state``.
    classify_check_state = staticmethod(classify_check_state)

    def __init__(
        self,
        repository: CheckRepository = CheckRepository(),
        dep_repository: DependencyRepository = DependencyRepository(),
    ) -> None:
        self.repository = repository
        self.dep_repository = dep_repository
        self.dispatcher = CheckDispatcher(dep_repository)
        self.runner = ProbeRunner(repository, dep_repository)
        self.diagnostics = CheckDiagnostics(repository, dep_repository)

    async def schedule_due_checks(self, session: AsyncSession) -> int:
        """Beat tick: publish one task per due dep/region pair."""
        return await self.dispatcher.schedule_due_checks(session)

    async def trigger_manual_check(
        self,
        session: AsyncSession,
        dependency_id: uuid.UUID,
        org_id: uuid.UUID,
        region: str | None = None,
    ) -> dict[str, Any]:
        """On-demand diagnostic: publish exactly what Beat would publish."""
        return await self.dispatcher.trigger_manual_check(
            session, dependency_id, org_id, region
        )

    async def execute_check(
        self,
        session: AsyncSession,
        dependency_id: uuid.UUID,
        region: str,
        result_id: uuid.UUID | None = None,
    ) -> CheckResult | None:
        """Run one probe end to end: observe, record, detect, fan out."""
        return await self.runner.execute(session, dependency_id, region, result_id)

    async def get_check_state(
        self,
        session: AsyncSession,
        dependency_id: uuid.UUID,
        org_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Assemble the diagnostic view for one dependency."""
        return await self.diagnostics.get_check_state(session, dependency_id, org_id)

    async def list_results_for_dependency(
        self,
        session: AsyncSession,
        dependency_id: uuid.UUID,
        limit: int = 50,
    ) -> list[CheckResultResponse]:
        return await list_results_for_dependency(
            session, self.repository, dependency_id, limit=limit
        )

    async def list_results_for_org(
        self, session: AsyncSession, org_id: uuid.UUID, limit: int = 50
    ) -> list[CheckResultResponse]:
        return await list_results_for_org(session, self.repository, org_id, limit=limit)

    @staticmethod
    async def _enqueue_observation_outbox(
        session: AsyncSession,
        result: CheckResult,
        endpoint_url: str,
        method: str,
    ) -> None:
        """FIX 9: observation outbox row in the result's own transaction."""
        await enqueue_observation_outbox(session, result, endpoint_url, method)


check_service = CheckService()
