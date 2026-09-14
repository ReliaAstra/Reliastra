"""Rebase the traffic counters so the numbers mean what they now claim.

Internal-traffic exclusions are applied at recording time, which means the
counters that already exist still contain whatever was recorded before the
filter was switched on. There is no honest way to subtract it afterwards -
`an:pv:total` cannot tell one visitor's refresh from another's - so the only
correct repair is to zero the traffic series and start counting clean.

What this touches, and what it refuses to:

    an:pv:*        page views (daily + total + excluded)   -> cleared
    an:uv:*        unique-visitor HyperLogLogs             -> cleared
    an:country:*   per-country view counts                 -> cleared
    an:geo:*       country cache per visitor                -> kept (a cache,
                   not a statistic; clearing it costs lookups)
    an:co:*        the checkout funnel                      -> kept. Those are
                   real organizations with real email addresses; they are sales
                   data, not traffic, and this script must never be able to
                   destroy them.

Dry run by default. Requires --apply to write anything.

    cd backend
    python -m scripts.reset_traffic_counters            # inspect
    python -m scripts.reset_traffic_counters --apply     # rebase
"""
from __future__ import annotations

import argparse
import asyncio
import sys

_TRAFFIC_PATTERNS = ("an:pv:*", "an:uv:*", "an:country:*")
_PROTECTED_PATTERNS = ("an:co:*", "an:geo:*")


async def _scan(redis, pattern: str) -> list[str]:
    keys: list[str] = []
    async for key in redis.scan_iter(match=pattern, count=1000):
        keys.append(key if isinstance(key, str) else key.decode())
    return keys


async def run(apply: bool) -> int:
    try:
        import redis.asyncio as aioredis

        from app.config import settings
    except Exception as exc:  # pragma: no cover - operator environment problem
        print(f"cannot import backend settings/redis: {exc}", file=sys.stderr)
        return 2

    redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        targets = sorted(await _scan(redis, "an:*"))
    except Exception as exc:
        print(f"redis unreachable: {exc}", file=sys.stderr)
        return 2

    traffic: list[str] = []
    for pattern in _TRAFFIC_PATTERNS:
        traffic.extend(await _scan(redis, pattern))
    traffic = sorted(set(traffic))

    protected = 0
    for pattern in _PROTECTED_PATTERNS:
        protected += len(await _scan(redis, pattern))

    print(f"{len(targets)} keys under the analytics namespace, {protected} protected keys left alone")
    if not traffic:
        print("nothing to clear - the traffic counters are already empty.")
        await redis.aclose()
        return 0

    for key in traffic[:20]:
        value = await redis.get(key) if (await redis.type(key)) == "string" else None
        suffix = f"  = {value}" if value is not None else ""
        print(f"  will clear {key}{suffix}")
    if len(traffic) > 20:
        print(f"  … and {len(traffic) - 20} more")

    if not apply:
        print("\ndry run: nothing deleted. Re-run with --apply to rebase the counters.")
        await redis.aclose()
        return 0

    deleted = await redis.delete(*traffic)
    print(f"\ncleared {deleted} keys. Pageviews now start from zero, exclusions from here on included.")
    await redis.aclose()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--apply",
        action="store_true",
        help="actually delete; without this flag the script only reports",
    )
    args = parser.parse_args()
    return asyncio.run(run(apply=args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
