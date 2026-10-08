"""Tests for tracing, correlation IDs, and structured logging infrastructure."""

import json
import logging
import time
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from core.tracing import (
    DevelopmentFormatter,
    JSONFormatter,
    TraceContextFilter,
    TraceSpan,
    TracingMiddleware,
    clear_trace_context,
    get_current_session_id,
    get_current_trace_id,
    get_current_user_id,
    set_trace_context,
    setup_logging,
    trace_span,
)


@pytest.fixture(autouse=True)
def clean_context():
    """Ensure clean trace context before and after each test."""
    clear_trace_context()
    yield
    clear_trace_context()


class TestTraceContext:
    def test_trace_context_lifecycle(self):
        # Default fallback
        tid = get_current_trace_id()
        assert tid.startswith("tr-")

        # Explicit set
        set_trace_context(trace_id="tr-custom-123", user_id="user-456", session_id="sess-789")
        assert get_current_trace_id() == "tr-custom-123"
        assert get_current_user_id() == "user-456"
        assert get_current_session_id() == "sess-789"

        # Clear
        clear_trace_context()
        assert get_current_user_id() == ""
        assert get_current_session_id() == ""


class TestTraceSpan:
    def test_sync_span_measures_duration(self):
        with trace_span("test_span", custom_arg="val") as span:
            time.sleep(0.01)
            span.set_attribute("result", 42)

        assert span.duration_ms >= 8.0
        assert span.status == "OK"
        assert span.attributes["result"] == 42
        assert span.attributes["custom_arg"] == "val"

    def test_sync_span_handles_exception(self):
        span_ref = None
        with pytest.raises(ValueError, match="boom"):
            with trace_span("failing_span") as span:
                span_ref = span
                raise ValueError("boom")

        assert span_ref.status == "ERROR"
        assert span_ref.duration_ms >= 0.0

    @pytest.mark.asyncio
    async def test_async_span_measures_duration(self):
        async with trace_span("async_span", mode="agent") as span:
            span.set_attribute("steps", 3)

        assert span.status == "OK"
        assert span.duration_ms >= 0.0
        assert span.attributes["steps"] == 3


class TestFormatters:
    def test_trace_filter_injects_metadata(self):
        set_trace_context(trace_id="tr-test-filter", user_id="u1", session_id="s1")
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname=__file__,
            lineno=10,
            msg="Hello %s",
            args=("world",),
            exc_info=None,
        )
        TraceContextFilter().filter(record)

        assert record.trace_id == "tr-test-filter"
        assert record.user_id == "u1"
        assert record.session_id == "s1"

    def test_json_formatter_outputs_valid_json(self):
        set_trace_context(trace_id="tr-json-test", user_id="doctor_a")
        record = logging.LogRecord(
            name="medical_edu_agent",
            level=logging.INFO,
            pathname=__file__,
            lineno=20,
            msg="Clinical case loaded",
            args=(),
            exc_info=None,
        )
        TraceContextFilter().filter(record)

        formatted = JSONFormatter().format(record)
        data = json.loads(formatted)

        assert data["level"] == "INFO"
        assert data["trace_id"] == "tr-json-test"
        assert data["user_id"] == "doctor_a"
        assert data["message"] == "Clinical case loaded"
        assert "timestamp" in data

    def test_development_formatter_includes_trace_id(self):
        set_trace_context(trace_id="tr-dev-test")
        record = logging.LogRecord(
            name="test_logger",
            level=logging.INFO,
            pathname=__file__,
            lineno=30,
            msg="Development message",
            args=(),
            exc_info=None,
        )
        TraceContextFilter().filter(record)

        output = DevelopmentFormatter().format(record)
        assert "[tr-dev-test]" in output
        assert "Development message" in output


class TestTracingMiddleware:
    def _create_test_app(self):
        app = FastAPI()
        app.add_middleware(TracingMiddleware)

        @app.get("/ping")
        def ping():
            return {"status": "pong", "trace": get_current_trace_id()}

        @app.get("/fail")
        def fail():
            raise HTTPException(status_code=400, detail="Custom bad request")

        return app

    def test_middleware_generates_trace_header(self):
        client = TestClient(self._create_test_app())
        resp = client.get("/ping")

        assert resp.status_code == 200
        header_trace = resp.headers.get("X-Trace-ID")
        assert header_trace is not None
        assert header_trace.startswith("tr-")
        # Ensure inside route handler the trace ID matches the response header
        assert resp.json()["trace"] == header_trace

    def test_middleware_preserves_client_trace_header(self):
        client = TestClient(self._create_test_app())
        custom_trace = "client-trace-abc-123"
        resp = client.get("/ping", headers={"X-Trace-ID": custom_trace})

        assert resp.status_code == 200
        assert resp.headers.get("X-Trace-ID") == custom_trace
        assert resp.json()["trace"] == custom_trace

    def test_middleware_propagates_header_on_error(self):
        client = TestClient(self._create_test_app())
        resp = client.get("/fail", headers={"X-Request-ID": "req-999"})

        assert resp.status_code == 400
        assert resp.headers.get("X-Trace-ID") == "req-999"


def test_setup_logging_initialization(tmp_path):
    log_dir = str(tmp_path / "logs")
    setup_logging(app_env="development", log_dir=log_dir)
    assert (tmp_path / "logs" / "app.log").exists()
