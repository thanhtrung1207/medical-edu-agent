# Google OIDC Authentication — Design Spec

**Date:** 2026-10-01
**Status:** Approved for planning
**Scope:** Backend (FastAPI, HF Space) + Frontend (Next.js, Vercel)

## 1. Problem

The app currently has no authentication. Identity is an anonymous `crypto.randomUUID()` stored in `localStorage` (`frontend/src/lib/client-identity.ts`). This means:

- Chat/session history cannot follow a user across browsers or devices.
- Clearing browser storage silently loses access to all prior history.
- There is no concept of a user account.

This spec adds optional Google Sign-In (OIDC) so a user can link their identity to a durable account, while keeping anonymous usage fully functional for users who never log in.

## 2. Goals / Non-goals

**Goals**
- Add Google Sign-In using OIDC Authorization Code flow, backend-driven.
- Persist session/history per authenticated user instead of (or in addition to) anonymous UUID.
- Migrate a user's anonymous history into their account the first time they log in.
- Support logout and token refresh without requiring re-login every session.
- Explicit, user-facing error codes for every failure mode in the auth flow.

**Non-goals**
- No Google profile data beyond `sub`, `email`, `name`, `avatar_url` (no Calendar/Drive/etc scopes).
- No other OAuth providers (Facebook, GitHub, etc.) in this phase.
- No mandatory login — all existing anonymous functionality remains available.
- No "revoke all sessions" admin UI (deferred).

## 3. Architecture

Backend (FastAPI on Hugging Face Space) owns the entire OAuth flow using **Authlib**. The Google Client Secret never reaches the frontend. Frontend (Next.js on Vercel) is a different domain, so the session is carried via an **httpOnly, Secure, SameSite=None cookie scoped to the backend domain** — this cookie is naturally sent on every `fetch(..., credentials: 'include')` call from the Vercel frontend to the HF Space backend, without needing same-site cookies or a shared domain.

```
Next.js (Vercel)                          FastAPI (HF Space)
     │  GET /auth/google/login?anon_id=<uuid>
     ├─────────────────────────────────────▶│  Authlib builds state (signed, encodes anon_id)
     │                                       │  + nonce + PKCE
     │  302 → accounts.google.com            │
     │◀──────────────────────────────────────┤
     │                                       │
     │  (user authenticates with Google)
     │                                       │
     │  GET /auth/google/callback?code=&state=
     │                                       ├─ exchange code → tokens (Authlib)
     │                                       ├─ verify ID token (iss/aud/nonce/sig)
     │                                       ├─ find-or-create User by google_sub
     │                                       ├─ if new user + anon_id present:
     │                                       │     migrate sessions.user_id anon_id → user.id
     │                                       ├─ issue access_token (JWT, short-lived)
     │                                       ├─ issue refresh_token (random, hashed, stored in DB)
     │                                       ├─ Set-Cookie access_token; HttpOnly; Secure; SameSite=None
     │                                       ├─ Set-Cookie refresh_token; HttpOnly; Secure; SameSite=None; Path=/auth
     │  302 → frontend /auth/callback?ok=1
     │◀──────────────────────────────────────┤
     │
     │  (every subsequent API call: credentials:'include' → cookies sent automatically)
     │  GET /api/chat/sessions
     ├─────────────────────────────────────▶│  Depends(get_current_user): verify JWT from cookie
```

## 4. Data model

New tables in `sessions.db` (same SQLite file as existing `sessions`/`messages`, no ORM, consistent with current pattern in `memory/session_manager.py`):

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,              -- app-level uuid4, not the Google sub
    google_sub TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    avatar_url TEXT,
    created_at TEXT NOT NULL,
    last_login_at TEXT NOT NULL
);

CREATE TABLE refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL,         -- sha256(token); plaintext never stored
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
```

No schema change to `sessions`/`messages` — `sessions.user_id` is already a free-form TEXT column. Linking an account just rewrites the value from the anonymous UUID to the new `users.id`.

### Anonymous → account linking

- Frontend passes its anonymous id (`localStorage["medical-edu-agent.user-id"]`) as `?anon_id=` to `/auth/google/login`.
- Authlib encodes `anon_id` into the signed `state` parameter (no extra cookie needed; survives the Google round-trip).
- On callback, backend decodes `state` to recover `anon_id`.
- If the Google user is **new** (no existing `users` row for that `google_sub`): create the user, then `UPDATE sessions SET user_id = <new_user.id> WHERE user_id = <anon_id>` — one-time migration.
- If the Google user **already exists**: do not touch `anon_id`'s sessions (that anonymous history is considered an orphaned device-local history and is left behind — avoids corrupting an existing account's history with unrelated anonymous data).

## 5. Token lifecycle

- **Access token**: JWT, 15 minutes, payload = `{ sub: user.id, exp, iat }`. Cookie `access_token`.
- **Refresh token**: random opaque string, 30 days, cookie `refresh_token` scoped to `Path=/auth` (reduces exposure — only sent to auth endpoints). Server stores only `sha256(token)`.
- **Rotation**: every successful `/auth/refresh` issues a new access + refresh token pair and marks the old refresh token row `revoked_at`. Old token can never be reused.
- **Reuse detection**: if a refresh request presents a token whose hash matches a row that is already `revoked_at IS NOT NULL`, treat as compromised — revoke **all** refresh tokens for that user and return `AUTH_REFRESH_REUSE_DETECTED`.
- **Logout**: revoke the refresh token row for the presented cookie, clear both cookies (`Max-Age=0`).
- Frontend uses a single in-flight refresh promise so concurrent 401s trigger only one `/auth/refresh` call.

Accepted trade-offs:
- A revoked refresh token doesn't invalidate an already-issued access token until it expires (≤15 min) — standard, low-risk window.
- Logout in one tab doesn't instantly invalidate access tokens held by other open tabs; they expire naturally within 15 minutes.

## 6. Error taxonomy

All auth errors return `{ "error_code": "...", "message": "<Vietnamese>" }`.

| error_code | HTTP | Trigger | User-facing message |
|---|---|---|---|
| `AUTH_STATE_MISMATCH` | 400 | `state` missing/invalid (CSRF or stale link) | "Phiên đăng nhập không hợp lệ, vui lòng thử lại." |
| `AUTH_GOOGLE_DENIED` | 400 | User cancelled Google consent | "Bạn đã huỷ đăng nhập Google." |
| `AUTH_TOKEN_EXCHANGE_FAILED` | 502 | Google token exchange failed (network/outage) | "Không thể kết nối Google, vui lòng thử lại sau." |
| `AUTH_INVALID_ID_TOKEN` | 400 | ID token fails iss/aud/nonce/signature check | "Xác thực không hợp lệ, vui lòng thử lại." |
| `AUTH_REFRESH_INVALID` | 401 | Refresh token missing/expired/revoked (normal expiry) | silent — frontend reverts to logged-out state, no banner |
| `AUTH_REFRESH_REUSE_DETECTED` | 401 | Revoked refresh token reused (theft signal) | "Phiên đăng nhập đã bị thu hồi vì lý do an ninh, vui lòng đăng nhập lại." (persistent banner) |
| `AUTH_RATE_LIMITED` | 429 | Too many login/refresh attempts | "Thao tác quá nhanh, vui lòng thử lại sau ít phút." (respects `Retry-After`) |

## 7. Frontend changes

| File | Change |
|---|---|
| `frontend/src/lib/client-identity.ts` | Keep anonymous UUID as fallback; no removal |
| `frontend/src/lib/api.ts` | All fetches add `credentials: 'include'`; add 401 → single in-flight `/auth/refresh` → retry wrapper |
| `frontend/src/app/auth/callback/page.tsx` (new) | Reads `?ok=1` / `?error=<code>`, shows status, redirects to `/` |
| `frontend/src/contexts/AuthContext.tsx` (new) | `{ user, isLoading, login(), logout() }`, calls `/auth/me` on mount |
| `frontend/src/components/layout/Header.tsx` | Shows "Đăng nhập với Google" when logged out; avatar + "Đăng xuất" when logged in |
| `frontend/src/components/layout/SessionList.tsx` | No fetch-logic change; just resolves `user_id` from `AuthContext` when present, else anonymous id |

## 8. Backend implementation surface

- New router `api/auth.py`: `GET /auth/google/login`, `GET /auth/google/callback`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
- New module `auth/tokens.py`: JWT encode/decode, refresh token generation/hashing.
- New module `auth/service.py`: find-or-create user, anonymous linking, rotation, reuse detection.
- New FastAPI dependency `get_current_user_optional` (doesn't raise, returns `None`) and `get_current_user` (raises 401) for protected routes.
- CORS: add the Vercel production origin to `allow_origins` in `main.py` (currently only `localhost:3000`/`3001`).
- New env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `FRONTEND_URL` (for post-callback redirect).

## 9. Testing strategy

See full breakdown discussed in design session. Summary:

- **Backend unit**: JWT encode/decode/expiry, refresh token hashing, anonymous-linking logic (new user vs existing user), rotation, reuse detection.
- **Backend integration** (`TestClient`, Google mocked via Authlib test doubles — no real network calls): happy path login (new + existing user), every error code in the taxonomy, refresh happy path + invalid + reuse, logout, `/auth/me` authed/unauthed, session list scoped to authed user, rate limiting.
- **Security tests**: cookie flags (`HttpOnly`, `Secure`, `SameSite=None`) asserted on every Set-Cookie; forged `state` rejected; refresh token never appears in JSON response bodies.
- **Frontend unit** (Vitest): `AuthContext` mount behavior, fetch-wrapper single-flight refresh-and-retry, concurrent-401 dedup, `Header` logged-in/out rendering, `/auth/callback` success/error rendering, logout clearing state.
- **Manual E2E checklist** (real Google account, run once before merge): login → avatar appears; prior anonymous history appears in SessionList; logout → avatar gone; session survives browser restart within 7 days via refresh; deleting the refresh cookie manually degrades gracefully to logged-out state.
- No new CI job — runs in existing `pytest` / `vitest` suites.

## 10. Prerequisites (user-owned, outside this spec's implementation)

- Create a Google Cloud OAuth Client ID (Authorized redirect URI = backend HF Space `/auth/google/callback` URL) and provide `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.

## 11. Out of scope / deferred

- "Revoke all sessions" / admin token management UI.
- Non-Google OAuth providers.
- Real-time cross-tab logout invalidation.
