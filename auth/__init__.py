"""Google OIDC authentication for the Medical Education AI Agent.

Provides persistent Google-linked user accounts and rotating refresh tokens
on top of the same SQLite file used by :class:`memory.session_manager.SessionManager`.
"""

from __future__ import annotations

from auth.store import AuthStore, RefreshToken, User

__all__ = ["AuthStore", "User", "RefreshToken"]
