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
