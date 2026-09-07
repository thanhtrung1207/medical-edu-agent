"""Shared service container, lifecycle and request dependencies.

A single :class:`Services` instance holds all long-lived backend components
(session manager, memory store, learning DB, reasoning workflow, guardrails and
the optional ingestion pipeline). It is initialised once during the FastAPI
lifespan startup and injected into routers via :func:`get_services`.

Also provides a simple in-memory :class:`RateLimiter` (sliding window per key).
"""

from __future__ import annotations

import logging
import os
import sqlite3
import threading
import time
from collections import defaultdict, deque
from typing import Any, Deque, Dict, List, Optional

from fastapi import HTTPException

logger = logging.getLogger(__name__)


class Services:
    """Container for all shared backend services.

    Attributes are populated by :meth:`startup`. In-memory registries track
    uploaded documents and generated quizzes (persistence is not required for
    the MVP).
    """

    def __init__(self) -> None:
        self.session_manager: Any = None
        self.memory_store: Any = None
        self.context_builder: Any = None
        self.learning_db: Any = None
        self.feedback_collector: Any = None
        self.adaptive_engine: Any = None
        self.reasoning_workflow: Any = None
        self.guardrail_runner: Any = None
        self.ingestion_pipeline: Any = None

        # In-memory registries.
        self.document_registry: Dict[str, Dict[str, Any]] = {}
        self.quiz_store: Dict[str, Dict[str, Any]] = {}
        self.quiz_history: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

        self._started = False

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #
    def startup(self) -> None:
        """Initialise all backend services.

        Core services (memory, learning, reasoning, guardrails) are required.
        The document ingestion pipeline is optional and degrades gracefully
        when its heavy dependencies (ChromaDB / sentence-transformers) are not
        available.
        """
        if self._started:
            return

        # Memory & sessions.
        from memory import ContextBuilder, MemoryStore, SessionManager

        self.session_manager = SessionManager(
            os.getenv("SESSION_DB_PATH", "sessions.db")
        )
        self.memory_store = MemoryStore(os.getenv("MEMORY_DB_PATH", "memory.db"))
        self.context_builder = ContextBuilder(
            self.session_manager, self.memory_store
        )

        # Learning subsystem.
        from learning import AdaptiveEngine, FeedbackCollector, LearningDatabase

        self.learning_db = LearningDatabase(
            os.getenv("LEARNING_DB_PATH", "learning.db")
        )
        self.feedback_collector = FeedbackCollector(self.learning_db)
        self.adaptive_engine = AdaptiveEngine(self.learning_db)

        # Reasoning workflow + guardrails (shared, process-wide instances).
        from agents.root_agent import guardrail_runner, reasoning_workflow

        self.reasoning_workflow = reasoning_workflow
        self.guardrail_runner = guardrail_runner

        # Optional: document ingestion pipeline (RAG).
        try:
            from tools import IngestionPipeline

            self.ingestion_pipeline = IngestionPipeline()
            logger.info("IngestionPipeline initialised.")

            if os.getenv("CANONICAL_KNOWLEDGE_BOOTSTRAP") == "if-empty":
                try:
                    from tools.document_ingestion import bootstrap

                    bootstrap.bootstrap_if_empty(
                        self.ingestion_pipeline, bootstrap.DEFAULT_MANIFEST_PATH
                    )
                except Exception:
                    logger.exception(
                        "Canonical knowledge bootstrap failed; continuing with "
                        "the existing ingestion pipeline."
                    )
        except Exception as exc:  # pragma: no cover - depends on environment
            self.ingestion_pipeline = None
            logger.warning(
                "IngestionPipeline unavailable; document upload disabled: %s",
                exc,
            )

        self._started = True
        logger.info("Services startup complete.")

    def shutdown(self) -> None:
        """Release resources held by the services (best-effort)."""
        logger.info("Services shutdown.")
        self._started = False

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    def count_sessions(self) -> int:
        """Count total sessions by reading the session DB directly."""
        try:
            conn = sqlite3.connect(self.session_manager.db_path)
            try:
                row = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()
                return int(row[0]) if row else 0
            finally:
                conn.close()
        except Exception:  # pragma: no cover - defensive
            return 0

    def module_status(self) -> Dict[str, bool]:
        """Return a health map of which subsystems are available."""
        return {
            "session_manager": self.session_manager is not None,
            "memory_store": self.memory_store is not None,
            "learning": self.learning_db is not None,
            "reasoning_workflow": self.reasoning_workflow is not None,
            "guardrails": self.guardrail_runner is not None,
            "document_ingestion": self.ingestion_pipeline is not None,
        }


# Process-wide singleton, wired during application startup.
services = Services()


def get_services() -> Services:
    """FastAPI dependency returning the shared :class:`Services` instance."""
    return services


class RateLimiter:
    """Simple thread-safe in-memory sliding-window rate limiter."""

    def __init__(self, max_requests: int = 30, window_seconds: int = 60) -> None:
        """Initialise the limiter.

        Args:
            max_requests: Maximum allowed requests per window per key.
            window_seconds: Length of the sliding window in seconds.
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        """Register a hit for ``key`` and enforce the limit.

        Raises:
            HTTPException: 429 when the caller exceeds the allowed rate.
        """
        now = time.time()
        with self._lock:
            bucket = self._hits[key]
            cutoff = now - self.window_seconds
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= self.max_requests:
                retry = int(self.window_seconds - (now - bucket[0])) + 1
                raise HTTPException(
                    status_code=429,
                    detail=(
                        "Đã vượt quá giới hạn số yêu cầu. Vui lòng thử lại sau "
                        f"{max(1, retry)} giây."
                    ),
                )
            bucket.append(now)


# Shared limiter: 30 requests / minute per user (per API spec).
rate_limiter = RateLimiter(max_requests=30, window_seconds=60)
