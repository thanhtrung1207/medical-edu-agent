# Premium Login and Dashboard Redesign — Design Spec

## Context

UniDent already has Google OIDC authentication and a dedicated `/login` route. The current login page is functional but visually simple: a split screen with a brand panel and basic provider/form controls. The current home route (`/`) is also simple: a centered UniDent hero with two scenario cards.

The selected visual direction is **Option A: Premium Medical SaaS** from the mockups shown in the visual companion. The goal is to keep UniDent's existing maroon/gold identity while making the first-run and post-login experience feel more polished, trustworthy, and product-grade.

## Goals

- Redesign `/login` into a premium shadcn-style login screen using richer cards, soft borders, controlled shadows, Google branding, provider placeholders, disabled email/password inputs, and reassuring microcopy.
- Redesign `/` from a basic welcome screen into a dashboard-style home overview that still routes users into the two existing dental case flows.
- Introduce a small internal `components/ui/` primitive layer inspired by shadcn (`Button`, `Card`, `Badge`, `Input`, `Separator`) using the existing `cn()` helper and Tailwind tokens.
- Preserve all existing authentication behavior: Header routes to `/login`, Google sign-in still calls `useAuth().login()`, already-authenticated users visiting `/login` still redirect to `/`.
- Preserve all existing case routing: `/case/fracture` and `/case/missing` remain the scenario card targets.

## Non-goals

- Installing the shadcn CLI or adding Radix dependencies for this pass.
- Implementing real email/password auth.
- Implementing Facebook or Apple auth.
- Adding English/Vietnamese language switching. This remains a future enhancement.
- Changing backend APIs, auth tokens, session storage, RAG, chat, quiz, or case analysis logic.
- Bypassing the existing `AppShell` for `/login` or `/`.

## Visual Direction

### Shared style language

Use a premium medical SaaS look:

- Primary palette remains the existing Tailwind `primary` maroon family (`#8B1E3F`) with `primary-900` for depth.
- Secondary accents use the existing gold `secondary` family.
- Surfaces use `cream`, `surface`, `surface2`, and `borderSoft` from `tailwind.config.ts`.
- Cards use rounded corners (`rounded-2xl` / `rounded-3xl`), subtle border, soft shadow, and generous spacing.
- CTAs are clearly differentiated: maroon primary action, muted disabled placeholders.
- Copy stays Vietnamese-first.

### `/login`

The page remains a client component with the existing authenticated redirect guard. The visual redesign changes composition only:

- Full-page premium background: cream/white/gold radial or gradient accents using Tailwind classes.
- Left brand panel:
  - Dental icon/logo block.
  - Strong UniDent branding.
  - Headline: "Học nha khoa với trợ lý AI có trích dẫn."
  - Short supporting copy about case study, quiz, and cited answers.
  - Three feature rows: case study, quiz/spaced repetition, cited answers.
  - Hidden below `md`, preserving mobile readability.
- Right auth card:
  - shadcn-style `Card` with translucent/white surface, border, and shadow.
  - Kicker text: "Welcome to UniDent".
  - Heading: "Đăng nhập".
  - Microcopy explaining continuity of personalized AI study history.
  - Primary `GoogleSignInButton` with a Google mark and existing `login()` behavior.
  - Disabled Facebook/Apple buttons with improved disabled styling and `title="Sắp ra mắt"`.
  - `Separator` labelled "hoặc".
  - Disabled `EmailPasswordForm` with icon-like leading affordances, explicit disabled fields, and existing jsdom-safe disabled behavior.
  - Footer microcopy: Google OAuth security and learning history sync.

### `/` dashboard/home overview

The current home page becomes a premium dashboard-style learning cockpit while remaining static/local UI for now:

- Page background uses cream/surface gradients and scroll-safe padding.
- Top greeting block:
  - Heading: "Chào mừng quay lại".
  - Supporting line: "Tiếp tục ca lâm sàng và luyện quiz hôm nay."
  - Small badge: "AI Dental Education".
- Hero card:
  - Maroon gradient card with headline "Case Study: Phục hình răng sau".
  - Short explanation of Socratic guidance, treatment planning, and citations.
  - Primary CTA routes to `/case/fracture`.
  - Decorative FDI/tooth grid preview on larger screens only.
- Metric cards:
  - "Cases done" static value.
  - "Quiz streak" static value.
  - "Citations" static value.
  These are visual engagement placeholders only, not backed by new APIs in this pass.
- Scenario cards:
  - Keep both existing scenarios and routes.
  - Upgrade `ScenarioCard` to a more polished card with badge/tag chips, hover lift, and stronger CTA affordance.
  - Card content stays the same unless needed for wording polish.
- Secondary panels:
  - Lightweight static "Learning plan" and "Recent sessions" panels to make the home feel dashboard-like without adding data dependencies.

## Component Architecture

### New internal UI primitives

Create focused primitives under `frontend/src/components/ui/`:

- `Button.tsx`
  - Props extend native button props.
  - Supports `variant`: `primary`, `secondary`, `outline`, `ghost`, `muted`.
  - Supports `size`: `sm`, `md`, `lg`.
  - Uses `cn()` from `@/lib/utils`.
- `Card.tsx`
  - Exports `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
  - Pure styling wrappers around semantic `div` elements.
- `Badge.tsx`
  - Supports `variant`: `primary`, `secondary`, `muted`.
- `Input.tsx`
  - Native input wrapper with premium border/focus/disabled styling.
- `Separator.tsx`
  - Horizontal separator with optional centered label.

These are shadcn-style internal components, not a full design system and not a dependency installation.

### Auth components to update

- `LoginBrandPanel.tsx`
  - Upgrade visual treatment to the premium brand panel.
  - Keep no props.
  - Keep `hidden md:flex` behavior.
- `GoogleSignInButton.tsx`
  - Render through the new `Button` primitive with `variant="primary"` and `size="lg"`.
  - Add Google mark visual.
  - Keep label "Đăng nhập với Google".
  - Keep `onClick={login}`.
- `DisabledProviderButton.tsx`
  - Use improved disabled shadcn-style button styling.
  - Keep `provider: "facebook" | "apple"`.
  - Keep `disabled` and `title="Sắp ra mắt"`.
- `EmailPasswordForm.tsx`
  - Use the new `Input` primitive for both fields.
  - Use the new `Button` primitive with `variant="muted"` and `size="lg"` for the disabled submit button.
  - Keep form inert.
  - Keep explicit `disabled` attributes on controls because jsdom does not propagate disabled fieldset state to descendants.
  - Keep tooltip/title text: "Chức năng đăng nhập bằng email đang được phát triển".

### Page and home components to update

- `frontend/src/app/login/page.tsx`
  - Keep user redirect guard unchanged.
  - Compose the upgraded brand panel and auth card layout.
- `frontend/src/app/page.tsx`
  - Replace centered welcome layout with premium dashboard/home overview.
  - Continue using `ScenarioCard` for the two case routes.
- `frontend/src/components/home/ScenarioCard.tsx`
  - Keep current props: `href`, `icon`, `title`, `description`, `tags`.
  - Improve visual styling only.

## Data and Behavior

No new data sources are introduced.

- Google login still uses `AuthContext.login()`.
- Email/password and Facebook/Apple remain disabled placeholders.
- Dashboard metrics and secondary panels are static presentation content for this pass.
- Case scenario cards continue to navigate through Next.js `Link`.
- Existing dark mode support should remain visually acceptable using existing `dark:` Tailwind variants on new surfaces.

## Accessibility and Responsiveness

- All clickable targets must remain at least 44px tall.
- `/login` must stay usable on mobile: brand panel hidden below `md`, auth card centered with safe padding.
- `/` dashboard must stack cleanly on mobile: hero, metrics, scenario cards, secondary panels become a single column.
- Headings remain meaningful: `/login` uses one main `h1`; `/` uses one main `h1`.
- Decorative empty separators should use `aria-hidden="true"` where applicable.
- Disabled placeholder controls use both visual disabled styling and actual `disabled` attributes.

## Testing

Follow existing Vitest + Testing Library conventions. No jest-dom matchers.

- Add tests for new `components/ui/` primitives where behavior or variants matter:
  - `Button` renders classes for variant/size and forwards native props.
  - `Input` forwards disabled props.
  - `Separator` renders label when provided.
- Update auth component tests:
  - `GoogleSignInButton.test.tsx` still finds "Đăng nhập với Google" and verifies 44px target.
  - `DisabledProviderButton.test.tsx` still verifies disabled state and `title`.
  - `EmailPasswordForm.test.tsx` still verifies disabled email/password/submit controls and tooltip title.
  - `LoginBrandPanel.test.tsx` verifies UniDent, premium headline/feature text, `hidden` and `md:flex`.
- Update `/login/page.test.tsx`:
  - Logged-out page renders premium auth card, Google button, disabled providers, disabled email/password form.
  - Already-authenticated user still redirects to `/`.
- Update home tests or add `frontend/src/app/page.test.tsx` if no current test exists:
  - Home renders the dashboard greeting/hero.
  - Both existing case links point to `/case/fracture` and `/case/missing`.
  - Scenario cards keep the 44px CTA affordance.

## Open items carried forward

- English/Vietnamese language switcher.
- Real email/password authentication.
- Facebook/Apple OAuth.
- Live dashboard metrics from backend data.
- User-personalized greeting from the authenticated profile.
