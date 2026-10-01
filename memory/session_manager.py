"""Session management for the Medical Education AI Agent.

Provides persistent conversation session lifecycle management backed by
SQLite. Each session groups a series of user/assistant messages together and
tracks lightweight metadata (topic, timestamps) to support personalized,
multi-turn interactions.

Design notes:
    * Connection-per-call pattern for thread safety (no shared connection).
    * Complex values are stored as JSON strings in TEXT columns.
    * The DB path is configurable via the ``SESSION_DB_PATH`` env var.

Example:
    >>> from memory.session_manager import SessionManager
    >>> sm = SessionManager()
    >>> session = sm.create_session(user_id="u1", topic="Suy tim")
    >>> sm.add_message(session.id, "user", "Cơ chế thuốc lợi tiểu?")
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# Default DB path, overridable via environment variable.
_DEFAULT_DB_PATH = os.getenv("SESSION_DB_PATH", "sessions.db")


@dataclass
class Session:
    """A single conversation session.

    Attributes:
        id: Unique session identifier (UUID4 hex string).
        user_id: Identifier of the owning user.
        created_at: Timestamp when the session was created.
        last_active: Timestamp of the most recent activity.
        topic: Detected/assigned topic for the session, if any.
        metadata: Arbitrary JSON-serializable metadata.
        messages: List of message dicts (populated on retrieval).
    """

    id: str
    user_id: str
    created_at: datetime
    last_active: datetime
    topic: Optional[str] = None
    metadata: dict = field(default_factory=dict)
    messages: list = field(default_factory=list)


class SessionManager:
    """Manages conversation sessions with persistence.

    Uses a connection-per-call pattern so instances are safe to share across
    threads. All timestamps are stored as ISO 8601 strings.
    """

    def __init__(self, db_path: str = _DEFAULT_DB_PATH) -> None:
        """Initialize the manager and ensure the schema exists.

        Args:
            db_path: Filesystem path to the SQLite database. Defaults to the
                ``SESSION_DB_PATH`` env var or ``sessions.db``.
        """
        self.db_path = db_path
        self._init_db()
        logger.info("SessionManager initialized with db_path=%s", self.db_path)

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #
    def _connect(self) -> sqlite3.Connection:
        """Open a new SQLite connection with row access by name.

        Returns:
            A configured :class:`sqlite3.Connection`.
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        # Enforce foreign key constraints (for message cascade deletes).
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_db(self) -> None:
        """Create the ``sessions`` and ``messages`` tables if absent."""
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    last_active TEXT NOT NULL,
                    topic TEXT,
                    metadata TEXT NOT NULL DEFAULT '{}'
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (session_id)
                        REFERENCES sessions (id) ON DELETE CASCADE
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_user "
                "ON sessions (user_id, last_active DESC)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_messages_session "
                "ON messages (session_id, created_at)"
            )
            conn.commit()
        logger.debug("Session DB schema ensured at %s", self.db_path)

    @staticmethod
    def _row_to_session(row: sqlite3.Row) -> Session:
        """Convert a ``sessions`` table row into a :class:`Session`."""
        return Session(
            id=row["id"],
            user_id=row["user_id"],
            created_at=datetime.fromisoformat(row["created_at"]),
            last_active=datetime.fromisoformat(row["last_active"]),
            topic=row["topic"],
            metadata=json.loads(row["metadata"] or "{}"),
        )

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def create_session(self, user_id: str, topic: str = None) -> Session:
        """Create a new conversation session.

        Args:
            user_id: Identifier of the user owning the session.
            topic: Optional initial topic.

        Returns:
            The newly created :class:`Session`.
        """
        now = datetime.now()
        session = Session(
            id=uuid.uuid4().hex,
            user_id=user_id,
            created_at=now,
            last_active=now,
            topic=topic,
            metadata={},
        )
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO sessions "
                "(id, user_id, created_at, last_active, topic, metadata) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    session.id,
                    session.user_id,
                    session.created_at.isoformat(),
                    session.last_active.isoformat(),
                    session.topic,
                    json.dumps(session.metadata),
                ),
            )
            conn.commit()
        logger.info("Created session %s for user %s", session.id, user_id)
        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        """Retrieve a session by ID, including its messages.

        Args:
            session_id: The session identifier.

        Returns:
            The :class:`Session` with ``messages`` populated, or ``None`` if
            no such session exists.
        """
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            if row is None:
                logger.debug("Session %s not found", session_id)
                return None
            session = self._row_to_session(row)
            session.messages = self.get_session_history(session_id)
        return session

    def list_sessions(self, user_id: str, limit: int = 20) -> list[Session]:
        """List recent sessions for a user, most recently active first.

        Args:
            user_id: The user identifier.
            limit: Maximum number of sessions to return.

        Returns:
            A list of :class:`Session` (without messages populated).
        """
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM sessions WHERE user_id = ? "
                "ORDER BY last_active DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
        sessions = [self._row_to_session(row) for row in rows]
        logger.debug("Listed %d sessions for user %s", len(sessions), user_id)
        return sessions

    def count_messages_by_session(self, session_ids: list[str]) -> dict[str, int]:
        """Count messages for each of the given sessions in a single query.

        Args:
            session_ids: Session identifiers to count.

        Returns:
            A dict mapping each session id that has messages to its message
            count. Sessions without messages are simply absent.
        """
        if not session_ids:
            return {}
        placeholders = ",".join("?" for _ in session_ids)
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT session_id, COUNT(*) AS message_count FROM messages "
                f"WHERE session_id IN ({placeholders}) GROUP BY session_id",
                session_ids,
            ).fetchall()
        return {row["session_id"]: row["message_count"] for row in rows}

    def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        metadata: dict = None,
    ) -> str:
        """Add a message to a session and refresh the session activity time.

        Args:
            session_id: Target session identifier.
            role: Message role (e.g. ``'user'``, ``'assistant'``, ``'system'``).
            content: Message text content.
            metadata: Optional JSON-serializable metadata.

        Returns:
            The generated message identifier.

        Raises:
            ValueError: If the target session does not exist.
        """
        message_id = uuid.uuid4().hex
        now = datetime.now()
        with self._connect() as conn:
            exists = conn.execute(
                "SELECT 1 FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            if exists is None:
                raise ValueError(f"Session {session_id!r} does not exist")
            conn.execute(
                "INSERT INTO messages "
                "(id, session_id, role, content, metadata, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    message_id,
                    session_id,
                    role,
                    content,
                    json.dumps(metadata or {}),
                    now.isoformat(),
                ),
            )
            conn.execute(
                "UPDATE sessions SET last_active = ? WHERE id = ?",
                (now.isoformat(), session_id),
            )
            conn.commit()
        logger.debug("Added %s message %s to session %s", role, message_id, session_id)
        return message_id

    def get_session_history(
        self, session_id: str, limit: int = 50
    ) -> list[dict]:
        """Get message history for a session in chronological order.

        Args:
            session_id: The session identifier.
            limit: Maximum number of most-recent messages to return.

        Returns:
            A list of message dicts with keys ``id``, ``role``, ``content``,
            ``metadata`` and ``created_at`` (oldest first).
        """
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM ("
                "  SELECT * FROM messages WHERE session_id = ? "
                "  ORDER BY created_at DESC LIMIT ?"
                ") ORDER BY created_at ASC",
                (session_id, limit),
            ).fetchall()
        history = [
            {
                "id": row["id"],
                "role": row["role"],
                "content": row["content"],
                "metadata": json.loads(row["metadata"] or "{}"),
                "created_at": row["created_at"],
            }
            for row in rows
        ]
        return history

    def update_session_topic(self, session_id: str, topic: str) -> None:
        """Update the detected topic for a session.

        Args:
            session_id: The session identifier.
            topic: The new topic value.
        """
        with self._connect() as conn:
            conn.execute(
                "UPDATE sessions SET topic = ?, last_active = ? WHERE id = ?",
                (topic, datetime.now().isoformat(), session_id),
            )
            conn.commit()
        logger.debug("Updated topic of session %s to %r", session_id, topic)

    def reassign_user_sessions(self, old_user_id: str, new_user_id: str) -> int:
        """Move every session owned by ``old_user_id`` to ``new_user_id``.

        Used to fold a browser's anonymous history into a Google account on
        first login.

        Args:
            old_user_id: The current owner of the sessions (e.g. an anonymous id).
            new_user_id: The owner to reassign the sessions to.

        Returns:
            The number of sessions moved.
        """
        with self._connect() as conn:
            cursor = conn.execute(
                "UPDATE sessions SET user_id = ? WHERE user_id = ?",
                (new_user_id, old_user_id),
            )
            conn.commit()
            moved = cursor.rowcount
        logger.info("Reassigned %d sessions from %s to %s", moved, old_user_id, new_user_id)
        return moved

    def delete_session(self, session_id: str) -> None:
        """Delete a session and all of its messages.

        Args:
            session_id: The session identifier to remove.
        """
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM messages WHERE session_id = ?", (session_id,)
            )
            conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            conn.commit()
        logger.info("Deleted session %s and its messages", session_id)

    def cleanup_old_sessions(self, days: int = 90) -> int:
        """Remove sessions (and their messages) older than N days.

        Sessions are considered stale based on their ``last_active`` time.

        Args:
            days: Age threshold in days.

        Returns:
            The number of sessions deleted.
        """
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        with self._connect() as conn:
            stale = conn.execute(
                "SELECT id FROM sessions WHERE last_active < ?", (cutoff,)
            ).fetchall()
            stale_ids = [row["id"] for row in stale]
            if stale_ids:
                placeholders = ",".join("?" for _ in stale_ids)
                conn.execute(
                    f"DELETE FROM messages WHERE session_id IN ({placeholders})",
                    stale_ids,
                )
                conn.execute(
                    f"DELETE FROM sessions WHERE id IN ({placeholders})",
                    stale_ids,
                )
                conn.commit()
        count = len(stale_ids)
        logger.info("Cleaned up %d sessions older than %d days", count, days)
        return count
