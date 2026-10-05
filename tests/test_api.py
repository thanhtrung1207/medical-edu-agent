"""API endpoint tests using FastAPI's synchronous ``TestClient``.

These tests exercise the real FastAPI application wired to temporary databases
via the ``test_client`` fixture (see :mod:`tests.conftest`). The whole module is
skipped when ``google-adk`` is unavailable, because constructing the root agent
during application startup requires it.

The Agent runner is monkeypatched where a chat turn would otherwise make live
LLM calls, keeping the tests deterministic and offline.
"""

from __future__ import annotations

import pytest

# The app startup (lifespan) builds the ADK root agent; skip everything if the
# runtime is not installed in this environment.
pytest.importorskip("google.adk")


def _patch_agent_runner(monkeypatch, answer="Đau ngực sau xương ức.", confidence=0.9):
    """Replace the shared Agent runner ``run`` with a deterministic stub."""
    from api.deps import services

    async def fake_run(user_input, context=None):
        return {
            "verified_answer": answer,
            "formatted_answer": answer,
            "confidence_score": confidence,
            "reasoning_steps": ["Xác nhận câu hỏi", "Phân tích", "Trả lời"],
            "citations": ["Tài liệu nội khoa"],
            "warnings": [],
            "retrieved_sources": [],
        }

    monkeypatch.setattr(services.react_runner, "run", fake_run)


class TestHealthEndpoint:
    def test_health_ok(self, test_client):
        """GET /api/health returns 200 with an ok status payload."""
        resp = test_client.get("/api/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["version"] == "1.0.0"
        assert isinstance(body["modules"], dict)


class TestCorsPreflight:
    def test_chat_preflight_allows_local_next_server_on_port_3001(self, test_client):
        """The alternate local Next dev port can preflight chat requests."""
        response = test_client.options(
            "/api/chat",
            headers={
                "Origin": "http://localhost:3001",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "http://localhost:3001"


class TestChatEndpoint:
    def test_build_citations_deduplicates_resolved_sources_in_first_seen_order(self):
        from api.chat import _build_citations

        citations = _build_citations(
            {
                "retrieved_sources": [
                    {
                        "title": "First display title",
                        "url": "https://example.com/source",
                        "snippet": "First quote",
                    },
                    {
                        "source": "https://example.com/source",
                        "snippet": "Duplicate quote",
                    },
                    {"path": "chapter-2.pdf", "snippet": "Second quote"},
                ]
            }
        )

        assert [citation.source for citation in citations] == [
            "https://example.com/source",
            "chapter-2.pdf",
        ]
        assert [citation.quote for citation in citations] == [
            "First quote",
            "Second quote",
        ]

    def test_chat_basic(self, test_client, monkeypatch):
        """POST /api/chat with a valid message returns a structured answer."""
        _patch_agent_runner(monkeypatch)
        resp = test_client.post(
            "/api/chat",
            json={"message": "Triệu chứng nhồi máu cơ tim?", "user_id": "u1"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["session_id"]
        assert body["message_id"]
        assert "answer" in body and "content" in body

    def test_chat_returns_source_backed_ferrule_answer(self, test_client, monkeypatch):
        """A source-grounded ferrule explanation remains visible to the learner."""
        from api.deps import services

        answer = (
            "Ferrule là mô răng lành còn lại quanh cổ răng sau điều trị nội nha. "
            "Trụ chỉ giúp lưu giữ core, không làm chân răng khỏe hơn. "
            "Nội dung này chỉ hỗ trợ học tập."
        )
        source = {
            "title": "Phục hồi răng đã điều trị nội nha",
            "source": "endodontic_restoration_ferrule_posts.md",
            "snippet": answer,
            "content": answer,
        }

        async def fake_run(_user_input, _context=None):
            return {
                "verified_answer": answer,
                "formatted_answer": answer,
                "confidence_score": 0.9,
                "reasoning_steps": ["Đối chiếu với tài liệu ferrule."],
                "citations": ["Nguồn do mô hình tự tạo"],
                "warnings": [],
                "retrieved_sources": [source],
            }

        monkeypatch.setattr(services.react_runner, "run", fake_run)
        response = test_client.post(
            "/api/chat",
            json={
                "message": "Trong học tập, ferrule là gì trước khi phục hồi răng?",
                "user_id": "ferrule-student",
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["answer"] == answer
        assert body["content"] == answer
        assert "Nguy cơ bịa đặt" not in body["answer"]
        assert len(body["citations"]) == 1
        assert body["citations"][0]["source"] == "endodontic_restoration_ferrule_posts.md"
        assert body["citations"][0]["quote"] == answer

    def test_chat_prefers_source_url_over_display_title(
        self, test_client, monkeypatch
    ):
        from api.deps import services

        url = "https://example.com/source"

        async def fake_run(_user_input, _context=None):
            return {
                "verified_answer": "Nội dung nguồn web hỗ trợ học tập.",
                "formatted_answer": "Nội dung nguồn web hỗ trợ học tập.",
                "confidence_score": 0.9,
                "reasoning_steps": [],
                "citations": [url],
                "warnings": [],
                "retrieved_sources": [
                    {
                        "title": "Display title",
                        "url": url,
                        "source": url,
                        "snippet": "Nội dung nguồn web hỗ trợ học tập.",
                        "content": "Nội dung nguồn web hỗ trợ học tập.",
                    }
                ],
            }

        monkeypatch.setattr(services.react_runner, "run", fake_run)
        response = test_client.post(
            "/api/chat",
            json={"message": "Nguồn web nào?", "user_id": "url-source-student"},
        )

        assert response.status_code == 200
        assert response.json()["citations"][0]["source"] == url

    def test_chat_drops_citations_without_retrieved_sources(
        self, test_client, monkeypatch
    ):
        """Chat never exposes citation labels without retrieved source objects."""
        from api.deps import services

        async def fake_run(_user_input, _context=None):
            return {
                "verified_answer": "Ferrule cần được đánh giá trong bối cảnh học tập.",
                "formatted_answer": "Ferrule cần được đánh giá trong bối cảnh học tập.",
                "confidence_score": 0.9,
                "reasoning_steps": ["Không có tài liệu truy xuất."],
                "citations": ["Nguồn do mô hình tự tạo"],
                "warnings": [],
                "retrieved_sources": [],
            }

        monkeypatch.setattr(services.react_runner, "run", fake_run)
        response = test_client.post(
            "/api/chat",
            json={
                "message": "Trong học tập, ferrule là gì?",
                "user_id": "unretrieved-citation-student",
            },
        )

        assert response.status_code == 200
        assert response.json()["citations"] == []

    def test_chat_survives_memory_store_failure(self, test_client, monkeypatch):
        """A valid chat remains available when learning-memory recall fails."""
        from api.deps import services

        _patch_agent_runner(monkeypatch)
        recalled_user_ids = []

        def record_then_raise(user_id):
            recalled_user_ids.append(user_id)
            raise RuntimeError("unavailable")

        monkeypatch.setattr(services.memory_store, "recall_all", record_then_raise)

        response = test_client.post(
            "/api/chat", json={"message": "Implant là gì?", "user_id": "u1"}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["session_id"]
        assert body["message_id"]
        assert "answer" in body and "content" in body
        assert body["answer"] == body["content"]

        history = test_client.get(
            f"/api/chat/history/{body['session_id']}?user_id=u1"
        )
        assert history.status_code == 200
        assert any(
            message["id"] == body["message_id"]
            and message["role"] == "assistant"
            and message["content"] == body["content"]
            for message in history.json()["messages"]
        )
        assert recalled_user_ids == ["u1"]

    def test_chat_survives_learning_memory_write_failure(
        self, test_client, monkeypatch
    ):
        """A failed explicit-learning write does not make chat unavailable."""
        from api.deps import services

        _patch_agent_runner(monkeypatch)
        store_calls = []

        def record_then_raise(user_id, memory_type, key, value, confidence=1.0):
            store_calls.append((user_id, memory_type, key, value, confidence))
            raise RuntimeError("unavailable")

        monkeypatch.setattr(services.memory_store, "store", record_then_raise)

        response = test_client.post(
            "/api/chat",
            json={
                "message": "Tôi muốn học implant để chuẩn bị thi.",
                "user_id": "u1",
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["session_id"]
        assert body["message_id"]
        assert "answer" in body and "content" in body
        assert body["answer"] == body["content"]

        history = test_client.get(
            f"/api/chat/history/{body['session_id']}?user_id=u1"
        )
        assert history.status_code == 200
        assert any(
            message["id"] == body["message_id"]
            and message["role"] == "assistant"
            and message["content"] == body["content"]
            for message in history.json()["messages"]
        )
        assert store_calls == [
            (
                "u1",
                "learning_goal",
                "goal:Implant",
                {"topic": "Implant", "summary": "Mục tiêu học Implant"},
                1.0,
            )
        ]

    def test_chat_requires_user_id(self, test_client):
        """POST /api/chat rejects a request without an owning user id."""
        resp = test_client.post(
            "/api/chat", json={"message": "Triệu chứng nhồi máu cơ tim?"}
        )
        assert resp.status_code == 422

    def test_chat_blocked_input(self, test_client, monkeypatch):
        """POST /api/chat with an emergency input is blocked by pre-checks."""
        # The Agent runner should never run for a blocked input, but patch anyway
        # so the test cannot accidentally hit the live LLM.
        _patch_agent_runner(monkeypatch)
        resp = test_client.post(
            "/api/chat",
            json={"message": "Tôi bị đau ngực dữ dội và muốn tự tử", "user_id": "u2"},
        )
        assert resp.status_code == 200
        body = resp.json()
        # Pre-check blocks produce a zero-confidence safe redirect.
        assert body["confidence"] == 0.0
        assert body["session_id"]

    def test_chat_creates_session(self, test_client, monkeypatch):
        """A chat request without a session_id creates a new session."""
        _patch_agent_runner(monkeypatch)
        resp = test_client.post(
            "/api/chat",
            json={"message": "Huyết áp bình thường là bao nhiêu?", "user_id": "u3"},
        )
        assert resp.status_code == 200
        session_id = resp.json()["session_id"]
        assert session_id

        # Reusing the returned session_id should keep the same session.
        resp2 = test_client.post(
            "/api/chat",
            json={
                "message": "Còn huyết áp cao thì sao?",
                "user_id": "u3",
                "session_id": session_id,
            },
        )
        assert resp2.status_code == 200
        assert resp2.json()["session_id"] == session_id

    def test_chat_rejects_another_users_session(self, test_client, monkeypatch):
        """A supplied session id cannot be reused under another user id."""
        _patch_agent_runner(monkeypatch)
        created = test_client.post(
            "/api/chat", json={"message": "Tôi muốn học implant", "user_id": "owner"}
        )
        session_id = created.json()["session_id"]

        resp = test_client.post(
            "/api/chat",
            json={
                "message": "Hãy giải thích implant từng bước",
                "user_id": "other-user",
                "session_id": session_id,
            },
        )

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Session not found"

    def test_streaming_chat_rejects_another_users_session(
        self, test_client, monkeypatch
    ):
        """A stream validates session ownership before SSE headers are sent."""
        _patch_agent_runner(monkeypatch)
        created = test_client.post(
            "/api/chat", json={"message": "Tôi muốn học implant", "user_id": "u1"}
        )
        session_id = created.json()["session_id"]

        response = test_client.post(
            "/api/chat",
            json={
                "message": "Hãy giải thích implant từng bước",
                "user_id": "u2",
                "session_id": session_id,
                "stream": True,
            },
        )

        assert response.status_code == 404
        assert response.headers["content-type"].startswith("application/json")
        assert response.json()["detail"] == "Session not found"

    def test_streaming_chat_rejects_unknown_session(self, test_client):
        """A stream hides an unknown session behind the generic 404 response."""
        response = test_client.post(
            "/api/chat",
            json={
                "message": "Hãy giải thích implant từng bước",
                "user_id": "u1",
                "session_id": "session-does-not-exist",
                "stream": True,
            },
        )

        assert response.status_code == 404
        assert response.headers["content-type"].startswith("application/json")
        assert response.json()["detail"] == "Session not found"

    @pytest.mark.asyncio
    async def test_streaming_fallback_does_not_emit_exception_details(
        self, monkeypatch
    ):
        import api.chat as chat_module
        from api.models import ChatRequest

        sentinel = "PROVIDER_SECRET_TOKEN_67"

        async def fail(_request, _svc):
            raise RuntimeError(f"provider credentials: {sentinel}")

        monkeypatch.setattr(chat_module, "_run_chat", fail)
        frames = [
            frame
            async for frame in chat_module._stream_chat(
                ChatRequest(message="q", user_id="u", stream=True), object()
            )
        ]
        payload = "".join(frames)

        assert sentinel not in payload
        assert "provider credentials" not in payload
        assert "Đã xảy ra lỗi khi xử lý luồng trả lời." in payload

    def test_chat_history_is_scoped_to_owner(self, test_client, monkeypatch):
        """History requires the owning user and hides non-owned sessions."""
        _patch_agent_runner(monkeypatch)
        created = test_client.post(
            "/api/chat", json={"message": "Tôi muốn học implant", "user_id": "owner"}
        )
        session_id = created.json()["session_id"]

        own = test_client.get(f"/api/chat/history/{session_id}?user_id=owner")
        other = test_client.get(f"/api/chat/history/{session_id}?user_id=other-user")
        missing_user = test_client.get(f"/api/chat/history/{session_id}")

        assert own.status_code == 200
        assert other.status_code == 404
        assert other.json()["detail"] == "Session not found"
        assert missing_user.status_code == 422

    def test_chat_sessions_lists_only_owned_sessions(self, test_client, monkeypatch):
        """GET /api/chat/sessions lists the owner's sessions with counts."""
        _patch_agent_runner(monkeypatch)
        created = test_client.post(
            "/api/chat", json={"message": "Tôi muốn học implant", "user_id": "owner"}
        )
        session_id = created.json()["session_id"]

        listed = test_client.get("/api/chat/sessions", params={"user_id": "owner"})

        assert listed.status_code == 200
        sessions = listed.json()
        assert isinstance(sessions, list)
        assert len(sessions) == 1
        entry = sessions[0]
        assert entry["session_id"] == session_id
        assert set(entry) == {
            "session_id",
            "topic",
            "created_at",
            "last_active",
            "message_count",
        }
        # One user message + one assistant message from the chat turn.
        assert entry["message_count"] == 2
        assert "T" in entry["created_at"]
        assert "T" in entry["last_active"]

        # Another user sees none of the owner's sessions.
        other = test_client.get(
            "/api/chat/sessions", params={"user_id": "other-user"}
        )
        assert other.status_code == 200
        assert other.json() == []

    def test_chat_sessions_requires_user_id(self, test_client):
        """GET /api/chat/sessions rejects a missing or blank user id."""
        missing = test_client.get("/api/chat/sessions")
        blank = test_client.get("/api/chat/sessions", params={"user_id": "   "})

        assert missing.status_code == 400
        assert missing.json()["detail"] == "user_id is required"
        assert blank.status_code == 400
        assert blank.json()["detail"] == "user_id is required"


class TestMemoryEndpoints:
    def test_memory_endpoints_are_isolated_by_owner(self, test_client):
        """Memory APIs never expose or delete another user's entries."""
        from api.deps import services

        retained = services.memory_store.store(
            "user-a",
            "learning_goal",
            "goal:Implant",
            {"topic": "Implant", "summary": "Học implant"},
        )
        removable = services.memory_store.store(
            "user-a",
            "preference",
            "preference:Implant:explanation_style",
            {"topic": "Implant", "name": "explanation_style", "summary": "từng bước"},
        )
        other_entry = services.memory_store.store(
            "user-b",
            "learning_goal",
            "goal:Nha chu",
            {"topic": "Nha chu", "summary": "Học nha chu"},
        )

        missing_user = test_client.get("/api/memories")
        user_a_list = test_client.get("/api/memories", params={"user_id": "user-a"})
        user_b_list = test_client.get("/api/memories", params={"user_id": "user-b"})

        assert missing_user.status_code == 422
        assert user_a_list.status_code == 200
        assert {entry["id"] for entry in user_a_list.json()["memories"]} == {
            retained.id,
            removable.id,
        }
        assert all(
            isinstance(entry["value"], dict)
            and "T" in entry["created_at"]
            and "T" in entry["updated_at"]
            for entry in user_a_list.json()["memories"]
        )
        assert [entry["id"] for entry in user_b_list.json()["memories"]] == [
            other_entry.id
        ]

        cross_owner = test_client.delete(
            f"/api/memories/{other_entry.id}", params={"user_id": "user-a"}
        )
        missing = test_client.delete(
            "/api/memories/999999", params={"user_id": "user-a"}
        )
        own_delete = test_client.delete(
            f"/api/memories/{removable.id}", params={"user_id": "user-a"}
        )

        assert cross_owner.status_code == 404
        assert cross_owner.json()["detail"] == "Memory not found"
        assert missing.status_code == 404
        assert missing.json()["detail"] == "Memory not found"
        assert own_delete.status_code == 200
        assert own_delete.json() == {"deleted": 1}

        delete_all = test_client.delete("/api/memories", params={"user_id": "user-a"})
        assert delete_all.status_code == 200
        assert delete_all.json() == {"deleted": 1}
        assert test_client.get("/api/memories", params={"user_id": "user-a"}).json() == {
            "memories": []
        }
        assert [
            entry["id"]
            for entry in test_client.get(
                "/api/memories", params={"user_id": "user-b"}
            ).json()["memories"]
        ] == [other_entry.id]


class TestDocumentEndpoints:
    def test_upload_document(self, test_client):
        """POST /api/documents/upload accepts a file and registers it."""
        resp = test_client.post(
            "/api/documents/upload",
            files={"file": ("note.txt", b"Noi dung tai lieu y khoa.", "text/plain")},
            data={"specialty": "cardiology", "description": "test"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["document_id"].startswith("doc_")
        assert body["filename"] == "note.txt"
        # status is "processing" (pipeline available) or "failed" (unavailable).
        assert body["status"] in {"processing", "failed", "completed"}

    def test_list_documents(self, test_client):
        """GET /api/documents returns the list of registered documents."""
        upload = test_client.post(
            "/api/documents/upload",
            files={"file": ("a.txt", b"abc", "text/plain")},
        )
        doc_id = upload.json()["document_id"]

        resp = test_client.get("/api/documents")
        assert resp.status_code == 200
        ids = [d["id"] for d in resp.json()["documents"]]
        assert doc_id in ids

    def test_delete_document(self, test_client):
        """DELETE /api/documents/{id} removes a registered document."""
        upload = test_client.post(
            "/api/documents/upload",
            files={"file": ("b.txt", b"xyz", "text/plain")},
        )
        doc_id = upload.json()["document_id"]

        resp = test_client.delete(f"/api/documents/{doc_id}")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        # Deleting an unknown document reports success=False.
        resp2 = test_client.delete("/api/documents/doc_missing")
        assert resp2.status_code == 200
        assert resp2.json()["success"] is False


class TestFeedbackEndpoints:
    def test_submit_feedback(self, test_client):
        """POST /api/feedback records feedback and reports success."""
        resp = test_client.post(
            "/api/feedback",
            json={
                "session_id": "s1",
                "user_id": "learner",
                "message_id": "m1",
                "rating": 5,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_get_progress(self, test_client):
        """GET /api/progress/{user_id} returns a progress payload."""
        resp = test_client.get("/api/progress/learner")
        assert resp.status_code == 200
        body = resp.json()
        assert "mastery_levels" in body
        assert "weak_areas" in body
        assert "strong_areas" in body
        assert "total_interactions" in body


class TestQuizEndpoints:
    def test_generate_quiz(self, test_client):
        """POST /api/quiz/generate returns questions (fallback works offline)."""
        resp = test_client.post(
            "/api/quiz/generate",
            json={"topic": "sinh lý tim", "difficulty": "easy", "count": 3, "user_id": "q1"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["quiz_id"].startswith("quiz_")
        assert len(body["questions"]) >= 1
        first = body["questions"][0]
        assert first["stem"]
        assert len(first["options"]) >= 2
        # The generate response must not leak the correct answer.
        assert first.get("correct_answer") is None

    def test_submit_quiz(self, test_client):
        """POST /api/quiz/submit grades a submission and returns a score."""
        gen = test_client.post(
            "/api/quiz/generate",
            json={"topic": "giải phẫu", "difficulty": "easy", "count": 2, "user_id": "q2"},
        )
        gen_body = gen.json()
        quiz_id = gen_body["quiz_id"]
        answers = {q["id"]: "A" for q in gen_body["questions"]}

        resp = test_client.post(
            "/api/quiz/submit",
            json={"quiz_id": quiz_id, "user_id": "q2", "answers": answers},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == len(gen_body["questions"])
        assert 0.0 <= body["score"] <= 100.0
        assert len(body["details"]) == body["total"]

        # Submitting an unknown quiz id returns 404.
        missing = test_client.post(
            "/api/quiz/submit",
            json={"quiz_id": "quiz_missing", "user_id": "q2", "answers": {}},
        )
        assert missing.status_code == 404

    def test_incorrect_implant_quiz_stores_weak_area(self, test_client, monkeypatch):
        """An incorrect dental quiz records a score-derived weak area."""
        monkeypatch.setattr("api.quiz._QUIZ_LLM_AVAILABLE", False)
        generated = test_client.post(
            "/api/quiz/generate",
            json={"topic": "Implant", "difficulty": "easy", "count": 2, "user_id": "u1"},
        )
        quiz = generated.json()
        response = test_client.post(
            "/api/quiz/submit",
            json={"quiz_id": quiz["quiz_id"], "user_id": "u1", "answers": {}},
        )

        assert response.status_code == 200
        result = response.json()
        memories = test_client.get("/api/memories", params={"user_id": "u1"}).json()[
            "memories"
        ]
        assert len(memories) == 1
        memory = memories[0]
        assert memory["memory_type"] == "weak_area"
        assert memory["key"] == "Implant"
        assert memory["value"] == {
            "topic": "Implant",
            "incorrect_count": result["total"],
            "last_score": result["score"],
        }
        assert memory["confidence"] == 1.0

    def test_correct_implant_quiz_does_not_store_weak_area(self, test_client):
        """A fully correct dental quiz does not create a weak-area memory."""
        from api.deps import services

        services.quiz_store["quiz-implant"] = {
            "topic": "Implant",
            "difficulty": "easy",
            "questions": [{"id": "q1", "correct_answer": "B", "explanation": ""}],
        }

        response = test_client.post(
            "/api/quiz/submit",
            json={"quiz_id": "quiz-implant", "user_id": "u1", "answers": {"q1": "B"}},
        )

        assert response.status_code == 200
        assert services.memory_store.list_for_user("u1") == []

    def test_incorrect_cardiology_quiz_does_not_store_memory(
        self, test_client, monkeypatch
    ):
        """An incorrect non-dental quiz remains successful without memory writes."""
        monkeypatch.setattr("api.quiz._QUIZ_LLM_AVAILABLE", False)
        generated = test_client.post(
            "/api/quiz/generate",
            json={"topic": "Cardiology", "difficulty": "easy", "count": 2, "user_id": "u1"},
        )
        quiz = generated.json()
        response = test_client.post(
            "/api/quiz/submit",
            json={"quiz_id": quiz["quiz_id"], "user_id": "u1", "answers": {}},
        )

        assert response.status_code == 200
        assert response.json()["total"] == len(quiz["questions"])
        assert test_client.get("/api/memories", params={"user_id": "u1"}).json() == {
            "memories": []
        }
