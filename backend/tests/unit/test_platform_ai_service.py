"""The AI explainer must always use the Reliastra-managed LLM.

These tests pin the design: endpoint, model, credential and parameters come
from platform configuration only, and an organization can do exactly one
thing — opt out.
"""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.config import settings
from app.modules.ai_integration.service import (
    MAX_EXPLANATION_CHARS,
    AIService,
    PlatformLLM,
)


@pytest.fixture
def platform_ai(monkeypatch):
    """Configure a Reliastra-managed LLM for the duration of a test."""
    monkeypatch.setattr(settings, "RELIASTRA_AI_ENABLED", True, raising=False)
    monkeypatch.setattr(
        settings, "RELIASTRA_AI_PROVIDER_TYPE", "openai_compatible", raising=False
    )
    monkeypatch.setattr(
        settings,
        "RELIASTRA_AI_ENDPOINT_URL",
        "https://api.openai.com/v1/chat/completions",
        raising=False,
    )
    monkeypatch.setattr(settings, "RELIASTRA_AI_MODEL", "gpt-4o-mini", raising=False)
    monkeypatch.setattr(
        settings, "RELIASTRA_AI_API_KEY", None, raising=False
    )
    monkeypatch.setattr(
        type(settings),
        "ai_api_key",
        property(lambda _self: "platform-key"),
        raising=False,
    )
    return AIService()


def test_platform_model_reads_only_platform_settings(platform_ai):
    model = platform_ai.platform_model()
    assert isinstance(model, PlatformLLM)
    assert model.endpoint_url == "https://api.openai.com/v1/chat/completions"
    assert model.model_name == "gpt-4o-mini"
    assert model.api_key == "platform-key"


def test_platform_model_absent_without_credential(monkeypatch):
    monkeypatch.setattr(settings, "RELIASTRA_AI_ENABLED", True, raising=False)
    monkeypatch.setattr(
        type(settings), "ai_api_key", property(lambda _self: None), raising=False
    )
    assert AIService().platform_model() is None


def test_platform_model_absent_when_disabled(platform_ai, monkeypatch):
    monkeypatch.setattr(settings, "RELIASTRA_AI_ENABLED", False, raising=False)
    assert platform_ai.platform_model() is None


@pytest.mark.asyncio
async def test_generate_explanation_uses_platform_model(platform_ai, monkeypatch):
    call = AsyncMock(return_value={"text": "AI-generated explanation."})
    monkeypatch.setattr(platform_ai, "_call_model", call)
    monkeypatch.setattr(
        AIService, "_org_opted_in", AsyncMock(return_value=True), raising=False
    )

    result = await platform_ai.generate_explanation(
        context={"uptime_percentage": 99.5},
        instruction="Explain the incident.",
        session=object(),
        org_id=uuid.uuid4(),
    )

    assert result == "AI-generated explanation."
    model = call.await_args.args[0]
    assert model.model_name == "gpt-4o-mini"
    assert model.api_key == "platform-key"


@pytest.mark.asyncio
async def test_generate_explanation_skipped_when_org_opted_out(
    platform_ai, monkeypatch
):
    call = AsyncMock(return_value={"text": "should not be used"})
    monkeypatch.setattr(platform_ai, "_call_model", call)
    monkeypatch.setattr(
        AIService, "_org_opted_in", AsyncMock(return_value=False), raising=False
    )

    result = await platform_ai.generate_explanation(
        context={},
        instruction="Explain.",
        session=object(),
        org_id=uuid.uuid4(),
    )

    assert result is None
    call.assert_not_awaited()


@pytest.mark.asyncio
async def test_generate_explanation_none_when_platform_unconfigured(monkeypatch):
    monkeypatch.setattr(
        type(settings), "ai_api_key", property(lambda _self: None), raising=False
    )
    result = await AIService().generate_explanation(
        context={}, instruction="Explain.", session=None, org_id=None
    )
    assert result is None


@pytest.mark.asyncio
async def test_generate_explanation_truncates_long_output(platform_ai, monkeypatch):
    monkeypatch.setattr(
        platform_ai,
        "_call_model",
        AsyncMock(return_value={"text": "x" * (MAX_EXPLANATION_CHARS + 500)}),
    )
    monkeypatch.setattr(
        AIService, "_org_opted_in", AsyncMock(return_value=True), raising=False
    )

    result = await platform_ai.generate_explanation(
        context={}, instruction="Explain.", session=object(), org_id=uuid.uuid4()
    )

    assert result.endswith("...[truncated]")
    assert len(result) == MAX_EXPLANATION_CHARS + len("...[truncated]")


@pytest.mark.asyncio
async def test_generate_explanation_survives_transport_failure(
    platform_ai, monkeypatch
):
    monkeypatch.setattr(
        platform_ai, "_call_model", AsyncMock(side_effect=RuntimeError("boom"))
    )
    monkeypatch.setattr(
        AIService, "_org_opted_in", AsyncMock(return_value=True), raising=False
    )

    result = await platform_ai.generate_explanation(
        context={}, instruction="Explain.", session=object(), org_id=uuid.uuid4()
    )
    assert result is None


@pytest.mark.parametrize(
    ("provider_type", "expected_header"),
    [
        ("openai_compatible", "Authorization"),
        ("anthropic", "x-api-key"),
        ("google", "x-goog-api-key"),
    ],
)
def test_request_shapes_per_wire_format(provider_type, expected_header):
    model = PlatformLLM(
        provider_type=provider_type,
        endpoint_url="https://example.test/v1",
        model_name="m",
        api_key="k",
        max_tokens=256,
        temperature=0.1,
        timeout_seconds=30.0,
    )
    headers, payload = AIService._request(model, "prompt")
    assert expected_header in headers
    assert payload


@pytest.mark.asyncio
async def test_org_opt_out_flag_is_respected(monkeypatch):
    org = SimpleNamespace(ai_explanations_enabled=False)
    monkeypatch.setattr(
        "app.modules.organizations.repository.OrganizationRepository.get_by_id",
        AsyncMock(return_value=org),
    )
    assert await AIService._org_opted_in(object(), uuid.uuid4()) is False


@pytest.mark.asyncio
async def test_status_reports_platform_ownership(platform_ai, monkeypatch):
    monkeypatch.setattr(
        AIService, "_org_opted_in", AsyncMock(return_value=True), raising=False
    )
    status = await platform_ai.status(session=object(), org_id=uuid.uuid4())
    assert status["provider"] == "reliastra"
    assert status["platform_configured"] is True
    assert status["enabled"] is True
    assert status["model_name"] == "gpt-4o-mini"
