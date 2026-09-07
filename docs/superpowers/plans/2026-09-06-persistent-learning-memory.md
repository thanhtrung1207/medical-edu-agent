# Persistent Learning Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve explicit, topic-scoped dental learning facts across backend restarts and conversations on the same browser while allowing users to inspect and delete their stored memory.

**Architecture:** The browser owns a UUID stored in `localStorage` and sends it with every backend chat and memory request. SQLite stores compact, topic-tagged learning facts; the context builder injects only facts whose topic exactly matches the current question. The FastAPI API enforces session ownership for the device ID and exposes user-scoped memory management endpoints.

**Tech Stack:** Python 3, FastAPI, Pydantic, SQLite, pytest, Next.js 14, React 18, TypeScript, Vitest, jsdom, Tailwind CSS.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `memory/learning_memory.py` | Extract explicit, topic-scoped learning facts and normalize quiz topics. |
| `memory/memory_store.py` | SQLite index plus user-scoped memory list and delete operations. |
| `memory/context_builder.py` | Strict current-topic retrieval and bounded prompt context. |
| `api/memories.py` | FastAPI list, delete-one, and delete-all memory endpoints. |
| `api/models.py` | Required chat identity and memory API response models. |
| `api/chat.py` | Session ownership checks, current-message topic detection, and best-effort fact persistence. |
| `api/quiz.py` | Store a verified weak-area fact after an incorrect dental quiz submission. |
| `main.py` | Register the memory router. |
| `frontend/src/lib/client-identity.ts` | Browser identity and active-session storage helpers. |
| `frontend/src/lib/api.ts` | Backend-only chat, owner-scoped history, quiz submission, and memory-management client calls. |
| `frontend/src/components/chat/ChatInterface.tsx` | Use persistent browser identity and create a fresh conversation without clearing memory. |
| `frontend/src/components/chat/ChatInterface.test.tsx` | Verify session restoration and reset preserve the browser identity. |
| `frontend/src/components/case/CaseChatPanel.tsx` | Stop forwarding a scenario that only the removed direct-chat path used. |
| `frontend/src/app/case/[scenario]/page.tsx` | Stop passing the direct-chat scenario prop into the case chat panel. |
| `frontend/src/app/quiz/page.tsx` | Send the browser identity when submitting an answered quiz. |
| `frontend/src/components/case/SettingsModal.tsx` | List and delete the current browser's learning memories. |
| `frontend/src/components/layout/Header.tsx` | Open memory settings without API-key status. |
| `frontend/src/lib/api-keys.ts` | Delete: browser API keys no longer control chat routing. |
| `frontend/src/lib/ai-client.ts` | Delete: direct browser-to-model chat is removed. |
| `frontend/src/lib/system-prompt.ts` | Delete: it is only used by the removed direct-chat route. |
| `frontend/vitest.config.ts` | Vitest configuration with jsdom and the `@` alias. |
| `frontend/src/lib/client-identity.test.ts` | Browser identity and request-body tests. |
| `tests/test_memory.py` | SQLite, extraction, context-relevance, and restart-persistence tests. |
| `tests/test_api.py` | Chat ownership, memory endpoint, weak-area, and best-effort failure tests. |

### Task 1: Add topic-scoped memory primitives

**Files:**
- Create: `memory/learning_memory.py`
- Modify: `memory/__init__.py`
- Modify: `memory/memory_store.py:110-133, 218-345`
- Test: `tests/test_memory.py`

- [ ] **Step 1: Write failing extraction and store-ownership tests**

```python
from memory.learning_memory import extract_explicit_learning_facts, normalize_topic


def test_extracts_only_explicit_topic_scoped_goal():
    facts = extract_explicit_learning_facts(
        "Tôi muốn học implant để chuẩn bị thi.", "Implant"
    )

    assert len(facts) == 1
    assert facts[0].memory_type == "learning_goal"
    assert facts[0].key == "goal:Implant"
    assert facts[0].value == {
        "topic": "Implant",
        "summary": "Mục tiêu học Implant",
    }


def test_does_not_extract_fact_without_dental_topic():
    assert extract_explicit_learning_facts("Tôi muốn học kỹ hơn.", "") == []


def test_ignores_bookmark_without_dental_topic(memory_store):
    memory_store.bookmark_response("u1", "message-1", "Cardiology")
    assert memory_store.list_for_user("u1") == []


def test_store_upserts_an_explicit_learning_fact(memory_store):
    first = memory_store.store(
        "u1", "learning_goal", "goal:Implant", {"topic": "Implant", "summary": "A"}
    )
    updated = memory_store.store(
        "u1", "learning_goal", "goal:Implant", {"topic": "Implant", "summary": "B"}
    )

    entries = memory_store.list_for_user("u1")
    assert updated.id == first.id
    assert len(entries) == 1
    assert entries[0].parsed_value()["summary"] == "B"


def test_list_and_delete_are_scoped_to_owner(memory_store):
    older = memory_store.store(
        "u1", "weak_area", "Implant", {"topic": "Implant"}, confidence=1.0
    )
    owned = memory_store.store(
        "u1", "weak_area", "Nha chu", {"topic": "Nha chu"}, confidence=0.0
    )
    memory_store.store("u2", "weak_area", "Implant", {"topic": "Implant"})

    entries = memory_store.list_for_user("u1")
    assert [entry.id for entry in entries] == [owned.id, older.id]
    assert [entry.access_count for entry in entries] == [0, 0]
    assert memory_store.forget_for_user(owned.id, "u2") is False
    assert memory_store.forget_for_user(owned.id, "u1") is True
    assert memory_store.delete_all_for_user("u2") == 1
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pytest tests/test_memory.py -k "extracts_only_explicit_topic_scoped_goal or does_not_extract_fact_without_dental_topic or ignores_bookmark_without_dental_topic or store_upserts_an_explicit_learning_fact or list_and_delete_are_scoped_to_owner" -q`

Expected: FAIL during collection because `memory.learning_memory`, `list_for_user`, `forget_for_user`, and `delete_all_for_user` do not exist.

- [ ] **Step 3: Add the learning-fact module**

Create `memory/learning_memory.py` with the complete public contract below. Keep extraction intentionally conservative: it records only an explicit learning-goal sentence or an explicit explanation-style request, and never stores a message without a recognized topic.

```python
from __future__ import annotations

from dataclasses import dataclass

TOPICS = frozenset(
    {
        "Răng vỡ",
        "Mất răng",
        "Phục hình",
        "Implant",
        "Nha chu",
        "Nội nha",
        "Chỉnh nha",
        "Phẫu thuật",
    }
)


@dataclass(frozen=True)
class LearningFact:
    memory_type: str
    key: str
    value: dict[str, str]
    confidence: float


def normalize_topic(topic: str) -> str:
    normalized = topic.strip()
    return normalized if normalized in TOPICS else ""


def extract_explicit_learning_facts(message: str, topic: str) -> list[LearningFact]:
    normalized_topic = normalize_topic(topic)
    normalized_message = message.strip()
    if not normalized_topic or not normalized_message:
        return []

    lower = normalized_message.lower()
    if lower.startswith(("tôi muốn học", "mục tiêu của tôi", "tôi đang ôn")):
        return [
            LearningFact(
                memory_type="learning_goal",
                key=f"goal:{normalized_topic}",
                value={
                    "topic": normalized_topic,
                    "summary": f"Mục tiêu học {normalized_topic}",
                },
                confidence=1.0,
            )
        ]

    for style in ("ngắn gọn", "chi tiết", "từng bước"):
        if lower.startswith("hãy giải thích") and style in lower:
            return [
                LearningFact(
                    memory_type="preference",
                    key=f"preference:{normalized_topic}:explanation_style",
                    value={
                        "topic": normalized_topic,
                        "name": "explanation_style",
                        "summary": style,
                    },
                    confidence=1.0,
                )
            ]

    return []
```

Export `LearningFact`, `extract_explicit_learning_facts`, and `normalize_topic` from `memory/__init__.py`.

- [ ] **Step 4: Add non-mutating list and owner-scoped deletion methods**

In `MemoryStore._init_db`, create the approved index after the existing index:

```python
conn.execute(
    "CREATE INDEX IF NOT EXISTS idx_memories_user_updated "
    "ON memories (user_id, updated_at DESC)"
)
```

Add these methods to `MemoryStore`. They must not call `recall`, because opening settings must not increase `access_count`.

```python
def list_for_user(self, user_id: str) -> list[MemoryEntry]:
    with self._connect() as conn:
        rows = conn.execute(
            "SELECT * FROM memories WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
    return [self._row_to_entry(row) for row in rows]


def forget_for_user(self, memory_id: int, user_id: str) -> bool:
    with self._connect() as conn:
        cursor = conn.execute(
            "DELETE FROM memories WHERE id = ? AND user_id = ?",
            (memory_id, user_id),
        )
        conn.commit()
    return cursor.rowcount == 1


def delete_all_for_user(self, user_id: str) -> int:
    with self._connect() as conn:
        cursor = conn.execute("DELETE FROM memories WHERE user_id = ?", (user_id,))
        conn.commit()
    return cursor.rowcount
```

Import `normalize_topic` from `memory.learning_memory`, then replace the existing bookmark writer with this transcript-free contract:

```python
def bookmark_response(self, user_id: str, message_id: str, topic: str) -> None:
    normalized_topic = normalize_topic(topic)
    if not normalized_topic:
        return
    self.store(
        user_id,
        "bookmark",
        message_id,
        {
            "message_id": message_id,
            "topic": normalized_topic,
            "summary": f"Đã đánh dấu: {normalized_topic}",
        },
        confidence=1.0,
    )
```

Update the existing bookmark test to call the three-argument method and assert the stored `summary` does not contain response text.

- [ ] **Step 5: Run focused tests and verify success**

Run: `pytest tests/test_memory.py -k "extracts_only_explicit_topic_scoped_goal or does_not_extract_fact_without_dental_topic or ignores_bookmark_without_dental_topic or store_upserts_an_explicit_learning_fact or list_and_delete_are_scoped_to_owner" -q`

Expected: PASS. The obsolete cardiology context fixture is updated in Task 2.

- [ ] **Step 6: Commit the storage foundation**

```bash
git add memory/__init__.py memory/learning_memory.py memory/memory_store.py tests/test_memory.py
git commit -m "feat: add topic-scoped learning memory storage"
```

### Task 2: Restrict context to the current dental topic

**Files:**
- Modify: `memory/context_builder.py:67-167, 237-286`
- Test: `tests/test_memory.py`

- [ ] **Step 1: Write failing current-topic context tests**

```python
def test_new_session_uses_only_exact_current_topic_memory(session_manager, memory_store):
    builder = ContextBuilder(session_manager, memory_store)
    previous = session_manager.create_session("u1")
    session_manager.add_message(previous.id, "user", "Tôi muốn học implant")
    session = session_manager.create_session("u1")
    memory_store.store(
        "u1", "learning_goal", "goal:Implant",
        {"topic": "Implant", "summary": "Ôn implant"},
    )
    memory_store.store(
        "u1", "weak_area", "Nha chu",
        {"topic": "Nha chu", "summary": "Cần ôn nha chu"},
    )

    context = builder.build_context("u1", session.id, current_topic="Implant")

    assert context["conversation_history"] == []
    assert [entry.key for entry in context["relevant_memories"]] == ["goal:Implant"]
    assert context["user_preferences"] == {}
    assert context["user_profile_summary"] == ""


def test_build_context_omits_long_term_memory_without_topic(session_manager, memory_store):
    builder = ContextBuilder(session_manager, memory_store)
    session = session_manager.create_session("u1")
    memory_store.store(
        "u1", "learning_goal", "goal:Implant",
        {"topic": "Implant", "summary": "Ôn implant"},
    )

    context = builder.build_context("u1", session.id, current_topic="")

    assert context["relevant_memories"] == []


def test_build_context_retains_earlier_turns_in_the_active_session(session_manager, memory_store):
    builder = ContextBuilder(session_manager, memory_store)
    session = session_manager.create_session("u1")
    session_manager.add_message(session.id, "user", "Câu hỏi implant đầu tiên")
    session_manager.add_message(session.id, "assistant", "Câu trả lời đầu tiên")
    session_manager.add_message(session.id, "user", "Hãy giải thích tiếp")

    context = builder.build_context("u1", session.id, current_topic="Implant")

    assert [item["content"] for item in context["conversation_history"]] == [
        "Câu hỏi implant đầu tiên",
        "Câu trả lời đầu tiên",
        "Hãy giải thích tiếp",
    ]


def test_prompt_limits_only_long_term_memory(session_manager, memory_store):
    builder = ContextBuilder(session_manager, memory_store)
    session = session_manager.create_session("u1")
    memory_store.store(
        "u1", "learning_goal", "goal:Implant",
        {"topic": "Implant", "summary": "x" * 2_000},
    )

    prompt = builder.build_prompt_context("u1", session.id, current_topic="Implant")
    long_term_block = prompt.split("[Lịch sử gần đây]", 1)[0]
    assert len(long_term_block) <= 1_500


def test_build_context_ignores_memory_store_failure(session_manager, memory_store, monkeypatch):
    builder = ContextBuilder(session_manager, memory_store)
    session = session_manager.create_session("u1")
    session_manager.add_message(session.id, "user", "Implant là gì?")
    monkeypatch.setattr(
        memory_store,
        "recall_all",
        lambda user_id: (_ for _ in ()).throw(RuntimeError("unavailable")),
    )

    context = builder.build_context("u1", session.id, current_topic="Implant")

    assert [item["content"] for item in context["conversation_history"]] == ["Implant là gì?"]
    assert context["relevant_memories"] == []
```

- [ ] **Step 2: Run the context tests and verify failure**

Run: `pytest tests/test_memory.py -k "new_session_uses_only_exact_current_topic_memory or build_context_omits_long_term_memory_without_topic or retains_earlier_turns_in_the_active_session or prompt_limits_only_long_term_memory or build_context_ignores_memory_store_failure" -q`

Expected: FAIL because the current builder ranks every memory, falls back to session-derived topics, injects a generic profile, and does not isolate memory-store failures.

- [ ] **Step 3: Implement exact-topic selection and remove generic profile injection**

Replace `_select_relevant_memories` with this implementation. It accepts only object payloads whose `topic` exactly matches the supplied current topic, orders by existing store order, and caps the result at five entries.

```python
def _select_relevant_memories(
    self, all_memories: dict, current_topic: str | None
) -> list[MemoryEntry]:
    if not current_topic:
        return []

    matching: list[MemoryEntry] = []
    for entries in all_memories.values():
        for entry in entries:
            value = entry.parsed_value()
            if isinstance(value, dict) and value.get("topic") == current_topic:
                matching.append(entry)
    matching.sort(key=lambda entry: (entry.confidence, entry.updated_at), reverse=True)
    return matching[:5]
```

Add `_MAX_LONG_TERM_MEMORY_CHARS = 1500`. `build_context` must use the topic supplied by the caller without deriving one from session history, and a memory-store error must preserve conversation history while returning no long-term memory. `build_prompt_context` must call `build_context`, not read the store a second time, and must omit the long-term block when no exact-topic entries exist.

```python
def build_context(self, user_id: str, session_id: str, current_topic: str = None) -> dict:
    history = self.session_manager.get_session_history(
        session_id, limit=_RECENT_HISTORY_LIMIT
    )
    try:
        all_memories = self.memory_store.recall_all(user_id)
    except Exception as exc:
        logger.warning("Memory recall skipped: %s", type(exc).__name__)
        all_memories = {}
    return {
        "conversation_history": history,
        "user_preferences": {},
        "relevant_memories": self._select_relevant_memories(
            all_memories, current_topic
        ),
        "user_profile_summary": "",
    }


def _format_relevant_memories(self, memories: list[MemoryEntry]) -> str:
    lines = [
        f"- {entry.memory_type}: {json.dumps(entry.parsed_value(), ensure_ascii=False)}"
        for entry in memories
    ]
    return self._enforce_size_budget(
        "\n".join(lines),
        max_chars=_MAX_LONG_TERM_MEMORY_CHARS - len("[Dữ liệu học tập]\n"),
    )


def build_prompt_context(self, user_id: str, session_id: str, current_topic: str = None) -> str:
    structured = self.build_context(user_id, session_id, current_topic)
    blocks: list[str] = []
    learning_memory = self._format_relevant_memories(structured["relevant_memories"])
    if learning_memory:
        blocks.append("[Dữ liệu học tập]\n" + learning_memory)
    history_lines = self._format_recent_history(
        structured["conversation_history"], session_id, current_topic
    )
    if history_lines:
        blocks.append("[Lịch sử gần đây]\n" + "\n".join(history_lines))
    return "\n\n".join(blocks).strip()


@staticmethod
def _enforce_size_budget(context: str, max_chars: int = _MAX_CONTEXT_CHARS) -> str:
    if len(context) <= max_chars:
        return context
    return context[:max_chars].rsplit("\n", 1)[0].rstrip()
```

Import `json`. Remove the old fallback topic detection, `get_user_preferences` call, `_build_profile_summary` call, and `_format_user_info` call from these two paths.

- [ ] **Step 4: Update obsolete topic tests and run the memory suite**

Replace the cardiology fixtures in `tests/test_memory.py` with the current dental taxonomy. For example:

```python
topic = builder.detect_topic_from_messages(
    [{"role": "user", "content": "Kế hoạch điều trị implant đơn lẻ là gì?"}]
)
assert topic == "Implant"
```

Run: `pytest tests/test_memory.py -q`

Expected: PASS.

- [ ] **Step 5: Commit strict context behavior**

```bash
git add memory/context_builder.py tests/test_memory.py
git commit -m "feat: retrieve memory only for the current topic"
```

### Task 3: Add memory endpoints and enforce session ownership

**Files:**
- Create: `api/memories.py`
- Modify: `api/models.py:20-27, 195-208`
- Modify: `api/chat.py:64-102, 235-241`
- Modify: `main.py:26-80`
- Test: `tests/test_api.py`

- [ ] **Step 1: Write failing API tests**

```python
def test_chat_rejects_session_owned_by_another_user(test_client, monkeypatch):
    _patch_workflow(monkeypatch)
    first = test_client.post(
        "/api/chat", json={"message": "Implant là gì?", "user_id": "u1"}
    )
    session_id = first.json()["session_id"]

    response = test_client.post(
        "/api/chat",
        json={"message": "Tiếp tục", "user_id": "u2", "session_id": session_id},
    )

    assert response.status_code == 404


def test_chat_requires_user_id(test_client):
    response = test_client.post("/api/chat", json={"message": "Implant là gì?"})
    assert response.status_code == 422


def test_memory_endpoints_are_scoped_to_user(test_client):
    from api.deps import services

    entry = services.memory_store.store(
        "u1", "weak_area", "Implant", {"topic": "Implant", "summary": "Ôn implant"}
    )
    other_entry = services.memory_store.store(
        "u2", "weak_area", "Implant", {"topic": "Implant", "summary": "Ôn implant"}
    )
    listed = test_client.get("/api/memories", params={"user_id": "u1"})
    other_list = test_client.get("/api/memories", params={"user_id": "u2"})
    other = test_client.delete(f"/api/memories/{entry.id}", params={"user_id": "u2"})
    deleted = test_client.delete(f"/api/memories/{entry.id}", params={"user_id": "u1"})
    services.memory_store.store(
        "u1", "learning_goal", "goal:Implant", {"topic": "Implant", "summary": "Ôn thi"}
    )
    reset = test_client.delete("/api/memories", params={"user_id": "u1"})

    assert [memory["id"] for memory in listed.json()["memories"]] == [entry.id]
    assert [memory["id"] for memory in other_list.json()["memories"]] == [other_entry.id]
    assert other.status_code == 404
    assert deleted.json() == {"deleted": 1}
    assert reset.json() == {"deleted": 1}
    assert [entry.id for entry in services.memory_store.list_for_user("u2")] == [other_entry.id]
```

- [ ] **Step 2: Run API tests and verify failure**

Run: `pytest tests/test_api.py -q`

Expected: FAIL because identities default to `anonymous`, sessions are accepted across users, and `/api/memories` is not registered.

- [ ] **Step 3: Define explicit request and response models**

In `api/models.py`, replace the default user ID with a required constrained field and add the memory response models:

```python
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    user_id: str = Field(min_length=1, max_length=128)
    stream: bool = False


class QuizSubmitRequest(BaseModel):
    quiz_id: Optional[str] = None
    quizId: Optional[str] = None
    user_id: str = Field(min_length=1, max_length=128)
    answers: Dict[str, str] = Field(default_factory=dict)

    def resolved_quiz_id(self) -> str:
        return (self.quiz_id or self.quizId or "").strip()


class MemoryResponse(BaseModel):
    id: int
    memory_type: str
    key: str
    value: Any
    confidence: float
    created_at: str
    updated_at: str


class MemoryListResponse(BaseModel):
    memories: List[MemoryResponse] = Field(default_factory=list)


class MemoryDeleteResponse(BaseModel):
    deleted: int
```

- [ ] **Step 4: Implement the memory router**

Create `api/memories.py` using `get_services` and the new store methods. The route must return `404` for a non-owned memory ID and must never call `forget` directly.

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from .deps import Services, get_services
from .models import MemoryDeleteResponse, MemoryListResponse, MemoryResponse

router = APIRouter(prefix="/api", tags=["memories"])


def _entry_response(entry) -> MemoryResponse:
    return MemoryResponse(
        id=entry.id,
        memory_type=entry.memory_type,
        key=entry.key,
        value=entry.parsed_value(),
        confidence=entry.confidence,
        created_at=entry.created_at.isoformat(),
        updated_at=entry.updated_at.isoformat(),
    )


@router.get("/memories", response_model=MemoryListResponse)
def list_memories(
    user_id: str = Query(min_length=1, max_length=128),
    svc: Services = Depends(get_services),
) -> MemoryListResponse:
    return MemoryListResponse(
        memories=[_entry_response(entry) for entry in svc.memory_store.list_for_user(user_id)]
    )


@router.delete("/memories/{memory_id}", response_model=MemoryDeleteResponse)
def delete_memory(
    memory_id: int,
    user_id: str = Query(min_length=1, max_length=128),
    svc: Services = Depends(get_services),
) -> MemoryDeleteResponse:
    if not svc.memory_store.forget_for_user(memory_id, user_id):
        raise HTTPException(status_code=404, detail="Memory not found")
    return MemoryDeleteResponse(deleted=1)


@router.delete("/memories", response_model=MemoryDeleteResponse)
def delete_all_memories(
    user_id: str = Query(min_length=1, max_length=128),
    svc: Services = Depends(get_services),
) -> MemoryDeleteResponse:
    return MemoryDeleteResponse(deleted=svc.memory_store.delete_all_for_user(user_id))
```

Import `memories` beside the existing API modules in `main.py` and add `app.include_router(memories.router)`.

- [ ] **Step 5: Enforce session ownership and persist explicit facts after a successful turn**

In `_run_chat`, replace the session-resolution block with:

```python
if request.session_id:
    session = svc.session_manager.get_session(request.session_id)
    if session is None or session.user_id != request.user_id:
        raise HTTPException(status_code=404, detail="Session not found")
else:
    session = svc.session_manager.create_session(user_id=request.user_id)
session_id = session.id
current_topic = svc.context_builder.detect_topic_from_messages(
    [{"role": "user", "content": request.message}]
)
```

Pass `current_topic=current_topic` to `build_context`; replace the existing context error log with `logger.warning("Context build failed: %s", type(exc).__name__)`. After persisting the assistant answer, add this best-effort write. It runs only on the non-blocked path because pre-check exits return before this block:

```python
try:
    for fact in extract_explicit_learning_facts(request.message, current_topic):
        svc.memory_store.store(
            request.user_id,
            fact.memory_type,
            fact.key,
            fact.value,
            confidence=fact.confidence,
        )
except Exception as exc:
    logger.warning("Learning-memory write skipped: %s", type(exc).__name__)
```

Import `Query` from FastAPI and `extract_explicit_learning_facts` from `memory.learning_memory`. Use `rate_limiter.check(f"chat:{request.user_id}")`; do not retain the `anonymous` fallback. Replace history with this owner-scoped contract:

```python
@router.get("/chat/history/{session_id}", response_model=ChatHistoryResponse)
def chat_history(
    session_id: str,
    user_id: str = Query(min_length=1, max_length=128),
    svc: Services = Depends(get_services),
):
    session = svc.session_manager.get_session(session_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")
    return ChatHistoryResponse(messages=session.messages, topic=session.topic)
```

- [ ] **Step 6: Run API tests and verify success**

Run: `pytest tests/test_api.py -q`

Expected: PASS when `google.adk` is installed; otherwise pytest reports the module-level skip already declared by the suite.

- [ ] **Step 7: Commit API and ownership changes**

```bash
git add api/memories.py api/models.py api/chat.py main.py tests/test_api.py
git commit -m "feat: add scoped memory API and session ownership"
```

### Task 4: Record verified weak areas from quiz submissions

**Files:**
- Modify: `api/quiz.py:176-232`
- Test: `tests/test_api.py`

- [ ] **Step 1: Write a failing weak-area test**

```python
def test_incorrect_dental_quiz_stores_weak_area(test_client):
    from api.deps import services

    services.quiz_store["quiz-implant"] = {
        "topic": "Implant",
        "difficulty": "easy",
        "questions": [{"id": "q1", "correct_answer": "B", "explanation": ""}],
    }

    response = test_client.post(
        "/api/quiz/submit",
        json={"quiz_id": "quiz-implant", "user_id": "u1", "answers": {"q1": "A"}},
    )

    assert response.status_code == 200
    entries = services.memory_store.list_for_user("u1")
    assert entries[0].memory_type == "weak_area"
    assert entries[0].parsed_value()["topic"] == "Implant"
    assert entries[0].parsed_value()["incorrect_count"] == 1


def test_incorrect_non_dental_quiz_does_not_store_memory(test_client):
    from api.deps import services

    services.quiz_store["quiz-other"] = {
        "topic": "Cardiology",
        "difficulty": "easy",
        "questions": [{"id": "q1", "correct_answer": "B", "explanation": ""}],
    }

    response = test_client.post(
        "/api/quiz/submit",
        json={"quiz_id": "quiz-other", "user_id": "u1", "answers": {"q1": "A"}},
    )

    assert response.status_code == 200
    assert services.memory_store.list_for_user("u1") == []
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pytest tests/test_api.py -k "incorrect_dental_quiz_stores_weak_area or incorrect_non_dental_quiz_does_not_store_memory" -q`

Expected: FAIL because quiz submission does not write to `MemoryStore`.

- [ ] **Step 3: Persist only a normalized dental weak area**

Import `normalize_topic` in `api/quiz.py`. Immediately after calculating `score`, add this best-effort write; it records only normalized dental topics and logs only the failure category:

```python
try:
    memory_topic = normalize_topic(topic)
    incorrect_count = total - correct_count
    if memory_topic and incorrect_count:
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
except Exception as exc:
    logger.debug("Weak-area write skipped: %s", type(exc).__name__)
```

Replace every existing `/api/quiz/submit` test payload that lacks `user_id` with `"user_id": "u1"` before running the suite.

- [ ] **Step 4: Run quiz tests and verify success**

Run: `pytest tests/test_api.py::TestQuizEndpoints -q`

Expected: PASS when `google.adk` is installed; otherwise the suite skips consistently.

- [ ] **Step 5: Commit verified weak-area persistence**

```bash
git add api/quiz.py tests/test_api.py
git commit -m "feat: record weak areas from incorrect dental quizzes"
```

### Task 5: Make browser identity and backend requests testable

**Files:**
- Create: `frontend/src/lib/client-identity.ts`
- Create: `frontend/src/lib/client-identity.test.ts`
- Create: `frontend/vitest.config.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/src/lib/config.ts:30-32`
- Modify: `frontend/src/lib/api.ts:1-359`

- [ ] **Step 1: Add failing browser-identity and request tests**

Create `frontend/src/lib/client-identity.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearActiveSessionId,
  getActiveSessionId,
  getOrCreateUserId,
  setActiveSessionId,
} from "./client-identity";
import type { Quiz } from "./types";
import { sendMessage, submitQuizAnswer } from "./api";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("crypto", { randomUUID: () => "user-uuid" });
});

describe("client identity", () => {
  it("persists one browser identity", () => {
    expect(getOrCreateUserId()).toBe("user-uuid");
    expect(getOrCreateUserId()).toBe("user-uuid");
  });

  it("restores an active session after refresh", () => {
    setActiveSessionId("session-1");
    expect(getActiveSessionId()).toBe("session-1");
  });

  it("clears only the active session", () => {
    getOrCreateUserId();
    setActiveSessionId("session-1");
    clearActiveSessionId();

    expect(localStorage.getItem("chatSessionId")).toBeNull();
    expect(localStorage.getItem("medical-edu-agent.user-id")).toBe("user-uuid");
  });

  it("sends the identity and active session to the backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: "Đã nhận" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendMessage("Implant là gì?", "user-uuid", "session-1");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Implant là gì?",
        user_id: "user-uuid",
        session_id: "session-1",
      }),
    });
  });

  it("sends the identity with a quiz submission", async () => {
    const quiz: Quiz = { id: "quiz-1", topic: "Implant", difficulty: "easy", questions: [] };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ quizId: "quiz-1", score: 100, total: 0, correct: 0, correctCount: 0, details: [], results: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await submitQuizAnswer(quiz, {}, "user-uuid");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/quiz/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId: "quiz-1", answers: {}, user_id: "user-uuid" }),
    });
  });
});
```

- [ ] **Step 2: Configure and run the failing frontend test**

Add the `test` script and dev dependencies:

```json
"test": "vitest run"
```

```bash
npm install --save-dev vitest jsdom @testing-library/react
npm test
```

Expected: FAIL because `client-identity.ts` and `vitest.config.ts` do not exist.

- [ ] **Step 3: Implement identity helpers and Vitest configuration**

Create `frontend/src/lib/client-identity.ts`:

```typescript
const USER_ID_KEY = "medical-edu-agent.user-id";
const SESSION_ID_KEY = "chatSessionId";

export function getOrCreateUserId(): string {
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;

  const userId = crypto.randomUUID();
  localStorage.setItem(USER_ID_KEY, userId);
  return userId;
}

export function getActiveSessionId(): string | null {
  return localStorage.getItem(SESSION_ID_KEY);
}

export function setActiveSessionId(sessionId: string): void {
  localStorage.setItem(SESSION_ID_KEY, sessionId);
}

export function clearActiveSessionId(): void {
  localStorage.removeItem(SESSION_ID_KEY);
}
```

Create `frontend/vitest.config.ts`:

```typescript
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": resolve(rootDir, "./src") } },
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"] },
});
```

Change `USE_MOCK_API` in `frontend/src/lib/config.ts` to opt in only:

```typescript
export const USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API === "true";
```

- [ ] **Step 4: Route API calls through the backend only**

Remove the imports from `api-keys`, `ai-client`, and `system-prompt` in `frontend/src/lib/api.ts`. Replace the chat and history functions with these contracts:

```typescript
export async function sendMessage(
  message: string,
  userId: string,
  sessionId?: string,
): Promise<AssistantReply> {
  if (USE_MOCK_API) return buildMockReply(message);

  const res = await fetch(`${config.apiBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      user_id: userId,
      ...(sessionId ? { session_id: sessionId } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`);
  return (await res.json()) as AssistantReply;
}

export async function getChatHistory(
  sessionId: string,
  userId: string,
): Promise<ChatHistoryResponse> {
  if (USE_MOCK_API) return { messages: [], topic: null };

  const query = new URLSearchParams({ user_id: userId });
  const res = await fetch(
    `${config.apiBaseUrl}/api/chat/history/${sessionId}?${query.toString()}`,
  );
  if (!res.ok) throw new Error(`Chat history request failed: ${res.status}`);
  return (await res.json()) as ChatHistoryResponse;
}

export async function submitQuizAnswer(
  quiz: Quiz,
  answers: Record<string, string>,
  userId: string,
): Promise<QuizResult> {
  if (USE_MOCK_API) return gradeQuizLocally(quiz, answers);

  const res = await fetch(`${config.apiBaseUrl}/api/quiz/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quizId: quiz.id, answers, user_id: userId }),
  });
  if (!res.ok) throw new Error(`Quiz submit failed: ${res.status}`);
  return (await res.json()) as QuizResult;
}
```

Keep the existing explicit mock branch for local UI work only. Do not fall back to mock responses after a real backend request fails; let `ChatInterface` display its existing connection error.

- [ ] **Step 5: Run frontend tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit browser identity and API routing**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/lib/client-identity.ts frontend/src/lib/client-identity.test.ts frontend/src/lib/config.ts frontend/src/lib/api.ts
git commit -m "feat: send persistent browser identity to backend chat"
```

### Task 6: Provide conversation reset and memory management UI

**Files:**
- Modify: `frontend/src/components/chat/ChatInterface.tsx:1-413`
- Create: `frontend/src/components/chat/ChatInterface.test.tsx`
- Modify: `frontend/src/components/case/CaseChatPanel.tsx:1-32`
- Modify: `frontend/src/app/case/[scenario]/page.tsx:13-131`
- Modify: `frontend/src/app/quiz/page.tsx:31-244`
- Modify: `frontend/src/components/case/SettingsModal.tsx:1-281`
- Modify: `frontend/src/components/layout/Header.tsx:1-89`
- Modify: `frontend/src/lib/api.ts`
- Delete: `frontend/src/lib/api-keys.ts`
- Delete: `frontend/src/lib/ai-client.ts`
- Delete: `frontend/src/lib/system-prompt.ts`

- [ ] **Step 1: Add failing memory-client request tests**

Extend `frontend/src/lib/client-identity.test.ts` with this test. It verifies the complete URL and HTTP verb for every management operation.

```typescript
import { deleteAllMemories, deleteMemory, listMemories } from "./api";

it("scopes every memory request to the browser user", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ memories: [] }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ deleted: 1 }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ deleted: 2 }), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetchMock);

  await listMemories("user-uuid");
  await deleteMemory(7, "user-uuid");
  await deleteAllMemories("user-uuid");

  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "http://localhost:8000/api/memories?user_id=user-uuid",
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "http://localhost:8000/api/memories/7?user_id=user-uuid",
    { method: "DELETE" },
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    3,
    "http://localhost:8000/api/memories?user_id=user-uuid",
    { method: "DELETE" },
  );
});
```

- [ ] **Step 2: Run the frontend test and verify failure**

Run: `npm test`

Expected: FAIL because the memory client functions are not exported.

- [ ] **Step 3: Implement memory API methods without fallback data**

Add this complete contract to `frontend/src/lib/api.ts`. These calls use mock data only when `NEXT_PUBLIC_USE_MOCK_API=true`; otherwise errors propagate to the caller.

```typescript
export interface LearningMemory {
  id: number;
  memory_type: string;
  key: string;
  value: unknown;
  confidence: number;
  created_at: string;
  updated_at: string;
}

export async function listMemories(userId: string): Promise<LearningMemory[]> {
  if (USE_MOCK_API) return [];

  const query = new URLSearchParams({ user_id: userId });
  const res = await fetch(`${config.apiBaseUrl}/api/memories?${query.toString()}`);
  if (!res.ok) throw new Error(`Memory list request failed: ${res.status}`);
  const body = (await res.json()) as { memories: LearningMemory[] };
  return body.memories;
}

export async function deleteMemory(memoryId: number, userId: string): Promise<void> {
  if (USE_MOCK_API) return;

  const query = new URLSearchParams({ user_id: userId });
  const res = await fetch(
    `${config.apiBaseUrl}/api/memories/${memoryId}?${query.toString()}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Memory delete request failed: ${res.status}`);
}

export async function deleteAllMemories(userId: string): Promise<number> {
  if (USE_MOCK_API) return 0;

  const query = new URLSearchParams({ user_id: userId });
  const res = await fetch(`${config.apiBaseUrl}/api/memories?${query.toString()}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Memory reset request failed: ${res.status}`);
  const body = (await res.json()) as { deleted: number };
  return body.deleted;
}
```

- [ ] **Step 4: Wire identity, history ownership, and reset into chat**

In `ChatInterface`, initialize the identity after hydration, then load only that identity's active session:

```tsx
const [userId, setUserId] = useState<string | null>(null);

useEffect(() => {
  setUserId(getOrCreateUserId());
  if (!freshSession) setSessionId(getActiveSessionId());
}, [freshSession]);

const handleNewConversation = () => {
  clearActiveSessionId();
  setSessionId(null);
  setMessages([]);
  historyLoaded.current = false;
};
```

Update history loading to return early when `!sessionId || !userId`, call `getChatHistory(sessionId, userId)`, and call `sendMessage(trimmed, userId, sessionId ?? undefined)` after rejecting a send while `userId` is null. Save server sessions through `setActiveSessionId(reply.session_id)`.

Remove the direct-model history construction, streaming callback, API-key status check, direct-AI error branch, and the `scenario` prop from `ChatInterface`. Remove `scenario` from `CaseChatPanelProps` and its `<ChatInterface>` call, then remove the `scenario={...}` prop from `frontend/src/app/case/[scenario]/page.tsx`. Render the `Bắt đầu cuộc trò chuyện mới` button only when `!freshSession`; its handler is `handleNewConversation` and it must not touch the browser user ID.

In `frontend/src/app/quiz/page.tsx`, initialize the same identity after hydration and block submission until it is available:

```tsx
const [userId, setUserId] = useState<string | null>(null);

useEffect(() => {
  setUserId(getOrCreateUserId());
}, []);

const handleSubmit = async () => {
  if (!quiz || !userId) return;
  setSubmitting(true);
  try {
    const res = await submitQuizAnswer(quiz, answers, userId);
    setResult(res);
    try {
      await saveAttempt({
        quizId: res.quizId,
        topic: quiz.topic,
        difficulty: DIFFICULTY_TO_TRACKING[quiz.difficulty],
        score: res.score,
        totalQuestions: res.total,
        correctCount: res.correctCount,
        timestamp: Date.now(),
      });
      const schedule = await getProgress(quiz.topic);
      setNextReviewDays(schedule?.interval ?? null);
    } catch (err) {
      console.warn("Quiz progress tracking skipped:", err);
    }
  } finally {
    setSubmitting(false);
  }
};
```

Import `getOrCreateUserId` and keep the submit button disabled when `!userId`.

Create `frontend/src/components/chat/ChatInterface.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatInterface } from "./ChatInterface";
import { getChatHistory } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getChatHistory: vi.fn().mockResolvedValue({ messages: [], topic: null }),
  sendMessage: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("medical-edu-agent.user-id", "user-uuid");
  localStorage.setItem("chatSessionId", "session-1");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { value: vi.fn(), writable: true });
});

describe("ChatInterface identity", () => {
  it("restores its owned session and starts a new one without clearing identity", async () => {
    render(<ChatInterface />);

    await waitFor(() => {
      expect(getChatHistory).toHaveBeenCalledWith("session-1", "user-uuid");
    });
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu cuộc trò chuyện mới" }));

    expect(localStorage.getItem("chatSessionId")).toBeNull();
    expect(localStorage.getItem("medical-edu-agent.user-id")).toBe("user-uuid");
  });
});
```

- [ ] **Step 5: Replace API-key settings with memory settings**

Rewrite `SettingsModal` to load its browser identity on open, request the memory list, and update local state only after a successful deletion. Use this helper so legacy non-object values do not break the UI:

```tsx
function memorySummary(value: unknown): string {
  if (typeof value !== "object" || value === null) return "Dữ liệu học tập";
  const summary = (value as Record<string, unknown>).summary;
  return typeof summary === "string" && summary ? summary : "Dữ liệu học tập";
}
```

The modal state and callbacks must follow this contract:

```tsx
const [memories, setMemories] = useState<LearningMemory[]>([]);
const [userId, setUserId] = useState<string | null>(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState("");

useEffect(() => {
  if (!open) return;
  const id = getOrCreateUserId();
  setUserId(id);
  setError("");
  setLoading(true);
  void listMemories(id)
    .then(setMemories)
    .catch(() => setError("Không thể tải dữ liệu học tập."))
    .finally(() => setLoading(false));
}, [open]);

const handleDelete = async (memoryId: number) => {
  if (!userId) return;
  try {
    await deleteMemory(memoryId, userId);
    setMemories((current) => current.filter((memory) => memory.id !== memoryId));
  } catch {
    setError("Không thể xóa dữ liệu học tập.");
  }
};

const handleDeleteAll = async () => {
  if (!userId) return;
  try {
    await deleteAllMemories(userId);
    setMemories([]);
  } catch {
    setError("Không thể xóa dữ liệu học tập.");
  }
};
```

Render `error` as `<p role="alert" className="mb-3 text-sm text-red-600">{error}</p>` when non-empty. Render each entry with `memory.memory_type`, `memory.key`, `memorySummary(memory.value)`, and `new Date(memory.updated_at).toLocaleString("vi-VN")`. Change the title to `Dữ liệu học tập`, remove all API-key inputs and external key links, and render:

```tsx
<p className="mb-5 text-sm text-slate-600">
  Dữ liệu này chỉ giúp cá nhân hóa các câu hỏi cùng chủ đề nha khoa trên trình duyệt này.
  Bạn có thể xóa từng mục hoặc xóa toàn bộ bất cứ lúc nào.
</p>
```

In `Header`, remove API-key imports and `hasKey` state. Keep the settings icon, set its title and accessible label to `Quản lý dữ liệu học tập`, and remove the green/amber status dot.

- [ ] **Step 6: Delete unreachable direct-browser AI code**

Delete `frontend/src/lib/api-keys.ts`, `frontend/src/lib/ai-client.ts`, and `frontend/src/lib/system-prompt.ts`. Remove their imports from all affected files. Verify with:

```bash
rg "api-keys|ai-client|system-prompt|hasAnyApiKey|callAIDirect" frontend/src
```

Expected: no matches.

- [ ] **Step 7: Run frontend tests and production build**

Run: `npm test && npm run build`

Expected: both commands exit 0.

- [ ] **Step 8: Commit the user-facing memory workflow**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/client-identity.test.ts frontend/src/components/chat/ChatInterface.tsx frontend/src/components/chat/ChatInterface.test.tsx frontend/src/components/case/CaseChatPanel.tsx frontend/src/app/case/[scenario]/page.tsx frontend/src/app/quiz/page.tsx frontend/src/components/case/SettingsModal.tsx frontend/src/components/layout/Header.tsx
git rm frontend/src/lib/api-keys.ts frontend/src/lib/ai-client.ts frontend/src/lib/system-prompt.ts
git commit -m "feat: add browser memory controls to chat"
```

### Task 7: Verify the full behavior and document the user boundary

**Files:**
- Modify: `docs/superpowers/specs/2026-09-06-persistent-learning-memory-design.md`
- Test: `tests/test_memory.py`
- Test: `tests/test_api.py`
- Test: `frontend/src/lib/client-identity.test.ts`
- Test: `frontend/src/components/chat/ChatInterface.test.tsx`

- [ ] **Step 1: Add restart-persistence and best-effort failure tests**

```python
def test_memory_and_session_persist_when_stores_are_reopened(tmp_path):
    from memory import MemoryStore, SessionManager

    memory_path = str(tmp_path / "memory.db")
    session_path = str(tmp_path / "sessions.db")
    MemoryStore(memory_path).store(
        "u1", "learning_goal", "goal:Implant",
        {"topic": "Implant", "summary": "Ôn implant"},
    )
    manager = SessionManager(session_path)
    session = manager.create_session("u1")
    manager.add_message(session.id, "user", "Implant là gì?")

    reopened_memory = MemoryStore(memory_path)
    reopened_sessions = SessionManager(session_path)

    assert reopened_memory.list_for_user("u1")[0].parsed_value()["topic"] == "Implant"
    assert reopened_sessions.get_session(session.id).user_id == "u1"
    assert reopened_sessions.get_session_history(session.id)[0]["content"] == "Implant là gì?"


def test_chat_survives_memory_store_failure(test_client, monkeypatch):
    from api.deps import services

    _patch_workflow(monkeypatch)
    monkeypatch.setattr(
        services.memory_store,
        "recall_all",
        lambda user_id: (_ for _ in ()).throw(RuntimeError("unavailable")),
    )

    response = test_client.post(
        "/api/chat", json={"message": "Implant là gì?", "user_id": "u1"}
    )
    assert response.status_code == 200
```

- [ ] **Step 2: Run the complete automated suite**

Run: `pytest -q && (cd frontend && npm test && npm run build)`

Expected: pytest passes or reports only documented optional-dependency skips; Vitest and Next.js build both exit 0.

- [ ] **Step 3: Run the backend and manually verify the golden path**

Run in one terminal: `uvicorn main:app --reload --port 8000`

Run in another terminal: `cd frontend && NEXT_PUBLIC_USE_MOCK_API=false npm run dev`

Verify in the browser:

1. Ask `Tôi muốn học implant để chuẩn bị thi.` and receive a backend response.
2. Start a new conversation, then ask an implant question; the response path uses the same browser identity and a new backend session.
3. Start another conversation and ask a nha chu question; inspect the request/log-free UI behavior to confirm no implant memory is shown or reused.
4. Open `Quản lý dữ liệu học tập`, delete the implant goal, refresh, and verify it no longer appears.
5. Use `Bắt đầu cuộc trò chuyện mới` and confirm the chat clears while the settings list remains unchanged.

- [ ] **Step 4: Commit final verification updates**

```bash
git add tests/test_memory.py tests/test_api.py frontend/src/lib/client-identity.test.ts docs/superpowers/specs/2026-09-06-persistent-learning-memory-design.md
git commit -m "test: verify persistent learning memory behavior"
```
