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
