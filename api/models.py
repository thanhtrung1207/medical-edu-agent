"""Pydantic request/response models for the API layer.

These models define the wire contract between the Next.js frontend and the
FastAPI backend. Where the frontend uses camelCase field names (e.g.
``messageId``, ``quizId``) the models accept both the snake_case (spec) and
camelCase (frontend) variants so both callers work without modification.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

# --------------------------------------------------------------------------- #
# Chat
# --------------------------------------------------------------------------- #


class ChatRequest(BaseModel):
    """Body for ``POST /api/chat``."""

    message: str
    session_id: Optional[str] = None
    user_id: str = Field(min_length=1, max_length=128)
    # When true the endpoint returns an SSE stream instead of a JSON body.
    stream: bool = False


class Citation(BaseModel):
    """A single grounding citation surfaced to the user."""

    source: str
    page: Optional[int] = None
    chapter: Optional[str] = None
    quote: str = ""


class ChatResponse(BaseModel):
    """Structured chat answer.

    Includes both ``answer`` (API spec) and ``content`` (frontend
    ``AssistantReply``) carrying the same value so either client works.
    """

    answer: str
    content: str
    confidence: float = 0.0
    citations: List[Citation] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    disclaimer: Optional[str] = None
    reasoning_steps: List[str] = Field(default_factory=list)
    session_id: str
    message_id: str


class ChatHistoryResponse(BaseModel):
    """Response for ``GET /api/chat/history/{session_id}``."""

    messages: List[Dict[str, Any]] = Field(default_factory=list)
    topic: Optional[str] = None


# --------------------------------------------------------------------------- #
# Memories
# --------------------------------------------------------------------------- #


class MemoryResponse(BaseModel):
    """A parsed long-term memory entry exposed to its owner."""

    id: int
    memory_type: str
    key: str
    value: Any
    confidence: float
    created_at: str
    updated_at: str


class MemoryListResponse(BaseModel):
    """Response for ``GET /api/memories``."""

    memories: List[MemoryResponse] = Field(default_factory=list)


class MemoryDeleteResponse(BaseModel):
    """Response for deleting one or all owned memories."""

    deleted: int


# --------------------------------------------------------------------------- #
# Documents
# --------------------------------------------------------------------------- #


class UploadResponse(BaseModel):
    """Immediate response after queuing a document for ingestion."""

    document_id: str
    status: str
    filename: str


class DocumentInfo(BaseModel):
    """A registered document entry."""

    id: str
    filename: str
    status: str
    uploaded_at: str
    num_chunks: int = 0


class DocumentListResponse(BaseModel):
    """Response for ``GET /api/documents``."""

    documents: List[DocumentInfo] = Field(default_factory=list)


class DocumentStatusResponse(BaseModel):
    """Response for ``GET /api/documents/{document_id}/status``."""

    document_id: str
    status: str
    num_chunks: int = 0
    processing_time: float = 0.0


class DeleteResponse(BaseModel):
    """Generic success flag for delete operations."""

    success: bool


# --------------------------------------------------------------------------- #
# Feedback & Learning
# --------------------------------------------------------------------------- #


class FeedbackRequest(BaseModel):
    """Body for ``POST /api/feedback``.

    Accepts both ``message_id`` (spec) and ``messageId`` (frontend).
    """

    session_id: Optional[str] = None
    user_id: str = "anonymous"
    message_id: Optional[str] = None
    messageId: Optional[str] = None
    rating: int = 3
    correction: Optional[str] = None

    def resolved_message_id(self) -> str:
        """Return whichever message id variant was supplied."""
        return (self.message_id or self.messageId or "").strip()


class SuccessResponse(BaseModel):
    """Generic success flag."""

    success: bool


class ProgressResponse(BaseModel):
    """Response for ``GET /api/progress/{user_id}``."""

    mastery_levels: Dict[str, float] = Field(default_factory=dict)
    weak_areas: List[str] = Field(default_factory=list)
    strong_areas: List[str] = Field(default_factory=list)
    total_interactions: int = 0


class RecommendationsResponse(BaseModel):
    """Response for ``GET /api/recommendations/{user_id}``."""

    topics: List[Dict[str, Any]] = Field(default_factory=list)
    due_reviews: List[Dict[str, Any]] = Field(default_factory=list)
    suggested_difficulty: str = "medium"


# --------------------------------------------------------------------------- #
# Quiz
# --------------------------------------------------------------------------- #


class QuizGenerateRequest(BaseModel):
    """Body for ``POST /api/quiz/generate``."""

    topic: str
    difficulty: str = "medium"
    count: int = 5
    user_id: Optional[str] = None


class QuizOption(BaseModel):
    """A single MCQ option."""

    key: str
    text: str


class QuizQuestion(BaseModel):
    """A quiz question. ``correct_answer`` is omitted in generate responses."""

    id: str
    stem: str
    options: List[QuizOption] = Field(default_factory=list)
    explanation: Optional[str] = None
    correct_answer: Optional[str] = None


class QuizGenerateResponse(BaseModel):
    """Response for ``POST /api/quiz/generate``."""

    quiz_id: str
    id: str
    topic: str
    difficulty: str
    questions: List[QuizQuestion] = Field(default_factory=list)


class QuizSubmitRequest(BaseModel):
    """Body for ``POST /api/quiz/submit``.

    Accepts both ``quiz_id`` (spec) and ``quizId`` (frontend).
    """

    quiz_id: Optional[str] = None
    quizId: Optional[str] = None
    user_id: str = Field(min_length=1, max_length=128)
    answers: Dict[str, str] = Field(default_factory=dict)

    def resolved_quiz_id(self) -> str:
        """Return whichever quiz id variant was supplied."""
        return (self.quiz_id or self.quizId or "").strip()


class QuizAnswerDetail(BaseModel):
    """Per-question grading detail."""

    questionId: str
    selected: str
    correct: bool
    correctAnswer: str
    explanation: Optional[str] = None


class QuizSubmitResponse(BaseModel):
    """Response for ``POST /api/quiz/submit``.

    Carries both spec fields (``correct``, ``details``) and frontend fields
    (``correctCount``, ``results``) for compatibility.
    """

    quizId: str
    score: float
    total: int
    correct: int
    correctCount: int
    details: List[QuizAnswerDetail] = Field(default_factory=list)
    results: List[QuizAnswerDetail] = Field(default_factory=list)


class QuizAttemptSync(BaseModel):
    """A single quiz attempt synced from the frontend IndexedDB store."""

    topic: str
    difficulty: str  # "foundation" | "intermediate" | "advanced"
    is_correct: bool
    score: float  # 0-100
    timestamp: str  # ISO 8601


class QuizSyncRequest(BaseModel):
    """Body for ``POST /api/quiz/sync``.

    Carries a batch of quiz attempts accumulated offline in the frontend
    IndexedDB store, to be replayed into the adaptive learning engine.
    """

    user_id: str
    attempts: List[QuizAttemptSync] = Field(default_factory=list)


class QuizSyncResponse(BaseModel):
    """Response for ``POST /api/quiz/sync``."""

    synced_count: int
    mastery_levels: Dict[str, float] = Field(default_factory=dict)  # topic -> mastery (0-1)
    next_reviews: Dict[str, str] = Field(default_factory=dict)  # topic -> ISO datetime


# --------------------------------------------------------------------------- #
# Health & Admin
# --------------------------------------------------------------------------- #


class HealthResponse(BaseModel):
    """Response for ``GET /api/health``."""

    status: str
    version: str
    modules: Dict[str, bool] = Field(default_factory=dict)


class StatsResponse(BaseModel):
    """Response for ``GET /api/stats``."""

    total_sessions: int = 0
    total_documents: int = 0
    total_feedback: int = 0
