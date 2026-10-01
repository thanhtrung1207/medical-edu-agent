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
