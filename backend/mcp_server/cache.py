"""Bounded TTL cache for **public** observatory data only.

Freshness contract, stated plainly because an agent has to reason about it:

* Only unauthenticated GETs of public observatory endpoints are cached. The
  authenticated surface has no access to this object at all — see
  ``upstream.ReliastraClient``, where ``get_authed``/``post_authed`` never touch
  the cache. Caching tenant data would risk serving one organisation's record to
  another, so the separation is structural rather than a naming convention.
* The TTL defaults to 60s, which matches the Reliastra API's own Redis cache TTL
  for these endpoints (``_PUBLIC_VENDORS_CACHE_TTL`` and ``_SEARCH_CACHE_TTL`` in
  ``app/modules/vendors/router.py`` and ``app/modules/incidents/public_router.py``).
  Caching longer would make this server staler than its source; caching shorter
  buys nothing.
* Every hit is reported in the envelope as ``cached: true`` with the age in
  seconds and ``fresh_until``, so a caller can tell a live read from a recent
  one. Nothing is ever served silently stale: an expired entry is discarded, and
  a failed refresh is an error, not a fallback to the old value.
* The cache is process-local and bounded. A fleet therefore has one copy per
  instance, which is correct for public data and is why no shared store is
  introduced here.
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any

from .observability import METRICS


@dataclass(frozen=True)
class CacheEntry:
    value: Any
    stored_at: float

    def age_s(self, now: float) -> float:
        return max(0.0, now - self.stored_at)

    def freshness(self, ttl_s: float, now: float) -> dict[str, Any]:
        """What an envelope reports about a cached read."""
        return {
            "cached": True,
            "age_s": round(self.age_s(now), 1),
            "ttl_s": ttl_s,
            "fresh_until": self.stored_at + ttl_s,
        }


class PublicCache:
    """Thread-safe, LRU-bounded TTL cache. Keys are plain strings.

    ``ttl_s == 0`` disables caching entirely, which is what tests and any
    deployment that wants strictly live reads should use.
    """

    def __init__(self, ttl_s: float, max_entries: int) -> None:
        self._ttl_s = float(ttl_s)
        self._max_entries = int(max_entries)
        self._entries: OrderedDict[str, CacheEntry] = OrderedDict()
        self._lock = threading.Lock()

    @property
    def ttl_s(self) -> float:
        return self._ttl_s

    @property
    def enabled(self) -> bool:
        return self._ttl_s > 0

    @staticmethod
    def make_key(path: str, params: dict[str, Any] | None) -> str:
        """Stable key. Only public paths may be cached; this asserts it.

        An authenticated path reaching this function is a programming error that
        would leak tenant data across callers, so it is refused loudly rather
        than cached quietly.
        """
        if not path.startswith(("/v1/vendors", "/v1/public/", "/v1/verify", "/v1/pricing")):
            raise ValueError(f"refusing to cache non-public path: {path}")
        ordered = sorted((params or {}).items(), key=lambda kv: str(kv[0]))
        query = "&".join(f"{k}={v}" for k, v in ordered if v is not None)
        return f"{path}?{query}"

    def get(self, key: str) -> CacheEntry | None:
        if not self.enabled:
            return None
        now = time.monotonic()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                METRICS.cache_event("miss")
                return None
            if now - entry.stored_at >= self._ttl_s:
                # Expired: drop it. A stale public figure is worse than a miss,
                # because a miss is honest and a stale hit looks authoritative.
                del self._entries[key]
                METRICS.cache_event("expired")
                return None
            self._entries.move_to_end(key)
            METRICS.cache_event("hit")
            return entry

    def put(self, key: str, value: Any) -> None:
        if not self.enabled:
            return
        now = time.monotonic()
        with self._lock:
            self._entries[key] = CacheEntry(value=value, stored_at=now)
            self._entries.move_to_end(key)
            while len(self._entries) > self._max_entries:
                self._entries.popitem(last=False)
            METRICS.cache_event("store")

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

    def stats(self) -> dict[str, int]:
        with self._lock:
            return {"entries": len(self._entries), "max_entries": self._max_entries}
