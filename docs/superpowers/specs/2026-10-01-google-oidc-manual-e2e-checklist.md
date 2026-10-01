# Google OIDC — Prerequisite and Manual E2E Checklist

## Prerequisite (must be done before Task 10 can work end-to-end)

1. Go to https://console.cloud.google.com/apis/credentials
2. Create an OAuth 2.0 Client ID, type "Web application".
3. Authorized redirect URI — must exactly match `GOOGLE_OAUTH_REDIRECT_URI`:
   - Local dev: `http://localhost:8000/auth/google/callback`
   - Production: `https://<your-hf-space-domain>/auth/google/callback`
4. Copy the generated Client ID and Client Secret into:
   - Local: `.env` → `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
   - Production: the Hugging Face Space's secret environment variables
5. Set `JWT_SECRET_KEY` to a long random string (e.g. `openssl rand -hex 32`) in both environments — never reuse the local dev value in production.
6. Set `FRONTEND_URL` to the exact frontend origin (`http://localhost:3000` locally, the Vercel production URL in production) — this is both the post-login redirect target and must be added to the backend's CORS `allow_origins` list (Task 10).

## Manual E2E checklist (run once before merging, with a real Google account)

- [ ] Fresh browser profile, no existing cookies for either domain.
- [ ] Visit the frontend while anonymous, send a chat message, confirm it appears in "Gần đây" (SessionList) under the anonymous id.
- [ ] Click "Đăng nhập với Google" in the Header, complete the Google consent screen.
- [ ] Confirm redirect lands back on the frontend (`/auth/callback` then `/`), and the Header now shows the account name/avatar and "Đăng xuất" instead of the login button.
- [ ] Confirm the chat session sent while anonymous now appears in SessionList under the logged-in account (anonymous→account migration ran).
- [ ] Refresh the page — confirm the session persists (access token cookie still valid or silently refreshed) without being bounced back to logged-out.
- [ ] Close the browser entirely and reopen within a few minutes — confirm still logged in (refresh token cookie survived).
- [ ] Click "Đăng xuất" — confirm the Header reverts to the login button and a new chat message now gets attributed to a fresh anonymous id, not the old account.
- [ ] Log back in with the same Google account — confirm the account's own prior history reappears (not re-migrated, not duplicated).
- [ ] In the browser devtools, manually delete the `refresh_token` cookie, then wait for the access token to expire (or delete that cookie too) — confirm the app degrades gracefully to the logged-out UI rather than erroring.
- [ ] Open two tabs on the authenticated session; log out in one tab; confirm the other tab is not forcibly logged out immediately (per the spec's accepted trade-off — it naturally expires within 15 minutes).
