from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional


@dataclass
class User:
    id: str
    google_sub: str
    email: str
    name: Optional[str]
    avatar_url: Optional[str]
    created_at: str
    last_login_at: str


@dataclass
class RefreshToken:
    id: str
    user_id: str
    token_hash: str
    expires_at: str
    revoked_at: Optional[str]
    created_at: str


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AuthStore:
    """SQLite-backed storage for Google-authenticated users and refresh tokens.

    Shares the same database file as :class:`memory.session_manager.SessionManager`
    so that linking anonymous sessions to a new user is a single-file operation.
    """

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=15.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    google_sub TEXT UNIQUE NOT NULL,
                    email TEXT NOT NULL,
                    name TEXT,
                    avatar_url TEXT,
                    created_at TEXT NOT NULL,
                    last_login_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS refresh_tokens (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id),
                    token_hash TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    revoked_at TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user "
                "ON refresh_tokens (user_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash "
                "ON refresh_tokens (token_hash)"
            )
            conn.commit()

    def get_user_by_google_sub(self, google_sub: str) -> Optional[User]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE google_sub = ?", (google_sub,)
            ).fetchone()
        return self._row_to_user(row) if row else None

    def get_user_by_id(self, user_id: str) -> Optional[User]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE id = ?", (user_id,)
            ).fetchone()
        return self._row_to_user(row) if row else None

    def create_user(
        self,
        google_sub: str,
        email: str,
        name: Optional[str],
        avatar_url: Optional[str],
    ) -> User:
        now = _utc_now_iso()
        user_id = str(uuid.uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO users
                    (id, google_sub, email, name, avatar_url, created_at, last_login_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, google_sub, email, name, avatar_url, now, now),
            )
            conn.commit()
        return User(user_id, google_sub, email, name, avatar_url, now, now)

    def touch_login(self, user_id: str) -> None:
        now = _utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                "UPDATE users SET last_login_at = ? WHERE id = ?", (now, user_id)
            )
            conn.commit()

    def create_refresh_token(
        self, user_id: str, token_hash: str, expires_at: str
    ) -> str:
        token_id = str(uuid.uuid4())
        now = _utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO refresh_tokens
                    (id, user_id, token_hash, expires_at, revoked_at, created_at)
                VALUES (?, ?, ?, ?, NULL, ?)
                """,
                (token_id, user_id, token_hash, expires_at, now),
            )
            conn.commit()
        return token_id

    def get_refresh_token_by_hash(self, token_hash: str) -> Optional[RefreshToken]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM refresh_tokens WHERE token_hash = ?", (token_hash,)
            ).fetchone()
        return self._row_to_refresh_token(row) if row else None

    def revoke_refresh_token(self, token_id: str) -> None:
        now = _utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                "UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?",
                (now, token_id),
            )
            conn.commit()

    def revoke_all_user_tokens(self, user_id: str) -> None:
        now = _utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                "UPDATE refresh_tokens SET revoked_at = ? "
                "WHERE user_id = ? AND revoked_at IS NULL",
                (now, user_id),
            )
            conn.commit()

    @staticmethod
    def _row_to_user(row: sqlite3.Row) -> User:
        return User(
            id=row["id"],
            google_sub=row["google_sub"],
            email=row["email"],
            name=row["name"],
            avatar_url=row["avatar_url"],
            created_at=row["created_at"],
            last_login_at=row["last_login_at"],
        )

    @staticmethod
    def _row_to_refresh_token(row: sqlite3.Row) -> RefreshToken:
        return RefreshToken(
            id=row["id"],
            user_id=row["user_id"],
            token_hash=row["token_hash"],
            expires_at=row["expires_at"],
            revoked_at=row["revoked_at"],
            created_at=row["created_at"],
        )
