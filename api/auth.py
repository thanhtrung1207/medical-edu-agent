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
    client_key = request.client.host if request.client else "unknown"
    _enforce_rate_limit(f"auth-refresh:{client_key}")

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
