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
