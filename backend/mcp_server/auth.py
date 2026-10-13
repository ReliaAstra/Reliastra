"""Caller credentials, the transport gate, and instance-local rate limiting.

Credential model
----------------
Reliastra's programmatic credential is a **scoped API key** (``rel_...``) that
pins an organization. ``app/api/deps.py::get_current_user`` accepts it as
``X-API-Key``, as a bare ``Authorization: rel_...``, and as
``Authorization: Bearer rel_...`` / ``ApiKey rel_...`` — so carrying it as an
HTTP bearer credential on the MCP transport is the product's own documented
mechanism, not a scheme invented here.

This server is therefore **not an OAuth 2.1 resource server**, and does not
advertise one: Reliastra operates no MCP authorization server, no
``/.well-known/oauth-protected-resource`` metadata, and no dynamic client
registration. Publishing that metadata would send a client to discover
endpoints that do not exist. What this server does instead:

* The edge checks the credential's *shape* and rejects a missing or malformed
  one with **401 and a spec-shaped ``WWW-Authenticate: Bearer`` header**, before
  the protocol layer runs.
* The *authority* on validity, scopes, plan entitlement and tenant membership is
  the Reliastra API, consulted on every single call. A key that is revoked,
  out of scope, or on an organization without API access produces a
  ``forbidden`` tool failure carrying the API's own error code. Nothing is
  cached about a key's validity, so revocation takes effect immediately.
* ``token_verifier`` is the documented seam for a deployment that *does* have an
  authoritative validator (introspection endpoint, JWT with JWKS). It is called
  at the edge and can reject before any tool runs. The default implementation
  validates shape only and says so in the capability registry.

Per-request isolation
---------------------
The credential is read from the request's own ``Authorization`` header, which the
MCP SDK surfaces to tools as ``ctx.headers``. It is never stored on the shared
HTTP client and never kept in a module-level variable across requests, so on the
stateless HTTP transport — where consecutive requests belong to different
tenants — one caller's key cannot be used for another's call. For stdio, where
there are no headers, the key comes from ``RELIASTRA_API_KEY`` in the process
environment; that is the protocol's environment-based credential guidance, and
possession of the connection is never treated as proof of authorization.

Rate limiting
-------------
An in-memory sliding window, bucketed per credential fingerprint (or per client
IP for unauthenticated public reads). It is **instance-local**: a fleet needs
gateway-level limiting in front, and the Reliastra API applies its own limits
(``rl_apikey`` 1000/min, ``rl_vendor`` 300/min) regardless.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse

from .config import McpServerConfig
from .observability import METRICS, get_logger

log = get_logger("auth")

#: Minimum accepted key shape. ``app/modules/api_keys`` mints ``rel_`` + random
#: material; the floor here rejects obvious garbage before it costs an API call.
KEY_PREFIX = "rel_"
MIN_KEY_LENGTH = 12
MAX_KEY_LENGTH = 256

#: Optional authoritative validator: ``(key) -> bool``. Return False to reject.
TokenVerifier = Callable[[str], Awaitable[bool]]


@dataclass(frozen=True)
class Credential:
    """The caller's credential for one request."""

    key: str | None
    #: Non-reversible, per-process fingerprint. Safe for logs and rate-limit
    #: buckets; cannot be turned back into the key and does not survive restart.
    identity: str
    source: str  # "header" | "env" | "none"

    @property
    def authenticated(self) -> bool:
        return self.key is not None


#: Per-process salt so a leaked log line cannot be used as a key oracle.
_IDENTITY_SALT = secrets.token_bytes(32)


def credential_identity(key: str) -> str:
    """A stable, non-reversible label for a credential."""
    return hmac.new(_IDENTITY_SALT, key.encode("utf-8"), hashlib.sha256).hexdigest()[:16]


def is_plausible_key(value: str | None) -> bool:
    """Shape check only. Validity is the Reliastra API's decision."""
    if not value or not isinstance(value, str):
        return False
    if not (MIN_KEY_LENGTH <= len(value) <= MAX_KEY_LENGTH):
        return False
    if not value.startswith(KEY_PREFIX):
        return False
    # Reject anything that is not key material: whitespace, newlines (header
    # injection), or non-ASCII.
    return all(ch.isalnum() or ch in "_-" for ch in value)


def extract_bearer(header_value: str | None) -> str | None:
    """Pull a Reliastra API key out of an Authorization header value."""
    if not header_value:
        return None
    raw = header_value.strip()
    if raw.lower().startswith(KEY_PREFIX):
        return raw
    scheme, _, value = raw.partition(" ")
    if scheme.lower() not in {"bearer", "apikey"} or not value.strip():
        return None
    return value.strip()


def resolve_credential(
    headers: object | None, env_key: str | None
) -> Credential:
    """Credential for this request: per-request header first, env for stdio.

    ``headers`` is ``ctx.headers`` (a mapping, possibly None on stdio). Reading
    it per request — rather than from a global set by middleware — is what keeps
    the stateless HTTP transport tenant-safe.
    """
    header_value = None
    if headers:
        try:
            header_value = headers.get("authorization") or headers.get("Authorization")
        except AttributeError:
            header_value = None
    key = extract_bearer(header_value)
    if key and is_plausible_key(key):
        return Credential(key=key, identity=credential_identity(key), source="header")
    if env_key and is_plausible_key(env_key):
        return Credential(key=env_key, identity=credential_identity(env_key), source="env")
    # A header that was present but malformed is reported as unauthenticated;
    # the raw value is never echoed back.
    return Credential(key=None, identity="anonymous", source="none")


class RateLimiter:
    """Sliding-window limiter. ``allow`` returns retry-after seconds on deny."""

    def __init__(self, per_minute: int) -> None:
        self._per_minute = per_minute
        self._hits: dict[str, deque[float]] = {}

    @property
    def per_minute(self) -> int:
        return self._per_minute

    def allow(self, key: str) -> float | None:
        now = time.monotonic()
        window_start = now - 60.0
        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] <= window_start:
            hits.popleft()
        if len(hits) >= self._per_minute:
            return max(0.0, hits[0] + 60.0 - now)
        hits.append(now)
        # Opportunistic cleanup so idle callers don't accumulate forever.
        if len(self._hits) > 4096:
            for stale in [k for k, v in list(self._hits.items()) if not v]:
                del self._hits[stale]
        return None

    def snapshot(self) -> dict[str, int]:
        return {"buckets": len(self._hits), "per_minute": self._per_minute}


_WWW_AUTHENTICATE = (
    'Bearer error="invalid_token", '
    'error_description="Provide a Reliastra API key: Authorization: Bearer rel_..."'
)


class McpAuthMiddleware(BaseHTTPMiddleware):
    """Transport gate for the remote server. There is no bypass path.

    Runs before the MCP protocol layer, so an unauthenticated caller gets a
    plain HTTP 401 rather than a JSON-RPC error, and a rate-limited caller gets
    429 with ``Retry-After``. Health and metrics paths are exempt because they
    must be reachable by a load balancer and a Prometheus scrape, and they
    return no tenant data.
    """

    def __init__(
        self,
        app,  # type: ignore[no-untyped-def]
        config: McpServerConfig,
        limiter: RateLimiter,
        *,
        exempt_paths: frozenset[str] = frozenset(),
        token_verifier: TokenVerifier | None = None,
    ) -> None:
        super().__init__(app)
        self._config = config
        self._limiter = limiter
        self._exempt = exempt_paths
        self._token_verifier = token_verifier

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):  # type: ignore[no-untyped-def]
        path = request.url.path
        if path in self._exempt:
            return await call_next(request)

        key = extract_bearer(request.headers.get("authorization"))
        if not key or not is_plausible_key(key):
            METRICS.auth_failure("missing_or_malformed")
            return JSONResponse(
                {
                    "error": "invalid_token",
                    "error_description": (
                        "Missing or malformed credential. Send "
                        "Authorization: Bearer rel_... (a Reliastra API key)."
                    ),
                },
                status_code=401,
                headers={"WWW-Authenticate": _WWW_AUTHENTICATE},
            )

        if self._token_verifier is not None:
            try:
                accepted = await self._token_verifier(key)
            except Exception:
                # A broken validator must not become an open door.
                log.exception("token_verifier_error")
                accepted = False
            if not accepted:
                METRICS.auth_failure("rejected_by_verifier")
                return JSONResponse(
                    {
                        "error": "invalid_token",
                        "error_description": "Credential rejected by the token verifier.",
                    },
                    status_code=401,
                    headers={"WWW-Authenticate": _WWW_AUTHENTICATE},
                )

        identity = credential_identity(key)
        retry_after = self._limiter.allow(f"edge:{identity}")
        if retry_after is not None:
            METRICS.rate_limited("edge")
            return JSONResponse(
                {"error": "rate_limited", "error_description": "Back off and retry."},
                status_code=429,
                headers={"Retry-After": str(int(retry_after) + 1)},
            )

        # The tool layer re-reads the credential from ctx.headers; nothing is
        # stored here, so there is no request state to leak between callers.
        response = await call_next(request)
        response.headers["X-Reliastra-Caller"] = identity
        return response
