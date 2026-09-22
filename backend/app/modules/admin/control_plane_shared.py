"""Shared helpers for the admin control plane.

Small, stateless, used by several rooms: the clock, the period table,
and the tolerant row counters. Tolerant matters: an overview must
degrade, not 500, when one table is unavailable.
"""

from __future__ import annotations

from datetime import datetime, timezone
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


PERIOD_DAYS = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "365d": 365,
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def count_rows(session: AsyncSession, model) -> int:
    return int(
        (await session.execute(select(func.count()).select_from(model))).scalar()
        or 0
    )

async def count_rows_where(session: AsyncSession, model, *conditions) -> int:
    q = select(func.count()).select_from(model)
    for c in conditions:
        q = q.where(c)
    return int((await session.execute(q)).scalar() or 0)

async def count_checks_since(session: AsyncSession, since: datetime) -> int:
    try:
        from app.modules.checks.models import CheckResult

        return int(
            (
                await session.execute(
                    select(func.count())
                    .select_from(CheckResult)
                    .where(CheckResult.executed_at >= since)
                )
            ).scalar()
            or 0
        )
    except Exception:
        return 0
