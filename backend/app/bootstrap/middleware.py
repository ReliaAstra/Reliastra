"""HTTP middleware: request ids and idempotent POST/PATCH.

Moved verbatim from ``app.main`` during the bootstrap extraction. Behavior is
unchanged; only the import paths moved to canonical locations.

Execution order (outermost first) is set in
:func:`app.bootstrap.app_factory.create_app`: CORS → RequestId → Tenant →
Idempotency → router.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid

from fastapi import Request, Response, status
from starlette.concurrency import iterate_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.platform.integrations.redis import (
    safe_redis_claim,
    safe_redis_get,
    safe_redis_setex,
)
from app.platform.observability.context import request_id_var, set_request_id

logger = logging.getLogger(__name__)


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Injects a unique X-Request-ID into every incoming request for distributed tracing."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        request.state.request_id = request_id
        # FIX 36: propagate the request id into the context var so Celery
        # task dispatches made from service code can pass it along.
        token = set_request_id(request_id)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = request_id
        return response


class IdempotencyMiddleware(BaseHTTPMiddleware):
    # Headers that must not be cached/replayed (hop-by-hop)
    _HOP_BY_HOP = {
        "connection", "keep-alive", "proxy-authenticate",
        "proxy-authorization", "te", "trailers",
        "transfer-encoding", "upgrade", "content-encoding",
    }

    # FIX 40: deterministic error responses are cacheable too (409 conflict,
    # 422 validation, 404 not found). 5xx responses are never cached so
    # transient infrastructure failures are not frozen for 24 hours.
    @staticmethod
    def _is_cacheable_status(status_code: int) -> bool:
        return 200 <= status_code < 300 or status_code in {404, 409, 422}

    @staticmethod
    def _idempotency_principal(request: Request) -> str:
        """Derive a stable per-credential principal for idempotency scoping
        (FIX 7).

        Prefers the verified JWT ``sub``; falls back to a digest of the API
        key credential; finally the client IP for anonymous callers.  This
        guarantees two different tenants can never collide on a key.
        """
        auth = request.headers.get("authorization", "")
        api_key = request.headers.get("x-api-key", "")
        if auth.lower().startswith("bearer "):
            token = auth.split(None, 1)[1].strip()
            try:
                from app.platform.security.tokens import decode_token
                payload = decode_token(token)
                return f"user:{payload.get('sub', 'unknown')}"
            except Exception:
                return "user:invalid-token"
        credential = api_key or (auth if auth.lower().startswith(("apikey ", "rel_")) else "")
        if credential:
            return "key:" + hashlib.sha256(credential.encode("utf-8")).hexdigest()[:32]
        client = request.client
        return f"ip:{client.host if client else 'unknown'}"

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        idempotency_key = request.headers.get("idempotency-key")
        if not idempotency_key or request.method not in ["POST", "PATCH"]:
            return await call_next(request)

        try:
            # The idempotency cache MUST be scoped to the authenticated
            # principal.  A global `idempotency:{key}` namespace lets tenant A
            # replay tenant B's cached response (cross-tenant data leak) when
            # two clients happen to use the same key (e.g. both frontends use
            # a fixed key for the "create org" flow).
            principal = self._idempotency_principal(request)
            cache_key = f"idempotency:{principal}:{idempotency_key}"
            cached_resp = await safe_redis_get(cache_key)
            if cached_resp:
                data = json.loads(cached_resp)
                return Response(
                    content=data["content"],
                    status_code=data["status_code"],
                    media_type=data.get("media_type", "application/json"),
                    headers=data.get("headers", {}),
                )

            # Single-flight lock: only the first concurrent request with this
            # idempotency key executes the handler.  Subsequent concurrent
            # requests get a 409 Conflict instead of both executing and
            # causing duplicate side effects (e.g. two orgs created).
            lock_key = f"{cache_key}:lock"
            acquired = await safe_redis_claim(lock_key, ex=60)
            if acquired is None:
                # Redis is unreachable, so no single-flight lock can be taken.
                # Deliberate fail-open for availability: answering 409 would
                # misreport an infrastructure failure as a client duplicate
                # and turn a Redis outage into a total outage of every
                # idempotent POST/PATCH. Requests proceed unguarded, so the
                # tradeoff is that genuinely concurrent retries may both
                # execute; handlers that must not double-apply enforce that
                # durably in the database (e.g. commissions are unique on
                # payment_reference), which is the real correctness boundary.
                logger.warning(
                    "Idempotency lock store unavailable - processing %s %s "
                    "without single-flight protection",
                    request.method,
                    request.url.path,
                )
                return await call_next(request)
            if acquired is False:
                return Response(
                    status_code=status.HTTP_409_CONFLICT,
                    media_type="application/json",
                    content='{"error":{"code":"IDEMPOTENT_REQUEST_IN_FLIGHT",'
                            '"message":"A request with this idempotency key is '
                            'already being processed"}}',
                )

            try:
                response = await call_next(request)
            finally:
                # Best-effort lock release; TTL handles crashes.
                try:
                    from app.platform.integrations.redis import get_redis
                    redis = get_redis()
                    await redis.delete(lock_key)
                except Exception:
                    pass

            if self._is_cacheable_status(response.status_code):
                body = [section async for section in response.body_iterator]
                response.body_iterator = iterate_in_threadpool(iter(body))  # type: ignore
                content = b"".join(body).decode("utf-8")

                # Filter out hop-by-hop headers before caching
                safe_headers = {
                    k: v for k, v in response.headers.items()
                    if k.lower() not in self._HOP_BY_HOP
                }

                await safe_redis_setex(
                    cache_key,
                    86400,  # 24 hours TTL
                    json.dumps(
                        {
                            "status_code": response.status_code,
                            "content": content,
                            "media_type": response.media_type,
                            "headers": safe_headers,
                        }
                    ),
                )
                return Response(
                    content=content,
                    status_code=response.status_code,
                    media_type=response.media_type,
                    headers=safe_headers,
                )
            return response
        except Exception as exc:
            logger.warning("Idempotency cache fallback (Redis error): %s", exc)
            return await call_next(request)
