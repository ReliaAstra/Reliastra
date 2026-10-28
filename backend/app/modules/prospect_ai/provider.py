"""Admin-configured LLM provider profiles for Prospect AI drafting.

Provider-agnostic by contract: the wire format is one of
``openai_compatible`` / ``anthropic`` / ``google``, carried by the same
:class:`PlatformLLM` dataclass and the same pinned, retrying
:func:`call_llm` transport the Reliastra-managed LLM uses. An
admin-supplied endpoint is never trusted with outbound reachability: it
goes through ``resolve_pinned_target`` + ``pinned_transport_for`` inside
``call_llm``, so an internal address resolves to a config problem, not a
successful POST from inside the network.

Resolution order: the active ``ai_provider_profiles`` row (decrypted at
call time), falling back to the platform ``RELIASTRA_AI_*`` settings when
no profile is active.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import ValidationException
from app.modules.ai_integration.service import AIService, PlatformLLM, call_llm
from app.modules.prospect_ai.models import AIProviderProfile
from app.platform.security.field_encryption import decrypt_jsonb, encrypt_jsonb

logger = logging.getLogger(__name__)

PROVIDER_TYPES = {"openai_compatible", "anthropic", "google"}

MIN_TEMPERATURE = 0.0
MAX_TEMPERATURE = 2.0
MIN_MAX_TOKENS = 256
MAX_MAX_TOKENS = 200_000
MIN_TIMEOUT = 5.0
MAX_TIMEOUT = 300.0


def _validate_profile_fields(
    *, provider_type: str, endpoint_url: str, model_name: str,
    temperature: float, max_tokens: int, timeout_seconds: float,
) -> None:
    if provider_type not in PROVIDER_TYPES:
        raise ValidationException(
            f"provider_type must be one of {sorted(PROVIDER_TYPES)}."
        )
    endpoint = (endpoint_url or "").strip()
    if not endpoint.startswith("https://"):
        raise ValidationException(
            "endpoint_url must be an https URL - API keys do not travel in "
            "plaintext over http."
        )
    if not (model_name or "").strip():
        raise ValidationException("model is required.")
    if not MIN_TEMPERATURE <= temperature <= MAX_TEMPERATURE:
        raise ValidationException(
            f"temperature must be between {MIN_TEMPERATURE} and {MAX_TEMPERATURE}."
        )
    if not MIN_MAX_TOKENS <= max_tokens <= MAX_MAX_TOKENS:
        raise ValidationException(
            f"max_tokens must be between {MIN_MAX_TOKENS} and {MAX_MAX_TOKENS}."
        )
    if not MIN_TIMEOUT <= timeout_seconds <= MAX_TIMEOUT:
        raise ValidationException(
            f"timeout_seconds must be between {MIN_TIMEOUT} and {MAX_TIMEOUT}."
        )


async def get_active_profile(db: AsyncSession) -> AIProviderProfile | None:
    """The single active provider row, or None."""
    return (
        await db.execute(
            select(AIProviderProfile)
            .where(AIProviderProfile.is_active.is_(True))
            .order_by(AIProviderProfile.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


def profile_to_llm(profile: AIProviderProfile) -> PlatformLLM:
    """Decrypt the stored key and build the immutable call spec."""
    key: str | None = None
    if profile.api_key_encrypted:
        data = decrypt_jsonb(profile.api_key_encrypted)
        key = data.get("api_key") if isinstance(data, dict) else None
    return PlatformLLM(
        provider_type=profile.provider_type,
        endpoint_url=profile.endpoint_url,
        model_name=profile.model_name,
        api_key=key or "",
        max_tokens=profile.max_tokens,
        temperature=profile.temperature,
        timeout_seconds=profile.timeout_seconds,
    )


async def resolve_active_profile(db: AsyncSession) -> PlatformLLM | None:
    """Drafting model resolution: active profile first, platform env fallback."""
    profile = await get_active_profile(db)
    if profile is not None:
        llm = profile_to_llm(profile)
        if llm.api_key:
            return llm
        logger.warning(
            "Active AI provider profile %s has no usable key - falling back "
            "to platform config.", profile.id,
        )
    return AIService.platform_model()


def active_profile_source(profile: AIProviderProfile | None) -> str:
    return "profile" if profile is not None else "platform"


async def save_profile(
    db: AsyncSession,
    *,
    provider_type: str,
    endpoint_url: str,
    model_name: str,
    api_key: str | None,
    temperature: float,
    max_tokens: int,
    timeout_seconds: float,
    label: str = "Primary",
) -> AIProviderProfile:
    """Upsert the single active profile. Deactivates any previous row."""
    _validate_profile_fields(
        provider_type=provider_type,
        endpoint_url=endpoint_url,
        model_name=model_name,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout_seconds=timeout_seconds,
    )
    existing = await get_active_profile(db)
    if existing is None:
        # Keep any inactive historical row if it exists; otherwise create.
        existing = (
            await db.execute(
                select(AIProviderProfile).order_by(
                    AIProviderProfile.created_at.desc()
                ).limit(1)
            )
        ).scalar_one_or_none()
    if existing is None:
        existing = AIProviderProfile()
        db.add(existing)
    if api_key and api_key.strip():
        existing.api_key_encrypted = encrypt_jsonb({"api_key": api_key.strip()})
    existing.label = (label or "Primary")[:120]
    existing.provider_type = provider_type
    existing.endpoint_url = endpoint_url.strip()
    existing.model_name = model_name.strip()
    existing.temperature = temperature
    existing.max_tokens = max_tokens
    existing.timeout_seconds = timeout_seconds
    existing.is_active = True
    await db.commit()
    await db.refresh(existing)
    return existing


async def test_profile(
    db: AsyncSession,
    *,
    api_key: str | None = None,
    provider_type: str | None = None,
    endpoint_url: str | None = None,
    model_name: str | None = None,
) -> dict[str, Any]:
    """Minimal live completion to prove the endpoint works.

    Ephemeral probe: when the caller supplied overrides, nothing is
    persisted and a failed test records nothing. A test against the saved
    active profile updates its ``last_test_*`` columns only. The probe
    rides the same pinned transport as real drafting.
    """
    overrides = any(
        v is not None for v in (provider_type, endpoint_url, model_name)
    )
    if overrides:
        resolved_provider = provider_type or "openai_compatible"
        resolved_endpoint = endpoint_url or ""
        resolved_model = model_name or ""
        key = (api_key or "").strip()
        if not key:
            return {"ok": False, "detail": "api_key is required for a test."}
        try:
            _validate_profile_fields(
                provider_type=resolved_provider,
                endpoint_url=resolved_endpoint,
                model_name=resolved_model,
                temperature=settings.RELIASTRA_AI_TEMPERATURE,
                max_tokens=settings.RELIASTRA_AI_MAX_TOKENS,
                timeout_seconds=60.0,
            )
        except ValidationException as exc:
            return {"ok": False, "detail": str(exc)}
        llm = PlatformLLM(
            provider_type=resolved_provider,
            endpoint_url=resolved_endpoint.strip(),
            model_name=resolved_model.strip(),
            api_key=key,
            max_tokens=settings.RELIASTRA_AI_MAX_TOKENS,
            temperature=settings.RELIASTRA_AI_TEMPERATURE,
            timeout_seconds=60.0,
        )
        profile_row: AIProviderProfile | None = None
    else:
        profile_row = await get_active_profile(db)
        if profile_row is None:
            platform = AIService.platform_model()
            if platform is None:
                return {
                    "ok": False,
                    "detail": "No provider profile and no platform "
                    "RELIASTRA_AI_* configuration to test.",
                }
            llm = platform
            profile_row = None
        else:
            llm = profile_to_llm(profile_row)
            if not llm.api_key:
                return {
                    "ok": False,
                    "detail": "Saved profile has no decryptable API key - "
                    "re-enter the key and save.",
                }

    started = time.monotonic()
    try:
        result = await call_llm(
            llm,
            "Reply with exactly one word: ok",
        )
        text = (result.get("text") or "").strip()
        elapsed_ms = int((time.monotonic() - started) * 1000)
        ok = bool(text)
        detail = f"model replied: {text[:80]}" if ok else "empty completion"
    except Exception as exc:
        elapsed_ms = int((time.monotonic() - started) * 1000)
        ok = False
        detail = f"{type(exc).__name__}: {str(exc)[:300]}"

    if profile_row is not None:
        profile_row.last_test_at = datetime.now(timezone.utc)
        profile_row.last_test_ok = ok
        profile_row.last_test_detail = detail[:1000]
        await db.commit()

    return {
        "ok": ok,
        "latency_ms": elapsed_ms,
        "model": llm.model_name,
        "detail": detail,
    }
