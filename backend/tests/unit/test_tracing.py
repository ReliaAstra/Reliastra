"""Distributed tracing: W3C traceparent without an SDK dependency."""

import re

from app.platform.observability.tracing import (
    TRACE_KWARG,
    TraceContext,
    format_traceparent,
    get_otel_tracer,
    get_trace_context,
    new_trace,
    parse_traceparent,
    reset_trace_context,
    restore_task_context,
    set_trace_context,
    span,
    task_context_kwargs,
    traced_headers,
)


def test_new_trace_has_valid_shape():
    ctx = new_trace()
    assert re.fullmatch(r"[0-9a-f]{32}", ctx.trace_id)
    assert re.fullmatch(r"[0-9a-f]{16}", ctx.span_id)


def test_traceparent_roundtrip_keeps_trace_but_renews_span():
    ctx = new_trace()
    parsed = parse_traceparent(format_traceparent(ctx))
    assert parsed is not None
    assert parsed.trace_id == ctx.trace_id
    assert parsed.span_id != ctx.span_id  # this process is a new hop
    assert parsed.sampled is True


def test_parse_rejects_garbage_and_zero_ids():
    assert parse_traceparent(None) is None
    assert parse_traceparent("") is None
    assert parse_traceparent("not-a-traceparent") is None
    assert parse_traceparent("00-" + "0" * 32 + "-" + "1" * 16 + "-01") is None
    assert parse_traceparent("00-" + "1" * 32 + "-" + "0" * 16 + "-01") is None
    assert parse_traceparent("ff-" + "1" * 32 + "-" + "2" * 16 + "-01") is None


def test_sampled_flag_survives_the_roundtrip():
    ctx = TraceContext(trace_id="1" * 32, span_id="2" * 16, sampled=False)
    assert format_traceparent(ctx).endswith("-00")
    assert parse_traceparent(format_traceparent(ctx)).sampled is False


def test_child_shares_trace_with_fresh_span():
    ctx = new_trace()
    child = ctx.child()
    assert child.trace_id == ctx.trace_id
    assert child.span_id != ctx.span_id


def test_traced_headers_empty_outside_a_scope():
    assert get_trace_context() is None
    assert traced_headers() == {}
    assert task_context_kwargs() == {}


def test_traced_headers_propagate_trace_and_request():
    from app.platform.observability.context import set_request_id

    token = set_trace_context(new_trace())
    req_token = set_request_id("req-1")
    try:
        headers = traced_headers()
        assert "traceparent" in headers
        assert headers["X-Request-ID"] == "req-1"
        # The propagated span continues our trace under a new id.
        assert parse_traceparent(headers["traceparent"]).trace_id == get_trace_context().trace_id
    finally:
        reset_trace_context(token)
        from app.platform.observability.context import request_id_var

        request_id_var.reset(req_token)


def test_task_kwargs_roundtrip_into_restore():
    token = set_trace_context(new_trace())
    try:
        kwargs = task_context_kwargs()
        assert set(kwargs) == {TRACE_KWARG}
        parent_trace = get_trace_context().trace_id
    finally:
        reset_trace_context(token)
    assert get_trace_context() is None
    restore_task_context(traceparent=kwargs[TRACE_KWARG], request_id="req-9")
    try:
        assert get_trace_context().trace_id == parent_trace
        from app.platform.observability.context import get_request_id

        assert get_request_id() == "req-9"
    finally:
        reset_trace_context(set_trace_context(None))


def test_restore_without_context_starts_a_fresh_trace():
    assert get_trace_context() is None
    restore_task_context()
    try:
        assert get_trace_context() is not None
    finally:
        reset_trace_context(set_trace_context(None))


def test_span_sets_context_and_survives_errors(caplog):
    assert get_trace_context() is None
    with span("op", key="value") as ctx:
        assert get_trace_context() is ctx
    assert get_trace_context() is None
    try:
        with span("boom"):
            raise RuntimeError("nope")
    except RuntimeError:
        pass
    assert get_trace_context() is None


def test_otel_tracer_falls_back_without_the_sdk():
    tracer = get_otel_tracer("test")
    with tracer.start_as_current_span("op"):
        pass
