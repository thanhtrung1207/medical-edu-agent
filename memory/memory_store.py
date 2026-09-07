"""Long-term memory store for cross-session personalization.

Persists durable, user-scoped memories (preferences, learning style, topic
interests, corrections, bookmarks) that survive across sessions. These memories
feed the :class:`~memory.context_builder.ContextBuilder` to personalize agent
responses.

Design notes:
    * SQLite backed, connection-per-call for thread safety.
    * Values are stored as JSON strings in a TEXT column.
    * A ``(user_id, memory_type, key)`` triple uniquely identifies an entry;
      storing again upserts (updates value/confidence).
    * A simple time-based decay reduces confidence of stale memories so they do
      not dominate context indefinitely.

The DB path is configurable via the ``MEMORY_DB_PATH`` env var.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Optional

from memory.learning_memory import normalize_topic

logger = logging.getLogger(__name__)

# Default DB path, overridable via environment variable.
_DEFAULT_DB_PATH = os.getenv("MEMORY_DB_PATH", "memory.db")

# Known memory types (informational; storage is not restricted to these).
MEMORY_TYPES = (
    "preference",
    "learning_style",
    "topic_interest",
    "correction",
    "bookmark",
    "learning_goal",
    "weak_area",
)


@dataclass
class MemoryEntry:
    """A single long-term memory record.

    Attributes:
        id: Row id (``None`` before persistence).
        user_id: Owning user identifier.
        memory_type: Category such as ``'preference'`` or ``'bookmark'``.
        key: Sub-key within the type (e.g. ``'explanation_style'``).
        value: JSON-serialized value payload.
        confidence: Certainty score in ``[0.0, 1.0]``.
        created_at: Creation timestamp.
        updated_at: Last update timestamp.
        access_count: Number of times this memory has been recalled.
    """

    id: Optional[int]
    user_id: str
    memory_type: str
    key: str
    value: str
    confidence: float
    created_at: datetime
    updated_at: datetime
    access_count: int

    def parsed_value(self) -> Any:
        """Return the JSON-decoded value payload.

        Returns:
            The decoded Python object, or the raw string if it is not valid
            JSON.
        """
        try:
            return json.loads(self.value)
        except (json.JSONDecodeError, TypeError):
            return self.value


class MemoryStore:
    """Persistent long-term memory for user personalization.

    Uses a connection-per-call pattern, making instances safe to share across
    threads.
    """

    def __init__(self, db_path: str = _DEFAULT_DB_PATH) -> None:
        """Initialize the store and ensure the schema exists.

        Args:
            db_path: Filesystem path to the SQLite database. Defaults to the
                ``MEMORY_DB_PATH`` env var or ``memory.db``.
        """
        self.db_path = db_path
        self._init_db()
        logger.info("MemoryStore initialized with db_path=%s", self.db_path)

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #
    def _connect(self) -> sqlite3.Connection:
        """Open a new SQLite connection with row access by name."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        """Create the ``memories`` table and indexes if absent."""
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    memory_type TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    confidence REAL NOT NULL DEFAULT 1.0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    access_count INTEGER NOT NULL DEFAULT 0,
                    UNIQUE (user_id, memory_type, key)
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_memories_user_type "
                "ON memories (user_id, memory_type)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_memories_user_updated "
                "ON memories (user_id, updated_at DESC)"
            )
            conn.commit()
        logger.debug("Memory DB schema ensured at %s", self.db_path)

    @staticmethod
    def _row_to_entry(row: sqlite3.Row) -> MemoryEntry:
        """Convert a ``memories`` row into a :class:`MemoryEntry`."""
        return MemoryEntry(
            id=row["id"],
            user_id=row["user_id"],
            memory_type=row["memory_type"],
            key=row["key"],
            value=row["value"],
            confidence=row["confidence"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            access_count=row["access_count"],
        )

    # ------------------------------------------------------------------ #
    # Core store / recall
    # ------------------------------------------------------------------ #
    def store(
        self,
        user_id: str,
        memory_type: str,
        key: str,
        value: Any,
        confidence: float = 1.0,
    ) -> MemoryEntry:
        """Store or update (upsert) a memory entry.

        If an entry with the same ``(user_id, memory_type, key)`` already
        exists, its value, confidence and ``updated_at`` are refreshed while
        the original ``created_at`` and ``access_count`` are preserved.

        Args:
            user_id: Owning user identifier.
            memory_type: Category of the memory.
            key: Sub-key within the type.
            value: Any JSON-serializable value.
            confidence: Certainty score, clamped to ``[0.0, 1.0]``.

        Returns:
            The stored :class:`MemoryEntry`.
        """
        confidence = max(0.0, min(1.0, float(confidence)))
        serialized = json.dumps(value, ensure_ascii=False)
        now = datetime.now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO memories
                    (user_id, memory_type, key, value, confidence,
                     created_at, updated_at, access_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                ON CONFLICT (user_id, memory_type, key) DO UPDATE SET
                    value = excluded.value,
                    confidence = excluded.confidence,
                    updated_at = excluded.updated_at
                """,
                (
                    user_id,
                    memory_type,
                    key,
                    serialized,
                    confidence,
                    now.isoformat(),
                    now.isoformat(),
                ),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM memories "
                "WHERE user_id = ? AND memory_type = ? AND key = ?",
                (user_id, memory_type, key),
            ).fetchone()
        logger.debug(
            "Stored memory user=%s type=%s key=%s conf=%.2f",
            user_id,
            memory_type,
            key,
            confidence,
        )
        return self._row_to_entry(row)

    def recall(
        self,
        user_id: str,
        memory_type: str = None,
        key: str = None,
    ) -> list[MemoryEntry]:
        """Recall memories, optionally filtered by type and key.

        Recalled entries have their ``access_count`` incremented to track
        usage (feeding the decay heuristic).

        Args:
            user_id: Owning user identifier.
            memory_type: Optional type filter.
            key: Optional key filter.

        Returns:
            Matching memories ordered by confidence then recency (desc).
        """
        query = "SELECT * FROM memories WHERE user_id = ?"
        params: list[Any] = [user_id]
        if memory_type is not None:
            query += " AND memory_type = ?"
            params.append(memory_type)
        if key is not None:
            query += " AND key = ?"
            params.append(key)
        query += " ORDER BY confidence DESC, updated_at DESC"

        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
            ids = [row["id"] for row in rows]
            if ids:
                placeholders = ",".join("?" for _ in ids)
                conn.execute(
                    f"UPDATE memories SET access_count = access_count + 1 "
                    f"WHERE id IN ({placeholders})",
                    ids,
                )
                conn.commit()
        entries = [self._row_to_entry(row) for row in rows]
        logger.debug(
            "Recalled %d memories for user=%s type=%s key=%s",
            len(entries),
            user_id,
            memory_type,
            key,
        )
        return entries

    def recall_all(self, user_id: str) -> dict:
        """Get all memories for a user, organized by type.

        Note:
            Unlike :meth:`recall`, this does not increment access counts; it is
            intended for read-only inspection / context building.

        Args:
            user_id: Owning user identifier.

        Returns:
            Mapping of ``memory_type`` to a list of :class:`MemoryEntry`.
        """
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM memories WHERE user_id = ? "
                "ORDER BY confidence DESC, updated_at DESC",
                (user_id,),
            ).fetchall()
        organized: dict[str, list[MemoryEntry]] = {}
        for row in rows:
            entry = self._row_to_entry(row)
            organized.setdefault(entry.memory_type, []).append(entry)
        logger.debug(
            "Recalled all memories for user=%s across %d types",
            user_id,
            len(organized),
        )
        return organized

    def list_for_user(self, user_id: str) -> list[MemoryEntry]:
        """List a user's memories by most recent update without recording access."""
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT * FROM memories WHERE user_id = ? "
                "ORDER BY updated_at DESC, id DESC",
                (user_id,),
            ).fetchall()
        return [self._row_to_entry(row) for row in rows]

    # ------------------------------------------------------------------ #
    # Maintenance
    # ------------------------------------------------------------------ #
    def update_confidence(self, memory_id: int, new_confidence: float) -> None:
        """Update the confidence score for a memory.

        Args:
            memory_id: Row id of the memory.
            new_confidence: New confidence, clamped to ``[0.0, 1.0]``.
        """
        new_confidence = max(0.0, min(1.0, float(new_confidence)))
        with self._connect() as conn:
            conn.execute(
                "UPDATE memories SET confidence = ?, updated_at = ? WHERE id = ?",
                (new_confidence, datetime.now().isoformat(), memory_id),
            )
            conn.commit()
        logger.debug(
            "Updated confidence of memory %s to %.2f", memory_id, new_confidence
        )

    def forget(self, memory_id: int) -> None:
        """Remove a specific memory entry by id.

        Args:
            memory_id: Row id of the memory to delete.
        """
        with self._connect() as conn:
            conn.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
            conn.commit()
        logger.info("Forgot memory %s", memory_id)

    def forget_for_user(self, memory_id: int, user_id: str) -> bool:
        """Delete one memory only when it belongs to the supplied user."""
        with closing(self._connect()) as conn:
            with conn:
                cursor = conn.execute(
                    "DELETE FROM memories WHERE id = ? AND user_id = ?",
                    (memory_id, user_id),
                )
                deleted = cursor.rowcount
        return deleted == 1

    def delete_all_for_user(self, user_id: str) -> int:
        """Delete every memory belonging to the supplied user."""
        with closing(self._connect()) as conn:
            with conn:
                cursor = conn.execute(
                    "DELETE FROM memories WHERE user_id = ?", (user_id,)
                )
                deleted = cursor.rowcount
        return deleted

    def forget_by_key(self, user_id: str, memory_type: str, key: str) -> None:
        """Remove memories matching user/type/key.

        Args:
            user_id: Owning user identifier.
            memory_type: Memory category.
            key: Sub-key within the type.
        """
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM memories "
                "WHERE user_id = ? AND memory_type = ? AND key = ?",
                (user_id, memory_type, key),
            )
            conn.commit()
        logger.info(
            "Forgot memory user=%s type=%s key=%s", user_id, memory_type, key
        )

    # ------------------------------------------------------------------ #
    # Preferences convenience API
    # ------------------------------------------------------------------ #
    def get_user_preferences(self, user_id: str) -> dict:
        """Get a user's learning preferences as a flat dict.

        Args:
            user_id: Owning user identifier.

        Returns:
            Mapping of preference key to decoded value.
        """
        entries = self.recall(user_id, memory_type="preference")
        prefs = {entry.key: entry.parsed_value() for entry in entries}
        logger.debug("Loaded %d preferences for user=%s", len(prefs), user_id)
        return prefs

    def set_user_preference(self, user_id: str, key: str, value: Any) -> None:
        """Set a user preference.

        Args:
            user_id: Owning user identifier.
            key: Preference key.
            value: Any JSON-serializable value.
        """
        self.store(user_id, "preference", key, value, confidence=1.0)

    # ------------------------------------------------------------------ #
    # Bookmarks
    # ------------------------------------------------------------------ #
    def bookmark_response(self, user_id: str, message_id: str, topic: str) -> None:
        """Bookmark a response using only its ID and normalized dental topic."""
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

    def get_bookmarks(self, user_id: str, topic: str = None) -> list[MemoryEntry]:
        """Get a user's bookmarked responses, optionally filtered by topic.

        Args:
            user_id: Owning user identifier.
            topic: Optional topic filter (case-insensitive substring match).

        Returns:
            A list of bookmark :class:`MemoryEntry`.
        """
        entries = self.recall(user_id, memory_type="bookmark")
        if topic:
            topic_lc = topic.lower()
            entries = [
                entry
                for entry in entries
                if topic_lc in str(entry.parsed_value().get("topic", "")).lower()
            ]
        logger.debug(
            "Found %d bookmarks for user=%s topic=%r", len(entries), user_id, topic
        )
        return entries

    # ------------------------------------------------------------------ #
    # Decay
    # ------------------------------------------------------------------ #
    def decay_old_memories(self, days: int = 180, factor: float = 0.9) -> int:
        """Reduce confidence of old, unused memories.

        Any memory whose ``updated_at`` is older than ``days`` has its
        confidence multiplied by ``factor``. This gradually demotes stale
        memories so recent/relevant ones dominate context. Bookmarks and
        explicit corrections are preserved (not decayed).

        Args:
            days: Age threshold in days based on ``updated_at``.
            factor: Multiplicative decay factor in ``[0.0, 1.0]``.

        Returns:
            The number of memories affected.
        """
        factor = max(0.0, min(1.0, float(factor)))
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id FROM memories "
                "WHERE updated_at < ? AND memory_type NOT IN ('bookmark', 'correction')",
                (cutoff,),
            ).fetchall()
            ids = [row["id"] for row in rows]
            if ids:
                placeholders = ",".join("?" for _ in ids)
                conn.execute(
                    f"UPDATE memories SET confidence = confidence * ? "
                    f"WHERE id IN ({placeholders})",
                    [factor, *ids],
                )
                conn.commit()
        count = len(ids)
        logger.info(
            "Decayed %d memories older than %d days by factor %.2f",
            count,
            days,
            factor,
        )
        return count
