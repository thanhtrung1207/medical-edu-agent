"""Medical Education AI Agent - FastAPI server entry point.

Wires the backend modules (reasoning workflow, guardrails, memory/sessions,
self-learning and document ingestion) into a single FastAPI application.

Run locally:
    python main.py
or:
    uvicorn main:app --reload
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Load environment variables from a local .env file before anything else.
load_dotenv()

from api import chat, documents, feedback, quiz  # noqa: E402
from api.deps import services  # noqa: E402
from api.models import HealthResponse, StatsResponse  # noqa: E402

APP_VERSION = "1.0.0"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("medical_edu_agent")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise shared services on startup and release them on shutdown."""
    logger.info("Starting Medical Education AI Agent backend...")
    try:
        services.startup()
    except Exception:  # pragma: no cover - surfaced to logs
        logger.exception("Failed to initialise services during startup")
        raise
    logger.info("Backend ready.")
    yield
    services.shutdown()
    logger.info("Backend stopped.")


app = FastAPI(
    title="Medical Education AI Agent",
    description=(
        "Backend API for a Vietnamese medical-education AI agent with "
        "structured reasoning, safety guardrails, RAG and self-learning."
    ),
    version=APP_VERSION,
    lifespan=lifespan,
)

# CORS — allow the Next.js dev frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers.
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(feedback.router)
app.include_router(quiz.router)


@app.get("/api/health", response_model=HealthResponse)
def health():
    """Liveness/health probe with per-module availability."""
    return HealthResponse(
        status="ok",
        version=APP_VERSION,
        modules=services.module_status(),
    )


@app.get("/api/stats", response_model=StatsResponse)
def stats():
    """Aggregate usage statistics."""
    try:
        total_feedback = len(services.learning_db.get_all_feedback())
    except Exception:  # pragma: no cover - defensive
        total_feedback = 0
    return StatsResponse(
        total_sessions=services.count_sessions(),
        total_documents=len(services.document_registry),
        total_feedback=total_feedback,
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Return a JSON error body for any unhandled exception."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"error": str(exc)})


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("APP_HOST", "0.0.0.0")
    port = int(os.getenv("APP_PORT", "8000"))
    reload = os.getenv("APP_ENV", "development") == "development"
    uvicorn.run("main:app", host=host, port=port, reload=reload)
"""Medical Education AI Agent - FastAPI Server Entry Point."""

# Placeholder - will be implemented in Task 5
# This file will set up the FastAPI application with ADK integration

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
