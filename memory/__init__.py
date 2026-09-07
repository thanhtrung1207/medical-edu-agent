"""Memory & session management package for the Medical Education AI Agent.

Provides persistent conversation sessions, long-term user memory, and a context
builder that fuses both into personalized, size-bounded prompt context for the
agent.

Example:
    >>> from memory import SessionManager, MemoryStore, ContextBuilder
    >>> sessions = SessionManager()
    >>> store = MemoryStore()
    >>> builder = ContextBuilder(sessions, store)
"""

from __future__ import annotations

from memory.context_builder import ContextBuilder
from memory.learning_memory import (
    LearningFact,
    extract_explicit_learning_facts,
    normalize_topic,
)
from memory.memory_store import MEMORY_TYPES, MemoryEntry, MemoryStore
from memory.session_manager import Session, SessionManager

__all__ = [
    "SessionManager",
    "Session",
    "MemoryStore",
    "MemoryEntry",
    "MEMORY_TYPES",
    "ContextBuilder",
    "LearningFact",
    "extract_explicit_learning_facts",
    "normalize_topic",
]
