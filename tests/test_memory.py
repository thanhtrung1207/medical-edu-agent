"""Tests for the memory & session-management module.

All fixtures use temp SQLite databases, so these tests need no optional
dependencies.
"""

from __future__ import annotations

import pytest

from memory import ContextBuilder


class TestSessionManager:
    def test_create_session(self, session_manager):
        session = session_manager.create_session("u1", topic="Tim mạch")

        assert session.id
        assert session.user_id == "u1"
        assert session.topic == "Tim mạch"

    def test_add_message(self, session_manager):
        session = session_manager.create_session("u1")

        message_id = session_manager.add_message(session.id, "user", "Xin chào")

        assert message_id
        # Adding to a non-existent session raises ValueError.
        with pytest.raises(ValueError):
            session_manager.add_message("does-not-exist", "user", "x")

    def test_get_history(self, session_manager):
        session = session_manager.create_session("u1")
        session_manager.add_message(session.id, "user", "Câu hỏi 1")
        session_manager.add_message(session.id, "assistant", "Trả lời 1")

        history = session_manager.get_session_history(session.id)

        assert len(history) == 2
        # Chronological order (oldest first).
        assert history[0]["content"] == "Câu hỏi 1"
        assert history[1]["role"] == "assistant"

    def test_list_sessions(self, session_manager):
        session_manager.create_session("u1")
        session_manager.create_session("u1")
        session_manager.create_session("other_user")

        sessions = session_manager.list_sessions("u1")

        assert len(sessions) == 2

    def test_delete_session(self, session_manager):
        session = session_manager.create_session("u1")

        session_manager.delete_session(session.id)

        assert session_manager.get_session(session.id) is None

    def test_cleanup_old(self, session_manager):
        session_manager.create_session("u1")

        # Negative age puts the cutoff in the future so all sessions are stale.
        removed = session_manager.cleanup_old_sessions(days=-1)

        assert removed >= 1


class TestMemoryStore:
    def test_store_and_recall(self, memory_store):
        entry = memory_store.store("u1", "preference", "level", "Y3")

        assert entry.id is not None
        recalled = memory_store.recall("u1", memory_type="preference", key="level")
        assert len(recalled) == 1
        assert recalled[0].parsed_value() == "Y3"

    def test_upsert_existing(self, memory_store):
        memory_store.store("u1", "preference", "level", "Y3")
        memory_store.store("u1", "preference", "level", "Y4")

        recalled = memory_store.recall("u1", memory_type="preference", key="level")

        assert len(recalled) == 1
        assert recalled[0].parsed_value() == "Y4"

    def test_preferences(self, memory_store):
        memory_store.set_user_preference("u1", "explanation_style", "chi tiết")

        prefs = memory_store.get_user_preferences("u1")

        assert prefs["explanation_style"] == "chi tiết"

    def test_bookmarks(self, memory_store):
        memory_store.bookmark_response(
            "u1", "m1", "Tim mạch", "Tóm tắt về suy tim"
        )

        all_bookmarks = memory_store.get_bookmarks("u1")
        filtered = memory_store.get_bookmarks("u1", topic="tim")

        assert len(all_bookmarks) == 1
        assert len(filtered) == 1

    def test_forget(self, memory_store):
        entry = memory_store.store("u1", "preference", "level", "Y3")

        memory_store.forget(entry.id)

        assert memory_store.recall("u1", memory_type="preference", key="level") == []

    def test_decay(self, memory_store):
        memory_store.store("u1", "preference", "level", "Y3", confidence=1.0)

        # days=0 -> cutoff is "now"; the just-stored entry is already older.
        affected = memory_store.decay_old_memories(days=0, factor=0.5)

        assert affected >= 1
        recalled = memory_store.recall(
            "u1", memory_type="preference", key="level"
        )
        assert recalled[0].confidence < 1.0


class TestContextBuilder:
    def test_build_prompt_context(self, session_manager, memory_store):
        builder = ContextBuilder(session_manager, memory_store)
        memory_store.set_user_preference("u1", "level", "Y3")
        session = session_manager.create_session("u1", topic="Tim mạch")
        session_manager.add_message(session.id, "user", "Suy tim là gì?")

        context = builder.build_prompt_context("u1", session.id)

        assert isinstance(context, str)
        assert "Y3" in context

    def test_detect_topic(self, session_manager, memory_store):
        builder = ContextBuilder(session_manager, memory_store)

        topic = builder.detect_topic_from_messages(
            [{"role": "user", "content": "Suy tim và huyết áp cao là gì?"}]
        )

        assert topic == "Tim mạch"

    def test_context_size_limit(self, session_manager, memory_store):
        builder = ContextBuilder(session_manager, memory_store)
        session = session_manager.create_session("u1", topic="Tim mạch")
        # A very long message must not blow the context budget.
        session_manager.add_message(session.id, "user", "tim " * 5000)

        context = builder.build_prompt_context("u1", session.id)

        assert len(context) <= 2000
