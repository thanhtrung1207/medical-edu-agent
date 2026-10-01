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
