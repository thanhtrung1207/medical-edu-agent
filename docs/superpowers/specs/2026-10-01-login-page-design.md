# Dedicated `/login` Page — Design Spec

## Context

Google OIDC auth already exists end-to-end (see `docs/superpowers/specs/2026-10-01-google-oidc-auth-design.md`). Today, logging in is a single inline button in the `Header` labelled "Đăng nhập với Google" that calls `useAuth().login()` directly (redirecting straight to `/auth/google/login`).

This spec adds a dedicated `/login` page (split-screen layout, similar in spirit to Qoder's login screen) that becomes the single entry point for all sign-in affordances. Google remains the only functional provider. Email/password and other OAuth providers (Facebook, Apple) are visually present but disabled — reserved UI space for future work, not implemented now.

## Goals

- Replace the Header's direct-to-Google button with a generic "Đăng nhập" button that navigates to `/login`.
- `/login` shows: a branded left panel (gradient + icon + slogan, hidden on mobile), and a right panel with a working Google sign-in button, a disabled email/password form, and disabled Facebook/Apple buttons — all with "Sắp ra mắt" (coming soon) affordance via native `title` tooltips.
- Already-authenticated users visiting `/login` are redirected to `/`.
- No backend changes. No new API calls beyond what `useAuth()` already provides.

## Non-goals

- Implementing real email/password authentication (password storage, hashing, signup, reset flows).
- Implementing Facebook or Apple OAuth.
- A tooltip/popover library — plain `title` attributes are sufficient for this scope.

## Architecture

### Route change

- `frontend/src/components/layout/Header.tsx`: the login button's label changes from "Đăng nhập với Google" to **"Đăng nhập"**, and its `onClick` changes from `login` (the `useAuth()` function) to `() => router.push("/login")`. `Header` already has no `useRouter()` call today — add one, following the same pattern used in `SessionList.tsx`/`Drawer.tsx` (`const router = useRouter();` from `next/navigation`).
- New file `frontend/src/app/login/page.tsx` (client component, route `/login`):
  - Calls `const { user, login } = useAuth();` and `const router = useRouter();`.
  - `useEffect(() => { if (user) router.replace("/"); }, [user, router]);` — redirect already-authenticated users away. Mirrors the guard pattern already used in `frontend/src/app/auth/callback/page.tsx` (`router.replace("/")`).
  - Renders `null` while `user` is being resolved and redirect is pending, to avoid a flash of the login UI for an already-authenticated user (same `isLoading`-style guard already used elsewhere in the codebase, e.g. `AuthContext`'s own `isLoading` flag — here we gate on `user` directly since the page's only unwanted state is "user is in fact logged in").
  - Otherwise renders the split-screen layout: `<LoginBrandPanel />` (left, `hidden md:flex`) and the sign-in column (right): `<GoogleSignInButton />`, two `<DisabledProviderButton provider="facebook" />` / `<DisabledProviderButton provider="apple" />` side by side, a divider, then `<EmailPasswordForm />`.

### New components (`frontend/src/components/auth/`)

- **`LoginBrandPanel.tsx`** — static presentational component, no props. Gradient background (`bg-gradient-to-br from-primary to-blue-900` or equivalent existing Tailwind tokens), a dental-themed icon from `lucide-react` (reuse `Stethoscope`, already imported elsewhere in `Header.tsx`, to avoid introducing a new icon dependency), "UniDent" title, and a one-line static Vietnamese slogan ("Học nha khoa cùng AI — hỏi đáp, case study, quiz có trích dẫn"). Hidden below the `md` breakpoint (`hidden md:flex`), consistent with the project's existing mobile/tablet/desktop breakpoint conventions.
- **`GoogleSignInButton.tsx`** — extracted from the Google button markup currently inline in `Header.tsx`. Props: none (reads `login` from `useAuth()` itself). Renders the same visual button (`min-h-[44px]`, primary background, "Đăng nhập với Google" label) so both `Header` (if ever needed again) and `/login` share one implementation. `Header.tsx` is updated to no longer render this markup directly.
- **`DisabledProviderButton.tsx`** — props: `provider: "facebook" | "apple"`. Renders a `min-h-[44px]` `disabled` button with the provider's display name ("Facebook" / "Apple") and `title="Sắp ra mắt"`. No click handler (disabled buttons don't fire `onClick`).
- **`EmailPasswordForm.tsx`** — props: none. Renders a `<fieldset disabled>` wrapping an email `<input>`, a password `<input>`, and a submit `<button>` labelled "Đăng nhập". The submit button carries `title="Chức năng đăng nhập bằng email đang được phát triển"`. Wrapping the inputs in a `disabled` `fieldset` disables all of them in one place rather than repeating the `disabled` attribute three times.

### Data flow

No new network calls. `GoogleSignInButton` calls the existing `login()` from `AuthContext`, which already redirects the browser to `${config.apiBaseUrl}/auth/google/login?anon_id=...` (unchanged backend flow from the OIDC spec). `EmailPasswordForm` and `DisabledProviderButton` never call any API — they are inert by construction (`disabled`).

### Error handling

No new error states are introduced by this page itself. The existing `/auth/callback` page already owns all post-Google-redirect error handling (the 4-code mapping already implemented). `/login` only has one piece of control flow — the already-authenticated redirect guard — which has no failure mode (a `user` object or `null`, nothing can throw).

## Testing

Following the existing Vitest + Testing Library conventions already used throughout `frontend/src/components/`:

- **`frontend/src/app/login/page.test.tsx`** (new): wrap in `AuthProvider` like other auth-aware tests; mock `next/navigation`'s `useRouter` (`vi.hoisted` + `vi.mock`, same pattern as `SessionList.test.tsx`/`Drawer.test.tsx`). Cases:
  - renders the Google sign-in button when logged out (`fetch` stubbed to 401, same as other logged-out fixtures).
  - renders the brand panel, and the disabled email/password fields + disabled Facebook/Apple buttons, each with the expected `title`.
  - redirects to `/` (`router.replace` called with `"/"`) when `fetch` to `/auth/me` resolves with a 200 user — mirrors the "shows the avatar..." pattern already used in `Header.test.tsx`.
- **`frontend/src/components/auth/GoogleSignInButton.test.tsx`** (new): renders inside `AuthProvider` with `fetch` stubbed to a 401 (logged-out) response; asserts the button has the expected accessible name and `min-h-[44px]` class, matching the assertion style already used by `Header.test.tsx`'s "Header auth controls" tests.
- **`frontend/src/components/auth/DisabledProviderButton.test.tsx`** (new): for both `"facebook"` and `"apple"`, asserts the button is disabled and has the expected `title`.
- **`frontend/src/components/auth/EmailPasswordForm.test.tsx`** (new): asserts both inputs and the submit button are disabled, and the submit button has the expected `title`.
- **`frontend/src/components/layout/Header.test.tsx`** (modify): update the existing "shows a 44px-tall Google sign-in control when logged out" test — the button's accessible name changes from `"Đăng nhập với Google"` to `"Đăng nhập"`, and clicking it must now assert `navigation.push` was called with `"/login"` (reusing the `navigation` hoisted mock pattern already present in `SessionList.test.tsx`, which needs to be added to `Header.test.tsx`) instead of asserting a `login()` call.

No backend tests are affected — this is a frontend-only change.

## Open items carried forward (not blocking this spec)

- Real email/password auth and Facebook/Apple OAuth remain explicitly out of scope; if/when they're built, they'll need their own brainstorming + spec cycle (new backend auth methods, password policy, security review) following the same process as the Google OIDC spec.
