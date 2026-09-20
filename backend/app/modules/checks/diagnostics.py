"""Answering "is the target down, or did we never get a probe out?".

An empty check history is ambiguous on its own: it looks the same whether
the vendor has been perfectly quiet or the scheduler, broker and worker are
all dead. ``get_check_state`` assembles the queryable fact, and the pure
``classify_check_state`` holds the precedence rules so they stay testable
without Redis, a broker or a database.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.platform.web.errors import ResourceNotFoundException
from app.modules.checks.constants import (
    BLOCKED_BY_SECURITY_POLICY_PREFIX,
    INFRASTRUCTURE_STATES,
    REDIRECT_BLOCKED_BY_SECURITY_POLICY_PREFIX,
    TARGET_STATES,
    CheckState,
)
from app.modules.checks.models import CheckResult
from app.modules.checks.repository import CheckRepository
from app.modules.dependencies.repository import DependencyRepository

logger = logging.getLogger(__name__)


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


class CheckDiagnostics:
    """The state endpoint's read model. Probes nothing, publishes nothing."""

    def __init__(
        self,
        repository: CheckRepository = CheckRepository(),
        dep_repository: DependencyRepository = DependencyRepository(),
    ) -> None:
        self.repository = repository
        self.dep_repository = dep_repository

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

        state, detail = classify_check_state(
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
