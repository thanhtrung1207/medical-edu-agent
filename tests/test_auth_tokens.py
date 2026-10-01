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
