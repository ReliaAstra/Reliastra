"""Partner analytics: attribution aggregation, funnel, time series.

All queries are per-partner, privacy-preserving, and operate on
existing tables without new columns:

- Acquisition source: derived by joining partner_referrals.user → acquisition_first_touch
- Partner attribution: the referral itself (partner_id link)
- Time series: referrals by created_at day/week
- Funnel: referral status distribution

No per-visitor browsing history is exposed; only aggregate counts
and per-referral channel labels.
"""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.acquisition.models import AcquisitionFirstTouch
from app.modules.partners.models import PartnerReferral


# Canonical channel labels for display – matches acquisition.service.classify output
_CHANNEL_LABELS: dict[str, str] = {
    "campaign": "Campaign",
    "organic_search": "Organic Search",
    "referral": "Referral",
    "direct": "Direct",
    "youtube": "YouTube",
    "google": "Google",
    "reddit": "Reddit",
}

# Map common UTM source values to display-friendly buckets
_SOURCE_BUCKETS: dict[str, str] = {
    "youtube": "YouTube",
    "youtu.be": "YouTube",
    "google": "Google",
    "bing": "Search",
    "duckduckgo": "Search",
    "reddit": "Reddit",
    "twitter": "Twitter",
    "x.com": "Twitter",
    "linkedin": "LinkedIn",
    "facebook": "Facebook",
    "instagram": "Instagram",
    "tiktok": "TikTok",
    "direct": "Direct",
}


def _bucket_source(row: AcquisitionFirstTouch | None) -> str:
    """Map a stored acquisition row to a partner-facing bucket name."""
    if row is None:
        return "Direct"
    # Prefer campaign source → channel mapping
    raw_source = (row.source or "").lower().strip()
    if raw_source in _SOURCE_BUCKETS:
        return _SOURCE_BUCKETS[raw_source]
    # Youtube often arrives as source=youtube or referrer_host=youtube
    channel = (row.channel or "").lower()
    if channel == "campaign" and raw_source:
        # Title-case the raw source for unknown campaign sources
        return raw_source[:24].title() if len(raw_source) <= 24 else raw_source[:24]
    if channel == "organic_search":
        return "Organic Search"
    if channel == "referral":
        host = (row.referrer_host or "").lower()
        if "youtube" in host or "youtu.be" in host:
            return "YouTube"
        if "google" in host:
            return "Google"
        if "reddit" in host:
            return "Reddit"
        return "Referral"
    if channel == "direct":
        return "Direct"
    return _CHANNEL_LABELS.get(channel, channel.title() if channel else "Direct")


async def attribution_breakdown(
    session: AsyncSession, partner_id: uuid.UUID
) -> list[dict[str, Any]]:
    """Aggregate acquisition buckets for all referrals of one partner."""
    referrals = (
        await session.execute(
            select(PartnerReferral).where(PartnerReferral.partner_id == partner_id)
        )
    ).scalars().all()

    if not referrals:
        return []

    user_ids = [r.referred_user_id for r in referrals]
    rows = (
        await session.execute(
            select(AcquisitionFirstTouch).where(
                AcquisitionFirstTouch.user_id.in_(user_ids)
            )
        )
    ).scalars().all()
    by_user: dict[uuid.UUID, AcquisitionFirstTouch] = {r.user_id: r for r in rows}

    buckets: list[str] = []
    for r in referrals:
        buckets.append(_bucket_source(by_user.get(r.referred_user_id)))

    counter = Counter(buckets)
    total = len(buckets)
    result: list[dict[str, Any]] = []
    for bucket, count in counter.most_common():
        pct = round((count / total) * 100, 1) if total else 0
        result.append({"bucket": bucket, "count": count, "pct": pct})
    return result


async def time_series(
    session: AsyncSession, partner_id: uuid.UUID, days: int = 30
) -> list[dict[str, Any]]:
    """Daily signup counts for the last N days (inclusive today)."""
    since = datetime.now(timezone.utc) - timedelta(days=days - 1)
    since = since.replace(hour=0, minute=0, second=0, microsecond=0)

    referrals = (
        await session.execute(
            select(PartnerReferral).where(
                PartnerReferral.partner_id == partner_id,
                PartnerReferral.created_at >= since,
            )
        )
    ).scalars().all()

    # Bucket by date string YYYY-MM-DD
    counts: Counter[str] = Counter()
    for r in referrals:
        # Ensure UTC date
        ts = r.created_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        else:
            ts = ts.astimezone(timezone.utc)
        counts[ts.strftime("%Y-%m-%d")] += 1

    series: list[dict[str, Any]] = []
    for i in range(days):
        d = (since + timedelta(days=i)).strftime("%Y-%m-%d")
        series.append({"date": d, "signups": counts.get(d, 0)})
    return series


async def funnel(
    session: AsyncSession, partner_id: uuid.UUID
) -> list[dict[str, Any]]:
    """Count referrals per lifecycle status."""
    rows = (
        await session.execute(
            select(PartnerReferral.status, func.count())
            .where(PartnerReferral.partner_id == partner_id)
            .group_by(PartnerReferral.status)
        )
    ).all()
    mapping = {status: int(cnt) for status, cnt in rows}
    ordered = ["signed_up", "paid", "churned", "referred"]
    result: list[dict[str, Any]] = []
    for s in ordered:
        if s in mapping:
            result.append({"status": s, "count": mapping[s]})
    # Include any unexpected statuses as trailing entries
    for s, cnt in mapping.items():
        if s not in ordered:
            result.append({"status": s, "count": cnt})
    return result


async def top_campaigns(
    session: AsyncSession, partner_id: uuid.UUID, limit: int = 5
) -> list[dict[str, Any]]:
    """Top campaign names among referred users."""
    referrals = (
        await session.execute(
            select(PartnerReferral).where(PartnerReferral.partner_id == partner_id)
        )
    ).scalars().all()
    if not referrals:
        return []
    user_ids = [r.referred_user_id for r in referrals]
    rows = (
        await session.execute(
            select(AcquisitionFirstTouch).where(
                AcquisitionFirstTouch.user_id.in_(user_ids),
                AcquisitionFirstTouch.campaign.is_not(None),
            )
        )
    ).scalars().all()
    campaigns = [r.campaign for r in rows if r.campaign]
    counter = Counter(campaigns)
    return [
        {"campaign": camp, "count": cnt}
        for camp, cnt in counter.most_common(limit)
    ]
