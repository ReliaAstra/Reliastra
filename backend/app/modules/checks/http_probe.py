"""One bounded, DNS-pinned HTTP execution path for customer and public checks.

Every hop resolves its own pinned target and runs on its own pinned
transport, so a pooled client cannot be shared here — instead each hop
builds a fresh client from the shared factory (``build_client``), which is
what also propagates the ambient trace to the probed target's access logs.
"""

from __future__ import annotations

import asyncio
import logging
import time
import urllib.parse
from dataclasses import dataclass
from typing import Any

from app.modules.checks.constants import (
    BLOCKED_BY_SECURITY_POLICY_PREFIX,
    REDIRECT_BLOCKED_BY_SECURITY_POLICY_PREFIX,
    TOO_MANY_REDIRECTS_PREFIX,
)
from app.platform.integrations.http import build_client
from app.platform.security.ssrf import pinned_transport_for, resolve_pinned_target_async

logger = logging.getLogger(__name__)

#: Maximum redirect hops followed by a single probe. A redirect loop becomes
#: a failed check, never an unbounded request.
_MAX_REDIRECTS = 5

#: Credential headers stripped when a redirect crosses to a different host,
#: so an open redirect or third-party error page can never capture org
#: credentials configured for the original host.
_SENSITIVE_HEADERS = frozenset(
    {"authorization", "x-api-key", "cookie", "proxy-authorization"}
)

_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})


@dataclass(frozen=True)
class ProbeObservation:
    latency_ms: float
    status_code: int | None
    is_up: bool
    error_message: str | None

    @property
    def semantics(self) -> dict:
        from app.modules.observations.semantics import normalize
        return normalize(self.status_code, None if self.is_up else 'probe_failed', self.error_message,
                         {'observation': {'evaluation': 'expected' if self.is_up else 'unexpected'}})

    @property
    def error_type(self) -> str | None:
        if self.is_up:
            return None
        return 'unexpected_http_response' if self.status_code is not None else self.semantics['transport_status']


async def observe_http(
    url: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    timeout: float = 10.0,
    expected_codes: list[int] | None = None,
    probe_id: Any | None = None,
) -> ProbeObservation:
    """Probe *url* once and classify the outcome.

    Redirects are followed manually instead of via httpx
    (``follow_redirects``) so that EVERY hop is re-validated against the
    SSRF policy and pinned to a freshly validated IP (FIX 26). Vendor
    endpoints routinely redirect (http->https, www->apex, CDN routing);
    blindly following them with a pinned transport would silently send
    cross-host requests to the wrong IP.
    """
    headers = headers or {}
    expected_codes = [200] if expected_codes is None else expected_codes
    if not expected_codes or any(not isinstance(code, int) or not 100 <= code <= 599 for code in expected_codes):
        raise ValueError('expected_codes must be a nonempty list of HTTP statuses')
    last_status: int | None = None

    async def run() -> ProbeObservation:
        nonlocal last_status
        start_time = time.perf_counter()
        try:
            try:
                current_target = await resolve_pinned_target_async(url)
            except ValueError as exc:
                return ProbeObservation(
                    (time.perf_counter() - start_time) * 1000,
                    None,
                    False,
                    f"{BLOCKED_BY_SECURITY_POLICY_PREFIX}: {exc}",
                )

            current_url = url
            current_headers = dict(headers)
            current_method = method
            redirects_followed = 0
            redirect_error: str | None = None
            while True:
                transport = pinned_transport_for(current_target)
                async with build_client(
                    "checks-probe", transport=transport, timeout=timeout
                ) as client:
                    response = await client.request(
                        method=current_method,
                        url=current_url,
                        headers=current_headers,
                    )
                last_status = response.status_code
                if (
                    response.status_code in _REDIRECT_STATUSES
                    and response.headers.get("location")
                ):
                    if redirects_followed >= _MAX_REDIRECTS:
                        redirect_error = (
                            f"{TOO_MANY_REDIRECTS_PREFIX} (> {_MAX_REDIRECTS})"
                        )
                        break
                    next_url = urllib.parse.urljoin(
                        current_url, response.headers["location"]
                    )
                    try:
                        current_target = await resolve_pinned_target_async(next_url)
                    except ValueError as exc:
                        redirect_error = (
                            f"{REDIRECT_BLOCKED_BY_SECURITY_POLICY_PREFIX}: {exc}"
                        )
                        break
                    # RFC 7231 §6.4.4: 303 switches the next request to GET.
                    if response.status_code == 303 and current_method in {
                        "POST",
                        "PUT",
                        "PATCH",
                        "DELETE",
                    }:
                        current_method = "GET"
                        current_headers = {
                            k: v
                            for k, v in current_headers.items()
                            if k.lower() != "content-type"
                        }
                    # Cross-host redirect: drop credential headers.
                    if (
                        urllib.parse.urlsplit(next_url).netloc
                        != urllib.parse.urlsplit(current_url).netloc
                    ):
                        current_headers = {
                            k: v
                            for k, v in current_headers.items()
                            if k.lower() not in _SENSITIVE_HEADERS
                        }
                    current_url = next_url
                    redirects_followed += 1
                    continue
                break

            latency_ms = (time.perf_counter() - start_time) * 1000.0
            status_code = response.status_code
            if redirect_error:
                return ProbeObservation(latency_ms, status_code, False, redirect_error)
            if response.status_code in expected_codes:
                return ProbeObservation(latency_ms, status_code, True, None)
            return ProbeObservation(
                latency_ms,
                status_code,
                False,
                f"Unexpected status code: {response.status_code}",
            )
        except Exception as exc:
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            logger.warning(
                "Check HTTP request failed for dep %s: %s", probe_id, type(exc).__name__
            )
            return ProbeObservation(
                latency_ms,
                last_status,
                False,
                f"{type(exc).__name__}: {str(exc) or 'Request failed'}",
            )

    started = time.perf_counter()
    try:
        return await asyncio.wait_for(run(), timeout=float(timeout))
    except asyncio.TimeoutError:
        return ProbeObservation(
            (time.perf_counter() - started) * 1000,
            last_status,
            False,
            "Timeout: check exceeded its deadline",
        )
