"""One bounded, DNS-pinned HTTP execution path for customer and public checks."""
import asyncio
import logging
import time
import urllib.parse
from dataclasses import dataclass
import httpx
from app.core.ssrf_protection import resolve_pinned_target_async, pinned_transport_for
from app.modules.checks.constants import BLOCKED_BY_SECURITY_POLICY_PREFIX, REDIRECT_BLOCKED_BY_SECURITY_POLICY_PREFIX, TOO_MANY_REDIRECTS_PREFIX

logger = logging.getLogger(__name__)
_MAX_REDIRECTS = 5

@dataclass(frozen=True)
class ProbeObservation:
    latency_ms: float
    status_code: int | None
    is_up: bool
    error_message: str | None

async def observe_http(url, method='GET', headers=None, timeout=10.0, expected_codes=None, probe_id=None):
    headers = headers or {}
    expected_codes = expected_codes or [200]
    status_code = None
    error_message = None
    is_up = False
    async def run():
        nonlocal status_code, error_message, is_up
        start_time = time.perf_counter()
        try:
            try:
                pinned_target = await resolve_pinned_target_async(url)
            except ValueError as exc:
                return ProbeObservation((time.perf_counter() - start_time) * 1000, None, False, f'{BLOCKED_BY_SECURITY_POLICY_PREFIX}: {exc}')
            # Redirects are followed manually instead of via httpx
            # (follow_redirects) so that EVERY hop is re-validated against
            # the SSRF policy and pinned to a freshly validated IP (FIX 26).
            # Vendor endpoints routinely redirect (http->https, www->apex,
            # CDN routing); blindly following them with a pinned transport
            # would silently send cross-host requests to the wrong IP. The
            # hop cap makes a redirect loop a failed check, not an unbounded
            # request.
            #
            # Security: credentials configured for the ORIGINAL host
            # (Authorization / X-API-Key / Cookie headers) are stripped when
            # a redirect crosses to a different host, so an open redirect or
            # third-party error page can never capture org credentials.
            _SENSITIVE_HEADERS = {
                "authorization",
                "x-api-key",
                "cookie",
                "proxy-authorization",
            }
            redirects_followed = 0
            current_url = url
            current_target = pinned_target
            current_headers = dict(headers)
            current_method = method
            redirect_error: str | None = None
            while True:
                transport = pinned_transport_for(current_target)
                async with httpx.AsyncClient(
                    transport=transport, timeout=timeout
                ) as client:
                    response = await client.request(
                        method=current_method,
                        url=current_url,
                        headers=current_headers,
                    )
                if response.status_code in {
                    301,
                    302,
                    303,
                    307,
                    308,
                } and response.headers.get("location"):
                    if redirects_followed >= _MAX_REDIRECTS:
                        redirect_error = f"{TOO_MANY_REDIRECTS_PREFIX} (> {_MAX_REDIRECTS})"
                        break
                    next_url = urllib.parse.urljoin(
                        current_url, response.headers["location"]
                    )
                    try:
                        current_target = await resolve_pinned_target_async(next_url)
                    except ValueError as exc:
                        redirect_error = f"{REDIRECT_BLOCKED_BY_SECURITY_POLICY_PREFIX}: {exc}"
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
                is_up = False
                error_message = redirect_error
            elif response.status_code in expected_codes:
                is_up = True
            else:
                is_up = False
                error_message = f"Unexpected status code: {response.status_code}"
        except Exception as exc:
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            is_up = False
            error_message = f"{type(exc).__name__}: {str(exc) or 'Request failed'}"
            logger.warning(
                "Check HTTP request failed for dep %s: %s", probe_id, type(exc).__name__
            )

        return ProbeObservation(latency_ms, status_code, is_up, error_message)
    started = time.perf_counter()
    try:
        return await asyncio.wait_for(run(), timeout=float(timeout))
    except asyncio.TimeoutError:
        return ProbeObservation((time.perf_counter() - started) * 1000, None, False, 'Timeout: check exceeded its deadline')
