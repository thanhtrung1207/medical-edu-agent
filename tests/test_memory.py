"""Tests for the memory & session-management module.

All fixtures use temp SQLite databases, so these tests need no optional
dependencies.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import closing

import pytest

from memory import (
    MEMORY_TYPES,
    ContextBuilder,
    LearningFact,
    extract_explicit_learning_facts,
    normalize_topic,
)


class TestLearningFacts:
    def test_normalize_topic_accepts_only_trimmed_dental_topics(self):
        assert normalize_topic(" Implant ") == "Implant"
        assert normalize_topic("Cardiology") == ""

    def test_extracts_only_explicit_topic_scoped_goal(self):
        facts = extract_explicit_learning_facts(
            "Tôi muốn học implant để chuẩn bị thi.", "Implant"
        )

        assert len(facts) == 1
        assert isinstance(facts[0], LearningFact)
        assert facts[0].memory_type == "learning_goal"
        assert facts[0].key == "goal:Implant"
        assert facts[0].value == {
            "topic": "Implant",
            "summary": "Mục tiêu học Implant",
        }

    def test_extracts_explicit_explanation_style_preference(self):
        facts = extract_explicit_learning_facts(
            "Hãy giải thích chi tiết về implant.", "Implant"
        )

        assert len(facts) == 1
        assert facts[0].memory_type == "preference"
        assert facts[0].key == "preference:Implant:explanation_style"
        assert facts[0].value == {
            "topic": "Implant",
            "name": "explanation_style",
            "summary": "chi tiết",
        }

    def test_does_not_extract_fact_without_dental_topic(self):
        assert extract_explicit_learning_facts("Tôi muốn học kỹ hơn.", "") == []
        assert extract_explicit_learning_facts("Implant là gì?", "Implant") == []


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
    def test_memory_types_include_supported_learning_types(self):
        expected_types = {
            "preference",
            "learning_style",
            "topic_interest",
            "correction",
            "bookmark",
            "learning_goal",
            "weak_area",
        }

        assert expected_types.issubset(MEMORY_TYPES)

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
        response_text = "Tóm tắt về điều trị implant"
        memory_store.bookmark_response("u1", "m1", "Implant")

        all_bookmarks = memory_store.get_bookmarks("u1")
        filtered = memory_store.get_bookmarks("u1", topic="implant")
        value = all_bookmarks[0].parsed_value()

        assert len(all_bookmarks) == 1
        assert len(filtered) == 1
        assert value == {
            "message_id": "m1",
            "topic": "Implant",
            "summary": "Đã đánh dấu: Implant",
        }
        assert response_text not in all_bookmarks[0].value

    def test_ignores_bookmark_without_dental_topic(self, memory_store):
        memory_store.bookmark_response("u1", "message-1", "Cardiology")

        assert memory_store.list_for_user("u1") == []

    def test_store_upserts_an_explicit_learning_fact(self, memory_store):
        first = memory_store.store(
            "u1",
            "learning_goal",
            "goal:Implant",
            {"topic": "Implant", "summary": "A"},
        )
        updated = memory_store.store(
            "u1",
            "learning_goal",
            "goal:Implant",
            {"topic": "Implant", "summary": "B"},
        )

        entries = memory_store.list_for_user("u1")

        assert updated.id == first.id
        assert len(entries) == 1
        assert entries[0].parsed_value()["summary"] == "B"

    def test_list_for_user_orders_equal_timestamps_by_id_desc(self, memory_store):
        older = memory_store.store("u1", "weak_area", "Implant", {"topic": "Implant"})
        newer = memory_store.store("u1", "weak_area", "Nha chu", {"topic": "Nha chu"})

        with closing(sqlite3.connect(memory_store.db_path)) as conn:
            with conn:
                conn.execute(
                    "UPDATE memories SET updated_at = ? WHERE user_id = ?",
                    ("2025-01-01T00:00:00", "u1"),
                )

        entries = memory_store.list_for_user("u1")

        assert [entry.id for entry in entries] == [newer.id, older.id]

    def test_list_and_delete_are_scoped_to_owner(self, memory_store):
        older = memory_store.store(
            "u1", "weak_area", "Implant", {"topic": "Implant"}, confidence=1.0
        )
        owned = memory_store.store(
            "u1", "weak_area", "Nha chu", {"topic": "Nha chu"}, confidence=0.0
        )
        other = memory_store.store(
            "u2", "weak_area", "Implant", {"topic": "Implant"}
        )

        entries = memory_store.list_for_user("u1")

        assert [entry.id for entry in entries] == [owned.id, older.id]
        assert [entry.access_count for entry in entries] == [0, 0]
        assert memory_store.forget_for_user(owned.id, "u2") is False
        assert memory_store.forget_for_user(owned.id, "u1") is True
        assert memory_store.delete_all_for_user("u2") == 1
        assert [entry.id for entry in memory_store.list_for_user("u1")] == [older.id]
        assert memory_store.list_for_user("u2") == []
        assert other.id is not None

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


class TestRestartPersistence:
    def test_memory_and_session_persist_when_stores_are_reopened(self, tmp_path):
        from memory import MemoryStore, SessionManager

        memory_path = str(tmp_path / "memory.db")
        session_path = str(tmp_path / "sessions.db")
        MemoryStore(memory_path).store(
            "u1",
            "learning_goal",
            "goal:Implant",
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


class TestContextBuilder:
    def test_new_session_injects_only_same_topic_memory_without_profile(
        self, session_manager, memory_store
    ):
        builder = ContextBuilder(session_manager, memory_store)
        memory_store.set_user_preference("u1", "level", "Y3")
        memory_store.store(
            "u1",
            "learning_goal",
            "goal:Implant",
            {"topic": "Implant", "summary": "Ôn implant đơn lẻ"},
        )
        memory_store.store(
            "u1",
            "learning_goal",
            "goal:Implant nâng cao",
            {"topic": "Implant nâng cao", "summary": "Ôn implant nâng cao"},
        )
        memory_store.store(
            "u1",
            "learning_goal",
            "goal:implant",
            {"topic": "implant", "summary": "Ôn implant chữ thường"},
        )
        memory_store.store(
            "u1",
            "weak_area",
            "Nha chu",
            {"topic": "Nha chu", "summary": "Cần ôn nha chu"},
        )
        previous_session = session_manager.create_session("u1", topic="Implant")
        session_manager.add_message(previous_session.id, "user", "Câu hỏi cũ")
        new_session = session_manager.create_session("u1")

        structured = builder.build_context("u1", new_session.id, "Implant")
        prompt = builder.build_prompt_context("u1", new_session.id, "Implant")

        assert structured["conversation_history"] == []
        assert structured["user_preferences"] == {}
        assert structured["user_profile_summary"] == ""
        assert [entry.key for entry in structured["relevant_memories"]] == [
            "goal:Implant"
        ]
        assert "[Dữ liệu học tập]" in prompt
        assert "Implant" in prompt
        assert "Nha chu" not in prompt
        assert "Y3" not in prompt
        assert "[Thông tin người dùng]" not in prompt

    def test_no_topic_omits_long_term_memory_without_reading_store(
        self, session_manager, memory_store, monkeypatch
    ):
        builder = ContextBuilder(session_manager, memory_store)
        memory_store.store(
            "u1",
            "learning_goal",
            "goal:Implant",
            {"topic": "Implant", "summary": "Ôn implant"},
        )
        session = session_manager.create_session("u1")
        session_manager.add_message(session.id, "user", "Implant là gì?")

        def fail_recall_all(user_id):
            pytest.fail("recall_all must not run without a current topic")

        monkeypatch.setattr(memory_store, "recall_all", fail_recall_all)

        structured = builder.build_context("u1", session.id)
        prompt = builder.build_prompt_context("u1", session.id)

        assert structured["relevant_memories"] == []
        assert "[Dữ liệu học tập]" not in prompt
        assert "[Lịch sử gần đây]" in prompt
        assert "Implant là gì?" in prompt

    def test_context_retains_prior_active_session_turns(
        self, session_manager, memory_store
    ):
        builder = ContextBuilder(session_manager, memory_store)
        session = session_manager.create_session("u1")
        session_manager.add_message(session.id, "user", "Câu hỏi trước")
        session_manager.add_message(session.id, "assistant", "Câu trả lời trước")

        structured = builder.build_context("u1", session.id)

        assert [message["content"] for message in structured["conversation_history"]] == [
            "Câu hỏi trước",
            "Câu trả lời trước",
        ]
        assert structured["relevant_memories"] == []

    def test_context_returns_six_most_recent_active_session_turns_chronologically(
        self, session_manager, memory_store
    ):
        builder = ContextBuilder(session_manager, memory_store)
        session = session_manager.create_session("u1")
        for index in range(8):
            session_manager.add_message(
                session.id, "user", f"Tin nhắn {index + 1}"
            )

        structured = builder.build_context("u1", session.id)

        assert [message["content"] for message in structured["conversation_history"]] == [
            "Tin nhắn 3",
            "Tin nhắn 4",
            "Tin nhắn 5",
            "Tin nhắn 6",
            "Tin nhắn 7",
            "Tin nhắn 8",
        ]

    def test_prompt_renders_six_recent_role_labelled_turns_chronologically(
        self, session_manager, memory_store
    ):
        builder = ContextBuilder(session_manager, memory_store)
        session = session_manager.create_session("u1")
        turns = [
            ("user", "Người dùng 1"),
            ("assistant", "Trợ lý 1"),
            ("user", "Người dùng 2"),
            ("assistant", "Trợ lý 2"),
            ("user", "Người dùng 3"),
            ("assistant", "Trợ lý 3"),
            ("user", "Người dùng 4"),
            ("assistant", "Trợ lý 4"),
        ]
        for role, content in turns:
            session_manager.add_message(session.id, role, content)

        prompt = builder.build_prompt_context("u1", session.id, "Implant")

        history_lines = prompt.split("[Lịch sử gần đây]\n", 1)[1].splitlines()
        assert history_lines == [
            "- Chủ đề hiện tại: Implant",
            "- user: Người dùng 2",
            "- assistant: Trợ lý 2",
            "- user: Người dùng 3",
            "- assistant: Trợ lý 3",
            "- user: Người dùng 4",
            "- assistant: Trợ lý 4",
        ]

    def test_prompt_reads_session_history_once(
        self, session_manager, memory_store, monkeypatch
    ):
        builder = ContextBuilder(session_manager, memory_store)
        session = session_manager.create_session("u1", topic="Implant")
        session_manager.add_message(session.id, "user", "Câu hỏi về implant")
        history_reads = []
        original_get_history = session_manager.get_session_history

        def count_history_reads(session_id, limit=50):
            history_reads.append((session_id, limit))
            return original_get_history(session_id, limit)

        monkeypatch.setattr(session_manager, "get_session_history", count_history_reads)

        prompt = builder.build_prompt_context("u1", session.id, "Implant")

        assert "[Lịch sử gần đây]" in prompt
        assert history_reads == [(session.id, 6)]

    def test_long_term_memory_block_is_limited_to_1500_chars(
        self, session_manager, memory_store
    ):
        builder = ContextBuilder(session_manager, memory_store)
        memory_store.store(
            "u1",
            "learning_goal",
            "goal:oversized-Implant",
            {"topic": "Implant", "summary": "x" * 2000},
            confidence=1.0,
        )
        memory_store.store(
            "u1",
            "weak_area",
            "small-Implant",
            {"topic": "Implant", "summary": "Cần ôn tiêu xương"},
            confidence=0.5,
        )
        session = session_manager.create_session("u1")

        context = builder.build_prompt_context("u1", session.id, "Implant")
        long_term_block = context.split("\n\n", 1)[0]
        payload_lines = long_term_block.splitlines()[1:]

        assert long_term_block.startswith("[Dữ liệu học tập]\n")
        assert len(long_term_block) <= 1500
        assert "x" * 2000 not in long_term_block
        assert payload_lines
        for line in payload_lines:
            memory_type, payload = line.removeprefix("- ").split(": ", 1)
            assert memory_type
            assert json.loads(payload)["topic"] == "Implant"

    def test_limits_relevant_memories_to_top_five(self, session_manager, memory_store):
        builder = ContextBuilder(session_manager, memory_store)
        for index in range(6):
            memory_store.store(
                "u1",
                "weak_area",
                f"Implant-{index}",
                {"topic": "Implant", "summary": str(index)},
                confidence=(index + 1) / 10,
            )
        session = session_manager.create_session("u1")

        structured = builder.build_context("u1", session.id, "Implant")

        assert [entry.key for entry in structured["relevant_memories"]] == [
            "Implant-5",
            "Implant-4",
            "Implant-3",
            "Implant-2",
            "Implant-1",
        ]

    def test_ranks_tied_relevant_memories_by_id_descending(
        self, session_manager, memory_store
    ):
        builder = ContextBuilder(session_manager, memory_store)
        first = memory_store.store(
            "u1",
            "weak_area",
            "first-Implant",
            {"topic": "Implant", "summary": "A"},
            confidence=0.8,
        )
        second = memory_store.store(
            "u1",
            "weak_area",
            "second-Implant",
            {"topic": "Implant", "summary": "B"},
            confidence=0.8,
        )
        with closing(sqlite3.connect(memory_store.db_path)) as conn:
            with conn:
                conn.execute(
                    "UPDATE memories SET updated_at = ? WHERE user_id = ?",
                    ("2025-01-01T00:00:00", "u1"),
                )
        session = session_manager.create_session("u1")

        structured = builder.build_context("u1", session.id, "Implant")

        assert [entry.id for entry in structured["relevant_memories"]] == [
            second.id,
            first.id,
        ]

    def test_memory_read_failure_retains_history_without_long_term_memory(
        self, session_manager, memory_store, monkeypatch
    ):
        builder = ContextBuilder(session_manager, memory_store)
        session = session_manager.create_session("u1")
        session_manager.add_message(session.id, "user", "Câu hỏi đang trao đổi")

        def raise_memory_error(user_id):
            raise RuntimeError("database unavailable")

        monkeypatch.setattr(memory_store, "recall_all", raise_memory_error)

        structured = builder.build_context("u1", session.id, "Implant")
        prompt = builder.build_prompt_context("u1", session.id, "Implant")

        assert [message["content"] for message in structured["conversation_history"]] == [
            "Câu hỏi đang trao đổi"
        ]
        assert structured["relevant_memories"] == []
        assert "[Dữ liệu học tập]" not in prompt
        assert "[Lịch sử gần đây]" in prompt

    def test_detect_topic(self, session_manager, memory_store):
        builder = ContextBuilder(session_manager, memory_store)

        topic = builder.detect_topic_from_messages(
            [{"role": "user", "content": "Kế hoạch điều trị implant đơn lẻ là gì?"}]
        )

        assert topic == "Implant"

    def test_context_size_limit(self, session_manager, memory_store):
        builder = ContextBuilder(session_manager, memory_store)
        session = session_manager.create_session("u1", topic="Implant")
        session_manager.add_message(session.id, "user", "implant " * 5000)

        context = builder.build_prompt_context("u1", session.id)

        assert len(context) <= 2000
