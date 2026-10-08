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

from fastapi import Depends, HTTPException, Request

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
        self.chat_mode_runner: Any = None
        self.react_runner: Any = None
        self.ingestion_pipeline: Any = None
        self.auth_store: Any = None
        self.auth_service: Any = None

        # Document registry (in-memory) & Quiz persistence (SQLite backed).
        from learning.quiz_store import QuizStore

        self.document_registry: Dict[str, Dict[str, Any]] = {}
        self.quiz_store_backend = QuizStore()
        self.quiz_store: Any = self.quiz_store_backend.as_quiz_mapping()
        self.quiz_history: Any = self.quiz_store_backend.as_history_mapping()

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

        # Google OIDC auth — shares the sessions DB so account linking is atomic.
        from auth import AuthService, AuthStore

        self.auth_store = AuthStore(os.getenv("SESSION_DB_PATH", "sessions.db"))
        self.auth_service = AuthService(self.auth_store, self.session_manager)

        # Learning subsystem & persistent quiz store.
        from learning import (
            AdaptiveEngine,
            FeedbackCollector,
            LearningDatabase,
            QuizStore,
        )

        self.learning_db = LearningDatabase(
            os.getenv("LEARNING_DB_PATH", "learning.db")
        )
        self.feedback_collector = FeedbackCollector(self.learning_db)
        self.adaptive_engine = AdaptiveEngine(self.learning_db)

        quiz_db_path = os.getenv(
            "QUIZ_DB_PATH", os.getenv("LEARNING_DB_PATH", "learning.db")
        )
        self.quiz_store_backend = QuizStore(db_path=quiz_db_path)
        self.quiz_store = self.quiz_store_backend.as_quiz_mapping()
        self.quiz_history = self.quiz_store_backend.as_history_mapping()

        # Reasoning workflow + guardrails (shared, process-wide instances).
        from agents.root_agent import guardrail_runner, reasoning_workflow

        self.reasoning_workflow = reasoning_workflow
        self.guardrail_runner = guardrail_runner

        # Chat/Agent mode runners (replace one-shot reasoning_workflow when
        # the client passes ChatRequest.mode = "chat" / "agent").
        from agents.workflow.chat_mode import ChatModeRunner
        from agents.workflow.react_runner import ReActRunner
        from tools.anatomy_tool import search_anatomy
        from tools.drug_lookup import lookup_drug_info
        from tools.medical_search import retrieve as rag_retrieve
        from tools.url_reader import read_url as url_reader
        from tools.web_search import tavily_search

        llm = _react_llm_adapter()
        self.chat_mode_runner = ChatModeRunner(llm=llm)

        async def _verify_only(state: Dict[str, Any]) -> Dict[str, Any]:
            from agents.workflow.verify_node import verify_node

            return await verify_node(state)

        web_search_tool = tavily_search if os.getenv("TAVILY_API_KEY") else None
        self.react_runner = ReActRunner(
            llm=llm,
            rag_search=lambda q: rag_retrieve(q, top_k=5),
            web_search=web_search_tool,
            read_url=url_reader,
            verify=_verify_only,
            anatomy_tool=search_anatomy,
            drug_lookup=lookup_drug_info,
        )

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
            conn = sqlite3.connect(self.session_manager.db_path, timeout=5.0)
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
            "quiz_store": self.quiz_store_backend is not None,
            "reasoning_workflow": self.reasoning_workflow is not None,
            "guardrails": self.guardrail_runner is not None,
            "document_ingestion": self.ingestion_pipeline is not None,
        }


def _react_llm_adapter():
    """Return an async LLM callable (prompt -> text) backed by the primary model."""
    from google.adk import Agent

    from agents.model_config import get_primary_model
    from agents.workflow._runtime import run_agent

    agent = Agent(
        name="chat_mode_llm",
        model=get_primary_model(),
        instruction="Trả về đúng nội dung được yêu cầu trong prompt.",
    )

    async def _call(prompt: str) -> str:
        return await run_agent(agent, prompt)

    return _call


# Process-wide singleton, wired during application startup.
services = Services()


def get_services() -> Services:
    """FastAPI dependency returning the shared :class:`Services` instance."""
    return services


def get_current_user(request: Request, svc: "Services" = Depends(get_services)):
    """FastAPI dependency returning the authenticated :class:`auth.store.User`.

    Raises 401 if the ``access_token`` cookie is missing, invalid, expired,
    or no longer maps to a known user.
    """
    from auth.tokens import InvalidAccessTokenError, decode_access_token

    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập.")

    try:
        payload = decode_access_token(token)
    except InvalidAccessTokenError:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập.")

    user = svc.auth_store.get_user_by_id(payload["sub"])
    if user is None:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập.")
    return user


def get_current_user_optional(
    request: Request, svc: "Services" = Depends(get_services)
):
    """Like :func:`get_current_user` but returns ``None`` instead of raising."""
    try:
        return get_current_user(request, svc)
    except HTTPException:
        return None


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
