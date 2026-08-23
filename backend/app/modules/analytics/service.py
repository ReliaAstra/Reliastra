"""Traffic + funnel analytics for the admin control plane.

Storage: Redis with AOF persistence (supervisord runs redis-server
--appendonly yes), so counters survive restarts without a schema migration.

Keys:
  an:uv:{day}          HyperLogLog of unique visitor hashes per UTC day
  an:uv:total          HyperLogLog, all-time unique visitors
  an:pv:{day} / total  page-view counters
  an:country:{day}     HASH country -> views (daily)
  an:country:total     HASH country -> views (all-time)
  an:co:start:{org}    HASH checkout lead: email, plan, amount_minor,
                       reference, user_id, started_at
  an:co:open           SET of org ids with an unresolved checkout start
  an:co:n:{started|converted}:{day|total}   funnel counters

The checkout funnel is the sales tool: every initialize_payment records a
lead (org id + email + plan + amount); successful verification converts it.
Whatever remains in ``an:co:open`` is an abandoned checkout with a reachable
email address.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from app.infrastructure.redis_client import (
    get_redis,
    safe_redis_get,
)

logger = logging.getLogger(__name__)

_DAY_TTL_SECONDS = 90 * 24 * 3600


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def _day_key(offset_days: int = 0) -> str:
    day = datetime.now(timezone.utc) - timedelta(days=offset_days)
    return day.strftime("%Y%m%d")


class AnalyticsService:
    # ── Recording ────────────────────────────────────────────────────────

    async def record_visit(
        self,
        visitor_hash: str,
        country: str,
        path: str | None = None,
    ) -> None:
        """Count one pageview + unique visitor + country attribution."""
        try:
            from app.infrastructure.redis_client import get_redis as _g

            redis = _g()
        except Exception:
            logger.debug("analytics: redis unavailable, visit dropped")
            return

        day = _today()
        try:
            pipe = redis.pipeline(transaction=False)
            pipe.pfadd(f"an:uv:{day}", visitor_hash)
            pipe.pfadd("an:uv:total", visitor_hash)
            pipe.incr(f"an:pv:{day}")
            pipe.incr("an:pv:total")
            pipe.expire(f"an:uv:{day}", _DAY_TTL_SECONDS)
            pipe.expire(f"an:pv:{day}", _DAY_TTL_SECONDS)
            pipe.hincrby(f"an:country:{day}", country, 1)
            pipe.hincrby("an:country:total", country, 1)
            pipe.expire(f"an:country:{day}", _DAY_TTL_SECONDS)
            await pipe.execute()
        except Exception:
            logger.debug("analytics: visit pipeline failed", exc_info=True)

    async def record_checkout_started(
        self,
        org_id: str,
        *,
        email: str,
        plan: str,
        amount_minor: int,
        reference: str,
        user_id: str | None = None,
    ) -> None:
        """A potential customer reached Paystack checkout. Sales gold."""
        try:
            redis = get_redis()
        except Exception:
            return
        now = datetime.now(timezone.utc).isoformat()
        day = _today()
        try:
            pipe = redis.pipeline(transaction=False)
            pipe.hset(
                f"an:co:start:{org_id}",
                mapping={
                    "email": email,
                    "plan": plan,
                    "amount_minor": str(amount_minor),
                    "reference": reference,
                    "user_id": user_id or "",
                    "started_at": now,
                },
            )
            pipe.sadd("an:co:open", org_id)
            pipe.incr("an:co:started:total")
            pipe.incr(f"an:co:started:{day}")
            pipe.expire(f"an:co:started:{day}", _DAY_TTL_SECONDS)
            await pipe.execute()
        except Exception:
            logger.debug("analytics: checkout-start recording failed", exc_info=True)

    async def record_checkout_converted(self, org_id: str) -> None:
        """Payment verified - remove the lead from the abandoned pool."""
        try:
            redis = get_redis()
        except Exception:
            return
        day = _today()
        try:
            was_open = await redis.srem("an:co:open", org_id)
            if not was_open:
                return  # webhook + verify double-fire; count once
            pipe = redis.pipeline(transaction=False)
            pipe.incr("an:co:converted:total")
            pipe.incr(f"an:co:converted:{day}")
            pipe.expire(f"an:co:converted:{day}", _DAY_TTL_SECONDS)
            pipe.delete(f"an:co:start:{org_id}")
            await pipe.execute()
        except Exception:
            logger.debug("analytics: conversion recording failed", exc_info=True)

    # ── Reporting ────────────────────────────────────────────────────────

    @staticmethod
    async def _pfcount(redis, key: str) -> int:
        try:
            return int(await redis.pfcount(key))
        except Exception:
            return 0

    async def overview(self, days: int = 14) -> dict[str, Any]:
        """Everything the admin traffic panel renders, in one call."""
        from sqlalchemy import func, select

        try:
            redis = get_redis()
        except Exception:
            redis = None

        series: list[dict[str, Any]] = []
        countries_daily: dict[str, int] = {}
        if redis is not None:
            for offset in range(days - 1, -1, -1):
                day_key = _day_key(offset)
                date_iso = (
                    (datetime.now(timezone.utc) - timedelta(days=offset))
                    .date()
                    .isoformat()
                )
                uv = await self._pfcount(redis, f"an:uv:{day_key}")
                pv_raw = await safe_redis_get(f"an:pv:{day_key}")
                co_raw = await safe_redis_get(f"an:co:started:{day_key}")
                cv_raw = await safe_redis_get(f"an:co:converted:{day_key}")
                su_raw = None  # filled from DB below
                series.append(
                    {
                        "date": date_iso,
                        "visitors": uv,
                        "pageviews": int(pv_raw or 0),
                        "checkouts_started": int(co_raw or 0),
                        "checkouts_converted": int(cv_raw or 0),
                        "signups": su_raw,
                    }
                )

            try:
                raw_countries = await redis.hgetall("an:country:total")
                countries_daily = {k: int(v) for k, v in (raw_countries or {}).items()}
            except Exception:
                countries_daily = {}

        uv_total = await self._pfcount(redis, "an:uv:total") if redis else 0
        pv_total = int(await safe_redis_get("an:pv:total") or 0)
        started_total = int(await safe_redis_get("an:co:started:total") or 0)
        converted_total = int(await safe_redis_get("an:co:converted:total") or 0)

        # Signups come from the database - the real source of truth.
        from app.db.session import get_session_maker
        from app.modules.users.models import User

        signup_total = 0
        signup_series: dict[str, int] = {}
        new_signups_7d = 0
        try:
            session_maker = get_session_maker()

            async def _query():
                async with session_maker() as session:
                    since = datetime.now(timezone.utc) - timedelta(days=days)
                    total_res = await session.execute(select(func.count(User.id)))
                    rows = await session.execute(
                        select(
                            func.date_trunc("day", User.created_at).label("day"),
                            func.count(User.id),
                        )
                        .where(User.created_at >= since)
                        .group_by("day")
                        .order_by("day")
                    )
                    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
                    week_res = await session.execute(
                        select(func.count(User.id)).where(User.created_at >= week_ago)
                    )
                    return (
                        int(total_res.scalar() or 0),
                        {r[0].date().isoformat(): int(r[1]) for r in rows},
                        int(week_res.scalar() or 0),
                    )

            signup_total, signup_series, new_signups_7d = await _query()
        except Exception:
            logger.debug("analytics: signup query failed", exc_info=True)

        for point in series:
            point["signups"] = signup_series.get(point["date"], 0)

        abandoned_leads = await self.abandoned_checkouts()

        def rate(part: float, whole: float) -> float:
            return round((part / whole) * 100, 2) if whole else 0.0

        today_uv = await self._pfcount(redis, f"an:uv:{_today()}") if redis else 0
        top_countries = sorted(
            (
                {"country": code, "views": count}
                for code, count in countries_daily.items()
            ),
            key=lambda item: item["views"],
            reverse=True,
        )[:10]

        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "window_days": days,
            "visitors": {
                "unique_total": uv_total,
                "unique_today": today_uv,
                "pageviews_total": pv_total,
            },
            "signups": {
                "total": signup_total,
                "last_7d": new_signups_7d,
                "conversion_rate": rate(signup_total, uv_total),
            },
            "checkout": {
                "started_total": started_total,
                "converted_total": converted_total,
                "abandoned_total": max(0, started_total - converted_total),
                "start_rate_from_signups": rate(started_total, signup_total),
                "abandonment_rate": rate(
                    max(0, started_total - converted_total), started_total
                ),
                "abandoned_leads": abandoned_leads,
            },
            "countries_top": top_countries,
            "series": series,
        }

    async def abandoned_checkouts(self, limit: int = 200) -> list[dict[str, Any]]:
        """Leads that reached checkout but never paid - with contact info."""
        try:
            redis = get_redis()
        except Exception:
            return []
        try:
            open_ids = list(await redis.smembers("an:co:open") or [])[:limit]
            leads: list[dict[str, Any]] = []
            for org_id in open_ids:
                data = await redis.hgetall(f"an:co:start:{org_id}")
                if not data:
                    continue
                leads.append(
                    {
                        "org_id": org_id,
                        "email": data.get("email", ""),
                        "plan": data.get("plan", ""),
                        "amount_minor": int(data.get("amount_minor") or 0),
                        "reference": data.get("reference", ""),
                        "user_id": data.get("user_id") or None,
                        "started_at": data.get("started_at", ""),
                    }
                )
            leads.sort(key=lambda item: item.get("started_at") or "", reverse=True)
            return leads
        except Exception:
            logger.debug("analytics: abandoned lookup failed", exc_info=True)
            return []


analytics_service = AnalyticsService()
