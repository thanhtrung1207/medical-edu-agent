"""Chat / agent-interaction endpoints.

The chat endpoint ties the whole backend together:

    1. resolve (or create) the conversation session
    2. run guardrail *pre*-checks on the user input (scope + emergency)
    3. if blocked, return a safe redirect message immediately
    4. build personalized context from memory
    5. run the reasoning workflow (confirm → think → answer → verify)
    6. run guardrail *post*-checks on the generated answer
    7. persist the assistant message and update the session topic
    8. return a structured response (optionally as an SSE stream)
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from agents.guardrails.models import DISCLAIMER_VI
from memory.learning_memory import extract_explicit_learning_facts

from .deps import Services, get_services, rate_limiter
from .models import (
    ChatHistoryResponse,
    ChatRequest,
    ChatResponse,
    ChatSessionSummary,
    Citation,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])


def _build_citations(state: Dict[str, Any]) -> List[Citation]:
    """Build structured citations from the workflow state.

    Prefers the full ``retrieved_sources`` objects (title + snippet); falls
    back to the plain citation strings produced by the Answer node.
    """
    citations: List[Citation] = []
    for src in state.get("retrieved_sources") or []:
        if isinstance(src, dict):
            citations.append(
                Citation(
                    source=str(
                        src.get("title") or src.get("source") or "Tài liệu"
                    ),
                    quote=str(src.get("snippet") or ""),
                )
            )
    if not citations:
        for item in state.get("citations") or []:
            text = str(item).strip()
            if text:
                citations.append(Citation(source=text, quote=""))
    return citations


async def _run_chat(request: ChatRequest, svc: Services) -> ChatResponse:
    """Execute the full chat pipeline and return a structured response."""
    # 1. Resolve or create the session.
    if request.session_id:
        session = svc.session_manager.get_session(request.session_id)
        if session is None or session.user_id != request.user_id:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        session = svc.session_manager.create_session(user_id=request.user_id)
    session_id = session.id

    # Set session title from first user message (only for new sessions).
    if session.topic is None:
        _title = request.message.strip()
        if len(_title) > 60:
            _title = _title[:57] + "…"
        svc.session_manager.update_session_topic(session_id, _title)
        session.topic = _title

    # Persist the user's message and identify only this turn's topic.
    svc.session_manager.add_message(session_id, "user", request.message)
    current_topic = svc.context_builder.detect_topic_from_messages(
        [{"role": "user", "content": request.message}]
    )

    # 2 & 3. Guardrail pre-checks (scope + emergency) — short-circuit if blocked.
    pre = svc.guardrail_runner.run_pre_checks(request.message)
    if pre.should_block:
        answer = pre.block_reason or pre.disclaimer or DISCLAIMER_VI
        message_id = svc.session_manager.add_message(
            session_id, "assistant", answer, {"blocked": True, "stage": "pre"}
        )
        logger.info("Chat blocked by pre-checks for session %s", session_id)
        return ChatResponse(
            answer=answer,
            content=answer,
            confidence=0.0,
            citations=[],
            warnings=list(pre.warnings),
            disclaimer=pre.disclaimer or DISCLAIMER_VI,
            reasoning_steps=[],
            session_id=session_id,
            message_id=message_id,
        )

    # 4. Build personalized context from memory (best-effort).
    context: Dict[str, Any] = {}
    try:
        context = svc.context_builder.build_context(
            request.user_id, session_id, current_topic
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Context build failed: %s", type(exc).__name__)

    # 5. Run the mode-specific runner.
    try:
        if request.mode == "chat":
            state = await svc.chat_mode_runner.run(request.message, context)
        else:
            state = await svc.react_runner.run(request.message, context)
    except Exception as exc:
        logger.exception("Mode runner failed: %s", type(exc).__name__)
        fallback = "Đã xảy ra lỗi khi xử lý câu trả lời. Vui lòng thử lại sau."
        state = {
            "formatted_answer": fallback,
            "verified_answer": fallback,
            "reasoning_steps": [],
            "citations": [],
            "retrieved_sources": [],
            "confidence_score": 0.0,
            "warnings": [f"RunnerError: {type(exc).__name__}"],
        }
    answer = (
        state.get("verified_answer")
        or state.get("formatted_answer")
        or ""
    )
    reasoning_steps = [str(s) for s in (state.get("reasoning_steps") or [])]
    citation_strings = list(state.get("citations") or [])
    warnings: List[str] = list(state.get("warnings") or [])
    confidence = float(state.get("confidence_score", 0.0) or 0.0)

    # 6. Guardrail post-checks (hallucination, safety, confidence).
    # Use actual retrieved document content for grounding checks, NOT
    # citation name strings (e.g. book titles) generated by the LLM.
    # Citation names can never match answer content via token-overlap.
    retrieved_content = [
        src.get("content", src.get("snippet", ""))
        for src in (state.get("retrieved_sources") or [])
        if isinstance(src, dict)
    ]
    post = svc.guardrail_runner.run_post_checks(
        response=answer,
        sources=retrieved_content,
        reasoning=reasoning_steps,
        user_input=request.message,
    )
    if post.should_block:
        answer = post.block_reason or post.disclaimer or answer
    for warning in post.warnings:
        if warning not in warnings:
            warnings.append(warning)
    if post.confidence_score:
        confidence = float(post.confidence_score)
    disclaimer = post.disclaimer or DISCLAIMER_VI

    # 7. Persist the assistant message, then record explicit learning facts.
    message_id = svc.session_manager.add_message(
        session_id,
        "assistant",
        answer,
        {
            "confidence": confidence,
            "citations": citation_strings,
            "warnings": warnings,
        },
    )
    if not post.should_block:
        try:
            for fact in extract_explicit_learning_facts(
                request.message, current_topic
            ):
                svc.memory_store.store(
                    request.user_id,
                    fact.memory_type,
                    fact.key,
                    fact.value,
                    fact.confidence,
                )
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Memory write failed: %s", type(exc).__name__)

    # 8. Structured response.
    return ChatResponse(
        answer=answer,
        content=answer,
        confidence=confidence,
        citations=_build_citations(state),
        warnings=warnings,
        disclaimer=disclaimer,
        reasoning_steps=reasoning_steps,
        session_id=session_id,
        message_id=message_id,
    )


def _sse(step: str, content: Any) -> str:
    """Format a single Server-Sent-Event data frame."""
    payload = json.dumps({"step": step, "content": content}, ensure_ascii=False)
    return f"data: {payload}\n\n"


async def _stream_chat(request: ChatRequest, svc: Services):
    """Yield the reasoning stages then the final answer as SSE events."""
    try:
        result = await _run_chat(request, svc)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Streaming chat failed")
        yield _sse("error", str(exc))
        return

    yield _sse("confirm", {"session_id": result.session_id})
    yield _sse("think", result.reasoning_steps)
    yield _sse(
        "answer",
        {"answer": result.answer, "citations": [c.model_dump() for c in result.citations]},
    )
    yield _sse(
        "verify",
        {"confidence": result.confidence, "warnings": result.warnings},
    )
    yield _sse(
        "done",
        {
            "answer": result.answer,
            "confidence": result.confidence,
            "citations": [c.model_dump() for c in result.citations],
            "warnings": result.warnings,
            "disclaimer": result.disclaimer,
            "reasoning_steps": result.reasoning_steps,
            "session_id": result.session_id,
            "message_id": result.message_id,
        },
    )


@router.post("/chat")
async def chat(request: ChatRequest, svc: Services = Depends(get_services)):
    """Handle a chat turn.

    Returns a JSON :class:`ChatResponse` by default, or an SSE stream when
    ``request.stream`` is true.
    """
    rate_limiter.check(f"chat:{request.user_id}")

    if request.stream:
        if request.session_id:
            session = svc.session_manager.get_session(request.session_id)
            if session is None or session.user_id != request.user_id:
                raise HTTPException(status_code=404, detail="Session not found")
        return StreamingResponse(
            _stream_chat(request, svc),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return await _run_chat(request, svc)


@router.get("/chat/history/{session_id}", response_model=ChatHistoryResponse)
def chat_history(
    session_id: str,
    user_id: str = Query(..., min_length=1, max_length=128),
    svc: Services = Depends(get_services),
):
    """Return the requesting user's message history and detected topic."""
    session = svc.session_manager.get_session(session_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")
    return ChatHistoryResponse(messages=session.messages, topic=session.topic)


@router.get("/chat/sessions", response_model=List[ChatSessionSummary])
def chat_sessions(
    user_id: Optional[str] = Query(None, max_length=128),
    limit: int = Query(20, ge=1, le=100),
    svc: Services = Depends(get_services),
):
    """List the requesting user's recent chat sessions, newest first.

    Returns an empty array when the user has no sessions yet. Sessions are
    always scoped to the requesting ``user_id`` and never expose messages.
    """
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required")

    sessions = svc.session_manager.list_sessions(user_id, limit=limit)
    message_counts = svc.session_manager.count_messages_by_session(
        [session.id for session in sessions]
    )
    return [
        ChatSessionSummary(
            session_id=session.id,
            topic=session.topic,
            created_at=session.created_at.isoformat(),
            last_active=session.last_active.isoformat(),
            message_count=message_counts.get(session.id, 0),
        )
        for session in sessions
    ]
