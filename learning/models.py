"""Database models and schema management for the self-learning module.

Uses the sqlite3 standard library (no ORM) with a connection-per-call pattern
for thread safety. The database file path is configurable via the
``LEARNING_DB_PATH`` environment variable (default: ``learning.db``).
"""

from __future__ import annotations

import logging
import os
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Iterator, List, Optional

logger = logging.getLogger(__name__)

# ISO 8601 format used to persist datetimes as TEXT in SQLite.
_DT_FORMAT = "%Y-%m-%dT%H:%M:%S.%f"


def _dt_to_str(value: datetime) -> str:
    """Serialize a datetime to an ISO 8601 string for storage."""
    return value.strftime(_DT_FORMAT)


def _str_to_dt(value: Optional[str]) -> Optional[datetime]:
    """Deserialize an ISO 8601 string back into a datetime.

    Returns ``None`` when the input is empty/None. Falls back gracefully when
    the value lacks microseconds.
    """
    if not value:
        return None
    try:
        return datetime.strptime(value, _DT_FORMAT)
    except ValueError:
        try:
            return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S")
        except ValueError:
            logger.warning("Could not parse datetime value: %s", value)
            return None


@dataclass
class Feedback:
    """User feedback on a single agent response."""

    id: Optional[int]
    session_id: str
    user_id: str
    message_id: str
    rating: int  # 1-5
    correction: Optional[str]
    created_at: datetime


@dataclass
class UserProgress:
    """Per-user, per-topic mastery and spaced-repetition state."""

    id: Optional[int]
    user_id: str
    topic: str
    mastery_level: float  # 0.0 - 1.0
    last_reviewed: datetime
    next_review: datetime  # spaced repetition
    attempts: int
    correct_count: int


@dataclass
class KnowledgeUpdate:
    """A record of a change applied to the knowledge base."""

    id: Optional[int]
    source_document: str
    update_type: str  # 'addition', 'correction', 'removal'
    content: str
    applied_at: datetime
    applied_by: str  # 'user', 'auto', 'expert'


@dataclass
class KnownError:
    """A recorded mistake and its correction, used to avoid repetition."""

    id: Optional[int]
    topic: str
    incorrect_claim: str
    correct_info: str
    source: str
    created_at: datetime


class LearningDatabase:
    """Manages the SQLite database for learning data.

    A new connection is opened for every operation (connection-per-call) so the
    database can be safely shared across threads. All datetimes are stored as
    ISO 8601 TEXT columns.
    """

    def __init__(self, db_path: Optional[str] = None) -> None:
        """Initialize the database and create tables if needed.

        Args:
            db_path: Optional explicit path to the SQLite file. When omitted,
                the ``LEARNING_DB_PATH`` environment variable is used, falling
                back to ``learning.db``.
        """
        self.db_path = db_path or os.getenv("LEARNING_DB_PATH", "learning.db")
        self._init_db()

    # ------------------------------------------------------------------
    # Connection management
    # ------------------------------------------------------------------
    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        """Yield a short-lived connection with row access by column name.

        The connection is committed on success and always closed. Enables
        foreign keys for data integrity.
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        try:
            yield conn
            conn.commit()
        except sqlite3.Error:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self) -> None:
        """Create the feedback, user_progress, knowledge_updates and
        known_errors tables if they do not already exist."""
        try:
            with self._connect() as conn:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS feedback (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        message_id TEXT NOT NULL,
                        rating INTEGER NOT NULL,
                        correction TEXT,
                        created_at TEXT NOT NULL
                    );

                    CREATE INDEX IF NOT EXISTS idx_feedback_user
                        ON feedback(user_id);

                    CREATE TABLE IF NOT EXISTS user_progress (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT NOT NULL,
                        topic TEXT NOT NULL,
                        mastery_level REAL NOT NULL DEFAULT 0.0,
                        last_reviewed TEXT NOT NULL,
                        next_review TEXT NOT NULL,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        correct_count INTEGER NOT NULL DEFAULT 0,
                        UNIQUE(user_id, topic)
                    );

                    CREATE INDEX IF NOT EXISTS idx_progress_user
                        ON user_progress(user_id);

                    CREATE TABLE IF NOT EXISTS knowledge_updates (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        source_document TEXT NOT NULL,
                        update_type TEXT NOT NULL,
                        content TEXT NOT NULL,
                        applied_at TEXT NOT NULL,
                        applied_by TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS known_errors (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        topic TEXT NOT NULL,
                        incorrect_claim TEXT NOT NULL,
                        correct_info TEXT NOT NULL,
                        source TEXT NOT NULL,
                        created_at TEXT NOT NULL
                    );

                    CREATE INDEX IF NOT EXISTS idx_errors_topic
                        ON known_errors(topic);
                    """
                )
            logger.info("Learning database initialized at %s", self.db_path)
        except sqlite3.Error as exc:
            logger.error("Failed to initialize learning database: %s", exc)
            raise

    # ------------------------------------------------------------------
    # Feedback CRUD
    # ------------------------------------------------------------------
    def insert_feedback(self, feedback: Feedback) -> Feedback:
        """Insert a feedback row and return it with the assigned id."""
        try:
            with self._connect() as conn:
                cur = conn.execute(
                    """
                    INSERT INTO feedback
                        (session_id, user_id, message_id, rating, correction,
                         created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        feedback.session_id,
                        feedback.user_id,
                        feedback.message_id,
                        feedback.rating,
                        feedback.correction,
                        _dt_to_str(feedback.created_at),
                    ),
                )
                feedback.id = cur.lastrowid
                return feedback
        except sqlite3.Error as exc:
            logger.error("Failed to insert feedback: %s", exc)
            raise

    def get_feedback_by_user(self, user_id: str) -> List[Feedback]:
        """Return all feedback rows for a user (newest first)."""
        try:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT * FROM feedback WHERE user_id = ? "
                    "ORDER BY created_at DESC",
                    (user_id,),
                ).fetchall()
                return [self._row_to_feedback(r) for r in rows]
        except sqlite3.Error as exc:
            logger.error("Failed to fetch feedback for %s: %s", user_id, exc)
            return []

    def get_all_feedback(self) -> List[Feedback]:
        """Return every feedback row (newest first)."""
        try:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT * FROM feedback ORDER BY created_at DESC"
                ).fetchall()
                return [self._row_to_feedback(r) for r in rows]
        except sqlite3.Error as exc:
            logger.error("Failed to fetch all feedback: %s", exc)
            return []

    # ------------------------------------------------------------------
    # UserProgress CRUD
    # ------------------------------------------------------------------
    def upsert_progress(self, progress: UserProgress) -> UserProgress:
        """Insert or update the progress row for a (user_id, topic) pair."""
        try:
            with self._connect() as conn:
                cur = conn.execute(
                    """
                    INSERT INTO user_progress
                        (user_id, topic, mastery_level, last_reviewed,
                         next_review, attempts, correct_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, topic) DO UPDATE SET
                        mastery_level = excluded.mastery_level,
                        last_reviewed = excluded.last_reviewed,
                        next_review = excluded.next_review,
                        attempts = excluded.attempts,
                        correct_count = excluded.correct_count
                    """,
                    (
                        progress.user_id,
                        progress.topic,
                        progress.mastery_level,
                        _dt_to_str(progress.last_reviewed),
                        _dt_to_str(progress.next_review),
                        progress.attempts,
                        progress.correct_count,
                    ),
                )
                if progress.id is None:
                    progress.id = cur.lastrowid
                return progress
        except sqlite3.Error as exc:
            logger.error("Failed to upsert progress: %s", exc)
            raise

    def get_progress(
        self, user_id: str, topic: str
    ) -> Optional[UserProgress]:
        """Return the progress row for a (user_id, topic) pair, or None."""
        try:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT * FROM user_progress "
                    "WHERE user_id = ? AND topic = ?",
                    (user_id, topic),
                ).fetchone()
                return self._row_to_progress(row) if row else None
        except sqlite3.Error as exc:
            logger.error("Failed to fetch progress: %s", exc)
            return None

    def get_all_progress(self, user_id: str) -> List[UserProgress]:
        """Return every progress row for a user."""
        try:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT * FROM user_progress WHERE user_id = ?",
                    (user_id,),
                ).fetchall()
                return [self._row_to_progress(r) for r in rows]
        except sqlite3.Error as exc:
            logger.error("Failed to fetch progress list: %s", exc)
            return []

    # ------------------------------------------------------------------
    # KnowledgeUpdate CRUD
    # ------------------------------------------------------------------
    def insert_knowledge_update(
        self, update: KnowledgeUpdate
    ) -> KnowledgeUpdate:
        """Insert a knowledge update row and return it with its id."""
        try:
            with self._connect() as conn:
                cur = conn.execute(
                    """
                    INSERT INTO knowledge_updates
                        (source_document, update_type, content, applied_at,
                         applied_by)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        update.source_document,
                        update.update_type,
                        update.content,
                        _dt_to_str(update.applied_at),
                        update.applied_by,
                    ),
                )
                update.id = cur.lastrowid
                return update
        except sqlite3.Error as exc:
            logger.error("Failed to insert knowledge update: %s", exc)
            raise

    def get_knowledge_updates_since(
        self, since: Optional[datetime] = None
    ) -> List[KnowledgeUpdate]:
        """Return knowledge updates applied on/after ``since`` (newest first).

        When ``since`` is None, all updates are returned.
        """
        try:
            with self._connect() as conn:
                if since is None:
                    rows = conn.execute(
                        "SELECT * FROM knowledge_updates "
                        "ORDER BY applied_at DESC"
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT * FROM knowledge_updates "
                        "WHERE applied_at >= ? ORDER BY applied_at DESC",
                        (_dt_to_str(since),),
                    ).fetchall()
                return [self._row_to_update(r) for r in rows]
        except sqlite3.Error as exc:
            logger.error("Failed to fetch knowledge updates: %s", exc)
            return []

    def get_knowledge_updates_by_type(
        self, update_type: str
    ) -> List[KnowledgeUpdate]:
        """Return all knowledge updates of a given type (newest first)."""
        try:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT * FROM knowledge_updates "
                    "WHERE update_type = ? ORDER BY applied_at DESC",
                    (update_type,),
                ).fetchall()
                return [self._row_to_update(r) for r in rows]
        except sqlite3.Error as exc:
            logger.error("Failed to fetch updates by type: %s", exc)
            return []

    # ------------------------------------------------------------------
    # KnownError CRUD
    # ------------------------------------------------------------------
    def insert_known_error(self, error: KnownError) -> KnownError:
        """Insert a known error row and return it with its id."""
        try:
            with self._connect() as conn:
                cur = conn.execute(
                    """
                    INSERT INTO known_errors
                        (topic, incorrect_claim, correct_info, source,
                         created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        error.topic,
                        error.incorrect_claim,
                        error.correct_info,
                        error.source,
                        _dt_to_str(error.created_at),
                    ),
                )
                error.id = cur.lastrowid
                return error
        except sqlite3.Error as exc:
            logger.error("Failed to insert known error: %s", exc)
            raise

    def get_known_errors(
        self, topic: Optional[str] = None
    ) -> List[KnownError]:
        """Return known errors, optionally filtered by topic (newest first)."""
        try:
            with self._connect() as conn:
                if topic is None:
                    rows = conn.execute(
                        "SELECT * FROM known_errors ORDER BY created_at DESC"
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT * FROM known_errors WHERE topic = ? "
                        "ORDER BY created_at DESC",
                        (topic,),
                    ).fetchall()
                return [self._row_to_error(r) for r in rows]
        except sqlite3.Error as exc:
            logger.error("Failed to fetch known errors: %s", exc)
            return []

    # ------------------------------------------------------------------
    # Row -> dataclass mappers
    # ------------------------------------------------------------------
    @staticmethod
    def _row_to_feedback(row: sqlite3.Row) -> Feedback:
        return Feedback(
            id=row["id"],
            session_id=row["session_id"],
            user_id=row["user_id"],
            message_id=row["message_id"],
            rating=row["rating"],
            correction=row["correction"],
            created_at=_str_to_dt(row["created_at"]),
        )

    @staticmethod
    def _row_to_progress(row: sqlite3.Row) -> UserProgress:
        return UserProgress(
            id=row["id"],
            user_id=row["user_id"],
            topic=row["topic"],
            mastery_level=row["mastery_level"],
            last_reviewed=_str_to_dt(row["last_reviewed"]),
            next_review=_str_to_dt(row["next_review"]),
            attempts=row["attempts"],
            correct_count=row["correct_count"],
        )

    @staticmethod
    def _row_to_update(row: sqlite3.Row) -> KnowledgeUpdate:
        return KnowledgeUpdate(
            id=row["id"],
            source_document=row["source_document"],
            update_type=row["update_type"],
            content=row["content"],
            applied_at=_str_to_dt(row["applied_at"]),
            applied_by=row["applied_by"],
        )

    @staticmethod
    def _row_to_error(row: sqlite3.Row) -> KnownError:
        return KnownError(
            id=row["id"],
            topic=row["topic"],
            incorrect_claim=row["incorrect_claim"],
            correct_info=row["correct_info"],
            source=row["source"],
            created_at=_str_to_dt(row["created_at"]),
        )
