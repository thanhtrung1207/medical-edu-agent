"""API endpoint tests using FastAPI's synchronous ``TestClient``.

These tests exercise the real FastAPI application wired to temporary databases
via the ``test_client`` fixture (see :mod:`tests.conftest`). The whole module is
skipped when ``google-adk`` is unavailable, because constructing the root agent
during application startup requires it.

The reasoning workflow is monkeypatched where a chat turn would otherwise make
live LLM calls, keeping the tests deterministic and offline.
"""

from __future__ import annotations

import pytest

# The app startup (lifespan) builds the ADK root agent; skip everything if the
# runtime is not installed in this environment.
pytest.importorskip("google.adk")


def _patch_workflow(monkeypatch, answer="Đau ngực sau xương ức.", confidence=0.9):
    """Replace the shared reasoning workflow ``run`` with a deterministic stub."""
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

    monkeypatch.setattr(services.reasoning_workflow, "run", fake_run)


class TestHealthEndpoint:
    def test_health_ok(self, test_client):
        """GET /api/health returns 200 with an ok status payload."""
        resp = test_client.get("/api/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["version"] == "1.0.0"
        assert isinstance(body["modules"], dict)


class TestChatEndpoint:
    def test_chat_basic(self, test_client, monkeypatch):
        """POST /api/chat with a valid message returns a structured answer."""
        _patch_workflow(monkeypatch)
        resp = test_client.post(
            "/api/chat",
            json={"message": "Triệu chứng nhồi máu cơ tim?", "user_id": "u1"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["session_id"]
        assert body["message_id"]
        assert "answer" in body and "content" in body

    def test_chat_blocked_input(self, test_client, monkeypatch):
        """POST /api/chat with an emergency input is blocked by pre-checks."""
        # The workflow should never run for a blocked input, but patch anyway
        # so the test cannot accidentally hit the live LLM.
        _patch_workflow(monkeypatch)
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
        _patch_workflow(monkeypatch)
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
