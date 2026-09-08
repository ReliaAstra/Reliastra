"""Resend API client for the Email Center.

Two responsibilities:

1. **Domain verification truth** - ``GET /domains`` tells us which sending
   domains are actually ``verified`` in the Resend account. Resend verifies
   *domains*, not individual mailbox aliases, so an alias is sendable iff
   its domain is verified. Results are cached briefly (TTL below) and the
   UI's "Refresh" actions bypass the cache.
2. **Delivery** - ``POST /emails`` with the full operational surface
   (display-name From, To/Cc/Bcc, Reply-To, attachments, tags).

The API key is read from settings on every call and never logged, never
returned, and never leaves this module's request path.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)

RESEND_BASE_URL = "https://api.resend.com"
DOMAINS_CACHE_TTL_SECONDS = 120.0
REQUEST_TIMEOUT_SECONDS = 15.0


def _api_key() -> str | None:
    # Single source of truth for key extraction (SecretStr-aware).
    from app.infrastructure.email_resend import _api_key as _base_api_key

    return _base_api_key()


@dataclass
class ResendDomainInfo:
    id: str
    name: str
    status: str  # verified | pending | failed | ... (raw provider value)
    records: list[dict[str, Any]] = field(default_factory=list)

    @property
    def verified(self) -> bool:
        return self.status.strip().lower() == "verified"


@dataclass
class ResendDomainsSnapshot:
    domains: list[ResendDomainInfo]
    fetched_at: float
    error: str | None = None  # technical detail for server logs only

    def status_for(self, domain: str) -> ResendDomainInfo | None:
        wanted = domain.strip().lower()
        for item in self.domains:
            if item.name.strip().lower() == wanted:
                return item
        return None


_domains_cache: ResendDomainsSnapshot | None = None


def clear_domains_cache() -> None:
    global _domains_cache
    _domains_cache = None


async def fetch_domains(*, force_refresh: bool = False) -> ResendDomainsSnapshot:
    """Return the Resend account's domains (cached briefly unless forced).

    When the API key is missing or the provider cannot be reached, the
    snapshot carries ``error`` and an empty domain list - callers must
    surface "Status unavailable", never invent verification state.
    """
    global _domains_cache
    now = time.time()
    if (
        not force_refresh
        and _domains_cache is not None
        and now - _domains_cache.fetched_at < DOMAINS_CACHE_TTL_SECONDS
    ):
        return _domains_cache

    api_key = _api_key()
    if not api_key:
        snapshot = ResendDomainsSnapshot(domains=[], fetched_at=now, error="missing_api_key")
        _domains_cache = snapshot
        return snapshot

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            resp = await client.get(
                f"{RESEND_BASE_URL}/domains",
                headers={"Authorization": f"Bearer {api_key}"},
            )
    except httpx.TimeoutException as exc:
        logger.warning("Resend domains lookup timed out: %s", exc)
        snapshot = ResendDomainsSnapshot(domains=[], fetched_at=now, error="timeout")
        _domains_cache = snapshot
        return snapshot
    except Exception as exc:
        logger.warning("Resend domains lookup failed: %s", exc)
        snapshot = ResendDomainsSnapshot(domains=[], fetched_at=now, error="network_error")
        _domains_cache = snapshot
        return snapshot

    if resp.status_code in (401, 403):
        logger.warning("Resend domains lookup rejected (%s): invalid API key", resp.status_code)
        snapshot = ResendDomainsSnapshot(domains=[], fetched_at=now, error="auth_failed")
        _domains_cache = snapshot
        return snapshot
    if resp.status_code == 429:
        logger.warning("Resend domains lookup rate-limited")
        snapshot = ResendDomainsSnapshot(domains=[], fetched_at=now, error="rate_limited")
        _domains_cache = snapshot
        return snapshot
    if resp.status_code >= 400:
        logger.warning("Resend domains lookup %s: %s", resp.status_code, resp.text[:300])
        snapshot = ResendDomainsSnapshot(
            domains=[], fetched_at=now, error=f"provider_http_{resp.status_code}"
        )
        _domains_cache = snapshot
        return snapshot

    try:
        payload = resp.json()
    except Exception:
        snapshot = ResendDomainsSnapshot(domains=[], fetched_at=now, error="bad_provider_payload")
        _domains_cache = snapshot
        return snapshot

    items = payload.get("data") if isinstance(payload, dict) else None
    domains: list[ResendDomainInfo] = []
    if isinstance(items, list):
        for entry in items:
            if not isinstance(entry, dict):
                continue
            name = str(entry.get("name") or "").strip()
            if not name:
                continue
            domains.append(
                ResendDomainInfo(
                    id=str(entry.get("id") or ""),
                    name=name,
                    status=str(entry.get("status") or "unknown"),
                    records=entry.get("records") if isinstance(entry.get("records"), list) else [],
                )
            )
    snapshot = ResendDomainsSnapshot(domains=domains, fetched_at=now)
    _domains_cache = snapshot
    return snapshot


# ── Delivery ──────────────────────────────────────────────────────────────


@dataclass
class ResendSendResult:
    ok: bool
    resend_id: str | None = None
    status_code: int | None = None
    error_code: str | None = None
    technical_detail: str | None = None  # server logs only, never to clients


async def send_email(
    *,
    sender: str,
    to: list[str],
    subject: str,
    html: str | None,
    text: str | None,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
    reply_to: str | None = None,
    attachments: list[dict[str, Any]] | None = None,
    tags: list[dict[str, str]] | None = None,
) -> ResendSendResult:
    """Send one message via Resend. Returns a structured result; never raises
    for provider-side failures. Never logs the API key or message bodies."""
    api_key = _api_key()
    if not api_key:
        return ResendSendResult(ok=False, error_code="missing_api_key")

    payload: dict[str, Any] = {"from": sender, "to": to, "subject": subject}
    if html:
        payload["html"] = html
    if text:
        payload["text"] = text
    if cc:
        payload["cc"] = cc
    if bcc:
        payload["bcc"] = bcc
    if reply_to:
        payload["reply_to"] = reply_to
    if attachments:
        payload["attachments"] = attachments
    if tags:
        payload["tags"] = tags

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                f"{RESEND_BASE_URL}/emails",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.TimeoutException:
        logger.warning("Resend send timed out (to=%s)", _mask(to[0]) if to else "?")
        return ResendSendResult(ok=False, error_code="timeout")
    except Exception as exc:
        logger.warning("Resend send network failure: %s", exc)
        return ResendSendResult(ok=False, error_code="network_error", technical_detail=str(exc)[:300])

    if resp.status_code >= 400:
        body = resp.text[:800]
        logger.warning("Resend send rejected (%s): %s", resp.status_code, body)
        code = _classify_send_error(resp.status_code, body)
        return ResendSendResult(
            ok=False,
            status_code=resp.status_code,
            error_code=code,
            technical_detail=f"HTTP {resp.status_code}: {body[:300]}",
        )

    try:
        resend_id = resp.json().get("id")
    except Exception:
        resend_id = None
    logger.info("Resend accepted email-center send to=%s id=%s", _mask(to[0]) if to else "?", resend_id)
    return ResendSendResult(ok=True, resend_id=resend_id, status_code=resp.status_code)


def _mask(email: str) -> str:
    if "@" in email:
        local, _, domain = email.partition("@")
        return f"{local[:2]}***@{domain}"
    return "***"


def _classify_send_error(status_code: int, body: str) -> str:
    lowered = body.lower()
    if status_code in (401, 403):
        return "auth_failed"
    if status_code == 429:
        return "rate_limited"
    if status_code == 422 or "validation" in lowered:
        if "domain" in lowered and ("not verified" in lowered or "unverified" in lowered):
            return "domain_not_verified"
        if "from" in lowered or "sender" in lowered or "domain" in lowered:
            return "invalid_sender"
        if "to" in lowered or "recipient" in lowered or "email" in lowered:
            return "invalid_recipient"
        return "validation_error"
    if status_code >= 500:
        return "provider_unavailable"
    return "provider_error"


# ── Friendly error copy (safe for admin UI) ───────────────────────────────

FRIENDLY_ERRORS: dict[str, str] = {
    "missing_api_key": (
        "Resend is not configured on this environment (no API key). "
        "Add RESEND_API_KEY to the backend environment, then retry."
    ),
    "auth_failed": (
        "Resend rejected the API credentials. Check that RESEND_API_KEY is "
        "valid and has not been revoked."
    ),
    "domain_not_verified": (
        "Resend rejected this sender identity. Verify that the sender domain "
        "is authorized in Resend first."
    ),
    "invalid_sender": (
        "Resend rejected this sender identity. Verify that the sender domain "
        "is authorized in Resend first."
    ),
    "invalid_recipient": (
        "Resend rejected one or more recipient addresses. Remove invalid or "
        "undeliverable addresses and try again."
    ),
    "validation_error": (
        "Resend rejected this message as invalid. Check the sender, "
        "recipients, and content, then try again."
    ),
    "rate_limited": (
        "Resend rate-limited this request. Wait a moment and try again."
    ),
    "timeout": (
        "The request to Resend timed out. The message may or may not have "
        "been accepted - check Resend before retrying."
    ),
    "network_error": (
        "Could not reach the Resend API. Check network connectivity and try again."
    ),
    "provider_unavailable": (
        "Resend is currently unavailable. Try again shortly."
    ),
    "provider_error": (
        "Resend could not deliver this message. Try again, and check the "
        "Resend dashboard if the problem persists."
    ),
}


def friendly_error(code: str | None) -> str:
    return FRIENDLY_ERRORS.get(
        code or "",
        "The message could not be sent. Try again, and check the Resend dashboard if the problem persists.",
    )
