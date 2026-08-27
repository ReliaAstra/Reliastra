"""Idempotency middleware: a Redis outage must not be reported as a duplicate.

With the old helper a brand-new Idempotency-Key returned 409
IDEMPOTENT_REQUEST_IN_FLIGHT whenever Redis was unreachable, turning a Redis
outage into a total outage of every idempotent POST/PATCH.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.main import IdempotencyMiddleware


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(IdempotencyMiddleware)

    @app.post("/thing")
    async def create_thing():
        return {"created": True}

    return app


async def _post(headers):
    transport = ASGITransport(app=_app())
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        return await c.post("/thing", headers=headers, json={})


@pytest.mark.asyncio
async def test_new_key_with_healthy_redis_proceeds():
    with (
        patch("app.main.safe_redis_get", new=AsyncMock(return_value=None)),
        patch("app.main.safe_redis_claim", new=AsyncMock(return_value=True)),
        patch("app.main.safe_redis_setex", new=AsyncMock(return_value=True)),
    ):
        res = await _post({"Idempotency-Key": "fresh-key"})
    assert res.status_code == 200
    assert res.json() == {"created": True}


@pytest.mark.asyncio
async def test_duplicate_key_in_flight_with_healthy_redis_conflicts():
    with (
        patch("app.main.safe_redis_get", new=AsyncMock(return_value=None)),
        patch("app.main.safe_redis_claim", new=AsyncMock(return_value=False)),
    ):
        res = await _post({"Idempotency-Key": "dupe-key"})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "IDEMPOTENT_REQUEST_IN_FLIGHT"


@pytest.mark.asyncio
async def test_redis_outage_does_not_produce_a_false_409():
    """The regression: infrastructure failure reported as a client duplicate."""
    with (
        patch("app.main.safe_redis_get", new=AsyncMock(return_value=None)),
        patch("app.main.safe_redis_claim", new=AsyncMock(return_value=None)),
        patch("app.main.safe_redis_setex", new=AsyncMock(return_value=True)),
    ):
        res = await _post({"Idempotency-Key": "fresh-key-during-outage"})
    assert res.status_code != 409, "Redis being down is not a duplicate request"
    assert res.status_code == 200
    assert res.json() == {"created": True}


@pytest.mark.asyncio
async def test_requests_without_an_idempotency_key_are_untouched():
    res = await _post({})
    assert res.status_code == 200
