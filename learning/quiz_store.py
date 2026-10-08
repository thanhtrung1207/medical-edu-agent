"""Persistent storage for generated quizzes and student quiz submissions.

Backed by SQLite with WAL mode and connection timeouts to support concurrent
access across async and multi-threaded request handlers.

Provides high-level database operations (:class:`QuizStore`) along with
dict-compatible mappings (:class:`QuizStoreMapping`, :class:`QuizHistoryMapping`)
to ensure seamless drop-in backwards compatibility with existing in-memory APIs.
"""

from __future__ import annotations

import collections.abc
import json
import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, Iterator, List, Optional

logger = logging.getLogger(__name__)

_DEFAULT_DB_PATH = "learning.db"


class QuizStore:
    """Manages SQLite persistence for quizzes and user quiz submissions."""

    def __init__(self, db_path: Optional[str] = None) -> None:
        """Initialize the store with an explicit or environment-derived path.

        Args:
            db_path: Path to the SQLite database. If None, resolves dynamically
                from ``QUIZ_DB_PATH`` or ``LEARNING_DB_PATH`` (defaulting to
                ``learning.db``).
        """
        self._explicit_path = db_path
        self._initialized_paths: set[str] = set()

    @property
    def db_path(self) -> str:
        """Dynamic database path resolution."""
        return (
            self._explicit_path
            or os.getenv("QUIZ_DB_PATH")
            or os.getenv("LEARNING_DB_PATH")
            or _DEFAULT_DB_PATH
        )

    # ------------------------------------------------------------------ #
    # Database Connection & Schema
    # ------------------------------------------------------------------ #

    def _connect(self) -> sqlite3.Connection:
        """Open a SQLite connection configured with WAL and busy timeout."""
        current_path = self.db_path
        conn = sqlite3.connect(current_path, timeout=15.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")

        if current_path not in self._initialized_paths:
            self._init_db(conn)
            self._initialized_paths.add(current_path)

        return conn

    def _init_db(self, conn: sqlite3.Connection) -> None:
        """Create the quizzes and quiz_submissions tables if absent."""
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS quizzes (
                id TEXT PRIMARY KEY,
                topic TEXT NOT NULL,
                difficulty TEXT,
                questions TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS quiz_submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                quiz_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                topic TEXT NOT NULL,
                difficulty TEXT,
                score REAL NOT NULL,
                total INTEGER NOT NULL,
                correct INTEGER NOT NULL,
                details TEXT NOT NULL DEFAULT '[]',
                submitted_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_quiz_submissions_user "
            "ON quiz_submissions (user_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_quizzes_created "
            "ON quizzes (created_at)"
        )
        conn.commit()

    # ------------------------------------------------------------------ #
    # Quiz CRUD
    # ------------------------------------------------------------------ #

    def save_quiz(self, quiz: Dict[str, Any]) -> None:
        """Persist or update a quiz item."""
        quiz_id = str(quiz.get("id") or "")
        if not quiz_id:
            raise ValueError("Quiz must have an 'id' field")

        topic = str(quiz.get("topic") or "")
        difficulty = quiz.get("difficulty")
        questions = quiz.get("questions") or []
        created_at = str(quiz.get("created_at") or datetime.now().isoformat())

        questions_json = json.dumps(questions, ensure_ascii=False)

        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO quizzes (id, topic, difficulty, questions, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (quiz_id, topic, difficulty, questions_json, created_at),
            )
            conn.commit()

    def get_quiz(self, quiz_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a quiz by ID."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, topic, difficulty, questions, created_at "
                "FROM quizzes WHERE id = ?",
                (str(quiz_id),),
            ).fetchone()

            if not row:
                return None

            try:
                questions = json.loads(row["questions"])
            except Exception:
                questions = []

            return {
                "id": row["id"],
                "topic": row["topic"],
                "difficulty": row["difficulty"],
                "questions": questions,
                "created_at": row["created_at"],
            }

    def delete_quiz(self, quiz_id: str) -> bool:
        """Delete a quiz by ID. Returns True if a record was deleted."""
        with self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM quizzes WHERE id = ?", (str(quiz_id),)
            )
            conn.commit()
            return cur.rowcount > 0

    def list_quizzes(self) -> List[Dict[str, Any]]:
        """List all quizzes ordered by creation time descending."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, topic, difficulty, questions, created_at "
                "FROM quizzes ORDER BY created_at DESC"
            ).fetchall()

            res: List[Dict[str, Any]] = []
            for r in rows:
                try:
                    questions = json.loads(r["questions"])
                except Exception:
                    questions = []
                res.append(
                    {
                        "id": r["id"],
                        "topic": r["topic"],
                        "difficulty": r["difficulty"],
                        "questions": questions,
                        "created_at": r["created_at"],
                    }
                )
            return res

    def clear_quizzes(self) -> None:
        """Delete all stored quizzes."""
        with self._connect() as conn:
            conn.execute("DELETE FROM quizzes")
            conn.commit()

    # ------------------------------------------------------------------ #
    # Submission / History CRUD
    # ------------------------------------------------------------------ #

    def save_submission(
        self, user_id: str, submission: Dict[str, Any]
    ) -> None:
        """Persist a user's graded quiz submission."""
        user_id_str = str(user_id)
        quiz_id = str(submission.get("quiz_id") or "")
        topic = str(submission.get("topic") or "")
        difficulty = submission.get("difficulty")
        score = float(submission.get("score") or 0.0)
        total = int(submission.get("total") or 0)
        correct = int(submission.get("correct") or 0)
        details = submission.get("details") or []
        submitted_at = str(
            submission.get("submitted_at") or datetime.now().isoformat()
        )

        details_json = json.dumps(details, ensure_ascii=False)

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO quiz_submissions (
                    quiz_id, user_id, topic, difficulty, score, total, correct, details, submitted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    quiz_id,
                    user_id_str,
                    topic,
                    difficulty,
                    score,
                    total,
                    correct,
                    details_json,
                    submitted_at,
                ),
            )
            conn.commit()

    def get_history(self, user_id: str) -> List[Dict[str, Any]]:
        """Retrieve completed quiz submissions for a user."""
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT quiz_id, topic, difficulty, score, total, correct, details, submitted_at
                FROM quiz_submissions
                WHERE user_id = ?
                ORDER BY submitted_at ASC, id ASC
                """,
                (str(user_id),),
            ).fetchall()

            history: List[Dict[str, Any]] = []
            for r in rows:
                history.append(
                    {
                        "quiz_id": r["quiz_id"],
                        "topic": r["topic"],
                        "difficulty": r["difficulty"],
                        "score": float(r["score"]),
                        "total": int(r["total"]),
                        "correct": int(r["correct"]),
                        "submitted_at": r["submitted_at"],
                    }
                )
            return history

    def clear_history(self, user_id: Optional[str] = None) -> None:
        """Clear quiz submissions, either for a specific user or globally."""
        with self._connect() as conn:
            if user_id is not None:
                conn.execute(
                    "DELETE FROM quiz_submissions WHERE user_id = ?",
                    (str(user_id),),
                )
            else:
                conn.execute("DELETE FROM quiz_submissions")
            conn.commit()

    def clear(self) -> None:
        """Clear all quizzes and submissions."""
        self.clear_quizzes()
        self.clear_history()

    # ------------------------------------------------------------------ #
    # Dict-Compatible Mapping Wrappers
    # ------------------------------------------------------------------ #

    def as_quiz_mapping(self) -> QuizStoreMapping:
        """Return a dict-like MutableMapping for quizzes."""
        return QuizStoreMapping(self)

    def as_history_mapping(self) -> QuizHistoryMapping:
        """Return a dict-like MutableMapping for user quiz history."""
        return QuizHistoryMapping(self)


class QuizStoreMapping(collections.abc.MutableMapping):
    """Dict-compatible wrapper for QuizStore quiz items."""

    def __init__(self, store: QuizStore) -> None:
        self._store = store

    def __getitem__(self, key: str) -> Dict[str, Any]:
        val = self._store.get_quiz(str(key))
        if val is None:
            raise KeyError(key)
        return val

    def __setitem__(self, key: str, value: Dict[str, Any]) -> None:
        if not isinstance(value, dict):
            raise TypeError("Quiz value must be a dictionary")
        payload = dict(value)
        if "id" not in payload:
            payload["id"] = str(key)
        self._store.save_quiz(payload)

    def __delitem__(self, key: str) -> None:
        if not self._store.delete_quiz(str(key)):
            raise KeyError(key)

    def __iter__(self) -> Iterator[str]:
        for q in self._store.list_quizzes():
            yield q["id"]

    def __len__(self) -> int:
        return len(self._store.list_quizzes())

    def __contains__(self, key: object) -> bool:
        if not isinstance(key, str):
            return False
        return self._store.get_quiz(key) is not None

    def get(self, key: str, default: Any = None) -> Any:
        val = self._store.get_quiz(str(key))
        return default if val is None else val

    def clear(self) -> None:
        self._store.clear_quizzes()


class _UserQuizHistoryList(collections.abc.MutableSequence):
    """List-like sequence representing a single user's quiz submission history."""

    def __init__(self, user_id: str, store: QuizStore) -> None:
        self._user_id = str(user_id)
        self._store = store

    def _items(self) -> List[Dict[str, Any]]:
        return self._store.get_history(self._user_id)

    def __len__(self) -> int:
        return len(self._items())

    def __getitem__(self, i: Any) -> Any:
        return self._items()[i]

    def __setitem__(self, i: int, value: Dict[str, Any]) -> None:
        raise NotImplementedError("In-place mutation of quiz history item is not supported")

    def __delitem__(self, i: int) -> None:
        raise NotImplementedError("Direct deletion by index is not supported")

    def insert(self, index: int, value: Dict[str, Any]) -> None:
        self.append(value)

    def append(self, item: Dict[str, Any]) -> None:
        self._store.save_submission(self._user_id, item)

    def extend(self, items: Iterable[Dict[str, Any]]) -> None:
        for item in items:
            self.append(item)

    def __iter__(self) -> Iterator[Dict[str, Any]]:
        return iter(self._items())

    def __repr__(self) -> str:
        return repr(self._items())


class QuizHistoryMapping(collections.abc.MutableMapping):
    """Dict-compatible wrapper for user quiz histories."""

    def __init__(self, store: QuizStore) -> None:
        self._store = store

    def __getitem__(self, user_id: str) -> _UserQuizHistoryList:
        return _UserQuizHistoryList(str(user_id), self._store)

    def __setitem__(self, user_id: str, value: Any) -> None:
        self._store.clear_history(str(user_id))
        for item in value:
            self._store.save_submission(str(user_id), item)

    def __delitem__(self, user_id: str) -> None:
        self._store.clear_history(str(user_id))

    def __iter__(self) -> Iterator[str]:
        with self._store._connect() as conn:
            rows = conn.execute(
                "SELECT DISTINCT user_id FROM quiz_submissions"
            ).fetchall()
            return iter([row["user_id"] for row in rows])

    def __len__(self) -> int:
        with self._store._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(DISTINCT user_id) FROM quiz_submissions"
            ).fetchone()
            return int(row[0]) if row else 0

    def __contains__(self, user_id: object) -> bool:
        if not isinstance(user_id, str):
            return False
        return len(self._store.get_history(user_id)) > 0

    def get(self, user_id: str, default: Any = None) -> Any:
        history = self._store.get_history(str(user_id))
        if history:
            return history
        return default if default is not None else []

    def clear(self) -> None:
        self._store.clear_history()
