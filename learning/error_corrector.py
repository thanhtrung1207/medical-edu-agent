"""Error correction and repetition prevention for the self-learning module.

Records mistakes and their corrections, then builds prompt context so the agent
can avoid repeating known errors and flagged misconceptions.
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime
from typing import Dict, List, Optional

from .models import KnownError, LearningDatabase

logger = logging.getLogger(__name__)


class ErrorCorrector:
    """Learns from mistakes and prevents repetition."""

    def __init__(self, db: LearningDatabase) -> None:
        """Initialize with a shared :class:`LearningDatabase` instance."""
        self.db = db

    def record_error(
        self,
        topic: str,
        incorrect_claim: str,
        correct_info: str,
        source: str,
    ) -> None:
        """Record an error and its correction.

        Args:
            topic: Topic the error belongs to.
            incorrect_claim: The wrong statement the agent made.
            correct_info: The correct information.
            source: Authoritative source backing the correction.
        """
        error = KnownError(
            id=None,
            topic=(topic or "").strip(),
            incorrect_claim=incorrect_claim,
            correct_info=correct_info,
            source=source,
            created_at=datetime.utcnow(),
        )
        try:
            stored = self.db.insert_known_error(error)
            logger.info(
                "Recorded error id=%s topic=%s", stored.id, error.topic
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.error("Failed to record error: %s", exc)

    def get_known_errors(self, topic: Optional[str] = None) -> List[dict]:
        """Get list of known errors to avoid, optionally filtered by topic.

        Args:
            topic: When provided, only errors for this topic are returned.

        Returns:
            A list of error dicts.
        """
        errors = self.db.get_known_errors(topic)
        return [
            {
                "id": e.id,
                "topic": e.topic,
                "incorrect_claim": e.incorrect_claim,
                "correct_info": e.correct_info,
                "source": e.source,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in errors
        ]

    def build_error_avoidance_context(self, topic: str) -> str:
        """Build a prompt context string of known errors for a topic.

        The returned text is intended to be injected into the agent's prompt so
        it does not repeat mistakes.

        Args:
            topic: Topic to build avoidance context for.

        Returns:
            A formatted context string, or an empty string when there is
            nothing to avoid.
        """
        errors = self.db.get_known_errors(topic)
        if not errors:
            return ""

        lines: List[str] = [
            f"### Known errors to AVOID for topic '{topic}':",
        ]
        for idx, e in enumerate(errors, start=1):
            lines.append(
                f"{idx}. Do NOT claim: \"{e.incorrect_claim}\". "
                f"Correct: {e.correct_info} (Source: {e.source})."
            )
        lines.append(
            "Always verify against these corrections before responding."
        )

        context = "\n".join(lines)
        logger.info(
            "Built avoidance context for topic=%s (%d errors)",
            topic,
            len(errors),
        )
        return context

    def get_error_patterns(self) -> dict:
        """Analyze error patterns across all recorded errors.

        Returns:
            A dict with the total error count, a per-topic count map and the
            most error-prone topics (top 5).
        """
        errors = self.db.get_known_errors()
        if not errors:
            return {
                "total_errors": 0,
                "by_topic": {},
                "most_error_prone": [],
            }

        counter: Counter = Counter(
            (e.topic or "unknown") for e in errors
        )
        by_topic: Dict[str, int] = dict(counter)
        most_prone = [
            {"topic": topic, "count": count}
            for topic, count in counter.most_common(5)
        ]

        return {
            "total_errors": len(errors),
            "by_topic": by_topic,
            "most_error_prone": most_prone,
        }
