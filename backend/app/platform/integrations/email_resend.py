from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
TIMEOUT = httpx.Timeout(10.0)
LIMITS = httpx.Limits(max_connections=20, max_keepalive_connections=10)

_client: httpx.AsyncClient | None = None


def _client_get() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=TIMEOUT, limits=LIMITS)
    return _client


async def close_resend_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _from_for_category(category: str) -> str:
    cat = (category or "").lower()
    if cat in {"monitor_alert", "incident", "incident_notification", "alert"}:
        return settings.RESEND_ALERTS_FROM_EMAIL
    return settings.RESEND_FROM_EMAIL


def _reply_to_for_category(category: str) -> str | None:
    cat = (category or "").lower()
    if cat in {"security", "security_notification"}:
        return settings.SECURITY_EMAIL
    if cat in {"billing", "payment", "subscription", "trial"}:
        return settings.BILLING_EMAIL
    if cat in {"partner", "partners"}:
        return settings.PARTNERS_EMAIL
    # default monitoring/account/billing -> support
    return settings.SUPPORT_EMAIL


def _api_key() -> str | None:
    raw = settings.RESEND_API_KEY
    if raw is None:
        return None
    elif hasattr(raw, "get_secret_value"):
        try:
            return raw.get_secret_value()  # type: ignore[attr-defined]
        except Exception:
            return str(raw)
    else:
        return str(raw)


def _build_payload(
    *,
    to: str | list[str],
    subject: str,
    html: str,
    text: str | None,
    category: str,
    tags: list[dict[str, str]] | None,
    correlation_id: str | None,
) -> tuple[dict[str, Any], list[str]]:
    recipients = [to] if isinstance(to, str) else to
    # sanitize tags - only opaque ids, no PII
    safe_tags = tags or []
    # add category tag
    safe_tags = [{"name": "category", "value": category[:64]}] + safe_tags[:9]
    if correlation_id:
        safe_tags.append({"name": "correlation_id", "value": correlation_id[:64]})

    payload: dict[str, Any] = {
        "from": _from_for_category(category),
        "to": recipients,
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text
    reply_to = _reply_to_for_category(category)
    if reply_to:
        payload["reply_to"] = reply_to
    if safe_tags:
        payload["tags"] = safe_tags
    return payload, recipients
async def send_via_resend(
    *,
    to: str | list[str],
    subject: str,
    html: str,
    text: str | None = None,
    category: str = "transactional",
    tags: list[dict[str, str]] | None = None,
    correlation_id: str | None = None,
) -> tuple[bool, str | None]:
    """Send via Resend. Returns (ok, resend_id). Never logs secrets."""
    api_key = _api_key()
    if not api_key:
        return False, None

    payload, recipients = _build_payload(
        to=to,
        subject=subject,
        html=html,
        text=text,
        category=category,
        tags=tags,
        correlation_id=correlation_id,
    )

    try:
        client = _client_get()
        resp = await client.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        if resp.status_code >= 400:
            logger.warning("Resend API %s: %s", resp.status_code, resp.text[:500])
            return False, None
        data = resp.json()
        resend_id = data.get("id")
        logger.info(
            "Resend accepted category=%s to=%s id=%s",
            category,
            recipients[0][:3] + "***",
            resend_id,
        )
        return True, resend_id
    except Exception as exc:
        logger.warning("Resend send failed category=%s: %s", category, exc)
        return False, None


def send_via_resend_sync(
    *,
    to: str | list[str],
    subject: str,
    html: str,
    text: str | None = None,
    category: str = "transactional",
    tags: list[dict[str, str]] | None = None,
    correlation_id: str | None = None,
    timeout_seconds: float = 10.0,
) -> tuple[bool, str | None]:
    """Sync version of :func:`send_via_resend` for sync-only call sites.

    Same contract and payload - used by ``EmailClient`` so every SMTP-era
    caller becomes Resend-first without going async. Returns (ok, resend_id).
    Never logs secrets.
    """
    api_key = _api_key()
    if not api_key:
        return False, None

    payload, recipients = _build_payload(
        to=to,
        subject=subject,
        html=html,
        text=text,
        category=category,
        tags=tags,
        correlation_id=correlation_id,
    )

    try:
        with httpx.Client(timeout=timeout_seconds) as client:
            resp = client.post(
                RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if resp.status_code >= 400:
            logger.warning("Resend API %s: %s", resp.status_code, resp.text[:500])
            return False, None
        resend_id = resp.json().get("id")
        logger.info(
            "Resend accepted category=%s to=%s id=%s",
            category,
            recipients[0][:3] + "***",
            resend_id,
        )
        return True, resend_id
    except Exception as exc:
        logger.warning("Resend send failed category=%s: %s", category, exc)
        return False, None
