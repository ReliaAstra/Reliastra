"""Reliastra-managed LLM integration.

The LLM behind AI explanations belongs to Reliastra. Endpoint, model,
credential and generation parameters come from platform configuration
(``app.config.Settings.RELIASTRA_AI_*``) — organizations never register a
provider, never supply a key, and never choose a model. The only tenant-side
control is an opt-out flag: ``organizations.ai_explanations_enabled``.

AI output is explanatory only. It restates pre-computed evidence and can
never create or alter attribution truth.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import ValidationException
from app.core.ssrf_protection import (
    pinned_transport_for,
    resolve_pinned_target,
)

logger = logging.getLogger(__name__)

# Prompt/context limits to bound memory and PDF size.
MAX_CONTEXT_JSON_CHARS = 6000
MAX_EXPLANATION_CHARS = 4000
MAX_RETRIES = 2
RETRY_BACKOFF_BASE = 0.5


@dataclass(frozen=True)
class PlatformLLM:
    """Immutable snapshot of the Reliastra-operated model."""

    provider_type: str
    endpoint_url: str
    model_name: str
    api_key: str
    max_tokens: int
    temperature: float
    timeout_seconds: float


class AIService:
    """Explanation generation backed by the Reliastra-managed LLM."""

    # ------------------------------------------------------------------
    # Platform model resolution
    # ------------------------------------------------------------------
    @staticmethod
    def platform_model() -> PlatformLLM | None:
        """Return the configured Reliastra LLM, or None when unavailable."""
        if not settings.ai_available:
            return None
        api_key = settings.ai_api_key
        if not api_key:
            return None
        return PlatformLLM(
            provider_type=settings.RELIASTRA_AI_PROVIDER_TYPE,
            endpoint_url=settings.RELIASTRA_AI_ENDPOINT_URL,
            model_name=settings.RELIASTRA_AI_MODEL,
            api_key=api_key,
            max_tokens=settings.RELIASTRA_AI_MAX_TOKENS,
            temperature=settings.RELIASTRA_AI_TEMPERATURE,
            timeout_seconds=settings.RELIASTRA_AI_TIMEOUT_SECONDS,
        )

    async def status(
        self, session: AsyncSession | None = None, org_id: uuid.UUID | None = None
    ) -> dict[str, Any]:
        """Non-secret description of the AI capability for an organization."""
        model = self.platform_model()
        org_opted_in = True
        if session is not None and org_id is not None:
            org_opted_in = await self._org_opted_in(session, org_id)
        return {
            "provider": "reliastra",
            "platform_configured": model is not None,
            "organization_enabled": org_opted_in,
            "enabled": model is not None and org_opted_in,
            "model_name": model.model_name if model else None,
        }

    @staticmethod
    async def _org_opted_in(session: AsyncSession, org_id: uuid.UUID) -> bool:
        """Respect an organization's opt-out of AI explanations."""
        from app.modules.organizations.repository import OrganizationRepository

        try:
            org = await OrganizationRepository.get_by_id(session, org_id)
        except Exception:
            logger.debug(
                "Could not load organization %s for AI opt-out check", org_id,
                exc_info=True,
            )
            return True
        if org is None:
            return False
        return bool(getattr(org, "ai_explanations_enabled", True))

    # ------------------------------------------------------------------
    # Generation
    # ------------------------------------------------------------------
    async def generate_explanation(
        self,
        context: dict[str, Any],
        instruction: str,
        session: AsyncSession | None = None,
        org_id: uuid.UUID | None = None,
    ) -> str | None:
        """Explain pre-computed facts; never create or alter attribution truth."""
        model = self.platform_model()
        if model is None:
            logger.info(
                "Reliastra-managed LLM is not configured — skipping AI explanation"
            )
            return None

        if session is not None and org_id is not None:
            if not await self._org_opted_in(session, org_id):
                logger.info(
                    "Organization %s has AI explanations disabled — skipping", org_id
                )
                return None

        # Bound context size — prevent prompt injection / huge payloads
        try:
            context_json = json.dumps(context, sort_keys=True, ensure_ascii=False)
        except Exception:
            context_json = str(context)
        if len(context_json) > MAX_CONTEXT_JSON_CHARS:
            context_json = context_json[:MAX_CONTEXT_JSON_CHARS] + "...[truncated]"

        prompt = (
            "You are a technical evidence explainer. Explain only the supplied "
            "pre-computed evidence. Do not invent measurements, conclusions, or "
            "facts. Do not alter the attribution result or confidence score.\n\n"
            f"Instruction: {instruction}\n\nEvidence Data:\n{context_json}\n\n"
            "Use clear language and state that this is an AI-generated explanation."
        )

        try:
            result = await self._call_model(model, prompt)
            text = result.get("text")
            if text:
                # Bound output — protects PDF size / storage
                if len(text) > MAX_EXPLANATION_CHARS:
                    text = text[:MAX_EXPLANATION_CHARS] + "...[truncated]"
                return text
            return None
        except ValidationException:
            # SSRF validation errors — misconfigured platform endpoint.
            logger.error(
                "Reliastra-managed LLM endpoint failed safety validation — "
                "check RELIASTRA_AI_ENDPOINT_URL"
            )
            return None
        except Exception as exc:
            logger.warning("AI generation failed on the Reliastra LLM: %s", exc)
            return None

    # ------------------------------------------------------------------
    # Transport
    # ------------------------------------------------------------------
    async def _call_model(
        self, model: PlatformLLM, prompt: str
    ) -> dict[str, Any]:
        """Pinned, retrying HTTP call to the platform LLM. Returns {'text': str|None}."""
        # Metrics
        from app.core.metrics import ai_generation_latency, ai_generation_total

        start = time.monotonic()
        # Resolve + pin DNS once — closes DNS-rebinding TOCTOU
        try:
            target = resolve_pinned_target(model.endpoint_url)
        except ValueError as exc:
            raise ValidationException(str(exc)) from exc

        transport = pinned_transport_for(target)
        headers, payload = self._request(model, prompt)

        last_exc: Exception | None = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(
                    transport=transport, timeout=model.timeout_seconds
                ) as client:
                    response = await client.post(
                        model.endpoint_url, headers=headers, json=payload
                    )
                    response.raise_for_status()
                    data = response.json()
                    text = self._extract(model.provider_type, data)
                    elapsed = time.monotonic() - start
                    try:
                        ai_generation_total.labels(
                            provider_type=model.provider_type, status="success"
                        ).inc()
                        ai_generation_latency.labels(
                            provider_type=model.provider_type
                        ).observe(elapsed)
                    except Exception:
                        pass
                    return {"text": text, "raw": data}
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                status = exc.response.status_code if exc.response is not None else 0
                # Retry only on transient errors
                if status in (429, 500, 502, 503, 504) and attempt < MAX_RETRIES:
                    await asyncio.sleep(RETRY_BACKOFF_BASE * (2**attempt))
                    continue
                try:
                    ai_generation_total.labels(
                        provider_type=model.provider_type, status="error"
                    ).inc()
                except Exception:
                    pass
                raise
            except (httpx.TimeoutException, httpx.ConnectError, httpx.NetworkError) as exc:
                last_exc = exc
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(RETRY_BACKOFF_BASE * (2**attempt))
                    continue
                try:
                    ai_generation_total.labels(
                        provider_type=model.provider_type, status="error"
                    ).inc()
                except Exception:
                    pass
                raise
            except Exception as exc:
                last_exc = exc
                try:
                    ai_generation_total.labels(
                        provider_type=model.provider_type, status="error"
                    ).inc()
                except Exception:
                    pass
                raise

        if last_exc:
            raise last_exc
        return {"text": None}

    @staticmethod
    def _request(
        model: PlatformLLM, prompt: str
    ) -> tuple[dict[str, str], dict[str, Any]]:
        headers = {"Content-Type": "application/json"}
        if model.provider_type == "anthropic":
            headers.update(
                {"x-api-key": model.api_key, "anthropic-version": "2023-06-01"}
            )
            payload = {
                "model": model.model_name,
                "max_tokens": model.max_tokens,
                "temperature": model.temperature,
                "messages": [{"role": "user", "content": prompt}],
            }
        elif model.provider_type == "google":
            headers["x-goog-api-key"] = model.api_key
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "maxOutputTokens": model.max_tokens,
                    "temperature": model.temperature,
                },
            }
        else:
            headers["Authorization"] = f"Bearer {model.api_key}"
            payload = {
                "model": model.model_name,
                "max_tokens": model.max_tokens,
                "temperature": model.temperature,
                "messages": [{"role": "user", "content": prompt}],
            }
        return headers, payload

    @staticmethod
    def _extract(provider_type: str, data: dict[str, Any]) -> str | None:
        if provider_type == "anthropic":
            content = data.get("content") or []
            return "\n".join(
                str(item.get("text", ""))
                for item in content
                if isinstance(item, dict) and item.get("text")
            ) or None
        if provider_type == "google":
            candidates = data.get("candidates") or []
            if not candidates:
                return None
            parts = candidates[0].get("content", {}).get("parts", [])
            return "\n".join(
                str(item.get("text", ""))
                for item in parts
                if isinstance(item, dict) and item.get("text")
            ) or None
        choices = data.get("choices") or []
        return (
            str(choices[0].get("message", {}).get("content"))
            if choices
            else None
        )


ai_service = AIService()
