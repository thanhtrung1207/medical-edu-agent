"""API layer for the Medical Education AI Agent.

Groups the FastAPI routers (chat, documents, feedback/learning, quiz) and the
shared service container / dependency helpers used to wire the backend modules
into the HTTP server defined in :mod:`main`.
"""

from __future__ import annotations

__all__ = ["chat", "documents", "feedback", "quiz", "models", "deps"]
