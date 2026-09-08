import asyncio
import pytest
from unittest.mock import AsyncMock
from app.modules.checks.http_probe import observe_http


@pytest.mark.asyncio
async def test_dns_is_inside_the_total_probe_deadline(mocker):
    async def slow_dns(_):
        await asyncio.sleep(10)
    mocker.patch('app.modules.checks.http_probe.resolve_pinned_target_async', side_effect=slow_dns)
    result = await observe_http('https://example.com', timeout=0.02)
    assert result.is_up is False
    assert result.status_code is None
    assert result.error_message.startswith('Timeout:')
    assert 0 < result.latency_ms < 1000
