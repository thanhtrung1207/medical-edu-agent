"""Adaptive learning engine for the self-learning module.

Tracks per-user mastery, schedules spaced-repetition reviews using a simplified
SM-2 variant, and recommends what to study next.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from .models import LearningDatabase, UserProgress

logger = logging.getLogger(__name__)

# Spaced-repetition tuning constants (simplified SM-2 variant).
_MIN_INTERVAL_DAYS = 1
_MAX_INTERVAL_DAYS = 30
_INITIAL_EASINESS = 2.5
_MIN_EASINESS = 1.3

# Mastery adjustment step per interaction.
_MASTERY_STEP_UP = 0.15
_MASTERY_STEP_DOWN = 0.20

# Difficulty thresholds.
_EASY_MAX = 0.3
_MEDIUM_MAX = 0.6


class AdaptiveEngine:
    """Adapts agent behavior based on user's learning progress."""

    def __init__(self, db: LearningDatabase) -> None:
        """Initialize with a shared :class:`LearningDatabase` instance."""
        self.db = db

    def update_progress(
        self, user_id: str, topic: str, is_correct: bool
    ) -> UserProgress:
        """Update user's mastery level for a topic after an interaction.

        Args:
            user_id: The user.
            topic: The topic interacted with.
            is_correct: Whether the user answered correctly.

        Returns:
            The updated :class:`UserProgress`.
        """
        now = datetime.utcnow()
        existing = self.db.get_progress(user_id, topic)

        if existing is None:
            mastery = _MASTERY_STEP_UP if is_correct else 0.0
            attempts = 1
            correct_count = 1 if is_correct else 0
        else:
            if is_correct:
                mastery = min(1.0, existing.mastery_level + _MASTERY_STEP_UP)
            else:
                mastery = max(0.0, existing.mastery_level - _MASTERY_STEP_DOWN)
            attempts = existing.attempts + 1
            correct_count = existing.correct_count + (1 if is_correct else 0)

        next_review = self.calculate_next_review(mastery, attempts, is_correct)

        progress = UserProgress(
            id=existing.id if existing else None,
            user_id=user_id,
            topic=topic,
            mastery_level=round(mastery, 4),
            last_reviewed=now,
            next_review=next_review,
            attempts=attempts,
            correct_count=correct_count,
        )
        stored = self.db.upsert_progress(progress)
        logger.info(
            "Updated progress user=%s topic=%s mastery=%.2f correct=%s",
            user_id,
            topic,
            mastery,
            is_correct,
        )
        return stored

    def get_mastery_level(self, user_id: str, topic: str) -> float:
        """Get current mastery level (0.0 - 1.0) for a topic.

        Returns 0.0 when no progress exists.
        """
        progress = self.db.get_progress(user_id, topic)
        return progress.mastery_level if progress else 0.0

    def get_weak_areas(
        self, user_id: str, threshold: float = 0.4
    ) -> List[str]:
        """Identify topics where the user is struggling (mastery < threshold)."""
        return [
            p.topic
            for p in self.db.get_all_progress(user_id)
            if p.mastery_level < threshold
        ]

    def get_strong_areas(
        self, user_id: str, threshold: float = 0.7
    ) -> List[str]:
        """Identify topics where the user excels (mastery >= threshold)."""
        return [
            p.topic
            for p in self.db.get_all_progress(user_id)
            if p.mastery_level >= threshold
        ]

    def calculate_next_review(
        self, mastery_level: float, attempts: int, is_correct: bool = True
    ) -> datetime:
        """Compute the next review date via a simplified SM-2 variant.

        Rules:
            - Incorrect answer resets the interval to the minimum (1 day).
            - Correct answers grow the interval by an easiness factor that
              scales with mastery (higher mastery -> longer intervals).
            - Interval is clamped to [1, 30] days.

        Args:
            mastery_level: Current mastery (0.0 - 1.0).
            attempts: Total number of attempts for the topic.
            is_correct: Whether the latest answer was correct.

        Returns:
            The next review datetime (UTC).
        """
        now = datetime.utcnow()

        if not is_correct:
            return now + timedelta(days=_MIN_INTERVAL_DAYS)

        # Easiness factor grows with mastery, bounded below by _MIN_EASINESS.
        easiness = max(_MIN_EASINESS, _INITIAL_EASINESS * (0.5 + mastery_level))

        # Interval compounds with the number of successful attempts.
        interval = _MIN_INTERVAL_DAYS
        for _ in range(max(1, attempts)):
            interval *= easiness

        interval = int(round(interval))
        interval = max(_MIN_INTERVAL_DAYS, min(_MAX_INTERVAL_DAYS, interval))
        return now + timedelta(days=interval)

    def get_due_reviews(self, user_id: str) -> List[UserProgress]:
        """Get topics due for review (next_review <= now)."""
        now = datetime.utcnow()
        due = [
            p
            for p in self.db.get_all_progress(user_id)
            if p.next_review and p.next_review <= now
        ]
        due.sort(key=lambda p: p.next_review)
        return due

    def recommend_topics(self, user_id: str, count: int = 5) -> List[dict]:
        """Recommend next topics to study.

        Blends: due reviews (spaced repetition) first, then weak areas, so the
        user reinforces overdue material before tackling struggling topics.

        Args:
            user_id: The user.
            count: Maximum number of recommendations.

        Returns:
            A list of recommendation dicts with topic, reason and priority.
        """
        recommendations: List[dict] = []
        seen: set = set()

        for progress in self.get_due_reviews(user_id):
            if progress.topic in seen:
                continue
            seen.add(progress.topic)
            recommendations.append(
                {
                    "topic": progress.topic,
                    "reason": "due_review",
                    "priority": 1,
                    "mastery_level": progress.mastery_level,
                }
            )

        for topic in self.get_weak_areas(user_id):
            if topic in seen:
                continue
            seen.add(topic)
            recommendations.append(
                {
                    "topic": topic,
                    "reason": "weak_area",
                    "priority": 2,
                    "mastery_level": self.get_mastery_level(user_id, topic),
                }
            )

        recommendations.sort(key=lambda r: (r["priority"], r["mastery_level"]))
        return recommendations[: max(0, count)]

    def get_difficulty_level(self, user_id: str, topic: str) -> str:
        """Determine appropriate difficulty for this user/topic.

        Returns 'easy', 'medium' or 'hard' based on mastery thresholds.
        """
        mastery = self.get_mastery_level(user_id, topic)
        if mastery < _EASY_MAX:
            return "easy"
        if mastery <= _MEDIUM_MAX:
            return "medium"
        return "hard"

    def get_user_profile(self, user_id: str) -> dict:
        """Get a comprehensive user learning profile.

        Returns:
            A dict summarizing overall mastery, weak/strong areas, accuracy,
            total interactions and a consistency estimate.
        """
        progress_list = self.db.get_all_progress(user_id)
        if not progress_list:
            return {
                "user_id": user_id,
                "topics_tracked": 0,
                "overall_mastery": 0.0,
                "total_attempts": 0,
                "accuracy": 0.0,
                "weak_areas": [],
                "strong_areas": [],
                "due_reviews": 0,
                "consistency": 0.0,
            }

        total_attempts = sum(p.attempts for p in progress_list)
        total_correct = sum(p.correct_count for p in progress_list)
        overall_mastery = sum(p.mastery_level for p in progress_list) / len(
            progress_list
        )
        accuracy = (
            total_correct / total_attempts if total_attempts else 0.0
        )

        # Consistency: fraction of tracked topics that are not overdue.
        due = len(self.get_due_reviews(user_id))
        consistency = 1.0 - (due / len(progress_list)) if progress_list else 0.0

        return {
            "user_id": user_id,
            "topics_tracked": len(progress_list),
            "overall_mastery": round(overall_mastery, 3),
            "total_attempts": total_attempts,
            "accuracy": round(accuracy, 3),
            "weak_areas": self.get_weak_areas(user_id),
            "strong_areas": self.get_strong_areas(user_id),
            "due_reviews": due,
            "consistency": round(consistency, 3),
        }
