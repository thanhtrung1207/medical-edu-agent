"""Self-learning module for the Medical Education AI Agent.

Enables the agent to improve over time by:
    - collecting explicit and implicit user feedback,
    - tracking and applying knowledge-base updates,
    - recording errors and building avoidance context, and
    - adapting to each user's mastery via spaced repetition.

Example:
    >>> from learning import LearningDatabase, AdaptiveEngine
    >>> db = LearningDatabase()
    >>> engine = AdaptiveEngine(db)
"""

from __future__ import annotations

from .adaptive_engine import AdaptiveEngine
from .error_corrector import ErrorCorrector
from .feedback_collector import FeedbackCollector
from .knowledge_updater import KnowledgeUpdater
from .models import (
    Feedback,
    KnowledgeUpdate,
    KnownError,
    LearningDatabase,
    UserProgress,
)

__all__ = [
    # Database + models
    "LearningDatabase",
    "Feedback",
    "UserProgress",
    "KnowledgeUpdate",
    "KnownError",
    # Components
    "FeedbackCollector",
    "KnowledgeUpdater",
    "ErrorCorrector",
    "AdaptiveEngine",
]
