"""ObservabilityMiddleware: every request is traced and counted."""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.bootstrap.middleware import ObservabilityMiddleware
from app.platform.observability import metrics as metrics_module
from app.platform.observability.tracing import get_trace_context, parse_traceparent


def _counter_value(counter, **labels):
    for metric in counter.collect():
        for sample in metric.samples:
            if sample.name.endswith("_total") and all(
                sample.labels.get(k) == v for k, v in labels.items()
            ):
                return sample.value
    return 0.0


def _histogram_count(histogram, **labels):
    for metric in histogram.collect():
        for sample in metric.samples:
            if sample.name.endswith("_count") and all(
                sample.labels.get(k) == v for k, v in labels.items()
            ):
                return sample.value
    return 0.0


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(ObservabilityMiddleware)

    @app.get("/v1/things/{thing_id}")
    async def get_thing(thing_id: str):
        assert get_trace_context() is not None, "trace must be ambient in handlers"
        return {"id": thing_id}

    @app.get("/boom")
    async def boom():
        raise RuntimeError("kaboom")

    return app


async def _get(app, path, headers=None):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as client:
        return await client.get(path, headers=headers or {})


@pytest.mark.asyncio
async def test_request_is_counted_with_route_template():
    app = _app()
    before = _counter_value(
        metrics_module.http_requests_total, method="GET", status="200"
    )
    before_hist = _histogram_count(
        metrics_module.http_request_duration_seconds,
        method="GET",
        route="/v1/things/{thing_id}",
        status="200",
    )
    res = await _get(app, "/v1/things/abc-123")
    assert res.status_code == 200
    assert (
        _counter_value(metrics_module.http_requests_total, method="GET", status="200")
        == before + 1
    )
    # The route label is the template, never the raw id (bounded cardinality).
    assert (
        _histogram_count(
            metrics_module.http_request_duration_seconds,
            method="GET",
            route="/v1/things/{thing_id}",
            status="200",
        )
        == before_hist + 1
    )
    assert (
        _histogram_count(
            metrics_module.http_request_duration_seconds,
            method="GET",
            route="/v1/things/abc-123",
            status="200",
        )
        == 0
    )


@pytest.mark.asyncio
async def test_traceparent_is_joined_and_echoed():
    app = _app()
    inbound = "00-" + "a" * 32 + "-" + "b" * 16 + "-01"
    res = await _get(app, "/v1/things/1", headers={"traceparent": inbound})
    assert res.status_code == 200
    echoed = res.headers.get("traceparent")
    assert echoed is not None
    assert parse_traceparent(echoed).trace_id == "a" * 32


@pytest.mark.asyncio
async def test_missing_traceparent_starts_a_trace():
    app = _app()
    res = await _get(app, "/v1/things/1")
    assert res.status_code == 200
    assert parse_traceparent(res.headers.get("traceparent")) is not None


@pytest.mark.asyncio
async def test_errors_are_counted_as_500():
    app = _app()
    before = _counter_value(
        metrics_module.http_requests_total, method="GET", status="500"
    )
    with pytest.raises(RuntimeError):
        await _get(app, "/boom")
    assert (
        _counter_value(metrics_module.http_requests_total, method="GET", status="500")
        == before + 1
    )
    assert get_trace_context() is None, "trace token must always reset"


@pytest.mark.asyncio
async def test_unmatched_route_records_unknown():
    app = _app()
    before = _histogram_count(
        metrics_module.http_request_duration_seconds,
        method="GET",
        route="unknown",
        status="404",
    )
    res = await _get(app, "/nope")
    assert res.status_code == 404
    assert (
        _histogram_count(
            metrics_module.http_request_duration_seconds,
            method="GET",
            route="unknown",
            status="404",
        )
        == before + 1
    )
