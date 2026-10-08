"""Tracing and Structured Logging Infrastructure for Medical Education AI Agent.

Provides end-to-end observability across:
    1. HTTP request lifecycle via Correlation / Trace IDs.
    2. Context propagation via Python contextvars across async tasks.
    3. AI Agent ReAct loop, LLM calls, RAG retrieval and tool executions via `trace_span`.
    4. Dual-mode formatting (human-readable colored logs for development,
       structured JSON for production).
    5. Rotating file logging to prevent disk saturation.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import uuid
from contextvars import ContextVar
from datetime import datetime
from logging.handlers import RotatingFileHandler
from typing import Any, Dict, Optional

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("medical_edu_agent.tracing")

# Context variables for trace correlation across async boundaries.
_current_trace_id: ContextVar[str] = ContextVar("current_trace_id", default="")
_current_user_id: ContextVar[str] = ContextVar("current_user_id", default="")
_current_session_id: ContextVar[str] = ContextVar("current_session_id", default="")


def get_current_trace_id() -> str:
    """Return the active trace ID, or generate a fallback trace ID if none exists."""
    tid = _current_trace_id.get()
    if not tid:
        tid = f"tr-{uuid.uuid4().hex[:12]}"
        _current_trace_id.set(tid)
    return tid


def get_current_user_id() -> str:
    """Return the active user ID if set in the current execution context."""
    return _current_user_id.get()


def get_current_session_id() -> str:
    """Return the active session ID if set in the current execution context."""
    return _current_session_id.get()


def set_trace_context(
    trace_id: Optional[str] = None,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> None:
    """Explicitly set or update trace context variables."""
    if trace_id is not None:
        _current_trace_id.set(trace_id)
    if user_id is not None:
        _current_user_id.set(user_id)
    if session_id is not None:
        _current_session_id.set(session_id)


def clear_trace_context() -> None:
    """Reset active trace context variables to defaults."""
    _current_trace_id.set("")
    _current_user_id.set("")
    _current_session_id.set("")


class TraceContextFilter(logging.Filter):
    """Logging filter that injects trace_id, user_id, and session_id into all LogRecords."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.trace_id = _current_trace_id.get() or "no-trace"
        record.user_id = _current_user_id.get() or ""
        record.session_id = _current_session_id.get() or ""
        return True


class DevelopmentFormatter(logging.Formatter):
    """Clean, human-readable console formatter for local development."""

    _COLORS = {
        logging.DEBUG: "\033[36m",     # Cyan
        logging.INFO: "\033[32m",      # Green
        logging.WARNING: "\033[33m",   # Yellow
        logging.ERROR: "\033[31m",     # Red
        logging.CRITICAL: "\033[1;31m",# Bold Red
    }
    _RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self._COLORS.get(record.levelno, "")
        reset = self._RESET if color else ""
        trace_str = f"[{record.trace_id}]" if getattr(record, "trace_id", None) else "[no-trace]"
        timestamp = datetime.fromtimestamp(record.created).strftime("%Y-%m-%d %H:%M:%S")
        
        # Build prefix
        prefix = f"{timestamp} | {color}{record.levelname:<7}{reset} | {trace_str:<15} | {record.name}"
        msg = record.getMessage()
        if record.exc_info:
            msg += "\n" + self.formatException(record.exc_info)
        return f"{prefix}: {msg}"


class JSONFormatter(logging.Formatter):
    """Single-line JSON formatter for cloud logging / observability collectors."""

    def format(self, record: logging.LogRecord) -> str:
        data: Dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "trace_id": getattr(record, "trace_id", "no-trace"),
        }
        user_id = getattr(record, "user_id", None)
        if user_id:
            data["user_id"] = user_id
        session_id = getattr(record, "session_id", None)
        if session_id:
            data["session_id"] = session_id
        if record.exc_info:
            data["exception"] = self.formatException(record.exc_info)
        return json.dumps(data, ensure_ascii=False)


class TraceSpan:
    """Context manager for tracing latency, inputs, and outcomes of a unit of work.

    Usable both synchronously (`with trace_span(...):`) and asynchronously
    (`async with trace_span(...):`).
    """

    def __init__(self, span_name: str, **attributes: Any) -> None:
        self.span_name = span_name
        self.attributes = attributes
        self.start_time: float = 0.0
        self.duration_ms: float = 0.0
        self.status: str = "OK"

    def set_attribute(self, key: str, value: Any) -> None:
        """Add or update a span attribute."""
        self.attributes[key] = value

    def _format_attrs(self) -> str:
        return " ".join(f"{k}={v!r}" for k, v in self.attributes.items())

    def __enter__(self) -> TraceSpan:
        self.start_time = time.perf_counter()
        logger.debug(
            "[SPAN:START] %s%s",
            self.span_name,
            f" | {self._format_attrs()}" if self.attributes else "",
        )
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> bool:
        self.duration_ms = (time.perf_counter() - self.start_time) * 1000
        if exc_type is not None:
            self.status = "ERROR"
            logger.error(
                "[SPAN:ERROR] %s (took %.2fms) - %s: %s",
                self.span_name,
                self.duration_ms,
                getattr(exc_type, "__name__", str(exc_type)),
                exc_val,
                exc_info=True,
            )
        else:
            logger.info(
                "[SPAN:DONE] %s (took %.2fms)%s",
                self.span_name,
                self.duration_ms,
                f" | {self._format_attrs()}" if self.attributes else "",
            )
        return False  # Never suppress exceptions

    async def __aenter__(self) -> TraceSpan:
        return self.__enter__()

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> bool:
        return self.__exit__(exc_type, exc_val, exc_tb)


def trace_span(span_name: str, **attributes: Any) -> TraceSpan:
    """Create a new TraceSpan."""
    return TraceSpan(span_name, **attributes)


class TracingMiddleware(BaseHTTPMiddleware):
    """FastAPI/Starlette middleware injecting trace IDs and measuring request latency."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Extract incoming correlation ID or generate a new one.
        incoming_trace = (
            request.headers.get("X-Trace-ID")
            or request.headers.get("X-Request-ID")
            or f"tr-{uuid.uuid4().hex[:12]}"
        )
        token = _current_trace_id.set(incoming_trace)
        start_time = time.perf_counter()
        method = request.method
        path = request.url.path

        logger.info("[REQ:START] %s %s", method, path)
        try:
            response = await call_next(request)
            duration_ms = (time.perf_counter() - start_time) * 1000
            response.headers["X-Trace-ID"] = incoming_trace
            logger.info(
                "[REQ:DONE] %s %s - status=%d (took %.2fms)",
                method,
                path,
                response.status_code,
                duration_ms,
            )
            return response
        except Exception as exc:
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.error(
                "[REQ:ERROR] %s %s - (took %.2fms): %s",
                method,
                path,
                duration_ms,
                exc,
                exc_info=True,
            )
            raise
        finally:
            _current_trace_id.reset(token)


def setup_logging(
    app_env: str = "development",
    log_dir: str = "logs",
    log_level: int = logging.INFO,
) -> None:
    """Configure structured logging, rotation file handler, and console output."""
    os.makedirs(log_dir, exist_ok=True)
    trace_filter = TraceContextFilter()

    # Root / App logger configuration
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Clear existing handlers to prevent duplicate lines
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    # 1. Console Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_handler.addFilter(trace_filter)
    if app_env.lower() == "production":
        console_handler.setFormatter(JSONFormatter())
    else:
        console_handler.setFormatter(DevelopmentFormatter())
    root_logger.addHandler(console_handler)

    # 2. Rotating File Handler (logs/app.log, 10MB per file, max 5 backups)
    log_file_path = os.path.join(log_dir, "app.log")
    file_handler = RotatingFileHandler(
        log_file_path,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setLevel(log_level)
    file_handler.addFilter(trace_filter)
    # Always write JSON to file for structured parsing
    file_handler.setFormatter(JSONFormatter())
    root_logger.addHandler(file_handler)

    logging.getLogger("medical_edu_agent").info(
        "Logging initialised (env=%s, log_file=%s)", app_env, log_file_path
    )
