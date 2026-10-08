"""Quiz endpoints.

Generates USMLE/NMLE-style MCQs via the ``quiz_master`` ADK agent (with a
deterministic fallback when the LLM runtime is unavailable), grades submissions
server-side, feeds results into the adaptive learning engine and keeps a simple
per-user quiz history.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from core.tracing import trace_span
from memory.learning_memory import normalize_topic

from .deps import Services, get_services, rate_limiter
from .models import (
    QuizAnswerDetail,
    QuizGenerateRequest,
    QuizGenerateResponse,
    QuizOption,
    QuizQuestion,
    QuizSubmitRequest,
    QuizSubmitResponse,
    QuizSyncRequest,
    QuizSyncResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["quiz"])

# The quiz LLM path depends on the ADK runtime; import defensively so the API
# still works (via fallback questions) when it is unavailable.
try:  # pragma: no cover - depends on environment
    from agents.quiz_agent import quiz_agent
    from agents.workflow._runtime import extract_json, run_agent

    _QUIZ_LLM_AVAILABLE = True
except Exception as exc:  # pragma: no cover - depends on environment
    logger.warning("Quiz LLM unavailable, using fallback generator: %s", exc)
    _QUIZ_LLM_AVAILABLE = False

_OPTION_KEYS = ("A", "B", "C", "D", "E")


def _normalize_questions(
    items: List[Any], count: int
) -> List[Dict[str, Any]]:
    """Normalise raw agent quiz items into internal question dicts."""
    questions: List[Dict[str, Any]] = []
    for idx, item in enumerate(items[: max(1, count)], start=1):
        if not isinstance(item, dict):
            continue
        raw_options = item.get("options") or {}
        options: List[Dict[str, str]] = []
        if isinstance(raw_options, dict):
            for key in _OPTION_KEYS:
                if key in raw_options:
                    options.append({"key": key, "text": str(raw_options[key])})
        elif isinstance(raw_options, list):
            for i, text in enumerate(raw_options):
                options.append({"key": _OPTION_KEYS[i % len(_OPTION_KEYS)], "text": str(text)})

        if not options:
            continue

        correct = str(item.get("correct_answer") or "A").strip().upper()[:1]
        if correct not in {o["key"] for o in options}:
            correct = options[0]["key"]

        questions.append(
            {
                "id": f"q{idx}",
                "stem": str(item.get("stem") or f"Câu hỏi {idx}"),
                "options": options,
                "correct_answer": correct,
                "explanation": str(item.get("explanation") or ""),
            }
        )
    return questions


def _fallback_questions(
    topic: str, difficulty: str, count: int
) -> List[Dict[str, Any]]:
    """Build deterministic placeholder questions when the LLM is unavailable."""
    questions: List[Dict[str, Any]] = []
    for i in range(1, max(1, count) + 1):
        options = [
            {"key": key, "text": f"Phương án {key} (minh hoạ)"}
            for key in _OPTION_KEYS
        ]
        questions.append(
            {
                "id": f"q{i}",
                "stem": (
                    f"({topic}) Câu hỏi số {i} [{difficulty}]: Đâu là phát biểu "
                    "đúng nhất theo y học dựa trên bằng chứng?"
                ),
                "options": options,
                "correct_answer": "B",
                "explanation": (
                    "Đây là câu hỏi minh hoạ được tạo khi công cụ tạo quiz bằng "
                    "LLM chưa sẵn sàng."
                ),
            }
        )
    return questions


async def _generate_questions(
    topic: str, difficulty: str, count: int
) -> List[Dict[str, Any]]:
    """Generate quiz questions via the quiz agent, falling back on failure."""
    if _QUIZ_LLM_AVAILABLE:
        prompt = (
            f"Hãy tạo {count} câu hỏi trắc nghiệm y khoa (MCQ) về chủ đề "
            f"'{topic}' với độ khó '{difficulty}'. Mỗi câu gồm 5 phương án A-E "
            "và một đáp án đúng. Trả về đúng định dạng JSON quy định."
        )
        try:
            raw = await run_agent(quiz_agent, prompt)
            parsed = extract_json(raw, default=None)
            items = parsed.get("quiz") if isinstance(parsed, dict) else parsed
            if isinstance(items, list) and items:
                normalized = _normalize_questions(items, count)
                if normalized:
                    return normalized
        except Exception as exc:  # pragma: no cover - depends on environment
            logger.warning("Quiz generation via LLM failed: %s", exc)

    return _fallback_questions(topic, difficulty, count)


@router.post("/quiz/generate", response_model=QuizGenerateResponse)
async def generate_quiz(
    request: QuizGenerateRequest, svc: Services = Depends(get_services)
):
    """Generate a quiz and store it (with answers) server-side."""
    rate_limiter.check(f"quiz:{request.user_id or 'anonymous'}")

    with trace_span("quiz.generate", topic=request.topic, difficulty=request.difficulty, count=request.count):
        questions = await _generate_questions(
            request.topic, request.difficulty, request.count
        )
        quiz_id = f"quiz_{uuid.uuid4().hex[:12]}"
        svc.quiz_store[quiz_id] = {
            "id": quiz_id,
            "topic": request.topic,
            "difficulty": request.difficulty,
            "questions": questions,
            "created_at": datetime.now().isoformat(),
        }

        # Public questions omit the correct answer / explanation.
        public_questions = [
            QuizQuestion(
                id=q["id"],
                stem=q["stem"],
                options=[QuizOption(**opt) for opt in q["options"]],
            )
            for q in questions
        ]
        return QuizGenerateResponse(
            quiz_id=quiz_id,
            id=quiz_id,
            topic=request.topic,
            difficulty=request.difficulty,
            questions=public_questions,
        )


@router.post("/quiz/submit", response_model=QuizSubmitResponse)
def submit_quiz(
    request: QuizSubmitRequest, svc: Services = Depends(get_services)
):
    """Grade a quiz submission and update the user's learning progress."""
    quiz_id = request.resolved_quiz_id()
    quiz = svc.quiz_store.get(quiz_id)
    if quiz is None:
        raise HTTPException(status_code=404, detail="Quiz not found")

    topic = quiz["topic"]
    with trace_span("quiz.submit", quiz_id=quiz_id, topic=topic, user_id=request.user_id):
        details: List[QuizAnswerDetail] = []
        correct_count = 0

        for question in quiz["questions"]:
            selected = str(request.answers.get(question["id"], "")).strip().upper()[:1]
            is_correct = selected == question["correct_answer"]
            if is_correct:
                correct_count += 1
            details.append(
                QuizAnswerDetail(
                    questionId=question["id"],
                    selected=selected,
                    correct=is_correct,
                    correctAnswer=question["correct_answer"],
                    explanation=question.get("explanation"),
                )
            )
            # Feed each answer into the adaptive engine for mastery tracking.
            try:
                svc.adaptive_engine.update_progress(request.user_id, topic, is_correct)
            except Exception as exc:  # pragma: no cover - defensive
                logger.debug("Progress update skipped: %s", exc)

        total = len(quiz["questions"])
        score = round((correct_count / total) * 100, 1) if total else 0.0
        incorrect_count = total - correct_count
        if incorrect_count:
            try:
                memory_topic = normalize_topic(topic)
                if memory_topic:
                    svc.memory_store.store(
                        request.user_id,
                        "weak_area",
                        memory_topic,
                        {
                            "topic": memory_topic,
                            "incorrect_count": incorrect_count,
                            "last_score": score,
                        },
                        confidence=incorrect_count / total,
                    )
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Weak-area memory write skipped: %s", type(exc).__name__)

        svc.quiz_history[request.user_id].append(
            {
                "quiz_id": quiz_id,
                "topic": topic,
                "difficulty": quiz.get("difficulty"),
                "score": score,
                "total": total,
                "correct": correct_count,
                "submitted_at": datetime.now().isoformat(),
            }
        )

        return QuizSubmitResponse(
            quizId=quiz_id,
            score=score,
            total=total,
            correct=correct_count,
            correctCount=correct_count,
            details=details,
            results=details,
        )


@router.get("/quiz/history/{user_id}")
def quiz_history(user_id: str, svc: Services = Depends(get_services)):
    """Return the user's completed quiz history."""
    return {"quizzes": svc.quiz_history.get(user_id, [])}


@router.post("/quiz/sync", response_model=QuizSyncResponse)
def sync_quiz_progress(
    request: QuizSyncRequest, svc: Services = Depends(get_services)
):
    """Sync batched quiz attempts from the frontend IndexedDB store.

    Attempts accumulated offline are replayed into the adaptive learning
    engine to keep server-side mastery and spaced-repetition schedules in
    sync. Attempts are processed in chronological order (sorted by their
    ISO 8601 ``timestamp``) so mastery adjustments apply in the same order
    the user actually answered. An empty batch is handled gracefully and
    reports zero synced attempts.
    """
    attempts = list(request.attempts)
    if not attempts:
        logger.info("Quiz sync: empty batch for user=%s", request.user_id)
        return QuizSyncResponse(
            synced_count=0, mastery_levels={}, next_reviews={}
        )

    # Process in chronological order so mastery adjustments are applied in the
    # same sequence the user answered. ISO 8601 strings sort lexicographically.
    attempts.sort(key=lambda a: a.timestamp or "")

    mastery_levels: Dict[str, float] = {}
    next_reviews: Dict[str, str] = {}
    synced_count = 0

    for attempt in attempts:
        try:
            progress = svc.adaptive_engine.update_progress(
                request.user_id, attempt.topic, attempt.is_correct
            )
            mastery_levels[attempt.topic] = progress.mastery_level
            if progress.next_review is not None:
                next_reviews[attempt.topic] = progress.next_review.isoformat()
            synced_count += 1
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning(
                "Quiz sync: skipped attempt user=%s topic=%s: %s",
                request.user_id,
                attempt.topic,
                exc,
            )

    logger.info(
        "Quiz sync: user=%s synced=%d/%d topics=%d",
        request.user_id,
        synced_count,
        len(attempts),
        len(mastery_levels),
    )
    return QuizSyncResponse(
        synced_count=synced_count,
        mastery_levels=mastery_levels,
        next_reviews=next_reviews,
    )
