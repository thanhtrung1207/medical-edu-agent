"""Tests for persistent SQLite QuizStore, WAL mode concurrency, and restart persistence."""

from __future__ import annotations

import concurrent.futures
import sqlite3
from datetime import datetime
from typing import Dict, Any

import pytest

from learning.quiz_store import QuizStore, QuizStoreMapping, QuizHistoryMapping


@pytest.fixture
def temp_quiz_store(tmp_path):
    """Return a QuizStore instance pointing to a temporary SQLite database."""
    db_file = str(tmp_path / "test_quiz.db")
    return QuizStore(db_path=db_file)


class TestQuizStoreOperations:
    def test_save_and_get_quiz(self, temp_quiz_store):
        quiz_data = {
            "id": "quiz_001",
            "topic": "tim mạch",
            "difficulty": "medium",
            "questions": [
                {
                    "id": "q1",
                    "stem": "Triệu chứng điển hình của NMCT?",
                    "options": [
                        {"key": "A", "text": "Đau ngực sau xương ức"},
                        {"key": "B", "text": "Đau hạ sườn phải"},
                    ],
                    "correct_answer": "A",
                    "explanation": "Đau thắt ngực là triệu chứng kinh điển.",
                }
            ],
            "created_at": datetime.now().isoformat(),
        }
        temp_quiz_store.save_quiz(quiz_data)

        retrieved = temp_quiz_store.get_quiz("quiz_001")
        assert retrieved is not None
        assert retrieved["id"] == "quiz_001"
        assert retrieved["topic"] == "tim mạch"
        assert retrieved["difficulty"] == "medium"
        assert len(retrieved["questions"]) == 1
        assert retrieved["questions"][0]["correct_answer"] == "A"

    def test_get_nonexistent_quiz_returns_none(self, temp_quiz_store):
        assert temp_quiz_store.get_quiz("quiz_nonexistent") is None

    def test_list_and_delete_quiz(self, temp_quiz_store):
        temp_quiz_store.save_quiz({"id": "q1", "topic": "t1", "questions": []})
        temp_quiz_store.save_quiz({"id": "q2", "topic": "t2", "questions": []})

        quizzes = temp_quiz_store.list_quizzes()
        assert len(quizzes) == 2

        deleted = temp_quiz_store.delete_quiz("q1")
        assert deleted is True
        assert temp_quiz_store.get_quiz("q1") is None
        assert len(temp_quiz_store.list_quizzes()) == 1

        # Deleting already deleted returns False
        assert temp_quiz_store.delete_quiz("q1") is False

    def test_save_and_get_submission_history(self, temp_quiz_store):
        sub1 = {
            "quiz_id": "quiz_001",
            "topic": "tim mạch",
            "difficulty": "medium",
            "score": 100.0,
            "total": 1,
            "correct": 1,
            "details": [{"questionId": "q1", "correct": True}],
            "submitted_at": "2026-10-08T10:00:00",
        }
        sub2 = {
            "quiz_id": "quiz_002",
            "topic": "hô hấp",
            "difficulty": "easy",
            "score": 50.0,
            "total": 2,
            "correct": 1,
            "details": [],
            "submitted_at": "2026-10-08T11:00:00",
        }
        temp_quiz_store.save_submission("user_dr_a", sub1)
        temp_quiz_store.save_submission("user_dr_a", sub2)
        temp_quiz_store.save_submission("user_dr_b", sub1)

        history_a = temp_quiz_store.get_history("user_dr_a")
        assert len(history_a) == 2
        assert history_a[0]["quiz_id"] == "quiz_001"
        assert history_a[0]["score"] == 100.0
        assert history_a[1]["quiz_id"] == "quiz_002"

        history_b = temp_quiz_store.get_history("user_dr_b")
        assert len(history_b) == 1

        # Clear history for user_dr_a only
        temp_quiz_store.clear_history("user_dr_a")
        assert len(temp_quiz_store.get_history("user_dr_a")) == 0
        assert len(temp_quiz_store.get_history("user_dr_b")) == 1

    def test_clear_all(self, temp_quiz_store):
        temp_quiz_store.save_quiz({"id": "q1", "topic": "t1", "questions": []})
        temp_quiz_store.save_submission("u1", {"quiz_id": "q1", "score": 100})
        temp_quiz_store.clear()

        assert len(temp_quiz_store.list_quizzes()) == 0
        assert len(temp_quiz_store.get_history("u1")) == 0


class TestMappingInterfaces:
    def test_quiz_store_mapping_dict_interface(self, temp_quiz_store):
        mapping: Dict[str, Any] = temp_quiz_store.as_quiz_mapping()

        # Item assignment
        mapping["q100"] = {
            "topic": "tiêu hóa",
            "questions": [{"id": "q1", "stem": "Loét dạ dày"}],
        }
        assert "q100" in mapping
        assert mapping.get("q100") is not None
        assert mapping["q100"]["topic"] == "tiêu hóa"
        assert len(mapping) == 1

        # Iteration
        keys = list(mapping)
        assert keys == ["q100"]

        # Deletion
        del mapping["q100"]
        assert "q100" not in mapping
        assert mapping.get("q100") is None

        # Clear
        mapping["q200"] = {"topic": "thần kinh"}
        mapping.clear()
        assert len(mapping) == 0

    def test_quiz_history_mapping_list_interface(self, temp_quiz_store):
        history = temp_quiz_store.as_history_mapping()

        # append via sequence proxy
        history["user_alice"].append(
            {
                "quiz_id": "q1",
                "topic": "tim mạch",
                "score": 80.0,
                "total": 5,
                "correct": 4,
            }
        )
        assert "user_alice" in history
        assert len(history["user_alice"]) == 1
        assert history.get("user_alice")[0]["score"] == 80.0

        # append second item
        history["user_alice"].append(
            {
                "quiz_id": "q2",
                "topic": "thận",
                "score": 100.0,
                "total": 5,
                "correct": 5,
            }
        )
        assert len(history["user_alice"]) == 2

        # Nonexistent user
        assert history.get("user_nobody", []) == []

        # Clear
        history.clear()
        assert "user_alice" not in history
        assert len(history.get("user_alice", [])) == 0


class TestPersistenceAndConcurrency:
    def test_restart_persistence(self, tmp_path):
        """Verify that data survives recreating the store instance (simulating server restart)."""
        db_file = str(tmp_path / "persistent_quiz.db")

        # Session 1: Create and store
        store_session_1 = QuizStore(db_path=db_file)
        mapping_1 = store_session_1.as_quiz_mapping()
        history_1 = store_session_1.as_history_mapping()

        mapping_1["quiz_restart"] = {
            "topic": "hồi sức cấp cứu",
            "difficulty": "hard",
            "questions": [{"id": "q1", "stem": "CPR protocol"}],
        }
        history_1["user_doc"].append(
            {
                "quiz_id": "quiz_restart",
                "topic": "hồi sức cấp cứu",
                "score": 95.0,
                "total": 10,
                "correct": 9,
            }
        )

        # Simulate server shutdown by dropping references
        del store_session_1
        del mapping_1
        del history_1

        # Session 2: New server startup against the same DB file
        store_session_2 = QuizStore(db_path=db_file)
        mapping_2 = store_session_2.as_quiz_mapping()
        history_2 = store_session_2.as_history_mapping()

        assert "quiz_restart" in mapping_2
        quiz = mapping_2.get("quiz_restart")
        assert quiz is not None
        assert quiz["topic"] == "hồi sức cấp cứu"
        assert quiz["questions"][0]["stem"] == "CPR protocol"

        history = history_2.get("user_doc", [])
        assert len(history) == 1
        assert history[0]["quiz_id"] == "quiz_restart"
        assert history[0]["score"] == 95.0

    def test_wal_mode_enabled(self, temp_quiz_store):
        """Verify PRAGMA journal_mode is WAL for persistent SQLite files."""
        with temp_quiz_store._connect() as conn:
            mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
            assert mode.lower() == "wal"

    def test_concurrent_writes(self, temp_quiz_store):
        """Concurrent writes from multiple threads should succeed without database is locked."""
        def write_worker(idx: int):
            temp_quiz_store.save_quiz(
                {
                    "id": f"quiz_concurrent_{idx}",
                    "topic": f"topic_{idx}",
                    "questions": [],
                }
            )
            temp_quiz_store.save_submission(
                f"user_{idx % 5}",
                {
                    "quiz_id": f"quiz_concurrent_{idx}",
                    "score": idx * 10.0,
                    "total": 10,
                    "correct": idx,
                },
            )
            return True

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(write_worker, i) for i in range(40)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        assert all(results)
        assert len(temp_quiz_store.list_quizzes()) == 40
