# Google OIDC Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Google Sign-In (OIDC) to medical-edu-agent so chat/session history can follow a durable user account instead of a browser-local anonymous UUID, while keeping all existing anonymous functionality working unchanged.

**Architecture:** FastAPI backend (Hugging Face Space) owns the full OAuth Authorization Code flow via Authlib and issues its own short-lived JWT access token + rotating opaque refresh token, both carried in httpOnly/Secure/SameSite=None cookies scoped to the backend domain. Next.js frontend (Vercel) never sees Google's client secret or raw tokens; it calls backend endpoints with `credentials: "include"` and auto-refreshes on 401.

**Tech Stack:** FastAPI, Authlib (OIDC client), PyJWT (access tokens), Starlette `SessionMiddleware` (OAuth handshake state/nonce), SQLite (same `sessions.db` file as existing `SessionManager`), Next.js App Router, React Context, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-google-oidc-auth-design.md`

---

## File Structure Overview

**New backend files:**
- `auth/__init__.py` — package exports
- `auth/store.py` — `AuthStore` (SQLite `users` + `refresh_tokens` tables), `User`, `RefreshToken` dataclasses
- `auth/tokens.py` — JWT access-token encode/decode, refresh-token generation/hashing
- `auth/exceptions.py` — `AuthError` taxonomy (one class per error code in the spec)
- `auth/service.py` — `AuthService` (find-or-create user, anonymous-session linking, token rotation, reuse detection)
- `auth/oidc.py` — Authlib `OAuth` client registered for Google
- `api/auth.py` — router: `/auth/google/login`, `/auth/google/callback`, `/auth/refresh`, `/auth/logout`, `/auth/me`

**Modified backend files:**
- `requirements.txt` — add `Authlib`, `PyJWT`, `itsdangerous`
- `.env.example` — add OAuth/JWT/frontend env vars
- `memory/session_manager.py` — add `reassign_user_sessions`
- `api/models.py` — add `UserResponse`
- `api/deps.py` — wire `Services.auth_store`/`auth_service`, add `get_current_user`/`get_current_user_optional`
- `main.py` — add `SessionMiddleware`, extend CORS origins, register `auth.router`

**New frontend files:**
- `frontend/src/lib/http.ts` — `apiFetch` (credentials + single-flight refresh-and-retry on 401)
- `frontend/src/contexts/AuthContext.tsx` — `AuthProvider`, `useAuth()`
- `frontend/src/app/auth/callback/page.tsx` — post-login/error landing page

**Modified frontend files:**
- `frontend/src/lib/api.ts` — route backend calls through `apiFetch`
- `frontend/src/app/layout.tsx` — wrap `AppShell` with `AuthProvider`
- `frontend/src/components/layout/Header.tsx` — login/logout UI
- `frontend/src/components/layout/Header.test.tsx` — wrap renders with `AuthProvider`, add login/logout cases
- `frontend/src/components/layout/SessionList.tsx` — resolve `user_id` from `useAuth()` first
- `frontend/src/components/layout/SessionList.test.tsx` — wrap renders with `AuthProvider`, add authed-id case

**Backend tests (new):**
- `tests/test_auth_store.py`, `tests/test_auth_tokens.py`, `tests/test_auth_exceptions.py`, `tests/test_session_reassign.py`, `tests/test_auth_service.py`, `tests/test_auth_api.py`

**Frontend tests (new):**
- `frontend/src/lib/http.test.ts`, `frontend/src/contexts/AuthContext.test.tsx`, `frontend/src/app/auth/callback/page.test.tsx`

---

## Task 1: Backend dependencies and environment variables

**Files:**
- Modify: `requirements.txt`
- Modify: `.env.example`

- [ ] **Step 1: Add OAuth/JWT libraries to `requirements.txt`**

Append after the existing `httpx>=0.25.0` line (before the `# Testing & evaluation` section):

```
Authlib>=1.3.0
PyJWT>=2.8.0
itsdangerous>=2.1.2
```

- [ ] **Step 2: Install the new dependencies**

Run: `pip install -r requirements.txt`
Expected: Authlib, PyJWT, and itsdangerous install without errors.

- [ ] **Step 3: Add auth env vars to `.env.example`**

Append a new section after `# Session DB`:

```
# Google OAuth (OIDC) — create at https://console.cloud.google.com/apis/credentials
# Authorized redirect URI must exactly match GOOGLE_OAUTH_REDIRECT_URI below.
GOOGLE_OAUTH_CLIENT_ID=your_google_oauth_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/auth/google/callback

# Signs JWT access tokens and the OAuth handshake session cookie — use a long random string in production
JWT_SECRET_KEY=change_me_to_a_random_64_char_secret

# Where the backend redirects the browser after /auth/google/callback
FRONTEND_URL=http://localhost:3000
```

- [ ] **Step 4: Commit**

```bash
git add requirements.txt .env.example
git commit -m "chore: add Google OIDC dependencies and env vars"
```

---

## Task 2: `AuthStore` — users and refresh tokens persistence

**Files:**
- Create: `auth/__init__.py`
- Create: `auth/store.py`
- Test: `tests/test_auth_store.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_auth_store.py`:

```python
import pytest

from auth.store import AuthStore


@pytest.fixture
def auth_store(tmp_path):
    return AuthStore(str(tmp_path / "sessions.db"))


def test_create_and_fetch_user_by_google_sub(auth_store):
    user = auth_store.create_user("google-sub-1", "a@example.com", "A", None)
    fetched = auth_store.get_user_by_google_sub("google-sub-1")
    assert fetched is not None
    assert fetched.id == user.id
    assert fetched.email == "a@example.com"


def test_get_user_by_google_sub_returns_none_when_missing(auth_store):
    assert auth_store.get_user_by_google_sub("missing") is None


def test_get_user_by_id(auth_store):
    user = auth_store.create_user("google-sub-2", "b@example.com", "B", None)
    assert auth_store.get_user_by_id(user.id).email == "b@example.com"


def test_get_user_by_id_returns_none_when_missing(auth_store):
    assert auth_store.get_user_by_id("missing") is None


def test_touch_login_updates_last_login_at(auth_store):
    user = auth_store.create_user("google-sub-3", "c@example.com", "C", None)
    auth_store.touch_login(user.id)
    refreshed = auth_store.get_user_by_id(user.id)
    assert refreshed.last_login_at >= user.last_login_at


def test_create_and_fetch_refresh_token_by_hash(auth_store):
    user = auth_store.create_user("google-sub-4", "d@example.com", "D", None)
    token_id = auth_store.create_refresh_token(
        user.id, "hash-1", "2099-01-01T00:00:00+00:00"
    )
    fetched = auth_store.get_refresh_token_by_hash("hash-1")
    assert fetched is not None
    assert fetched.id == token_id
    assert fetched.revoked_at is None


def test_get_refresh_token_by_hash_returns_none_when_missing(auth_store):
    assert auth_store.get_refresh_token_by_hash("missing") is None


def test_revoke_refresh_token_sets_revoked_at(auth_store):
    user = auth_store.create_user("google-sub-5", "e@example.com", "E", None)
    token_id = auth_store.create_refresh_token(
        user.id, "hash-2", "2099-01-01T00:00:00+00:00"
    )
    auth_store.revoke_refresh_token(token_id)
    assert auth_store.get_refresh_token_by_hash("hash-2").revoked_at is not None


def test_revoke_all_user_tokens_revokes_only_active_ones(auth_store):
    user = auth_store.create_user("google-sub-6", "f@example.com", "F", None)
    t1 = auth_store.create_refresh_token(
        user.id, "hash-3", "2099-01-01T00:00:00+00:00"
    )
    auth_store.create_refresh_token(user.id, "hash-4", "2099-01-01T00:00:00+00:00")
    auth_store.revoke_refresh_token(t1)

    auth_store.revoke_all_user_tokens(user.id)

    assert auth_store.get_refresh_token_by_hash("hash-3").revoked_at is not None
    assert auth_store.get_refresh_token_by_hash("hash-4").revoked_at is not None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_auth_store.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'auth'`

- [ ] **Step 3: Create the `auth` package and `AuthStore`**

Create `auth/__init__.py`:

```python
"""Google OIDC authentication for the Medical Education AI Agent.

Provides persistent Google-linked user accounts and rotating refresh tokens
on top of the same SQLite file used by :class:`memory.session_manager.SessionManager`.
"""

from __future__ import annotations

from auth.exceptions import (
    AuthError,
    AuthGoogleDeniedError,
    AuthInvalidIdTokenError,
    AuthRefreshInvalidError,
    AuthRefreshReuseError,
    AuthStateMismatchError,
    AuthTokenExchangeError,
)
from auth.service import AuthService
from auth.store import AuthStore, RefreshToken, User

__all__ = [
    "AuthStore",
    "User",
    "RefreshToken",
    "AuthService",
    "AuthError",
    "AuthStateMismatchError",
    "AuthGoogleDeniedError",
    "AuthTokenExchangeError",
    "AuthInvalidIdTokenError",
    "AuthRefreshInvalidError",
    "AuthRefreshReuseError",
]
```

Create `auth/store.py`:

```python
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
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
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
```

`auth/__init__.py` above imports `auth.service` and `auth.exceptions`, which don't exist yet — temporarily comment out those two import lines and the corresponding `__all__` entries so this task is self-contained; Task 4 and Task 6 will restore them. Edit `auth/__init__.py` to only contain:

```python
"""Google OIDC authentication for the Medical Education AI Agent.

Provides persistent Google-linked user accounts and rotating refresh tokens
on top of the same SQLite file used by :class:`memory.session_manager.SessionManager`.
"""

from __future__ import annotations

from auth.store import AuthStore, RefreshToken, User

__all__ = ["AuthStore", "User", "RefreshToken"]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_auth_store.py -v`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add auth/__init__.py auth/store.py tests/test_auth_store.py
git commit -m "feat(auth): add AuthStore for Google users and refresh tokens"
```

---

## Task 3: Token helpers (access JWT + refresh token hashing)

**Files:**
- Create: `auth/tokens.py`
- Test: `tests/test_auth_tokens.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_auth_tokens.py`:

```python
import jwt
import pytest

from auth.tokens import (
    InvalidAccessTokenError,
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_refresh_token,
    is_expired,
    refresh_token_expiry,
)


@pytest.fixture(autouse=True)
def jwt_secret(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret-key")


def test_create_and_decode_access_token_roundtrip():
    token = create_access_token("user-123")
    payload = decode_access_token(token)
    assert payload["sub"] == "user-123"


def test_decode_access_token_rejects_bad_signature():
    token = jwt.encode({"sub": "user-123"}, "wrong-secret", algorithm="HS256")
    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(token)


def test_decode_access_token_rejects_expired_token(monkeypatch):
    import auth.tokens as tokens_module

    monkeypatch.setattr(tokens_module, "ACCESS_TOKEN_TTL_MINUTES", -1)
    token = create_access_token("user-123")
    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(token)


def test_generate_refresh_token_is_unique_and_long():
    a = generate_refresh_token()
    b = generate_refresh_token()
    assert a != b
    assert len(a) > 40


def test_hash_refresh_token_is_deterministic():
    raw = "same-raw-token"
    assert hash_refresh_token(raw) == hash_refresh_token(raw)


def test_hash_refresh_token_differs_for_different_input():
    assert hash_refresh_token("a") != hash_refresh_token("b")


def test_is_expired_true_for_past_timestamp():
    assert is_expired("2000-01-01T00:00:00+00:00") is True


def test_is_expired_false_for_future_timestamp():
    assert is_expired(refresh_token_expiry()) is False
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_auth_tokens.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'auth.tokens'`

- [ ] **Step 3: Create `auth/tokens.py`**

```python
from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import jwt

ACCESS_TOKEN_TTL_MINUTES = 15
REFRESH_TOKEN_TTL_DAYS = 30
JWT_ALGORITHM = "HS256"


class InvalidAccessTokenError(Exception):
    """Raised when an access token is missing, malformed, or expired."""


def _secret_key() -> str:
    secret = os.getenv("JWT_SECRET_KEY")
    if not secret:
        raise RuntimeError("JWT_SECRET_KEY environment variable is not set")
    return secret


def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload: Dict[str, Any] = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, _secret_key(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, _secret_key(), algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise InvalidAccessTokenError(str(exc)) from exc


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def refresh_token_expiry() -> str:
    expiry = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_TTL_DAYS)
    return expiry.isoformat()


def is_expired(expires_at_iso: str) -> bool:
    expires_at = datetime.fromisoformat(expires_at_iso)
    return datetime.now(timezone.utc) >= expires_at
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_auth_tokens.py -v`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add auth/tokens.py tests/test_auth_tokens.py
git commit -m "feat(auth): add JWT access-token and refresh-token helpers"
```

---

## Task 4: Auth error taxonomy

**Files:**
- Create: `auth/exceptions.py`
- Modify: `auth/__init__.py`
- Test: `tests/test_auth_exceptions.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_auth_exceptions.py`:

```python
import pytest

from auth.exceptions import (
    AuthError,
    AuthGoogleDeniedError,
    AuthInvalidIdTokenError,
    AuthRefreshInvalidError,
    AuthRefreshReuseError,
    AuthStateMismatchError,
    AuthTokenExchangeError,
)


@pytest.mark.parametrize(
    "exc_class,expected_code,expected_status",
    [
        (AuthStateMismatchError, "AUTH_STATE_MISMATCH", 400),
        (AuthGoogleDeniedError, "AUTH_GOOGLE_DENIED", 400),
        (AuthTokenExchangeError, "AUTH_TOKEN_EXCHANGE_FAILED", 502),
        (AuthInvalidIdTokenError, "AUTH_INVALID_ID_TOKEN", 400),
        (AuthRefreshInvalidError, "AUTH_REFRESH_INVALID", 401),
        (AuthRefreshReuseError, "AUTH_REFRESH_REUSE_DETECTED", 401),
    ],
)
def test_auth_error_subclasses_expose_stable_code_and_status(
    exc_class, expected_code, expected_status
):
    exc = exc_class()
    assert isinstance(exc, AuthError)
    assert exc.error_code == expected_code
    assert exc.status_code == expected_status
    assert exc.message
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_auth_exceptions.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'auth.exceptions'`

- [ ] **Step 3: Create `auth/exceptions.py`**

```python
from __future__ import annotations


class AuthError(Exception):
    """Base class for auth-flow errors with a stable error_code and HTTP status."""

    error_code: str = "AUTH_ERROR"
    status_code: int = 400
    message: str = "Đã có lỗi xảy ra trong quá trình xác thực."


class AuthStateMismatchError(AuthError):
    error_code = "AUTH_STATE_MISMATCH"
    status_code = 400
    message = "Phiên đăng nhập không hợp lệ, vui lòng thử lại."


class AuthGoogleDeniedError(AuthError):
    error_code = "AUTH_GOOGLE_DENIED"
    status_code = 400
    message = "Bạn đã huỷ đăng nhập Google."


class AuthTokenExchangeError(AuthError):
    error_code = "AUTH_TOKEN_EXCHANGE_FAILED"
    status_code = 502
    message = "Không thể kết nối Google, vui lòng thử lại sau."


class AuthInvalidIdTokenError(AuthError):
    error_code = "AUTH_INVALID_ID_TOKEN"
    status_code = 400
    message = "Xác thực không hợp lệ, vui lòng thử lại."


class AuthRefreshInvalidError(AuthError):
    error_code = "AUTH_REFRESH_INVALID"
    status_code = 401
    message = "Phiên đăng nhập đã hết hạn."


class AuthRefreshReuseError(AuthError):
    error_code = "AUTH_REFRESH_REUSE_DETECTED"
    status_code = 401
    message = (
        "Phiên đăng nhập đã bị thu hồi vì lý do an ninh, vui lòng đăng nhập lại."
    )
```

- [ ] **Step 4: Update `auth/__init__.py` to export the new exceptions**

```python
"""Google OIDC authentication for the Medical Education AI Agent.

Provides persistent Google-linked user accounts and rotating refresh tokens
on top of the same SQLite file used by :class:`memory.session_manager.SessionManager`.
"""

from __future__ import annotations

from auth.exceptions import (
    AuthError,
    AuthGoogleDeniedError,
    AuthInvalidIdTokenError,
    AuthRefreshInvalidError,
    AuthRefreshReuseError,
    AuthStateMismatchError,
    AuthTokenExchangeError,
)
from auth.store import AuthStore, RefreshToken, User

__all__ = [
    "AuthStore",
    "User",
    "RefreshToken",
    "AuthError",
    "AuthStateMismatchError",
    "AuthGoogleDeniedError",
    "AuthTokenExchangeError",
    "AuthInvalidIdTokenError",
    "AuthRefreshInvalidError",
    "AuthRefreshReuseError",
]
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pytest tests/test_auth_exceptions.py -v`
Expected: 6 passed

- [ ] **Step 6: Commit**

```bash
git add auth/exceptions.py auth/__init__.py tests/test_auth_exceptions.py
git commit -m "feat(auth): add error taxonomy for the OIDC flow"
```

---

## Task 5: `SessionManager.reassign_user_sessions`

**Files:**
- Modify: `memory/session_manager.py`
- Test: `tests/test_session_reassign.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_session_reassign.py`:

```python
from memory import SessionManager


def test_reassign_user_sessions_moves_all_matching_sessions(tmp_path):
    manager = SessionManager(str(tmp_path / "sessions.db"))
    s1 = manager.create_session("anon-1")
    s2 = manager.create_session("anon-1")
    s3 = manager.create_session("other-user")

    moved = manager.reassign_user_sessions("anon-1", "user-42")

    assert moved == 2
    assert manager.get_session(s1.id).user_id == "user-42"
    assert manager.get_session(s2.id).user_id == "user-42"
    assert manager.get_session(s3.id).user_id == "other-user"


def test_reassign_user_sessions_returns_zero_when_no_match(tmp_path):
    manager = SessionManager(str(tmp_path / "sessions.db"))
    moved = manager.reassign_user_sessions("nobody", "user-99")
    assert moved == 0
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_session_reassign.py -v`
Expected: FAIL with `AttributeError: 'SessionManager' object has no attribute 'reassign_user_sessions'`

- [ ] **Step 3: Add the method to `memory/session_manager.py`**

Add this method to the `SessionManager` class, near the other mutation methods (e.g. after `update_session_topic` / before `delete_session` — exact position doesn't matter, keep it inside the class body):

```python
    def reassign_user_sessions(self, old_user_id: str, new_user_id: str) -> int:
        """Move every session owned by ``old_user_id`` to ``new_user_id``.

        Used to fold a browser's anonymous history into a Google account on
        first login. Returns the number of sessions moved.
        """
        with self._connect() as conn:
            cursor = conn.execute(
                "UPDATE sessions SET user_id = ? WHERE user_id = ?",
                (new_user_id, old_user_id),
            )
            conn.commit()
            return cursor.rowcount
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_session_reassign.py -v`
Expected: 2 passed

- [ ] **Step 5: Run the full existing memory test suite to check for regressions**

Run: `pytest tests/test_memory.py -v`
Expected: all previously-passing tests still pass (no change to any existing method).

- [ ] **Step 6: Commit**

```bash
git add memory/session_manager.py tests/test_session_reassign.py
git commit -m "feat(memory): add SessionManager.reassign_user_sessions for account linking"
```

---

## Task 6: `AuthService` — orchestration layer

**Files:**
- Create: `auth/service.py`
- Modify: `auth/__init__.py`
- Test: `tests/test_auth_service.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_auth_service.py`:

```python
import pytest

from auth.exceptions import AuthRefreshInvalidError, AuthRefreshReuseError
from auth.service import AuthService
from auth.store import AuthStore
from auth.tokens import decode_access_token
from memory import SessionManager


@pytest.fixture(autouse=True)
def jwt_secret(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret-key")


@pytest.fixture
def service(tmp_path):
    db_path = str(tmp_path / "sessions.db")
    return AuthService(AuthStore(db_path), SessionManager(db_path))


def test_find_or_create_user_creates_new_user_and_links_anonymous_sessions(service):
    anon_session = service.session_manager.create_session("anon-abc")

    user = service.find_or_create_user(
        "google-sub-1", "a@example.com", "A", None, anon_id="anon-abc"
    )

    assert user.email == "a@example.com"
    moved_session = service.session_manager.get_session(anon_session.id)
    assert moved_session.user_id == user.id


def test_find_or_create_user_does_not_relink_existing_user(service):
    first = service.find_or_create_user(
        "google-sub-2", "b@example.com", "B", None, anon_id=None
    )
    orphan_session = service.session_manager.create_session("anon-xyz")

    second = service.find_or_create_user(
        "google-sub-2", "b@example.com", "B", None, anon_id="anon-xyz"
    )

    assert second.id == first.id
    untouched = service.session_manager.get_session(orphan_session.id)
    assert untouched.user_id == "anon-xyz"


def test_find_or_create_user_touches_login_timestamp_for_existing_user(service):
    first = service.find_or_create_user(
        "google-sub-3", "c@example.com", "C", None, anon_id=None
    )
    second = service.find_or_create_user(
        "google-sub-3", "c@example.com", "C", None, anon_id=None
    )
    assert second.last_login_at >= first.last_login_at


def test_issue_token_pair_returns_decodable_access_token(service):
    user = service.find_or_create_user(
        "google-sub-4", "d@example.com", "D", None, None
    )
    access_token, refresh_token = service.issue_token_pair(user.id)
    assert decode_access_token(access_token)["sub"] == user.id
    assert refresh_token


def test_rotate_refresh_token_issues_new_pair_and_revokes_old(service):
    user = service.find_or_create_user(
        "google-sub-5", "e@example.com", "E", None, None
    )
    _, refresh_token = service.issue_token_pair(user.id)

    _, new_refresh_token, rotated_user = service.rotate_refresh_token(refresh_token)

    assert rotated_user.id == user.id
    assert new_refresh_token != refresh_token
    with pytest.raises(AuthRefreshReuseError):
        service.rotate_refresh_token(refresh_token)


def test_rotate_refresh_token_rejects_unknown_token(service):
    with pytest.raises(AuthRefreshInvalidError):
        service.rotate_refresh_token("does-not-exist")


def test_rotate_refresh_token_reuse_revokes_all_user_tokens(service):
    user = service.find_or_create_user(
        "google-sub-6", "f@example.com", "F", None, None
    )
    _, refresh_a = service.issue_token_pair(user.id)
    _, refresh_b = service.issue_token_pair(user.id)

    service.rotate_refresh_token(refresh_a)  # refresh_a is now revoked

    with pytest.raises(AuthRefreshReuseError):
        service.rotate_refresh_token(refresh_a)

    # refresh_b was never rotated itself, but reuse detection on refresh_a
    # must have revoked every active token for this user, including it.
    with pytest.raises(AuthRefreshReuseError):
        service.rotate_refresh_token(refresh_b)


def test_revoke_refresh_token_makes_it_unusable(service):
    user = service.find_or_create_user(
        "google-sub-7", "g@example.com", "G", None, None
    )
    _, refresh_token = service.issue_token_pair(user.id)

    service.revoke_refresh_token(refresh_token)

    with pytest.raises(AuthRefreshReuseError):
        service.rotate_refresh_token(refresh_token)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_auth_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'auth.service'`

- [ ] **Step 3: Create `auth/service.py`**

```python
from __future__ import annotations

from typing import Optional, Tuple

from memory.session_manager import SessionManager

from .exceptions import AuthRefreshInvalidError, AuthRefreshReuseError
from .store import AuthStore, User
from .tokens import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    is_expired,
    refresh_token_expiry,
)


class AuthService:
    """Orchestrates Google sign-in, anonymous-history linking, and refresh
    token rotation on top of :class:`AuthStore` and :class:`SessionManager`.
    """

    def __init__(self, auth_store: AuthStore, session_manager: SessionManager) -> None:
        self.auth_store = auth_store
        self.session_manager = session_manager

    def find_or_create_user(
        self,
        google_sub: str,
        email: str,
        name: Optional[str],
        avatar_url: Optional[str],
        anon_id: Optional[str],
    ) -> User:
        existing = self.auth_store.get_user_by_google_sub(google_sub)
        if existing is not None:
            self.auth_store.touch_login(existing.id)
            return self.auth_store.get_user_by_id(existing.id)

        user = self.auth_store.create_user(google_sub, email, name, avatar_url)
        if anon_id:
            self.session_manager.reassign_user_sessions(anon_id, user.id)
        return user

    def issue_token_pair(self, user_id: str) -> Tuple[str, str]:
        access_token = create_access_token(user_id)
        raw_refresh_token = generate_refresh_token()
        self.auth_store.create_refresh_token(
            user_id, hash_refresh_token(raw_refresh_token), refresh_token_expiry()
        )
        return access_token, raw_refresh_token

    def rotate_refresh_token(self, raw_refresh_token: str) -> Tuple[str, str, User]:
        token_hash = hash_refresh_token(raw_refresh_token)
        record = self.auth_store.get_refresh_token_by_hash(token_hash)
        if record is None:
            raise AuthRefreshInvalidError()

        if record.revoked_at is not None:
            self.auth_store.revoke_all_user_tokens(record.user_id)
            raise AuthRefreshReuseError()

        if is_expired(record.expires_at):
            raise AuthRefreshInvalidError()

        user = self.auth_store.get_user_by_id(record.user_id)
        if user is None:
            raise AuthRefreshInvalidError()

        self.auth_store.revoke_refresh_token(record.id)
        access_token, new_raw_refresh_token = self.issue_token_pair(user.id)
        return access_token, new_raw_refresh_token, user

    def revoke_refresh_token(self, raw_refresh_token: str) -> None:
        token_hash = hash_refresh_token(raw_refresh_token)
        record = self.auth_store.get_refresh_token_by_hash(token_hash)
        if record is not None and record.revoked_at is None:
            self.auth_store.revoke_refresh_token(record.id)
```

- [ ] **Step 4: Update `auth/__init__.py` to export `AuthService`**

```python
"""Google OIDC authentication for the Medical Education AI Agent.

Provides persistent Google-linked user accounts and rotating refresh tokens
on top of the same SQLite file used by :class:`memory.session_manager.SessionManager`.
"""

from __future__ import annotations

from auth.exceptions import (
    AuthError,
    AuthGoogleDeniedError,
    AuthInvalidIdTokenError,
    AuthRefreshInvalidError,
    AuthRefreshReuseError,
    AuthStateMismatchError,
    AuthTokenExchangeError,
)
from auth.service import AuthService
from auth.store import AuthStore, RefreshToken, User

__all__ = [
    "AuthStore",
    "User",
    "RefreshToken",
    "AuthService",
    "AuthError",
    "AuthStateMismatchError",
    "AuthGoogleDeniedError",
    "AuthTokenExchangeError",
    "AuthInvalidIdTokenError",
    "AuthRefreshInvalidError",
    "AuthRefreshReuseError",
]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pytest tests/test_auth_service.py -v`
Expected: 8 passed

- [ ] **Step 6: Commit**

```bash
git add auth/service.py auth/__init__.py tests/test_auth_service.py
git commit -m "feat(auth): add AuthService orchestration (linking, rotation, reuse detection)"
```

---

## Task 7: Authlib Google OIDC client registration

**Files:**
- Create: `auth/oidc.py`

No dedicated unit test for this file — it is a thin, side-effecting registration call exercised end-to-end by the integration tests in Task 10.

- [ ] **Step 1: Create `auth/oidc.py`**

```python
from __future__ import annotations

import os

from authlib.integrations.starlette_client import OAuth

oauth = OAuth()

oauth.register(
    name="google",
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_id=os.getenv("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_OAUTH_CLIENT_SECRET"),
    client_kwargs={"scope": "openid email profile"},
)
```

- [ ] **Step 2: Verify it imports cleanly without the env vars set**

Run: `python -c "import auth.oidc; print('ok')"`
Expected: prints `ok` (Authlib stores `client_id=None` lazily; it only fails when actually used to call Google, which happens in Task 10's mocked tests, not at import time).

- [ ] **Step 3: Commit**

```bash
git add auth/oidc.py
git commit -m "feat(auth): register the Google OIDC client via Authlib"
```

---

## Task 8: `api/models.py` — `UserResponse`

**Files:**
- Modify: `api/models.py`

No dedicated unit test — `UserResponse` is exercised by the `/auth/me` integration tests in Task 10.

- [ ] **Step 1: Append the model**

Add to the end of `api/models.py`, after the existing `StatsResponse` class:

```python


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #


class UserResponse(BaseModel):
    """Authenticated user profile returned by ``GET /auth/me``."""

    id: str
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
```

- [ ] **Step 2: Verify the module still imports cleanly**

Run: `python -c "from api.models import UserResponse; print(UserResponse.model_fields.keys())"`
Expected: prints a field list including `id`, `email`, `name`, `avatar_url`.

- [ ] **Step 3: Commit**

```bash
git add api/models.py
git commit -m "feat(api): add UserResponse model for /auth/me"
```

---

## Task 9: `api/deps.py` wiring — `Services.auth_service`, `get_current_user`

**Files:**
- Modify: `api/deps.py`

No dedicated unit test — this wiring is exercised end-to-end by the `/auth/me` integration tests in Task 10.

- [ ] **Step 1: Add `Request` to the FastAPI import and new fields to `Services.__init__`**

In `api/deps.py`, change:

```python
from fastapi import HTTPException
```

to:

```python
from fastapi import HTTPException, Request
```

In `Services.__init__`, add two new attributes alongside the existing ones (after `self.ingestion_pipeline: Any = None`):

```python
        self.auth_store: Any = None
        self.auth_service: Any = None
```

- [ ] **Step 2: Initialize `auth_store`/`auth_service` in `Services.startup()`**

Immediately after the existing session/memory block in `startup()`:

```python
        self.session_manager = SessionManager(
            os.getenv("SESSION_DB_PATH", "sessions.db")
        )
        self.memory_store = MemoryStore(os.getenv("MEMORY_DB_PATH", "memory.db"))
        self.context_builder = ContextBuilder(
            self.session_manager, self.memory_store
        )
```

add:

```python
        # Google OIDC auth — shares the sessions DB so account linking is atomic.
        from auth import AuthService, AuthStore

        self.auth_store = AuthStore(os.getenv("SESSION_DB_PATH", "sessions.db"))
        self.auth_service = AuthService(self.auth_store, self.session_manager)
```

- [ ] **Step 3: Add `get_current_user` and `get_current_user_optional` dependencies**

Add after the `get_services()` function definition (before the `RateLimiter` class):

```python
def get_current_user(request: Request, svc: "Services" = Depends(get_services)):
    """FastAPI dependency returning the authenticated :class:`auth.store.User`.

    Raises 401 if the ``access_token`` cookie is missing, invalid, expired,
    or no longer maps to a known user.
    """
    from auth.tokens import InvalidAccessTokenError, decode_access_token

    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập.")

    try:
        payload = decode_access_token(token)
    except InvalidAccessTokenError:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập.")

    user = svc.auth_store.get_user_by_id(payload["sub"])
    if user is None:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập.")
    return user


def get_current_user_optional(
    request: Request, svc: "Services" = Depends(get_services)
):
    """Like :func:`get_current_user` but returns ``None`` instead of raising."""
    try:
        return get_current_user(request, svc)
    except HTTPException:
        return None
```

This requires `Depends` to be importable in this module — add it to the existing `from fastapi import HTTPException, Request` line:

```python
from fastapi import Depends, HTTPException, Request
```

- [ ] **Step 4: Run the existing backend test suite to check for regressions**

Run: `pytest tests/ -v -k "not test_auth"`
Expected: all previously-passing tests still pass (the new `Services` fields are additive and `startup()`'s new import is lazy, matching the existing pattern for `memory`/`learning`/`agents`).

- [ ] **Step 5: Commit**

```bash
git add api/deps.py
git commit -m "feat(api): wire AuthService into Services and add get_current_user dependency"
```

---

## Task 10: `api/auth.py` router + `main.py` wiring

**Files:**
- Create: `api/auth.py`
- Modify: `main.py`
- Test: `tests/test_auth_api.py`

- [ ] **Step 1: Write the failing integration tests**

Create `tests/test_auth_api.py`:

```python
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.responses import RedirectResponse
from fastapi.testclient import TestClient


@pytest.fixture
def auth_client(tmp_path, monkeypatch):
    pytest.importorskip("google.adk")

    monkeypatch.setenv("SESSION_DB_PATH", str(tmp_path / "sessions.db"))
    monkeypatch.setenv("MEMORY_DB_PATH", str(tmp_path / "memory.db"))
    monkeypatch.setenv("LEARNING_DB_PATH", str(tmp_path / "learning.db"))
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv(
        "GOOGLE_OAUTH_REDIRECT_URI",
        "https://backend.example.com/auth/google/callback",
    )
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret-key")
    monkeypatch.setenv("FRONTEND_URL", "https://frontend.example.com")

    import main
    from api.deps import services

    services._started = False
    services.document_registry.clear()
    services.quiz_store.clear()
    services.quiz_history.clear()

    with TestClient(main.app) as client:
        yield client


def _mock_authorize_redirect(monkeypatch):
    from auth.oidc import oauth

    mock = AsyncMock(
        return_value=RedirectResponse(
            "https://accounts.google.com/o/oauth2/v2/auth?mock=1"
        )
    )
    monkeypatch.setattr(oauth.google, "authorize_redirect", mock)
    return mock


def _mock_authorize_access_token(monkeypatch, *, userinfo=None, side_effect=None):
    from auth.oidc import oauth

    if side_effect is not None:
        mock = AsyncMock(side_effect=side_effect)
    else:
        mock = AsyncMock(return_value={"userinfo": userinfo})
    monkeypatch.setattr(oauth.google, "authorize_access_token", mock)
    return mock


class TestGoogleLogin:
    def test_redirects_to_google(self, auth_client, monkeypatch):
        _mock_authorize_redirect(monkeypatch)

        response = auth_client.get(
            "/auth/google/login?anon_id=anon-1", follow_redirects=False
        )

        assert response.status_code == 307


class TestGoogleCallback:
    def test_new_user_happy_path_links_anonymous_sessions_and_sets_cookies(
        self, auth_client, monkeypatch
    ):
        _mock_authorize_access_token(
            monkeypatch,
            userinfo={
                "sub": "google-sub-1",
                "email": "a@example.com",
                "name": "A",
                "picture": "https://example.com/a.png",
            },
        )

        response = auth_client.get("/auth/google/callback", follow_redirects=False)

        assert response.status_code == 307
        assert (
            response.headers["location"]
            == "https://frontend.example.com/auth/callback?ok=1"
        )
        assert "access_token" in response.cookies
        assert "refresh_token" in response.cookies

    def test_google_denied_redirects_with_error_code(self, auth_client):
        response = auth_client.get(
            "/auth/google/callback?error=access_denied", follow_redirects=False
        )

        assert response.status_code == 307
        assert response.headers["location"] == (
            "https://frontend.example.com/auth/callback?error=AUTH_GOOGLE_DENIED"
        )

    def test_token_exchange_failure_redirects_with_error_code(
        self, auth_client, monkeypatch
    ):
        _mock_authorize_access_token(
            monkeypatch, side_effect=RuntimeError("network unreachable")
        )

        response = auth_client.get("/auth/google/callback", follow_redirects=False)

        assert response.headers["location"] == (
            "https://frontend.example.com/auth/callback?error=AUTH_TOKEN_EXCHANGE_FAILED"
        )

    def test_missing_id_token_claims_redirects_with_invalid_id_token_code(
        self, auth_client, monkeypatch
    ):
        _mock_authorize_access_token(monkeypatch, userinfo=None)

        response = auth_client.get("/auth/google/callback", follow_redirects=False)

        assert response.headers["location"] == (
            "https://frontend.example.com/auth/callback?error=AUTH_INVALID_ID_TOKEN"
        )


class TestRefreshAndLogout:
    def _login(self, auth_client, monkeypatch, google_sub="google-sub-2"):
        _mock_authorize_access_token(
            monkeypatch,
            userinfo={
                "sub": google_sub,
                "email": "b@example.com",
                "name": "B",
                "picture": None,
            },
        )
        auth_client.get("/auth/google/callback", follow_redirects=False)

    def test_refresh_rotates_cookies(self, auth_client, monkeypatch):
        self._login(auth_client, monkeypatch)
        old_refresh = auth_client.cookies.get("refresh_token")

        response = auth_client.post("/auth/refresh")

        assert response.status_code == 200
        assert auth_client.cookies.get("refresh_token") != old_refresh

    def test_refresh_without_cookie_returns_401(self, auth_client):
        response = auth_client.post("/auth/refresh")
        assert response.status_code == 401
        assert response.json()["detail"]["error_code"] == "AUTH_REFRESH_INVALID"

    def test_refresh_reuse_returns_401_with_reuse_code(
        self, auth_client, monkeypatch
    ):
        self._login(auth_client, monkeypatch)
        original_refresh = auth_client.cookies.get("refresh_token")

        auth_client.post("/auth/refresh")  # rotates; original_refresh is now revoked

        auth_client.cookies.set("refresh_token", original_refresh)
        response = auth_client.post("/auth/refresh")

        assert response.status_code == 401
        assert response.json()["detail"]["error_code"] == "AUTH_REFRESH_REUSE_DETECTED"

    def test_logout_clears_cookies(self, auth_client, monkeypatch):
        self._login(auth_client, monkeypatch)

        response = auth_client.post("/auth/logout")

        assert response.status_code == 200
        assert auth_client.cookies.get("access_token") is None


class TestMe:
    def test_me_requires_authentication(self, auth_client):
        response = auth_client.get("/auth/me")
        assert response.status_code == 401

    def test_me_returns_profile_when_authenticated(self, auth_client, monkeypatch):
        _mock_authorize_access_token(
            monkeypatch,
            userinfo={
                "sub": "google-sub-3",
                "email": "c@example.com",
                "name": "C",
                "picture": None,
            },
        )
        auth_client.get("/auth/google/callback", follow_redirects=False)

        response = auth_client.get("/auth/me")

        assert response.status_code == 200
        assert response.json()["email"] == "c@example.com"


class TestSecurityProperties:
    def test_login_happy_path_sets_httponly_secure_samesite_none_cookies(
        self, auth_client, monkeypatch
    ):
        _mock_authorize_access_token(
            monkeypatch,
            userinfo={
                "sub": "google-sub-4",
                "email": "d@example.com",
                "name": "D",
                "picture": None,
            },
        )

        response = auth_client.get("/auth/google/callback", follow_redirects=False)

        set_cookie_headers = response.headers.get_list("set-cookie")
        assert len(set_cookie_headers) == 2
        for header in set_cookie_headers:
            assert "HttpOnly" in header
            assert "Secure" in header
            assert "SameSite=none" in header.lower().replace(" ", "")

    def test_forged_state_redirects_with_state_mismatch_code(
        self, auth_client, monkeypatch
    ):
        _mock_authorize_access_token(
            monkeypatch,
            side_effect=RuntimeError("mismatching_state: CSRF Warning!"),
        )

        response = auth_client.get("/auth/google/callback", follow_redirects=False)

        assert response.headers["location"] == (
            "https://frontend.example.com/auth/callback?error=AUTH_STATE_MISMATCH"
        )

    def test_login_endpoint_rate_limits_repeated_requests(
        self, auth_client, monkeypatch
    ):
        _mock_authorize_redirect(monkeypatch)

        responses = [
            auth_client.get("/auth/google/login?anon_id=anon-1", follow_redirects=False)
            for _ in range(31)
        ]

        assert responses[-1].status_code == 429
        assert responses[-1].json()["detail"]["error_code"] == "AUTH_RATE_LIMITED"

    def test_refresh_token_never_appears_in_a_json_response_body(
        self, auth_client, monkeypatch
    ):
        _mock_authorize_access_token(
            monkeypatch,
            userinfo={
                "sub": "google-sub-5",
                "email": "e@example.com",
                "name": "E",
                "picture": None,
            },
        )
        auth_client.get("/auth/google/callback", follow_redirects=False)
        raw_refresh_token = auth_client.cookies.get("refresh_token")

        me_response = auth_client.get("/auth/me")
        refresh_response = auth_client.post("/auth/refresh")

        assert raw_refresh_token not in me_response.text
        assert refresh_response.content == b""
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_auth_api.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.auth'` (or 404s once `main.py` loads, since the router doesn't exist yet)

- [ ] **Step 3: Create `api/auth.py`**

```python
from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from auth.exceptions import (
    AuthError,
    AuthGoogleDeniedError,
    AuthInvalidIdTokenError,
    AuthStateMismatchError,
    AuthTokenExchangeError,
)
from auth.oidc import oauth

from .deps import Services, get_current_user, get_services, rate_limiter
from .models import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

ACCESS_TOKEN_COOKIE = "access_token"
REFRESH_TOKEN_COOKIE = "refresh_token"


def _frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:3000")


def _enforce_rate_limit(key: str) -> None:
    try:
        rate_limiter.check(key)
    except HTTPException as exc:
        raise HTTPException(
            status_code=429,
            detail={"error_code": "AUTH_RATE_LIMITED", "message": exc.detail},
        ) from exc


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        ACCESS_TOKEN_COOKIE,
        access_token,
        max_age=15 * 60,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )
    response.set_cookie(
        REFRESH_TOKEN_COOKIE,
        refresh_token,
        max_age=30 * 24 * 60 * 60,
        httponly=True,
        secure=True,
        samesite="none",
        path="/auth",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_TOKEN_COOKIE, path="/")
    response.delete_cookie(REFRESH_TOKEN_COOKIE, path="/auth")


@router.get("/google/login")
async def google_login(request: Request, anon_id: str | None = None):
    client_key = request.client.host if request.client else "unknown"
    _enforce_rate_limit(f"auth-login:{client_key}")

    request.session["anon_id"] = anon_id
    redirect_uri = os.getenv("GOOGLE_OAUTH_REDIRECT_URI")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, svc: Services = Depends(get_services)):
    anon_id = request.session.pop("anon_id", None)

    if request.query_params.get("error") == "access_denied":
        return RedirectResponse(
            f"{_frontend_url()}/auth/callback?error={AuthGoogleDeniedError.error_code}"
        )

    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as exc:  # Authlib's OAuthError and related CSRF/state errors
        message = str(exc).lower()
        if "state" in message or "csrf" in message:
            logger.warning("Google OAuth state mismatch: %s", exc)
            code = AuthStateMismatchError.error_code
        else:
            logger.warning("Google OAuth token exchange failed: %s", exc)
            code = AuthTokenExchangeError.error_code
        return RedirectResponse(f"{_frontend_url()}/auth/callback?error={code}")

    userinfo = token.get("userinfo")
    if not userinfo or not userinfo.get("sub") or not userinfo.get("email"):
        logger.warning("Google ID token missing required claims")
        return RedirectResponse(
            f"{_frontend_url()}/auth/callback?error={AuthInvalidIdTokenError.error_code}"
        )

    user = svc.auth_service.find_or_create_user(
        google_sub=userinfo["sub"],
        email=userinfo["email"],
        name=userinfo.get("name"),
        avatar_url=userinfo.get("picture"),
        anon_id=anon_id,
    )
    access_token, refresh_token = svc.auth_service.issue_token_pair(user.id)

    response = RedirectResponse(f"{_frontend_url()}/auth/callback?ok=1")
    _set_auth_cookies(response, access_token, refresh_token)
    return response


@router.post("/refresh")
def refresh(request: Request, svc: Services = Depends(get_services)):
    raw_refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE)
    if not raw_refresh_token:
        raise HTTPException(
            status_code=401,
            detail={
                "error_code": "AUTH_REFRESH_INVALID",
                "message": "Phiên đăng nhập đã hết hạn.",
            },
        )

    try:
        access_token, new_refresh_token, _user = svc.auth_service.rotate_refresh_token(
            raw_refresh_token
        )
    except AuthError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"error_code": exc.error_code, "message": exc.message},
        ) from exc

    response = Response(status_code=200)
    _set_auth_cookies(response, access_token, new_refresh_token)
    return response


@router.post("/logout")
def logout(request: Request, svc: Services = Depends(get_services)):
    raw_refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE)
    if raw_refresh_token:
        svc.auth_service.revoke_refresh_token(raw_refresh_token)

    response = Response(status_code=200)
    _clear_auth_cookies(response)
    return response


@router.get("/me", response_model=UserResponse)
def me(user=Depends(get_current_user)):
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
    )
```

- [ ] **Step 4: Wire `SessionMiddleware`, CORS, and the router into `main.py`**

Change the router import line:

```python
from api import chat, documents, feedback, memories, quiz  # noqa: E402
```

to:

```python
from api import auth, chat, documents, feedback, memories, quiz  # noqa: E402
```

Add the Starlette session middleware import alongside the existing CORS import:

```python
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
```

Replace the CORS middleware block:

```python
# CORS — allow the Next.js dev frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

with:

```python
# CORS — allow the Next.js dev frontend plus the deployed production origin.
_cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]
_production_frontend_url = os.getenv("FRONTEND_URL")
if _production_frontend_url and _production_frontend_url not in _cors_origins:
    _cors_origins.append(_production_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session middleware backs the Google OAuth handshake (state/nonce storage
# between /auth/google/login and /auth/google/callback). This is a short-lived
# signed cookie unrelated to the app's own access/refresh token cookies.
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("JWT_SECRET_KEY", "dev-insecure-secret-key"),
    same_site="lax",
    https_only=os.getenv("APP_ENV", "development") == "production",
)
```

Add the auth router to the include_router block:

```python
# Routers.
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(feedback.router)
app.include_router(memories.router)
app.include_router(quiz.router)
```

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `pytest tests/test_auth_api.py -v`
Expected: 15 passed

- [ ] **Step 6: Run the full backend test suite to check for regressions**

Run: `pytest tests/ -v`
Expected: all tests pass (previously-passing tests plus every new `test_auth_*` / `test_session_reassign` file).

- [ ] **Step 7: Commit**

```bash
git add api/auth.py main.py tests/test_auth_api.py
git commit -m "feat(api): add Google OIDC auth router (login, callback, refresh, logout, me)"
```

---

## Task 11: Frontend — `apiFetch` wrapper with cookie credentials and refresh-and-retry

**Files:**
- Create: `frontend/src/lib/http.ts`
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/src/lib/http.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/http.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, AUTH_SECURITY_EVENT } from "./http";

function responseWithStatus(status: number): Response {
  return new Response(null, { status });
}

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes through a successful response without refreshing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseWithStatus(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await apiFetch("https://api.example.com/api/chat/sessions");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/chat/sessions",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("refreshes and retries once on a 401, then returns the retried response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithStatus(401))
      .mockResolvedValueOnce(responseWithStatus(200)) // /auth/refresh
      .mockResolvedValueOnce(responseWithStatus(200)); // retried original request
    vi.stubGlobal("fetch", fetchMock);

    const res = await apiFetch("https://api.example.com/api/chat/sessions");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/auth/refresh");
  });

  it("returns the original 401 response when refresh also fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithStatus(401))
      .mockResolvedValueOnce(responseWithStatus(401)); // /auth/refresh fails
    vi.stubGlobal("fetch", fetchMock);

    const res = await apiFetch("https://api.example.com/api/chat/sessions");

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent 401s into a single refresh call", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithStatus(401)) // request A
      .mockResolvedValueOnce(responseWithStatus(401)) // request B
      .mockResolvedValueOnce(responseWithStatus(200)) // single /auth/refresh
      .mockResolvedValueOnce(responseWithStatus(200)) // retried A
      .mockResolvedValueOnce(responseWithStatus(200)); // retried B
    vi.stubGlobal("fetch", fetchMock);

    const [resA, resB] = await Promise.all([
      apiFetch("https://api.example.com/api/a"),
      apiFetch("https://api.example.com/api/b"),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("dispatches AUTH_SECURITY_EVENT with the server message when refresh fails with AUTH_REFRESH_REUSE_DETECTED", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithStatus(401)) // original request
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: {
              error_code: "AUTH_REFRESH_REUSE_DETECTED",
              message: "Phiên đăng nhập đã bị thu hồi vì lý do an ninh, vui lòng đăng nhập lại.",
            },
          }),
          { status: 401 },
        ),
      ); // /auth/refresh
    vi.stubGlobal("fetch", fetchMock);

    const handler = vi.fn();
    window.addEventListener(AUTH_SECURITY_EVENT, handler);

    await apiFetch("https://api.example.com/api/chat/sessions");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.message).toBe(
      "Phiên đăng nhập đã bị thu hồi vì lý do an ninh, vui lòng đăng nhập lại.",
    );

    window.removeEventListener(AUTH_SECURITY_EVENT, handler);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/http.test.ts`
Expected: FAIL with a module-not-found error for `./http`

- [ ] **Step 3: Create `frontend/src/lib/http.ts`**

```typescript
import { config } from "./config";

/**
 * Dispatched on `window` when a refresh attempt fails because the refresh
 * token was reused after rotation (theft signal) — see AUTH_REFRESH_REUSE_DETECTED
 * in the backend's error taxonomy. AuthContext listens for this to show a
 * persistent security banner, per the design spec's distinction between this
 * code (persistent banner) and plain AUTH_REFRESH_INVALID (silent, no banner).
 */
export const AUTH_SECURITY_EVENT = "auth-security-notice";

let refreshPromise: Promise<boolean> | null = null;

function dispatchSecurityNotice(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AUTH_SECURITY_EVENT, { detail: { message } }),
  );
}

function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${config.apiBaseUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (res.ok) return true;
        const body = await res.json().catch(() => null);
        if (body?.detail?.error_code === "AUTH_REFRESH_REUSE_DETECTED") {
          dispatchSecurityNotice(body.detail.message as string);
        }
        return false;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * fetch() wrapper that always sends auth cookies and retries once after a
 * successful token refresh when the backend returns 401. Concurrent 401s
 * share a single in-flight refresh call instead of each triggering their own.
 */
export async function apiFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const requestInit: RequestInit = { ...init, credentials: "include" };

  const first = await fetch(url, requestInit);
  if (first.status !== 401) return first;

  const refreshed = await refreshSession();
  if (!refreshed) return first;

  return fetch(url, requestInit);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/http.test.ts`
Expected: 5 passed

- [ ] **Step 5: Route every backend `fetch(` call in `api.ts` through `apiFetch`**

In `frontend/src/lib/api.ts`, add the import:

```typescript
import { config, USE_MOCK_API } from "./config";
import { apiFetch } from "./http";
import { generateId } from "./utils";
```

Then replace every backend `fetch(` call with `apiFetch(` (the mock-only branches that return before reaching `fetch` are untouched). Concretely:

In `sendMessage`:
```typescript
  const res = await apiFetch(`${config.apiBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      user_id: userId,
      ...(sessionId ? { session_id: sessionId } : {}),
    }),
  });
```

In `getChatHistory`:
```typescript
  const query = new URLSearchParams({ user_id: userId });
  const res = await apiFetch(
    `${config.apiBaseUrl}/api/chat/history/${sessionId}?${query.toString()}`,
  );
```

In `getChatSessions`:
```typescript
  const query = new URLSearchParams({ user_id: userId });
  const res = await apiFetch(
    `${config.apiBaseUrl}/api/chat/sessions?${query.toString()}`,
  );
```

In `listMemories`:
```typescript
  const query = new URLSearchParams({ user_id: userId });
  const res = await apiFetch(`${config.apiBaseUrl}/api/memories?${query.toString()}`);
```

In `deleteMemory`:
```typescript
  const query = new URLSearchParams({ user_id: userId });
  const res = await apiFetch(
    `${config.apiBaseUrl}/api/memories/${memoryId}?${query.toString()}`,
    { method: "DELETE" },
  );
```

In `deleteAllMemories`:
```typescript
  const query = new URLSearchParams({ user_id: userId });
  const res = await apiFetch(`${config.apiBaseUrl}/api/memories?${query.toString()}`, {
    method: "DELETE",
  });
```

In `uploadDocument`:
```typescript
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(`${config.apiBaseUrl}/api/documents`, {
    method: "POST",
    body: form,
  });
```

In `listDocuments`:
```typescript
  const res = await apiFetch(`${config.apiBaseUrl}/api/documents`);
```

In `submitFeedback`:
```typescript
  const res = await apiFetch(`${config.apiBaseUrl}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
```

In `generateQuiz`:
```typescript
  const res = await apiFetch(`${config.apiBaseUrl}/api/quiz/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, difficulty, count }),
  });
```

In `submitQuizAnswer`:
```typescript
  const res = await apiFetch(`${config.apiBaseUrl}/api/quiz/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quizId: quiz.id, answers, user_id: userId }),
  });
```

- [ ] **Step 6: Run the full frontend test suite to check for regressions**

Run: `cd frontend && npx vitest run`
Expected: all previously-passing tests still pass. (Existing tests mock `@/lib/api` module functions directly, not `fetch`/`apiFetch`, so this change is transparent to them.)

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/lib/http.ts src/lib/http.test.ts src/lib/api.ts
git commit -m "feat(frontend): add apiFetch cookie+refresh wrapper and route api.ts through it"
```

---

## Task 12: Frontend — `AuthContext`

**Files:**
- Create: `frontend/src/contexts/AuthContext.tsx`
- Create: `frontend/src/contexts/SecurityNoticeBanner.tsx`
- Modify: `frontend/src/app/layout.tsx`
- Test: `frontend/src/contexts/AuthContext.test.tsx`
- Test: `frontend/src/contexts/SecurityNoticeBanner.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/contexts/AuthContext.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

function Probe() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div>loading</div>;
  return <div>{user ? `logged-in:${user.email}` : "logged-out"}</div>;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AuthProvider", () => {
  it("sets the user when /auth/me returns 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "u1",
            email: "a@example.com",
            name: "A",
            avatar_url: null,
          }),
          { status: 200 },
        ),
      ),
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => screen.getByText("logged-in:a@example.com"));
  });

  it("sets user to null when /auth/me returns 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => screen.getByText("logged-out"));
  });

  it("useAuth throws when used outside AuthProvider", () => {
    const Bare = () => {
      useAuth();
      return null;
    };
    expect(() => render(<Bare />)).toThrow(
      "useAuth must be used within an AuthProvider",
    );
  });

  it("sets securityNotice when AUTH_SECURITY_EVENT fires and clears the user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "u1",
            email: "a@example.com",
            name: "A",
            avatar_url: null,
          }),
          { status: 200 },
        ),
      ),
    );

    function NoticeProbe() {
      const { securityNotice } = useAuth();
      return <div>{securityNotice ?? "no-notice"}</div>;
    }

    render(
      <AuthProvider>
        <NoticeProbe />
      </AuthProvider>,
    );

    await waitFor(() => screen.getByText("no-notice"));

    window.dispatchEvent(
      new CustomEvent(AUTH_SECURITY_EVENT, {
        detail: { message: "Phiên đăng nhập đã bị thu hồi vì lý do an ninh." },
      }),
    );

    await waitFor(() =>
      screen.getByText("Phiên đăng nhập đã bị thu hồi vì lý do an ninh."),
    );
  });

  it("dismissSecurityNotice clears the notice", async () => {
    function NoticeProbe() {
      const { securityNotice, dismissSecurityNotice } = useAuth();
      return (
        <div>
          <span>{securityNotice ?? "no-notice"}</span>
          <button onClick={dismissSecurityNotice}>dismiss</button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <NoticeProbe />
      </AuthProvider>,
    );

    window.dispatchEvent(
      new CustomEvent(AUTH_SECURITY_EVENT, { detail: { message: "notice" } }),
    );
    await waitFor(() => screen.getByText("notice"));

    screen.getByText("dismiss").click();
    await waitFor(() => screen.getByText("no-notice"));
  });
});
```

Add `AUTH_SECURITY_EVENT` to the imports at the top of this test file:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import { AUTH_SECURITY_EVENT } from "@/lib/http";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/contexts/AuthContext.test.tsx`
Expected: FAIL with a module-not-found error for `./AuthContext`

- [ ] **Step 3: Create `frontend/src/contexts/AuthContext.tsx`**

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { config } from "@/lib/config";
import { apiFetch, AUTH_SECURITY_EVENT } from "@/lib/http";
import { getOrCreateUserId } from "@/lib/client-identity";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  /** Non-null when a reused/stolen refresh token was detected server-side. */
  securityNotice: string | null;
  dismissSecurityNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`${config.apiBaseUrl}/auth/me`);
        if (cancelled) return;
        setUser(res.ok ? ((await res.json()) as AuthUser) : null);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleSecurityEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      setSecurityNotice(detail.message);
      setUser(null);
    };
    window.addEventListener(AUTH_SECURITY_EVENT, handleSecurityEvent);
    return () => {
      window.removeEventListener(AUTH_SECURITY_EVENT, handleSecurityEvent);
    };
  }, []);

  const login = useCallback(() => {
    setSecurityNotice(null);
    const anonId = getOrCreateUserId();
    window.location.href = `${config.apiBaseUrl}/auth/google/login?anon_id=${encodeURIComponent(anonId)}`;
  }, []);

  const logout = useCallback(async () => {
    await apiFetch(`${config.apiBaseUrl}/auth/logout`, { method: "POST" });
    setUser(null);
  }, []);

  const dismissSecurityNotice = useCallback(() => {
    setSecurityNotice(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, logout, securityNotice, dismissSecurityNotice }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/contexts/AuthContext.test.tsx`
Expected: 5 passed

- [ ] **Step 5: Create the `SecurityNoticeBanner` component**

This renders the persistent banner the design spec requires for `AUTH_REFRESH_REUSE_DETECTED` (distinct from the plain, silent `AUTH_REFRESH_INVALID` case, which never populates `securityNotice`).

Create `frontend/src/contexts/SecurityNoticeBanner.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockUseAuth = vi.fn();
vi.mock("./AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

import { SecurityNoticeBanner } from "./SecurityNoticeBanner";

afterEach(cleanup);

describe("SecurityNoticeBanner", () => {
  it("renders nothing when there is no notice", () => {
    mockUseAuth.mockReturnValue({
      securityNotice: null,
      dismissSecurityNotice: vi.fn(),
    });
    render(<SecurityNoticeBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the notice message and dismisses on click", () => {
    const dismiss = vi.fn();
    mockUseAuth.mockReturnValue({
      securityNotice: "Phiên đăng nhập đã bị thu hồi vì lý do an ninh.",
      dismissSecurityNotice: dismiss,
    });
    render(<SecurityNoticeBanner />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(
      "Phiên đăng nhập đã bị thu hồi vì lý do an ninh.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
```

Run: `cd frontend && npx vitest run src/contexts/SecurityNoticeBanner.test.tsx`
Expected: FAIL with a module-not-found error for `./SecurityNoticeBanner`

Create `frontend/src/contexts/SecurityNoticeBanner.tsx`:

```tsx
"use client";

import { useAuth } from "./AuthContext";

export function SecurityNoticeBanner() {
  const { securityNotice, dismissSecurityNotice } = useAuth();

  if (!securityNotice) return null;

  return (
    <div
      role="alert"
      className="flex min-h-[44px] items-center justify-between gap-3 bg-red-600 px-4 py-2 text-sm text-white"
    >
      <span>{securityNotice}</span>
      <button
        type="button"
        onClick={dismissSecurityNotice}
        aria-label="Đóng"
        className="flex min-h-[44px] items-center rounded px-2 font-medium underline"
      >
        Đóng
      </button>
    </div>
  );
}
```

Run: `cd frontend && npx vitest run src/contexts/SecurityNoticeBanner.test.tsx`
Expected: 2 passed

- [ ] **Step 6: Wrap the app with `AuthProvider` and render the banner in `frontend/src/app/layout.tsx`**

Change:

```tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
```

to:

```tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/contexts/AuthContext";
import { SecurityNoticeBanner } from "@/contexts/SecurityNoticeBanner";
```

and change the body:

```tsx
      <body>
        <div className="flex h-screen w-full overflow-hidden bg-cream text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          {/* AppShell is the client boundary that owns drawer state; this
              layout stays a server component for metadata rendering. */}
          <AppShell>{children}</AppShell>
        </div>
      </body>
```

to:

```tsx
      <body>
        <AuthProvider>
          <div className="flex h-screen w-full flex-col overflow-hidden bg-cream text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <SecurityNoticeBanner />
            {/* AppShell is the client boundary that owns drawer state; this
                layout stays a server component for metadata rendering. This
                inner row preserves AppShell's original flex-row sibling
                layout (Sidebar + content) now that the banner sits above it
                in a flex-col outer container. */}
            <div className="flex min-h-0 w-full flex-1 overflow-hidden">
              <AppShell>{children}</AppShell>
            </div>
          </div>
        </AuthProvider>
      </body>
```

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/contexts/AuthContext.tsx src/contexts/AuthContext.test.tsx src/contexts/SecurityNoticeBanner.tsx src/contexts/SecurityNoticeBanner.test.tsx src/app/layout.tsx
git commit -m "feat(frontend): add AuthContext, security-notice banner, and wrap the app shell with AuthProvider"
```

---

## Task 13: Frontend — `/auth/callback` page

**Files:**
- Create: `frontend/src/app/auth/callback/page.tsx`
- Test: `frontend/src/app/auth/callback/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/auth/callback/page.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const replaceMock = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParamsValue,
}));

import AuthCallbackPage from "./page";

afterEach(() => {
  replaceMock.mockClear();
});

describe("AuthCallbackPage", () => {
  it("redirects home immediately on success (?ok=1)", async () => {
    searchParamsValue = new URLSearchParams({ ok: "1" });

    render(<AuthCallbackPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
  });

  it("shows the Vietnamese message for a known error code", async () => {
    searchParamsValue = new URLSearchParams({ error: "AUTH_GOOGLE_DENIED" });

    render(<AuthCallbackPage />);

    expect(
      await screen.findByText("Bạn đã huỷ đăng nhập Google."),
    ).toBeDefined();
  });

  it("falls back to a generic message for an unknown error code", async () => {
    searchParamsValue = new URLSearchParams({ error: "SOMETHING_NEW" });

    render(<AuthCallbackPage />);

    expect(
      await screen.findByText("Đăng nhập không thành công, vui lòng thử lại."),
    ).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/app/auth/callback/page.test.tsx`
Expected: FAIL with a module-not-found error for `./page`

- [ ] **Step 3: Create `frontend/src/app/auth/callback/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_STATE_MISMATCH: "Phiên đăng nhập không hợp lệ, vui lòng thử lại.",
  AUTH_GOOGLE_DENIED: "Bạn đã huỷ đăng nhập Google.",
  AUTH_TOKEN_EXCHANGE_FAILED: "Không thể kết nối Google, vui lòng thử lại sau.",
  AUTH_INVALID_ID_TOKEN: "Xác thực không hợp lệ, vui lòng thử lại.",
};

const DEFAULT_ERROR_MESSAGE = "Đăng nhập không thành công, vui lòng thử lại.";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const errorCode = searchParams.get("error");
    if (!errorCode) {
      router.replace("/");
      return;
    }
    setMessage(ERROR_MESSAGES[errorCode] ?? DEFAULT_ERROR_MESSAGE);
  }, [searchParams, router]);

  if (!message) return null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
      <button
        type="button"
        onClick={() => router.replace("/")}
        className="min-h-[44px] rounded-lg bg-primary px-4 text-sm font-medium text-white"
      >
        Về trang chủ
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/auth/callback/page.test.tsx`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/app/auth/callback/page.tsx src/app/auth/callback/page.test.tsx
git commit -m "feat(frontend): add /auth/callback landing page for login success/error"
```

---

## Task 14: Frontend — `Header` login/logout UI

**Files:**
- Modify: `frontend/src/components/layout/Header.tsx`
- Modify: `frontend/src/components/layout/Header.test.tsx`

- [ ] **Step 1: Update `Header.test.tsx` to wrap every render in `AuthProvider` and stub `fetch`**

Replace the full contents of `frontend/src/components/layout/Header.test.tsx` with:

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";
import { AuthProvider } from "@/contexts/AuthContext";

vi.mock("@/components/case/SettingsModal", () => ({
  SettingsModal: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Dữ liệu học tập</div> : null,
}));

// jsdom does not implement window.matchMedia, which Header reads on mount.
function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderHeader(props: Parameters<typeof Header>[0] = {}) {
  return render(
    <AuthProvider>
      <Header {...props} />
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  stubMatchMedia(false);
  // Default to logged-out so existing assertions (no avatar/logout button)
  // keep holding; individual tests override this to simulate a logged-in user.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
  );
});

describe("Header", () => {
  it("renders the UniDent wordmark and drops legacy brand text", () => {
    renderHeader();

    expect(screen.getByText("UniDent")).toBeDefined();
    expect(screen.queryByText("Phục hình AI")).toBeNull();
    expect(screen.queryByText("Trợ lý Phục hình")).toBeNull();
  });

  it("keeps the brand as plain text so each route keeps its own top-level heading", () => {
    renderHeader();

    expect(screen.queryByRole("heading")).toBeNull();
    const brand = screen.getByText("UniDent");
    expect(brand.tagName).toBe("SPAN");
  });

  it("hamburger is a 44px mobile-only control wired to onToggleDrawer", () => {
    const onToggleDrawer = vi.fn();
    renderHeader({ onToggleDrawer });

    const hamburger = screen.getByRole("button", {
      name: "Mở menu điều hướng",
    });
    expect(hamburger.getAttribute("aria-controls")).toBe("nav-drawer");
    expect(hamburger.className).toContain("h-11");
    expect(hamburger.className).toContain("w-11");
    expect(hamburger.className).toContain("md:hidden");

    fireEvent.click(hamburger);
    expect(onToggleDrawer).toHaveBeenCalledTimes(1);
  });

  it("hamburger aria-expanded reflects the drawerOpen prop", () => {
    const { rerender } = renderHeader({ onToggleDrawer: () => {} });

    const hamburger = screen.getByRole("button", {
      name: "Mở menu điều hướng",
    });
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");

    rerender(
      <AuthProvider>
        <Header onToggleDrawer={() => {}} drawerOpen />
      </AuthProvider>,
    );
    expect(
      screen
        .getByRole("button", { name: "Mở menu điều hướng" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("tolerates a missing onToggleDrawer while the AppShell wiring is pending", () => {
    renderHeader();

    fireEvent.click(
      screen.getByRole("button", { name: "Mở menu điều hướng" }),
    );
  });

  it("toggles dark mode from a 44px target and persists the choice", () => {
    renderHeader();

    const themeButton = screen.getByRole("button", {
      name: "Chuyển sang chế độ tối",
    });
    expect(themeButton.className).toContain("h-11");
    expect(themeButton.className).toContain("w-11");

    fireEvent.click(themeButton);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(
      screen.getByRole("button", { name: "Chuyển sang chế độ sáng" }),
    ).toBeDefined();
  });

  it("applies the stored dark preference on mount", () => {
    localStorage.setItem("theme", "dark");
    renderHeader();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Chuyển sang chế độ sáng" }),
    ).toBeDefined();
  });

  it("opens the settings modal from a 44px target", () => {
    renderHeader();

    const settingsButton = screen.getByRole("button", {
      name: "Quản lý dữ liệu học tập",
    });
    expect(settingsButton.className).toContain("h-11");
    expect(settingsButton.className).toContain("w-11");

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(settingsButton);
    expect(screen.getByRole("dialog")).toBeDefined();
  });
});

describe("Header auth controls", () => {
  it("shows a 44px-tall Google sign-in control when logged out", async () => {
    renderHeader();

    const loginButton = await screen.findByRole("button", {
      name: "Đăng nhập với Google",
    });
    expect(loginButton.className).toContain("min-h-[44px]");
  });

  it("shows the avatar and a 44px sign-out control when logged in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "u1",
            email: "a@example.com",
            name: "Nguyễn A",
            avatar_url: null,
          }),
          { status: 200 },
        ),
      ),
    );

    renderHeader();

    expect(await screen.findByText("Nguyễn A")).toBeDefined();
    const logoutButton = screen.getByRole("button", { name: "Đăng xuất" });
    expect(logoutButton.className).toContain("min-h-[44px]");

    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    fireEvent.click(logoutButton);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Đăng nhập với Google" }),
      ).toBeDefined(),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/layout/Header.test.tsx`
Expected: FAIL — `renderHeader` wraps `Header` in `AuthProvider`, but `Header` does not yet call `useAuth()`, so the two new "Header auth controls" tests fail (no "Đăng nhập với Google" button exists yet). The 8 pre-existing tests still pass since `Header` itself is unchanged so far.

- [ ] **Step 3: Add login/logout UI to `frontend/src/components/layout/Header.tsx`**

Replace the full contents of `frontend/src/components/layout/Header.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { LogOut, Menu, Moon, Settings, Stethoscope, Sun } from "lucide-react";
import { SettingsModal } from "@/components/case/SettingsModal";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  onToggleDrawer?: () => void;
  /** Mirrors the AppShell drawer state so the launcher reports it correctly. */
  drawerOpen?: boolean;
}

export function Header({ onToggleDrawer, drawerOpen }: HeaderProps) {
  const [dark, setDark] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { user, login, logout } = useAuth();

  // Initialise theme from system / stored preference.
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const prefersDark =
      stored === "dark" ||
      (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(prefersDark);
    document.documentElement.classList.toggle("dark", prefersDark);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleDrawer}
          aria-label="Mở menu điều hướng"
          aria-expanded={drawerOpen ?? false}
          aria-controls="nav-drawer"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white md:hidden">
          <Stethoscope className="h-4 w-4" />
        </div>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
          UniDent
        </span>
      </div>

      <div className="flex items-center gap-1">
        {user ? (
          <div className="flex items-center gap-2 pr-1">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name ?? user.email}
                className="h-7 w-7 rounded-full"
              />
            ) : null}
            <span className="hidden text-xs font-medium text-slate-700 dark:text-slate-200 sm:inline">
              {user.name ?? user.email}
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="Đăng xuất"
              className="flex min-h-[44px] items-center rounded-lg px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <LogOut className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={login}
            aria-label="Đăng nhập với Google"
            className="flex min-h-[44px] items-center rounded-lg bg-primary px-3 text-xs font-medium text-white transition hover:bg-primary-700"
          >
            Đăng nhập với Google
          </button>
        )}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Quản lý dữ liệu học tập"
          aria-label="Quản lý dữ liệu học tập"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={dark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
```

Note: `Header` must be rendered inside an `AuthProvider` from this point on — the real app gets this from Task 12's `layout.tsx` change; tests get it from `renderHeader()`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/layout/Header.test.tsx`
Expected: 10 passed (8 pre-existing + 2 new auth-control tests)

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/layout/Header.tsx src/components/layout/Header.test.tsx
git commit -m "feat(frontend): add Google login/logout controls to Header"
```

---

## Task 15: Frontend — `SessionList` uses the authenticated user id

**Files:**
- Modify: `frontend/src/components/layout/SessionList.tsx`
- Modify: `frontend/src/components/layout/SessionList.test.tsx`

- [ ] **Step 1: Update `SessionList.test.tsx` to wrap every render in `AuthProvider` and add an authed-id test**

Replace the full contents of `frontend/src/components/layout/SessionList.test.tsx` with:

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChatSessions, type ChatSessionSummary } from "@/lib/api";

// Mutable router state lets tests assert navigation without the Next.js
// router context.
const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
}));

vi.mock("@/lib/api", () => ({
  getChatSessions: vi.fn(),
}));

import { SessionList } from "./SessionList";
import { SESSION_UPDATED_EVENT } from "@/lib/client-identity";
import { AuthProvider } from "@/contexts/AuthContext";

const SESSIONS: ChatSessionSummary[] = [
  {
    session_id: "session-1",
    topic: "Cuộc trò chuyện mẫu",
    created_at: new Date().toISOString(),
    last_active: new Date().toISOString(),
    message_count: 3,
  },
];

function renderSessionList(props: Parameters<typeof SessionList>[0] = {}) {
  return render(
    <AuthProvider>
      <SessionList {...props} />
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  navigation.push.mockClear();
  localStorage.clear();
  // Preset identity so SessionList never needs to mint a UUID.
  localStorage.setItem("medical-edu-agent.user-id", "user-uuid");
  localStorage.setItem("chatSessionId", "session-1");
  vi.mocked(getChatSessions).mockResolvedValue(SESSIONS);
  // Default to logged-out so SessionList falls back to the anonymous id,
  // matching today's behavior; individual tests override this.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
  );
});

describe("SessionList touch targets", () => {
  it("gives the new-conversation launcher a 44px hit area", async () => {
    renderSessionList();

    const button = await screen.findByRole("button", {
      name: "Bắt đầu cuộc trò chuyện mới",
    });
    expect(button.className).toContain("h-11");
    expect(button.className).toContain("w-11");
  });

  it("gives the failed-load retry button a 44px hit area", async () => {
    vi.mocked(getChatSessions).mockRejectedValueOnce(
      new Error("Chat sessions request failed: 500"),
    );

    renderSessionList();

    const retry = await screen.findByRole("button", { name: "Thử lại" });
    expect(retry.className).toContain("min-h-[44px]");
  });

  it("gives session rows a 44px minimum hit area", async () => {
    renderSessionList();

    const row = await screen.findByRole("button", {
      name: /Cuộc trò chuyện mẫu/,
    });
    expect(row.className).toContain("min-h-[44px]");
  });
});

describe("SessionList behavior", () => {
  it("starts a new conversation, clears the active session and notifies the container", async () => {
    const onNavigate = vi.fn();
    renderSessionList({ onNavigate });

    const button = await screen.findByRole("button", {
      name: "Bắt đầu cuộc trò chuyện mới",
    });
    fireEvent.click(button);

    expect(navigation.push).toHaveBeenCalledWith(
      expect.stringContaining("/chat?new="),
    );
    expect(localStorage.getItem("chatSessionId")).toBeNull();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("retries the failed load from the retry button", async () => {
    vi.mocked(getChatSessions)
      .mockRejectedValueOnce(new Error("Chat sessions request failed: 500"))
      .mockResolvedValueOnce(SESSIONS);

    renderSessionList();

    const retry = await screen.findByRole("button", { name: "Thử lại" });
    fireEvent.click(retry);

    expect(
      await screen.findByRole("button", { name: /Cuộc trò chuyện mẫu/ }),
    ).toBeDefined();
    expect(getChatSessions).toHaveBeenCalledTimes(2);
  });

  it("refetches in realtime when the session-updated event fires", async () => {
    renderSessionList();

    await screen.findByRole("button", { name: /Cuộc trò chuyện mẫu/ });
    expect(getChatSessions).toHaveBeenCalledTimes(1);

    fireEvent(window, new Event(SESSION_UPDATED_EVENT));

    await waitFor(() => {
      expect(getChatSessions).toHaveBeenCalledTimes(2);
    });
  });

  it("fetches sessions with the authenticated user's id once login resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "auth-user-1",
            email: "a@example.com",
            name: "A",
            avatar_url: null,
          }),
          { status: 200 },
        ),
      ),
    );

    renderSessionList();

    await waitFor(() => {
      expect(getChatSessions).toHaveBeenCalledWith("auth-user-1");
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify the new test fails**

Run: `cd frontend && npx vitest run src/components/layout/SessionList.test.tsx`
Expected: FAIL on "fetches sessions with the authenticated user's id once login resolves" — `SessionList` still calls `getOrCreateUserId()` unconditionally, so `getChatSessions` is called with `"user-uuid"`, not `"auth-user-1"`. The other 6 tests pass since logged-out is their default.

- [ ] **Step 3: Make `SessionList` prefer the authenticated user id**

In `frontend/src/components/layout/SessionList.tsx`, add the import:

```tsx
import { useAuth } from "@/contexts/AuthContext";
```

next to the other imports (after the `cn` import). Then change:

```tsx
export function SessionList({ onNavigate }: SessionListProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const refreshSessions = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    try {
      const userId = getOrCreateUserId();
      const data = await getChatSessions(userId);
```

to:

```tsx
export function SessionList({ onNavigate }: SessionListProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const refreshSessions = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    try {
      const userId = user?.id ?? getOrCreateUserId();
      const data = await getChatSessions(userId);
```

and change the effect's dependency array so it refetches once the authenticated user resolves:

```tsx
  useEffect(() => {
    void refreshSessions();
    const handleSessionUpdated = () => {
      void refreshSessions();
    };
    window.addEventListener(SESSION_UPDATED_EVENT, handleSessionUpdated);
    return () => {
      window.removeEventListener(SESSION_UPDATED_EVENT, handleSessionUpdated);
    };
  }, [refreshSessions]);
```

to:

```tsx
  useEffect(() => {
    void refreshSessions();
    const handleSessionUpdated = () => {
      void refreshSessions();
    };
    window.addEventListener(SESSION_UPDATED_EVENT, handleSessionUpdated);
    return () => {
      window.removeEventListener(SESSION_UPDATED_EVENT, handleSessionUpdated);
    };
  }, [refreshSessions, user]);
```

`refreshSessions` itself must also depend on `user` so the `useCallback` identity changes and the effect re-runs when `AuthContext` resolves from `isLoading` to a concrete user:

```tsx
  const refreshSessions = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    try {
      const userId = user?.id ?? getOrCreateUserId();
      const data = await getChatSessions(userId);
      if (fetchId !== fetchIdRef.current) return;
      setSessions(
        [...data].sort(
          (a, b) =>
            new Date(b.last_active).getTime() -
            new Date(a.last_active).getTime(),
        ),
      );
      setCurrentSessionId(getActiveSessionId());
      setFailed(false);
    } catch {
      if (fetchId !== fetchIdRef.current) return;
      setFailed(true);
    } finally {
      if (fetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [user]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/layout/SessionList.test.tsx`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/layout/SessionList.tsx src/components/layout/SessionList.test.tsx
git commit -m "feat(frontend): scope SessionList to the authenticated user id when logged in"
```

---

## Task 16: Google Cloud Console prerequisite and manual E2E checklist

**Files:**
- Create: `docs/superpowers/specs/2026-10-01-google-oidc-manual-e2e-checklist.md`

This task has no automated test — it documents the one external, user-owned prerequisite from the spec's "Prerequisites" section and the manual verification pass that automated tests cannot cover (a real Google account, a real browser, real cookies across two real domains).

- [ ] **Step 1: Write the prerequisite + checklist doc**

Create `docs/superpowers/specs/2026-10-01-google-oidc-manual-e2e-checklist.md`:

```markdown
# Google OIDC — Prerequisite and Manual E2E Checklist

## Prerequisite (must be done before Task 10 can work end-to-end)

1. Go to https://console.cloud.google.com/apis/credentials
2. Create an OAuth 2.0 Client ID, type "Web application".
3. Authorized redirect URI — must exactly match `GOOGLE_OAUTH_REDIRECT_URI`:
   - Local dev: `http://localhost:8000/auth/google/callback`
   - Production: `https://<your-hf-space-domain>/auth/google/callback`
4. Copy the generated Client ID and Client Secret into:
   - Local: `.env` → `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
   - Production: the Hugging Face Space's secret environment variables
5. Set `JWT_SECRET_KEY` to a long random string (e.g. `openssl rand -hex 32`) in both environments — never reuse the local dev value in production.
6. Set `FRONTEND_URL` to the exact frontend origin (`http://localhost:3000` locally, the Vercel production URL in production) — this is both the post-login redirect target and must be added to the backend's CORS `allow_origins` list (Task 10).

## Manual E2E checklist (run once before merging, with a real Google account)

- [ ] Fresh browser profile, no existing cookies for either domain.
- [ ] Visit the frontend while anonymous, send a chat message, confirm it appears in "Gần đây" (SessionList) under the anonymous id.
- [ ] Click "Đăng nhập với Google" in the Header, complete the Google consent screen.
- [ ] Confirm redirect lands back on the frontend (`/auth/callback` then `/`), and the Header now shows the account name/avatar and "Đăng xuất" instead of the login button.
- [ ] Confirm the chat session sent while anonymous now appears in SessionList under the logged-in account (anonymous→account migration ran).
- [ ] Refresh the page — confirm the session persists (access token cookie still valid or silently refreshed) without being bounced back to logged-out.
- [ ] Close the browser entirely and reopen within a few minutes — confirm still logged in (refresh token cookie survived).
- [ ] Click "Đăng xuất" — confirm the Header reverts to the login button and a new chat message now gets attributed to a fresh anonymous id, not the old account.
- [ ] Log back in with the same Google account — confirm the account's own prior history reappears (not re-migrated, not duplicated).
- [ ] In the browser devtools, manually delete the `refresh_token` cookie, then wait for the access token to expire (or delete that cookie too) — confirm the app degrades gracefully to the logged-out UI rather than erroring.
- [ ] Open two tabs on the authenticated session; log out in one tab; confirm the other tab is not forcibly logged out immediately (per the spec's accepted trade-off — it naturally expires within 15 minutes).
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-10-01-google-oidc-manual-e2e-checklist.md
git commit -m "docs: add Google OIDC prerequisite and manual E2E checklist"
```

---