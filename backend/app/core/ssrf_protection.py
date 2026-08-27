"""SSRF protection with DNS-rebinding-safe IP pinning.

The naive approach — resolve the hostname, validate the IPs, then let httpx
connect — has a TOCTOU window: an attacker-controlled DNS server can return a
public IP during validation and a private IP (e.g. 169.254.169.254) when the
HTTP client actually connects.

This module closes that window by **pinning the connection to a validated IP**:

1. ``resolve_pinned_target`` resolves the hostname once and verifies *every*
   resolved IP is public.
2. ``pinned_transport_for`` builds an httpcore-based transport whose TCP
   connection targets the pinned IP directly while TLS SNI, certificate
   hostname verification, and the ``Host`` header still use the original
   hostname (httpcore ``sni_hostname`` extension).

Transports are cached per (hostname, port, scheme, ip) so repeated checks
reuse warm httpcore connection pools.
"""

from __future__ import annotations

import ipaddress
import logging
import socket
import ssl
import urllib.parse

import httpcore
import httpx

logger = logging.getLogger(__name__)

# RFC 1918 / RFC 3927 / link-local / loopback ranges that must never be hit
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),  # "this network" / unspecified v4
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),  # CGNAT (cloud internal)
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local / cloud metadata
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("::/128"),  # unspecified v6
    ipaddress.ip_network("fc00::/7"),  # unique local
    ipaddress.ip_network("fe80::/10"),  # link-local
]

# NAT64 prefix (RFC 6052): the final 32 bits embed an IPv4 address.
_NAT64_NETWORK = ipaddress.ip_network("64:ff9b::/96")


def _normalize_ip(ip_str: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address:
    """Parse an address and unwrap IPv4-embedded IPv6 forms.

    ``::ffff:169.254.169.254`` parses as IPv6Address, which does NOT match the
    IPv4 blocked networks — a classic SSRF bypass. Unwrap:

    * IPv4-mapped (::ffff:a.b.c.d)  → the embedded IPv4 address
    * NAT64 (64:ff9b::a.b.c.d)      → the embedded IPv4 address
    """
    ip = ipaddress.ip_address(ip_str)
    if isinstance(ip, ipaddress.IPv6Address):
        mapped = ip.ipv4_mapped
        if mapped is not None:
            return mapped
        if ip in _NAT64_NETWORK:
            return ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
    return ip


def _is_blocked_ip(ip_str: str) -> bool:
    """True when *ip_str* is a literal address inside a blocked range.

    Used for addresses that are already known to be IPs (i.e. DNS answers), so
    an unparseable value is a resolver anomaly and is treated as hostile.
    """
    try:
        ip = _normalize_ip(ip_str)
    except ValueError:
        # Unparseable addresses are treated as hostile.
        return True
    return any(ip in net for net in _BLOCKED_NETWORKS)


def _is_blocked_ip_literal(host: str) -> bool:
    """True only when *host* is written as a literal IP **and** it is blocked.

    A URL host is either a literal IP or a DNS name. `_is_blocked_ip` answers
    "hostile" for anything it cannot parse, which is right for resolver output
    but wrong here: every ordinary hostname ("example.com") is unparseable as
    an IP, so using it to pre-screen the host rejected *all* hostname-based
    URLs before DNS resolution ever ran. Names return False here and are
    validated by the resolve-then-check step that follows.
    """
    try:
        ip = _normalize_ip(host)
    except ValueError:
        return False
    return any(ip in net for net in _BLOCKED_NETWORKS)


def _resolve_hostname(hostname: str) -> list[str]:
    """Resolve a hostname to all its IP addresses.

    NOTE: blocking (socket.getaddrinfo). Async callers should use
    :func:`_resolve_hostname_async` so a slow resolver cannot stall the
    event loop.
    """
    try:
        results = socket.getaddrinfo(
            hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM
        )
        return [r[4][0] for r in results]
    except socket.gaierror:
        return []


async def _resolve_hostname_async(hostname: str) -> list[str]:
    """Threaded variant of :func:`_resolve_hostname` for async contexts."""
    import asyncio

    return await asyncio.to_thread(_resolve_hostname, hostname)


def _is_public_ip(ip_str: str) -> bool:
    return not _is_blocked_ip(ip_str)


_ALLOWED_SCHEMES = {"http", "https"}


def is_url_safe(
    url: str, *, allowed_schemes: set[str] | None = None
) -> tuple[bool, str]:
    """
    Validate that *url* does not point to a private / internal IP range.

    Returns (is_safe, reason).  When *is_safe* is False, *reason* explains why.
    NOTE: performs blocking DNS — prefer :func:`is_url_safe_async` in async code.
    """
    allowed = allowed_schemes or _ALLOWED_SCHEMES

    try:
        parsed = urllib.parse.urlparse(url)
    except Exception as exc:
        return False, f"Cannot parse URL: {exc}"

    if parsed.scheme.lower() not in allowed:
        return False, f"Scheme '{parsed.scheme}' is not allowed"

    hostname = parsed.hostname
    if not hostname:
        return False, "URL has no hostname"

    # Check if the hostname itself is a numeric IP (covers IPv4-mapped IPv6
    # and NAT64 forms via normalization)
    if _is_blocked_ip_literal(hostname):
        return False, f"IP {hostname} points to a private/blocked network"

    # Resolve the hostname and check every resolved IP
    resolved_ips = _resolve_hostname(hostname)
    if not resolved_ips:
        return False, f"Cannot resolve hostname '{hostname}'"

    for resolved in resolved_ips:
        if _is_blocked_ip(resolved):
            return (
                False,
                (
                    f"Hostname '{hostname}' resolves to {resolved}, "
                    f"which is in a private/blocked network"
                ),
            )

    return True, ""


async def is_url_safe_async(
    url: str, *, allowed_schemes: set[str] | None = None
) -> tuple[bool, str]:
    """Non-blocking variant of :func:`is_url_safe` (DNS runs in a thread)."""
    allowed = allowed_schemes or _ALLOWED_SCHEMES

    try:
        parsed = urllib.parse.urlparse(url)
    except Exception as exc:
        return False, f"Cannot parse URL: {exc}"

    if parsed.scheme.lower() not in allowed:
        return False, f"Scheme '{parsed.scheme}' is not allowed"

    hostname = parsed.hostname
    if not hostname:
        return False, "URL has no hostname"

    if _is_blocked_ip_literal(hostname):
        return False, f"IP {hostname} points to a private/blocked network"

    resolved_ips = await _resolve_hostname_async(hostname)
    if not resolved_ips:
        return False, f"Cannot resolve hostname '{hostname}'"

    for resolved in resolved_ips:
        if _is_blocked_ip(resolved):
            return (
                False,
                (
                    f"Hostname '{hostname}' resolves to {resolved}, "
                    f"which is in a private/blocked network"
                ),
            )

    return True, ""


def validate_outbound_url(url: str, *, allowed_schemes: set[str] | None = None) -> None:
    """
    Raise ``ValueError`` when *url* targets a blocked IP range or uses
    a disallowed scheme.  Safe to call from service-layer code.
    """
    safe, reason = is_url_safe(url, allowed_schemes=allowed_schemes)
    if not safe:
        raise ValueError(f"URL safety check failed: {reason}")


# ---------------------------------------------------------------------------
# Pinned (DNS-rebinding-safe) transport
# ---------------------------------------------------------------------------


class PinnedTarget:
    """A validated URL together with the exact IPs the connection may use."""

    def __init__(self, url: str, hostname: str, port: int, ips: list[str]) -> None:
        self.url = url
        self.hostname = hostname
        self.port = port
        self.ips = ips


def resolve_pinned_target(url: str) -> PinnedTarget:
    """Validate *url* and pin it to its currently-resolved public IPs.

    Raises ``ValueError`` when the URL is unsafe or unresolvable.
    NOTE: blocking DNS — prefer :func:`resolve_pinned_target_async` in async code.
    """
    validate_outbound_url(url)
    parsed = urllib.parse.urlparse(url)
    hostname = parsed.hostname or ""
    resolved = _resolve_hostname(hostname)
    if not resolved:
        raise ValueError(f"Cannot resolve hostname '{hostname}'")
    for ip in resolved:
        if not _is_public_ip(ip):
            raise ValueError(
                f"Hostname '{hostname}' resolves to {ip}, "
                f"which is in a private/blocked network"
            )
    use_ssl = parsed.scheme.lower() == "https"
    port = parsed.port or (443 if use_ssl else 80)
    return PinnedTarget(url=url, hostname=hostname, port=port, ips=resolved)


async def resolve_pinned_target_async(url: str) -> PinnedTarget:
    """Non-blocking variant of :func:`resolve_pinned_target`.

    DNS resolution runs in a worker thread so a slow resolver cannot stall
    the event loop while probes are executing.
    """
    safe, reason = await is_url_safe_async(url)
    if not safe:
        raise ValueError(f"URL safety check failed: {reason}")
    parsed = urllib.parse.urlparse(url)
    hostname = parsed.hostname or ""
    resolved = await _resolve_hostname_async(hostname)
    if not resolved:
        raise ValueError(f"Cannot resolve hostname '{hostname}'")
    for ip in resolved:
        if not _is_public_ip(ip):
            raise ValueError(
                f"Hostname '{hostname}' resolves to {ip}, "
                f"which is in a private/blocked network"
            )
    use_ssl = parsed.scheme.lower() == "https"
    port = parsed.port or (443 if use_ssl else 80)
    return PinnedTarget(url=url, hostname=hostname, port=port, ips=resolved)


class _PinnedIPTransport(httpx.AsyncBaseTransport):
    """httpx transport that connects to a fixed IP while preserving TLS/SNI.

    The connection pool's origin host is the pinned IP; the ``sni_hostname``
    extension tells httpcore to verify the server certificate against the real
    hostname and to send it during the TLS handshake.
    """

    def __init__(
        self,
        hostname: str,
        ip: str,
        port: int,
        use_ssl: bool,
        max_connections: int = 100,
        max_keepalive_connections: int = 20,
    ) -> None:
        scheme = b"https" if use_ssl else b"http"
        origin = httpcore.URL(
            scheme=scheme,
            host=ip.encode("utf-8"),
            port=port,
        )
        ssl_context = ssl.create_default_context() if use_ssl else None
        self._pool = httpcore.AsyncConnectionPool(
            ssl_context=ssl_context,
            max_connections=max_connections,
            max_keepalive_connections=max_keepalive_connections,
            retries=0,
        )
        self._origin = origin
        self._hostname = hostname

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        assert isinstance(request.stream, httpx.AsyncByteStream)
        body = request.stream

        core_request = httpcore.Request(
            method=request.method,
            url=httpcore.URL(
                scheme=self._origin.scheme,
                host=self._origin.host,
                port=self._origin.port,
                target=request.url.raw_path,
            ),
            headers=[
                (k.encode("latin-1"), v.encode("latin-1"))
                for k, v in request.headers.items()
            ],
            content=body,
            extensions={"sni_hostname": self._hostname},
        )
        core_response = await self._pool.handle_async_request(core_request)
        try:
            from httpx._transports.default import AsyncResponseStream
        except ImportError:  # pragma: no cover - httpx version drift
            from httpx._transports.default import (
                ResponseStream as AsyncResponseStream,  # type: ignore[no-redef]
            )
        return httpx.Response(
            status_code=core_response.status,
            headers=[
                (k.decode("latin-1"), v.decode("latin-1"))
                for k, v in core_response.headers
            ],
            stream=AsyncResponseStream(core_response.stream),
            extensions=core_response.extensions,
        )

    async def aclose(self) -> None:
        await self._pool.aclose()


# Cache of pinned transports keyed by (hostname, port, use_ssl, ip).
_pinned_transport_cache: dict[tuple[str, int, bool, str], _PinnedIPTransport] = {}


def pinned_transport_for(
    target: PinnedTarget, ip: str | None = None
) -> httpx.AsyncBaseTransport:
    """Return a cached, pinned transport for *target*.

    Connections are keyed to a single validated IP, eliminating the
    resolve→connect TOCTOU window that enables DNS rebinding.
    """
    use_ssl = target.url.lower().startswith("https://")
    pinned_ip = ip or target.ips[0]
    key = (target.hostname, target.port, use_ssl, pinned_ip)
    transport = _pinned_transport_cache.get(key)
    if transport is None:
        transport = _PinnedIPTransport(
            hostname=target.hostname,
            ip=pinned_ip,
            port=target.port,
            use_ssl=use_ssl,
        )
        _pinned_transport_cache[key] = transport
    return transport


async def close_pinned_transports() -> None:
    """Close all cached pinned transports (used on shutdown/tests)."""
    for transport in list(_pinned_transport_cache.values()):
        try:
            await transport.aclose()
        except Exception:  # pragma: no cover - defensive
            logger.debug("Error closing pinned transport", exc_info=True)
    _pinned_transport_cache.clear()
