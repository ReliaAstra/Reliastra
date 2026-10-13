"""HTTP client for the canonical Reliastra API.

The single integration boundary: every operational tool goes through here, so
authentication, timeouts, retries, tracing, error translation and audit live in
one place. The client never touches the database, never reimplements a
Reliastra rule, and never invents data.

Safety rules encoded here:

* **Auth is per request** (``X-API-Key``), never stored on the shared client, so
  one caller's credential cannot leak into another's request — including on the
  stateless HTTP transport, where consecutive requests belong to different
  tenants.
* **Retries apply to GET only**, only for transport failures and 502/503/504,
  with exponential backoff plus jitter and a capped honour of ``Retry-After``.
  Mutations never retry; they carry an ``Idempotency-Key`` instead, which the
  backend scopes to the credential and replays for 24h
  (``app/bootstrap/middleware.py::IdempotencyMiddleware``).
* **Upstream bodies are never echoed.** Only the backend's public
  ``{error: {code, message}}`` envelope fields pass through, message truncated;
  anything else becomes a category.
* **Response size is capped.** A body over the limit is refused, not buffered.
* **Concurrency is bounded** by a semaphore, so a fan-out of parallel agent
  calls cannot exhaust memory or hammer the API.
* **A consecutive-failure circuit breaker** fast-fails during upstream outages.
* **Traces propagate.** Every call carries ``traceparent`` and ``X-Request-ID``
  in the format the backend parses, so a tool call and the API request it caused
  are one trace.
"""

from __future__ import annotations

import asyncio
import random
import time
from typing import Any

import httpx

from . import errors as err
from .cache import PublicCache
from .config import McpServerConfig
from .observability import METRICS, current_trace_headers, get_logger

log = get_logger("upstream")

_RETRYABLE_STATUS = frozenset({502, 503, 504})
_MAX_RETRY_AFTER_S = 5.0
_MAX_BACKOFF_S = 5.0


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
                METRICS.circuit(False)
                return
            raise CircuitOpen()

    async def success(self) -> None:
        async with self._lock:
            self._failures = 0
            self._opened_at = None
            METRICS.circuit(False)

    async def failure(self) -> None:
        async with self._lock:
            self._failures += 1
            if self._failures >= self._threshold:
                self._opened_at = time.monotonic()
                METRICS.circuit(True)
                log.warning("circuit_open", extra={"failures": self._failures})

    @property
    def is_open(self) -> bool:
        return self._opened_at is not None


def _is_error_envelope(body: Any) -> bool:
    """True when a body is *nothing but* the API's error envelope.

    Deliberately narrow. A payload carrying data alongside an ``error`` key (a
    partial-success shape) is not a failure and is left alone; only a body whose
    entire content is ``{"error": {...}}`` matches.
    """
    if not isinstance(body, dict) or set(body) != {"error"}:
        return False
    return isinstance(body["error"], dict) and bool(body["error"])


#: Envelope codes ``app/platform/web/errors.py`` uses for a credential, scope or
#: plan refusal. Consulted only when the HTTP status is a success and therefore
#: cannot classify the failure itself.
_AUTH_ENVELOPE_CODES = frozenset({"UNAUTHORIZED", "FORBIDDEN"})


def _envelope_classification_status(status: int, body: Any) -> int:
    """The status to classify an error envelope by.

    When a 2xx carries an error body the status is no evidence at all, so the
    envelope's own code decides: an auth code classifies as 403 (``forbidden``,
    the safe credential message, never retryable), anything else as 500
    (``upstream_error``, not retryable — retrying a malformed success is
    pointless).
    """
    if status >= 400:
        return status
    error = body.get("error") if isinstance(body, dict) else None
    code = str(error.get("code", "")).upper() if isinstance(error, dict) else ""
    return 403 if code in _AUTH_ENVELOPE_CODES else 500


def _safe_envelope_error(status: int, body: Any) -> err.ToolFailure | None:
    """Extract the backend's public error envelope, if present.

    The Reliastra API renders every error as ``{"error": {"code", "message"}}``
    (``app/platform/web/errors.py``). Those two fields are written for callers
    and are safe to pass through; everything else in a body is dropped, because
    an unexpected body may contain internal detail.
    """
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            code = str(error.get("code", "UPSTREAM_ERROR"))[:64]
            message = str(error.get("message", "Upstream request failed."))[:300]
            if status == 404:
                return err.not_found(f"Reliastra: {message}", upstream_code=code)
            if status in (401, 403):
                # Never echo the credential or the reason in detail: "the API
                # rejected this key" is the whole useful, safe answer.
                return err.forbidden(
                    "Reliastra rejected the credential or it lacks the required "
                    "scope. Check the key is active, its scopes cover this "
                    "operation, and the organization's plan includes API access.",
                    upstream_code=code,
                    status=status,
                )
            if status == 429:
                return err.upstream(
                    "upstream_rate_limited",
                    "Reliastra rate-limited the request. Back off and retry.",
                    retryable=True,
                    upstream_code=code,
                )
            if status == 422:
                return err.invalid_input(f"Reliastra rejected the arguments: {message}",
                                         upstream_code=code)
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
        self,
        config: McpServerConfig,
        transport: httpx.AsyncBaseTransport | None = None,
        cache: PublicCache | None = None,
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
            headers={
                "User-Agent": "reliastra-mcp/0.1.0",
                "Accept": "application/json",
            },
            follow_redirects=False,  # never chase a redirect to another host
        )
        self._breaker = _CircuitBreaker(
            config.circuit_breaker_threshold, config.circuit_breaker_cooldown_s
        )
        self._semaphore = asyncio.Semaphore(config.max_inflight_requests)
        self._cache = cache if cache is not None else PublicCache(
            config.public_cache_ttl_s, config.public_cache_max_entries
        )

    @property
    def cache(self) -> PublicCache:
        return self._cache

    @property
    def breaker_open(self) -> bool:
        return self._breaker.is_open

    async def aclose(self) -> None:
        await self._http.aclose()

    # ── public surface (unauthenticated, cacheable) ─────────────────────────

    async def get_public(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        request_id: str = "",
        *,
        cacheable: bool = True,
        accept_statuses: frozenset[int] = frozenset(),
    ) -> tuple[Any, dict[str, Any]]:
        """GET a public endpoint. Returns ``(body, freshness)``.

        ``accept_statuses`` lists non-2xx codes whose body *is* the answer rather
        than a failure. ``GET /v1/checks/health`` returns 503 with the pipeline
        state when checks are not running: reporting that as an upstream error
        would hide the one fact the caller asked for, and returning an empty
        success would hide the outage. So the tool opts in explicitly and the
        envelope says which status produced the body.
        """
        key = None
        if cacheable and self._cache.enabled and not accept_statuses:
            key = self._cache.make_key(path, params)
            entry = self._cache.get(key)
            if entry is not None:
                return entry.value, entry.freshness(
                    self._cache.ttl_s, time.monotonic()
                )
        body, status, headers = await self._request(
            "GET",
            path,
            params=params,
            api_key=None,
            retryable=True,
            request_id=request_id,
            accept_statuses=accept_statuses,
        )
        freshness: dict[str, Any] = {"cached": False}
        if accept_statuses and status in accept_statuses:
            freshness["upstream_status"] = status
        if headers:
            freshness["upstream_headers"] = headers
        if key is not None and status < 400:
            # Callers whose meaning lives in response headers (the evidence
            # artifact, the verification record, pipeline liveness) pass
            # cacheable=False, so the decision is explicit rather than inferred
            # from which headers happened to arrive.
            self._cache.put(key, body)
        return body, freshness

    # ── authenticated surface (caller credential, pinned per request) ───────

    def require_key(self, api_key: str | None) -> str:
        if not api_key:
            raise err.unauthenticated(
                "This operation needs a Reliastra API key. Provide one as "
                "RELIASTRA_API_KEY (stdio) or an Authorization: Bearer header "
                "(remote), then retry. Note that API access requires an "
                "organization on a paid plan."
            )
        return api_key

    async def get_authed(
        self,
        path: str,
        params: dict[str, Any] | None,
        api_key: str | None,
        request_id: str = "",
    ) -> Any:
        """GET on the caller's own workspace. Never cached, ever."""
        self.require_key(api_key)
        body, _status, _headers = await self._request(
            "GET",
            path,
            params=params,
            api_key=api_key,
            retryable=True,
            request_id=request_id,
        )
        return body

    async def post_authed(
        self,
        path: str,
        payload: dict[str, Any],
        api_key: str | None,
        request_id: str = "",
        *,
        idempotency_key: str | None = None,
        accept_statuses: frozenset[int] = frozenset(),
    ) -> tuple[Any, int, dict[str, str]]:
        """POST a mutation. Never retried. Never cached.

        ``idempotency_key`` makes a caller retry safe: the backend caches the
        first response for 24h, scoped to the credential, and answers a
        concurrent duplicate with 409 rather than executing twice.
        """
        self.require_key(api_key)
        return await self._request(
            "POST",
            path,
            json_body=payload,
            api_key=api_key,
            retryable=False,
            request_id=request_id,
            idempotency_key=idempotency_key,
            accept_statuses=accept_statuses,
        )

    def clamp_limit(self, limit: int | None) -> int:
        if limit is None:
            return self._config.default_page_size
        return max(1, min(int(limit), self._config.max_page_size))

    # ── core ────────────────────────────────────────────────────────────────

    async def _request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        api_key: str | None = None,
        retryable: bool = False,
        request_id: str = "",
        idempotency_key: str | None = None,
        accept_statuses: frozenset[int] = frozenset(),
    ) -> tuple[Any, int, dict[str, str]]:
        """Returns ``(body, status, provenance_headers)``.

        Only a fixed allow-list of headers is returned: the evidence routes carry
        provenance (version, schema, methodology, ETag) in headers rather than in
        the body, and those are facts a caller needs. Everything else is dropped,
        so a header cannot become a channel for upstream detail into tool output.
        """
        if not path.startswith("/v1/"):
            # The only paths this client may address. Anything else is a bug in a
            # tool module, and sending it would be an arbitrary-request primitive.
            raise err.internal("Refusing to call a non-/v1/ upstream path.")

        try:
            await self._breaker.check()
        except CircuitOpen:
            METRICS.upstream_observed(0.0, "circuit_open")
            raise err.upstream(
                "upstream_unavailable",
                "Reliastra API is temporarily unavailable (circuit open after "
                f"repeated failures). Retry in about "
                f"{self._config.circuit_breaker_cooldown_s:.0f}s.",
                retryable=True,
            ) from None

        headers = dict(current_trace_headers())
        if request_id:
            headers.setdefault("X-Request-ID", request_id)
        if api_key:
            headers["X-API-Key"] = api_key  # per-request; never on the shared client
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        attempts = 1 + (self._config.upstream_max_retries if retryable else 0)
        last_error: err.ToolFailure | None = None

        for attempt in range(attempts):
            server_wait = 0.0
            started = time.monotonic()
            try:
                async with self._semaphore:
                    METRICS.upstream_inflight(1)
                    try:
                        response = await self._http.request(
                            method,
                            path,
                            params=_clean_params(params),
                            json=json_body,
                            headers=headers,
                        )
                    finally:
                        METRICS.upstream_inflight(-1)
            except httpx.HTTPError as exc:
                duration = time.monotonic() - started
                timed_out = isinstance(exc, httpx.TimeoutException)
                METRICS.upstream_observed(
                    duration, "timeout" if timed_out else "transport_error"
                )
                await self._breaker.failure()
                reason = type(exc).__name__
                last_error = err.upstream(
                    "upstream_timeout" if timed_out else "upstream_unavailable",
                    (
                        f"Reliastra API did not answer within the timeout ({reason})."
                        if timed_out
                        else f"Reliastra API could not be reached ({reason})."
                    ),
                    retryable=True,
                )
                # Never name the host or include the URL: it can carry the key
                # for a query-authenticated call, and it is not useful to an agent.
                log.warning(
                    "upstream_transport_error",
                    extra={
                        "request_id": request_id,
                        "error_type": reason,
                        "attempt": attempt + 1,
                        "authenticated": api_key is not None,
                    },
                )
            else:
                duration = time.monotonic() - started
                status = response.status_code
                if len(response.content) > self._config.upstream_max_response_bytes:
                    METRICS.upstream_observed(duration, "response_too_large")
                    await self._breaker.failure()
                    raise err.upstream(
                        "upstream_invalid",
                        "Reliastra API returned a response larger than this server "
                        "accepts. The result was discarded, not truncated.",
                        retryable=False,
                    )
                if status in _RETRYABLE_STATUS and retryable and status not in accept_statuses:
                    METRICS.upstream_observed(duration, "retryable_status")
                    await self._breaker.failure()
                    last_error = err.upstream(
                        "upstream_unavailable",
                        f"Reliastra API returned {status}.",
                        retryable=True,
                        status=status,
                    )
                    server_wait = self._retry_after(response)
                elif status >= 400 and status not in accept_statuses:
                    METRICS.upstream_observed(duration, f"http_{status}")
                    if status >= 500:
                        await self._breaker.failure()
                    body = _try_json(response)
                    mapped = _safe_envelope_error(status, body)
                    log.warning(
                        "upstream_error_status",
                        extra={
                            "request_id": request_id,
                            "status": status,
                            "upstream_code": (mapped.data.get("upstream_code") if mapped else None),
                            "authenticated": api_key is not None,
                        },
                    )
                    raise (
                        mapped
                        or err.upstream(
                            "upstream_error",
                            f"Reliastra API returned {status}.",
                            retryable=False,
                            status=status,
                        )
                    )
                else:
                    await self._breaker.success()
                    METRICS.upstream_observed(duration, "ok" if status < 400 else f"accepted_{status}")
                    body = _try_json(response)
                    if body is _NOT_JSON:
                        raise err.upstream(
                            "upstream_invalid",
                            "Reliastra API returned a response that is not valid "
                            "JSON. It was discarded rather than guessed at.",
                            retryable=False,
                            status=status,
                        )
                    if _is_error_envelope(body):
                        # A success status carrying the API's error envelope is a
                        # contract violation, not a result. Passing it through
                        # would let a rejected call be reported as an *empty
                        # success* - "nothing is monitored" instead of "you are
                        # not allowed to look". Honest failure beats a plausible
                        # empty answer, so it is discarded and raised.
                        METRICS.upstream_observed(duration, "error_envelope_in_success")
                        log.warning(
                            "upstream_success_body_is_error_envelope",
                            extra={
                                "request_id": request_id,
                                "status": status,
                                "authenticated": api_key is not None,
                            },
                        )
                        raise _safe_envelope_error(
                            _envelope_classification_status(status, body), body
                        ) or err.upstream(
                            "upstream_error",
                            "Reliastra API returned a success status carrying an "
                            "error body. The result was discarded rather than "
                            "reported as empty.",
                            retryable=False,
                            status=status,
                        )
                    return body, status, _provenance_headers(response)
            if attempt < attempts - 1:
                base = self._config.upstream_retry_base_s * (2**attempt)
                delay = min(max(base + random.uniform(0, 0.2), server_wait), _MAX_BACKOFF_S)
                await asyncio.sleep(delay)

        assert last_error is not None
        raise last_error

    @staticmethod
    def _retry_after(response: httpx.Response) -> float:
        try:
            value = float(response.headers.get("retry-after", "0"))
        except (TypeError, ValueError):
            return 0.0
        return max(0.0, min(value, _MAX_RETRY_AFTER_S))


#: Headers that carry meaning for a caller. Anything not listed is dropped.
_PROVENANCE_HEADERS = (
    "etag",
    "x-reliastra-evidence-version",
    "x-reliastra-artifact-schema-version",
    "x-reliastra-methodology-version",
    "x-request-id",
    "cache-control",
    "retry-after",
)


def _provenance_headers(response: httpx.Response) -> dict[str, str]:
    found: dict[str, str] = {}
    for name in _PROVENANCE_HEADERS:
        value = response.headers.get(name)
        if value:
            found[name] = value[:200]
    return found


class _NotJson:
    """Sentinel: distinguishes 'not JSON' from a JSON null body."""


_NOT_JSON = _NotJson()


def _try_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return _NOT_JSON


def _clean_params(params: dict[str, Any] | None) -> dict[str, Any] | None:
    """Drop None/empty values so optional filters do not become empty strings."""
    if not params:
        return None
    cleaned = {
        key: value
        for key, value in params.items()
        if value is not None and value != "" and value != []
    }
    return cleaned or None
