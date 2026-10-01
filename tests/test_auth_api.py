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

    # Cookies are set with the Secure flag (required for SameSite=None), which
    # httpx's stdlib-backed cookie jar will only resend over an https:// base
    # URL. The default "http://testserver" base_url would silently drop these
    # cookies on every follow-up request, so we pin an https base_url here.
    with TestClient(main.app, base_url="https://testserver") as client:
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
            assert "samesite=none" in header.lower().replace(" ", "")

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
