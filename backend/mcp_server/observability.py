"""Structured logging and lightweight metrics.

No third-party dependencies: stdlib ``logging`` with a JSON formatter, plus a
lock-protected counter set. Cardinality is bounded — label values are tool
names and error categories, never user input, URLs, or credentials.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from collections import defaultdict
from typing import Any, ClassVar


class JsonFormatter(logging.Formatter):
    """Single-line JSON logs. ``api_key`` can never appear: callers must not
    pass secrets; this formatter additionally drops known-secret keys."""

    _SECRET_KEYS: ClassVar[set[str]] = {"api_key", "authorization", "token", "secret", "password"}

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in vars(record).items():
            if key in self._SECRET_KEYS or key.startswith("_"):
                continue
            if key in (
                "args",
                "msg",
                "levelname",
                "levelno",
                "pathname",
                "lineno",
                "funcName",
                "module",
                "exc_info",
                "exc_text",
                "stack_info",
                "created",
                "msecs",
                "relativeCreated",
                "thread",
                "threadName",
                "processName",
                "process",
                "name",
                "message",
            ):
                continue
            payload[key] = value
        if record.exc_info and record.exc_info[0] is not None:
            payload["exc"] = self.formatException(record.exc_info).splitlines()[-1]
        return json.dumps(payload, default=str)


def get_logger(name: str, level: str = "INFO") -> logging.Logger:
    logger = logging.getLogger(f"reliastra.mcp.{name}")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    logger.propagate = False
    return logger


def new_request_id() -> str:
    return f"mcp_{uuid.uuid4().hex[:12]}"


class Metrics:
    """Process-local counters and latency sums. Thread-safe."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tool_calls: dict[str, int] = defaultdict(int)
        self._tool_errors: dict[str, int] = defaultdict(int)
        self._upstream_latency_ms: list[float] = []
        self._upstream_errors: dict[str, int] = defaultdict(int)
        self._rate_limited = 0
        self._cache_hits = 0
        self._cache_misses = 0
        self._mutations = 0
        self._started_at = time.time()

    def tool_called(self, tool: str) -> None:
        with self._lock:
            self._tool_calls[tool] += 1

    def tool_error(self, category: str) -> None:
        with self._lock:
            self._tool_errors[category] += 1

    def upstream_observed(self, latency_ms: float, error_category: str | None) -> None:
        with self._lock:
            if len(self._upstream_latency_ms) < 1024:
                self._upstream_latency_ms.append(latency_ms)
            if error_category:
                self._upstream_errors[error_category] += 1

    def rate_limited(self) -> None:
        with self._lock:
            self._rate_limited += 1

    def cache_hit(self) -> None:
        with self._lock:
            self._cache_hits += 1

    def cache_miss(self) -> None:
        with self._lock:
            self._cache_misses += 1

    def mutation(self) -> None:
        with self._lock:
            self._mutations += 1

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            lat = sorted(self._upstream_latency_ms)
            p95 = lat[int(len(lat) * 0.95)] if lat else 0.0
            return {
                "uptime_s": round(time.time() - self._started_at, 1),
                "tool_calls": dict(self._tool_calls),
                "tool_errors": dict(self._tool_errors),
                "upstream_latency_ms": {
                    "count": len(lat),
                    "p50": lat[len(lat) // 2] if lat else 0.0,
                    "p95": round(p95, 1),
                },
                "upstream_errors": dict(self._upstream_errors),
                "rate_limited": self._rate_limited,
                "cache": {"hits": self._cache_hits, "misses": self._cache_misses},
                "mutations": self._mutations,
            }


METRICS = Metrics()
