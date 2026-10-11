"""HTTP client for the canonical Reliastra API.

The single integration boundary: every operational tool goes through here, so
authentication, timeouts, retries, error translation and audit live in one
place. The client never touches the database and never invents data.

Safety rules encoded here:
- Auth is per request (``X-API-Key``), never stored on the shared client, so
  one caller's credential cannot leak into another's request.
- Retries apply to GET only, only for transport failures and 502/503/504, with
  backoff + jitter and a capped honor of ``Retry-After``. Mutations never retry.
- Upstream bodies are never echoed: only the backend's public
  ``{error: {code, message}}`` envelope fields pass through (message truncated);
  anything else becomes a category.
- A consecutive-failure circuit breaker fast-fails during upstream outages.
"""

from __future__ import annotations

import asyncio
import random
import time
from typing import Any

import httpx

from . import errors as err
from .config import McpServerConfig
from .observability import METRICS, get_logger

log = get_logger("upstream")

_RETRYABLE_STATUS = {502, 503, 504}
_MAX_RETRY_AFTER_S = 5.0


class CircuitOpen(Exception):
    pass


class _CircuitBreaker:
    """Consecutive-failure breaker, per client instance (i.e. per process)."""

    def __init__(self, threshold: int, cooldown_s: float) -> None:
        self._threshold = threshold
        self._cooldown_s = cooldown_s
        self._failures = 0
        self._opened_at: float | None = None
        self._lock = asyncio.Lock()

    async def check(self) -> None:
        async with self._lock:
            if self._opened_at is None:
                return
            if time.monotonic() - self._opened_at >= self._cooldown_s:
                self._opened_at = None  # half-open: let one probe through
                self._failures = 0
                return
            raise CircuitOpen()

    async def success(self) -> None:
        async with self._lock:
            self._failures = 0
            self._opened_at = None

    async def failure(self) -> None:
        async with self._lock:
            self._failures += 1
            if self._failures >= self._threshold:
                self._opened_at = time.monotonic()
                log.warning("circuit_open", extra={"failures": self._failures})


def _safe_envelope_error(status: int, body: Any) -> err.ToolFailure | None:
    """Extract the backend's public error envelope, if present."""
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            code = str(error.get("code", "UPSTREAM_ERROR"))[:64]
            message = str(error.get("message", "Upstream request failed."))[:300]
            if status == 404:
                return err.not_found(f"Reliastra: {message}", upstream_code=code)
            if status in (401, 403):
                return err.forbidden("Reliastra rejected the credential.", upstream_code=code)
            if status == 429:
                return err.upstream(
                    "upstream_rate_limited",
                    "Reliastra rate-limited the request.",
                    retryable=True,
                    upstream_code=code,
                )
            return err.upstream(
                "upstream_error",
                f"Reliastra error {code}: {message}",
                retryable=status in _RETRYABLE_STATUS,
                status=status,
                upstream_code=code,
            )
    return None


class ReliastraClient:
    """Shared-connection client; auth is always per request."""

    def __init__(
        self, config: McpServerConfig, transport: httpx.AsyncHTTPTransport | None = None
    ) -> None:
        self._config = config
        timeout = httpx.Timeout(
            connect=config.upstream_connect_timeout_s,
            read=config.upstream_read_timeout_s,
            write=10.0,
            pool=5.0,
        )
        self._http = httpx.AsyncClient(
            base_url=config.reliastra_api_url,
            timeout=timeout,
            transport=transport,
            headers={"User-Agent": "reliastra-mcp/0.1.0", "Accept": "application/json"},
        )
        self._breaker = _CircuitBreaker(
            config.circuit_breaker_threshold, config.circuit_breaker_cooldown_s
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    # — public surface —

    async def get_public(
        self, path: str, params: dict[str, Any] | None = None, request_id: str = ""
    ) -> Any:
        return await self._request(
            "GET", path, params=params, api_key=None, retryable=True, request_id=request_id
        )

    async def get_verify(self, path: str, request_id: str = "") -> Any:
        # Verification records are immutable; safe to retry, never cached.
        return await self._request("GET", path, api_key=None, retryable=True, request_id=request_id)

    # — authenticated surface (caller credential, pinned per request) —

    def require_key(self, api_key: str | None) -> str:
        if not api_key:
            raise err.unauthenticated(
                "This operation needs a Reliastra API key. Provide one as "
                "RELIASTRA_API_KEY (stdio) or an Authorization: Bearer header "
                "(remote), then retry."
            )
        return api_key

    async def get_authed(
        self, path: str, params: dict[str, Any] | None, api_key: str, request_id: str = ""
    ) -> Any:
        self.require_key(api_key)
        return await self._request(
            "GET", path, params=params, api_key=api_key, retryable=True, request_id=request_id
        )

    async def post_authed(
        self, path: str, payload: dict[str, Any], api_key: str, request_id: str = ""
    ) -> Any:
        """Mutations: never retried. Caller must handle explicit failures."""
        self.require_key(api_key)
        return await self._request(
            "POST", path, json_body=payload, api_key=api_key, retryable=False, request_id=request_id
        )

    def clamp_limit(self, limit: int | None) -> int:
        if limit is None:
            return self._config.default_page_size
        return max(1, min(int(limit), self._config.max_page_size))

    # — core —

    async def _request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        api_key: str | None = None,
        retryable: bool = False,
        request_id: str = "",
    ) -> Any:
        try:
            await self._breaker.check()
        except CircuitOpen:
            METRICS.upstream_observed(0.0, "circuit_open")
            raise err.upstream(
                "upstream_unavailable",
                "Reliastra API is temporarily unavailable (circuit open after repeated failures).",
                retryable=True,
            ) from None

        headers = {"X-Request-ID": request_id} if request_id else {}
        if api_key:
            headers["X-API-Key"] = api_key  # per-request; never on shared client

        attempts = 1 + (self._config.upstream_max_retries if retryable else 0)
        last_error: err.ToolFailure | None = None
        for attempt in range(attempts):
            started = time.monotonic()
            server_wait = 0.0
            try:
                response = await self._http.request(
                    method, path, params=params, json=json_body, headers=headers
                )
            except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError) as exc:
                latency_ms = (time.monotonic() - started) * 1000
                METRICS.upstream_observed(latency_ms, "transport")
                last_error = err.upstream(
                    "upstream_timeout"
                    if isinstance(exc, httpx.TimeoutException)
                    else "upstream_unavailable",
                    f"Reliastra API did not answer ({type(exc).__name__}).",
                    retryable=True,
                )
                await self._breaker.failure()
            else:
                latency_ms = (time.monotonic() - started) * 1000
                if response.status_code in _RETRYABLE_STATUS and retryable:
                    METRICS.upstream_observed(latency_ms, "retryable_status")
                    await self._breaker.failure()
                    last_error = err.upstream(
                        "upstream_error",
                        f"Reliastra API returned {response.status_code}.",
                        retryable=True,
                        status=response.status_code,
                    )
                    server_wait = self._retry_after(response)
                elif response.status_code >= 400:
                    METRICS.upstream_observed(latency_ms, f"http_{response.status_code}")
                    await self._breaker.failure()
                    body: Any = None
                    try:
                        body = response.json()
                    except ValueError:
                        body = None
                    mapped = _safe_envelope_error(response.status_code, body)
                    raise (
                        mapped
                        or err.upstream(
                            "upstream_error",
                            f"Reliastra API returned {response.status_code}.",
                            retryable=False,
                            status=response.status_code,
                        )
                    )
                else:
                    await self._breaker.success()
                    METRICS.upstream_observed(latency_ms, None)
                    try:
                        return response.json()
                    except ValueError:
                        raise err.upstream(
                            "upstream_error",
                            "Reliastra API returned a non-JSON response.",
                            retryable=False,
                        ) from None
            if attempt < attempts - 1:
                base = self._config.upstream_retry_base_s * (2**attempt)
                delay = max(base + random.uniform(0, 0.2), server_wait)
                await asyncio.sleep(min(delay, 5.0))
        assert last_error is not None
        raise last_error

    @staticmethod
    def _retry_after(response: httpx.Response) -> float:
        try:
            value = float(response.headers.get("retry-after", "0"))
        except ValueError:
            return 0.0
        return max(0.0, min(value, _MAX_RETRY_AFTER_S))
