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
