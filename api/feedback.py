"""Feedback and learning endpoints.

Exposes explicit feedback recording plus per-user learning insights (mastery,
weak/strong areas) and study recommendations, backed by the self-learning
subsystem (:class:`FeedbackCollector`, :class:`AdaptiveEngine`).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends

from .deps import Services, get_services
from .models import (
    FeedbackRequest,
    ProgressResponse,
    RecommendationsResponse,
    SuccessResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["feedback", "learning"])


def _suggested_difficulty(overall_mastery: float) -> str:
    """Map an overall mastery score to a difficulty label."""
    if overall_mastery < 0.3:
        return "easy"
    if overall_mastery <= 0.6:
        return "medium"
    return "hard"


@router.post("/feedback", response_model=SuccessResponse)
def submit_feedback(
    request: FeedbackRequest, svc: Services = Depends(get_services)
):
    """Record explicit user feedback on an assistant message."""
    try:
        svc.feedback_collector.record_feedback(
            session_id=request.session_id or "",
            user_id=request.user_id,
            message_id=request.resolved_message_id(),
            rating=request.rating,
            correction=request.correction,
        )
        return SuccessResponse(success=True)
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Failed to record feedback: %s", exc)
        return SuccessResponse(success=False)


@router.get("/progress/{user_id}", response_model=ProgressResponse)
def get_progress(user_id: str, svc: Services = Depends(get_services)):
    """Return the user's mastery levels and weak/strong areas."""
    profile = svc.adaptive_engine.get_user_profile(user_id)
    progress_list = svc.learning_db.get_all_progress(user_id)
    mastery_levels = {p.topic: p.mastery_level for p in progress_list}
    return ProgressResponse(
        mastery_levels=mastery_levels,
        weak_areas=profile.get("weak_areas", []),
        strong_areas=profile.get("strong_areas", []),
        total_interactions=profile.get("total_attempts", 0),
    )


@router.get("/recommendations/{user_id}", response_model=RecommendationsResponse)
def get_recommendations(user_id: str, svc: Services = Depends(get_services)):
    """Recommend study topics and list reviews due for the user."""
    topics = svc.adaptive_engine.recommend_topics(user_id)
    due_reviews = [
        {
            "topic": p.topic,
            "mastery_level": p.mastery_level,
            "next_review": p.next_review.isoformat() if p.next_review else None,
        }
        for p in svc.adaptive_engine.get_due_reviews(user_id)
    ]
    profile = svc.adaptive_engine.get_user_profile(user_id)
    suggested = _suggested_difficulty(profile.get("overall_mastery", 0.0))
    return RecommendationsResponse(
        topics=topics,
        due_reviews=due_reviews,
        suggested_difficulty=suggested,
    )
