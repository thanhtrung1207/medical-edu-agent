"""Feedback collection and analysis for the self-learning module.

Collects explicit user feedback (ratings, corrections) and derives implicit
signals from conversation history so the agent can identify weak topics and
improve over time.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional

from .models import Feedback, LearningDatabase

logger = logging.getLogger(__name__)

# Rating bounds for explicit feedback (thumbs -> 1..5 scale).
_MIN_RATING = 1
_MAX_RATING = 5


class FeedbackCollector:
    """Collects and processes user feedback on agent responses."""

    def __init__(self, db: LearningDatabase) -> None:
        """Initialize with a shared :class:`LearningDatabase` instance."""
        self.db = db

    def record_feedback(
        self,
        session_id: str,
        user_id: str,
        message_id: str,
        rating: int,
        correction: Optional[str] = None,
    ) -> Feedback:
        """Record user feedback (thumbs up/down, corrections).

        Args:
            session_id: Conversation/session identifier.
            user_id: The user providing feedback.
            message_id: The agent message being rated.
            rating: Integer rating; clamped to the 1-5 range.
            correction: Optional corrected text supplied by the user.

        Returns:
            The persisted :class:`Feedback` (with assigned id).
        """
        clamped = max(_MIN_RATING, min(_MAX_RATING, int(rating)))
        if clamped != rating:
            logger.warning(
                "Rating %s out of range; clamped to %s", rating, clamped
            )

        feedback = Feedback(
            id=None,
            session_id=session_id,
            user_id=user_id,
            message_id=message_id,
            rating=clamped,
            correction=correction,
            created_at=datetime.utcnow(),
        )
        stored = self.db.insert_feedback(feedback)
        logger.info(
            "Recorded feedback id=%s user=%s rating=%s",
            stored.id,
            user_id,
            clamped,
        )
        return stored

    def get_user_feedback_stats(self, user_id: str) -> dict:
        """Get aggregate feedback stats for a user.

        Returns:
            A dict with total count, average rating, rating distribution and
            the number of corrections supplied. Sensible zero-defaults are
            returned when there is no feedback.
        """
        items = self.db.get_feedback_by_user(user_id)
        if not items:
            return {
                "user_id": user_id,
                "total": 0,
                "average_rating": 0.0,
                "rating_distribution": {},
                "corrections": 0,
            }

        distribution: Dict[int, int] = defaultdict(int)
        rating_sum = 0
        corrections = 0
        for fb in items:
            distribution[fb.rating] += 1
            rating_sum += fb.rating
            if fb.correction:
                corrections += 1

        return {
            "user_id": user_id,
            "total": len(items),
            "average_rating": round(rating_sum / len(items), 2),
            "rating_distribution": dict(distribution),
            "corrections": corrections,
        }

    def get_low_rated_topics(self, threshold: float = 3.0) -> List[str]:
        """Identify topics where responses are consistently poorly rated.

        Corrections are treated as topic labels (the corrected text often names
        the topic). When no explicit topic is available, the message_id is used
        as a proxy grouping key.

        Args:
            threshold: Average rating at or below which a topic is "low rated".

        Returns:
            A list of topic keys whose average rating is <= threshold.
        """
        all_feedback = self.db.get_all_feedback()
        if not all_feedback:
            return []

        grouped: Dict[str, List[int]] = defaultdict(list)
        for fb in all_feedback:
            key = (fb.correction or fb.message_id or "unknown").strip()
            grouped[key].append(fb.rating)

        low: List[str] = []
        for topic, ratings in grouped.items():
            avg = sum(ratings) / len(ratings)
            if avg <= threshold:
                low.append(topic)

        logger.info("Found %d low-rated topics (<=%.1f)", len(low), threshold)
        return low

    def detect_implicit_feedback(
        self, session_history: List[dict]
    ) -> List[dict]:
        """Detect implicit signals from a conversation history.

        Signals detected:
            - repeated_topic: user asks about the same topic again (didn't
              understand).
            - rephrase: user rephrases a very similar question (answer unclear).
            - correction: user explicitly corrects the agent (answer wrong).

        Args:
            session_history: Ordered list of message dicts. Each item may
                contain ``role`` ('user'/'assistant'), ``content`` and an
                optional ``topic``.

        Returns:
            A list of signal dicts: ``{"type", "topic", "message_index",
            "confidence"}``.
        """
        signals: List[dict] = []
        seen_topics: Dict[str, int] = {}
        prev_user_msg: Optional[str] = None

        correction_markers = (
            "actually", "that's wrong", "incorrect", "no,", "not right",
            "sai rồi", "không đúng", "thực ra",
        )

        for idx, msg in enumerate(session_history):
            if (msg.get("role") or "").lower() != "user":
                continue

            content = (msg.get("content") or "").strip()
            topic = (msg.get("topic") or "").strip().lower()
            lowered = content.lower()

            # Explicit correction language.
            if any(marker in lowered for marker in correction_markers):
                signals.append(
                    {
                        "type": "correction",
                        "topic": topic or None,
                        "message_index": idx,
                        "confidence": 0.8,
                    }
                )

            # Repeated topic.
            if topic:
                if topic in seen_topics:
                    signals.append(
                        {
                            "type": "repeated_topic",
                            "topic": topic,
                            "message_index": idx,
                            "confidence": 0.6,
                        }
                    )
                seen_topics[topic] = idx

            # Rephrase detection via token-overlap similarity.
            if prev_user_msg and self._is_rephrase(prev_user_msg, lowered):
                signals.append(
                    {
                        "type": "rephrase",
                        "topic": topic or None,
                        "message_index": idx,
                        "confidence": 0.5,
                    }
                )
            prev_user_msg = lowered

        logger.info("Detected %d implicit feedback signals", len(signals))
        return signals

    @staticmethod
    def _is_rephrase(prev: str, current: str, threshold: float = 0.5) -> bool:
        """Return True when two messages are similar (Jaccard token overlap).

        Identical messages are not counted as rephrases.
        """
        prev_tokens = set(prev.split())
        cur_tokens = set(current.split())
        if not prev_tokens or not cur_tokens:
            return False
        if prev == current:
            return False
        intersection = prev_tokens & cur_tokens
        union = prev_tokens | cur_tokens
        similarity = len(intersection) / len(union)
        return threshold <= similarity < 1.0
