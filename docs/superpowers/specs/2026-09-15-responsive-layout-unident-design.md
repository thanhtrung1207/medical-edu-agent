# Responsive Layout and UniDent Branding Design

## Goals

Make the primary flow — root shell, home scenario selection, case study, and chat — fully usable from a 375px phone through a 1440px desktop, and unify every user-facing brand surface under the name `UniDent`.

Concretely:

- Navigation and recent chat sessions are reachable at every breakpoint; no control on a phone depends on a hidden sidebar.
- The case study page works full-screen on phones through two tabs, `Thông tin ca` and `Trợ lý AI`, instead of two cramped half-height panes.
- No horizontal scrolling occurs anywhere in the primary flow at any tested viewport.
- Interactive controls in the primary flow meet an approximately 44px minimum touch target, with one documented exception for tooth buttons.
- The chat textarea grows with its content up to a cap, then scrolls internally.
- Existing behavior is preserved: dark mode, session realtime updates driven by `SESSION_UPDATED_EVENT`, chat history restore, case finish-and-save, and all backend contracts.
- No backend, API, database, or environment changes.

## Non-goals

- No responsive rework of the `/history`, `/quiz`, `/progress`, and `/upload` page content. They inherit the new shell (drawer, rail, expanded sidebar, header) but their internal layouts are unchanged.
- No rebrand of packages (`medical-edu-agent-frontend`), localStorage keys (`medical-edu-agent.user-id`, `theme`), API routes, backend identifiers, databases, environment variables, deployment project names, the `logo.svg` asset filename, or technical documentation.
- No rebrand of the legacy standalone demo `public/dental-case-assistant.html`; it is not part of the Next.js app shell and is retired separately if desired.
- No new frontend dependencies. The drawer, rail, focus trap, and tabs are implemented with React state, Tailwind, and native elements.
- No persistence of drawer state or active case tab across page reloads.
- No visual redesign: colors, fonts, theme tokens, and the overall aesthetic are unchanged.
- No i18n changes; user-facing copy stays Vietnamese.
- No automated E2E framework is introduced; browser E2E is a manual checklist at the specified matrix.
- No changes to `SettingsModal`, `FeedbackButtons`, `MessageBubble`, or `ConfidenceBadge` internals beyond fitting available width.

## Current problems

1. `Sidebar` is `hidden md:flex`, so below 768px there is no navigation at all. Recent sessions are equally unreachable on phones.
2. `SessionList` is mounted inside that hidden sidebar, so on every mobile page load it fetches session data that can never be seen.
3. `ScenarioCard` has a fixed `w-[340px]` inside a `p-10` home container. At 375px the available width is 295px, so the card causes horizontal overflow.
4. The case page stacks the form and chat at 50%/50% height below 768px. Both panes are unusably short, and neither can be viewed full-screen.
5. `ToothChart` renders 16 tooth buttons (28px each plus gaps and a divider, roughly 480px) in a non-wrapping row inside a panel with roughly 350px of inner width. It overflows even on desktop, producing an internal horizontal scrollbar.
6. The chat textarea is fixed at `rows={1}` with no auto-resize. The existing `max-h-40` has no effect, so long drafts are confined to a single scrolling line.
7. Several controls are below a 44px touch target: header settings/theme buttons (32px), session rows, and suggestion buttons.
8. The brand is inconsistent across surfaces: `Phục hình AI` (Header, Sidebar), `Trợ lý Phục hình` (Header title, Sidebar subtitle), `Trợ lý Lâm sàng Phục hình` (home), `Trợ lý AI Giáo dục Y khoa` (browser title), and `Trợ lý AI Giáo dục Nha khoa` (chat empty state).
9. Between 768px and 1023px the full 256px sidebar consumes tablet width that the chat and case panes need.

## Breakpoint behavior

The three tiers map directly onto Tailwind's default `md` (768px) and `lg` (1024px) tokens; no custom breakpoint configuration is added.

- Mobile — below 768px (below `md`):
  - The persistent sidebar is hidden. The Header shows a hamburger button that opens the navigation as an overlay drawer containing the labeled nav and the recent-sessions list.
  - The case page renders two full-screen tabs, `Thông tin ca` and `Trợ lý AI`. Both panels stay mounted so form values, selected teeth, chat messages, and chat session state persist across tab switches. The active tab is local React state, defaults to `Thông tin ca`, and switches to `Trợ lý AI` automatically when the case is submitted.
  - Cards, forms, and chat fill the full width. No horizontal overflow at 375px.
- Tablet — 768px through 1023px (`md` to below `lg`):
  - A persistent icon rail approximately 56px wide (`w-14`) shows the logo mark, icon-only nav links with active highlighting, and an expand button at its top. The expand button opens the same overlay drawer with labels and recent sessions.
  - The case page returns to the horizontal layout: the form pane is approximately 320px (`md:w-80`) and the chat pane takes the remaining flexible width.
- Desktop — 1024px and above (`lg` and up):
  - The full 256px expanded sidebar (`lg:w-64`) with labels and the always-mounted recent-sessions list, as today.
  - The case form pane is approximately 400px (`lg:w-[400px]`) with the flexible chat pane beside it.
  - Content max widths stay sensible: chat messages and the input column keep the existing centered `max-w-3xl`; the home scenario grid keeps its existing `max-w-3xl`; the case chat fills the remaining pane width.

If the drawer is open when the viewport grows to `lg` or wider, the drawer dismisses itself so the expanded sidebar does not compete with it. Shrinking the viewport never auto-opens anything.

## Component design

### AppShell (new)

A client component in `src/components/layout/` owns the drawer open state (plain `useState`, default `false`, so server and client render identically). `src/app/layout.tsx` remains a server component that owns metadata and renders `AppShell` around the existing Header / Sidebar / main / Footer structure. The shell coordinates the Header hamburger, the rail expand button, and the Drawer. Drawer state is never written to storage.

### Sidebar

One persistent `aside` serves tablet and desktop with responsive classes: `w-14 lg:w-64`, icon-only items below `lg`, labels (`hidden lg:inline`) from `lg` up, and the same active-state highlighting via `usePathname` as today. Rail items expose accessible names (visually hidden text or `aria-label`) and `title` tooltips. The expand button sits at the top of the rail, visible only between `md` and `lg`, labeled `Mở rộng thanh điều hướng` with `aria-expanded` and `aria-controls`. The brand block shows the logo mark below `lg` and the `UniDent` wordmark with its subtitle from `lg` up. The `SessionList` is mounted inside the sidebar only from `lg` up — conditionally mounted through a viewport query, not merely CSS-hidden — so phones and tablets never fetch session data into an invisible surface, which removes today's hidden-sidebar fetch. At `lg` and above it stays mounted exactly as today. The Knowledge Base external link is retained in both rail (icon) and expanded (labeled) forms.

### Drawer (new)

An overlay rendered only while open: a backdrop plus a panel approximately 288px wide (`w-72`, capped at `max-w-[85vw]`) styled like the expanded sidebar. It contains the `UniDent` brand block, the fully labeled nav, and a `SessionList` instance that mounts when the drawer opens. Both the mobile hamburger and the tablet rail expand button open this same drawer. The drawer closes on navigation, session selection, the new-conversation action, backdrop click, and `Escape`, and auto-dismisses when the viewport reaches `lg`. Because the `SessionList` mounts on open, the visible list is always fresh; while any instance is mounted, the existing `SESSION_UPDATED_EVENT` listener refreshes it, preserving today's realtime behavior wherever the list is visible.

### Header

The left region shows the hamburger button below `md` only, followed by the `UniDent` wordmark at all sizes (replacing today's mobile-only brand text and the `md`+ title). Settings and theme toggle buttons are retained and enlarged to an 11×11 unit (44px) hit area. `SettingsModal` behavior is unchanged.

### SessionList

Data logic is unchanged: fetch on mount, refetch on `SESSION_UPDATED_EVENT`, the fetch-generation guard, and the existing loading, failed-with-retry, and empty states. Only its container width behavior adapts to the drawer versus expanded sidebar.

### Home and ScenarioCard

The home container padding becomes `p-4 md:p-10` so phones lose the 40px gutters. The heading is rebranded (see Branding) and the existing tagline line is kept. `ScenarioCard` changes from fixed `w-[340px]` to `w-full max-w-[340px]`, so cards fill the width on small screens and keep their 340px design size on larger ones; the existing wrap behavior is kept and each card remains a single touch target of well over 44px.

### Case page

Below `md`, a tab bar (see Interaction and accessibility) switches between the two mounted panels; the inactive panel carries the `hidden` attribute so its state and scroll position persist. Submitting the case sets `caseSubmitted`, and an effect switches the active tab to `Trợ lý AI`; the chat's existing `initialMessage` auto-send continues to drive the analysis. When the scenario route changes, the existing reset effect also resets the active tab to `Thông tin ca`. From `md` up, the layout is horizontal with the form pane `md:w-80 lg:w-[400px]` and the chat pane `flex-1 min-w-0`, replacing today's uniform `md:w-[400px]`. Pre-submit placeholder copy that references `panel bên trái` is reworded to viewport-neutral wording (for example, "Điền thông tin bệnh nhân và nhấn Gửi case để phân tích") because the form is a tab on mobile.

### CaseForm and ToothChart

`CaseForm` keeps its header bar, scrollable body, and footer submit button; text inputs, the submit button, and `Case mẫu` control get a minimum 44px height. `ToothChart` reflows its quadrant rows to stack vertically (upper-right, upper-left, lower-right, lower-left, preserving tooth ordering within each quadrant) at every breakpoint, which fixes the existing desktop overflow. Tooth buttons keep approximately 28px at `md` and up for pointer precision, and grow to roughly 36–40px below `md` so a full quadrant of eight teeth fits the 375px form pane without scrolling. The `Xóa chọn` control is enlarged to a 44px target.

### ChatInterface

The component keeps its structure and all session/history/error logic. Widths inside the scroll area and input row remain full-container with the existing centered `max-w-3xl` columns. The textarea auto-grows: on each value change its height is reset and set to its `scrollHeight`, starting from a 44px minimum (`min-h-[44px]`, `rows={1}`), capped at 160px (`max-h-40`); past the cap the textarea scrolls internally (`overflow-y-auto`). After a send or reset the height returns to the baseline. The send button keeps its 11×11 unit size; suggestion buttons get a 44px minimum height; Enter-to-send and Shift+Enter newline behavior is unchanged.

## Interaction and accessibility

- Drawer: the panel has `role="dialog"`, `aria-modal="true"`, and is labeled by its brand heading. On open, focus moves to the first nav link. While open, `Tab` and `Shift+Tab` cycle within the drawer (minimal hand-rolled focus trap). `Escape` closes it, and focus returns to the control that opened it (hamburger or rail expand button). Both invoking controls expose `aria-expanded` and `aria-controls`. The backdrop intercepts pointer events and closes on click. Drawer transitions respect `prefers-reduced-motion` by opening and closing instantly.
- Tabs: the case tab bar uses `role="tablist"`, `role="tab"` with `aria-selected`, and `role="tabpanel"` panels referenced by `aria-labelledby`. Arrow keys move focus between tabs (roving tabindex). Each tab is at least 44px tall. The inactive panel is removed from the accessibility tree via the `hidden` attribute.
- Rail: every icon-only link and button has an accessible name; active state is conveyed by styling plus `aria-current="page"` on the active nav link.
- Touch targets: hamburger, rail expand, rail items, drawer nav items, session rows, new-conversation, settings, theme, tabs, suggestion buttons, form inputs, submit buttons, and chat send are all at least 44×44px. Tooth buttons are the single documented exception (roughly 36–40px below `md`, 28px above) because eight must fit per quadrant row at 375px; this is an intentional trade-off for dense anatomical data entry and is noted in the acceptance criteria.
- Keyboard-only users can reach every primary-flow feature: navigation via drawer, tab switching, form entry, tooth selection, chat send, history retry, and session switching, all with native focusable elements.
- Dark mode: all new surfaces (rail, drawer, tab bar, resized controls) use the existing `dark:` class pattern and are verified in the matrix.

## Branding

The canonical brand is `UniDent` (capital U and D, one word). The canonical Vietnamese descriptor is `Trợ lý AI Giáo dục Nha khoa`.

- `src/app/layout.tsx` metadata: title becomes `UniDent — Trợ lý AI Giáo dục Nha khoa`; the description leads with `UniDent` and retains the evidence-based educational wording. `lang="vi"`, viewport, theme color, and the `/logo.svg` icon are unchanged.
- `Header.tsx`: the wordmark `UniDent` replaces both `Phục hình AI` (mobile brand) and `Trợ lý Phục hình` (`md`+ title).
- `Sidebar.tsx` and the Drawer brand block: the name becomes `UniDent` and the subtitle becomes `Trợ lý AI Giáo dục Nha khoa`, replacing `Phục hình AI` / `Trợ lý Phục hình`.
- `app/page.tsx`: the home heading `Trợ lý Lâm sàng Phục hình` becomes `UniDent`; the tagline beneath it is kept.
- `ChatInterface.tsx`: `DEFAULT_HEADER_TITLE` becomes `UniDent`. Explicit per-page titles such as `Trò chuyện` and `Giảng viên AI` are functional labels, not brand surfaces, and are unchanged.
- The Footer disclaimer contains no brand and is unchanged.

The rename is limited to user-visible strings. It must not touch identifiers, storage keys, API paths, package names, or documentation, so no contract, test fixture, or deployment setting breaks. No existing frontend test asserts any of the replaced strings.

## Error and state handling

- `SessionList` keeps its loading, failed-with-retry, and empty states in both the expanded sidebar and the drawer; a failure inside the drawer shows the same retry affordance.
- Chat history restore keeps its error banner, retry, and dismiss behavior; none of it changes with layout.
- The drawer has no asynchronous failure modes. It closes optimistically on nav or session click rather than waiting for route completion, matching standard overlay-drawer behavior.
- Case tab switching never unmounts `ChatInterface`, so in-flight requests and the existing conversation-generation guard behave exactly as today.
- Viewport resizing across tiers is CSS-driven; the only scripted response is the `lg` auto-dismiss of an open drawer.
- No new error states, no new API calls beyond the existing session-list fetch, and no changes to request or response shapes.

## Testing and acceptance criteria

Automated checks (run in `frontend/`):

- Type-check: `npx tsc --noEmit` passes.
- Unit tests: `npm test` passes, including new component tests for the drawer (open via hamburger, close on backdrop and `Escape`, focus return to the invoking control) and the case tabs (switch persistence and auto-switch to `Trợ lý AI` after submit). The textarea auto-grow is covered by behavior review in the browser because jsdom does not report usable `scrollHeight`.
- Production build: `npm run build` succeeds.

Manual browser E2E matrix, each verified in both light and dark mode:

- 375×667 and 390×844 (mobile): hamburger opens the drawer; nav and session selection work and close the drawer; `Escape` and backdrop click close it; the home shows full-width cards; the case page shows both tabs, tab state persists, submit switches to `Trợ lý AI`; the tooth chart fits without horizontal scroll; the chat textarea grows to its cap and then scrolls; `document.documentElement.scrollWidth` never exceeds `window.innerWidth` on home, chat, and case pages.
- 768×1024 and 1024×768 (tablet): the 56px rail is persistent with icon nav and active highlighting; the expand button opens the labeled drawer with recent sessions; the case page is horizontal with a 320px form pane; session list updates in realtime after sending a chat message; no horizontal overflow.
- 1280×800 and 1440×900 (desktop): the 256px expanded sidebar with `SessionList` behaves as today; the case form pane is approximately 400px; chat content stays within its max width; resizing from a drawer-open tablet width to `lg` dismisses the drawer.

Acceptance criteria:

- Every primary-flow surface and control is reachable and usable at all six matrix sizes with zero horizontal overflow.
- The case study is completable end-to-end (sample case, submit, chat, finish and save) on a 375px viewport.
- Recent sessions remain visible and realtime-updated wherever a session list is visible.
- No user-facing surface still presents an old brand name (`Phục hình AI`, `Trợ lý Phục hình`, `Trợ lý Lâm sàng Phục hình`, or the old browser title `Trợ lý AI Giáo dục Y khoa`); `UniDent` appears in the browser title, Header, Sidebar/Drawer, and home heading, and `Trợ lý AI Giáo dục Nha khoa` appears only as the descriptor alongside the brand, never as a standalone label.
- Tooth buttons remain the only sub-44px touch targets in the primary flow (roughly 36–40px below `md`, 28px above), an accepted exception for dense anatomical data entry.
- No file outside `frontend/src` changes, and no backend, API, storage-key, or package-name change is included.
- Type-check, unit tests, and the production build all pass.

## Risks

- The hand-rolled focus trap could leak focus in edge cases; the trap is kept minimal (Tab loop within the drawer) and covered by component tests.
- `SessionList` remounts and refetches each time the drawer opens on mobile or tablet. The cost is one lightweight GET per open, and it guarantees the visible list is never stale; it replaces today's wasteful fetch into a hidden sidebar.
- Stacking tooth-chart quadrants changes the visual arrangement existing users know; quadrant labels and tooth ordering are preserved to limit confusion.
- At exactly 1024px the desktop layout leaves roughly 368px of chat width beside the 400px form pane; acceptable and consistent with the approved design.
- The rename could briefly confuse returning users who knew the old name; the retained Vietnamese descriptor keeps context.
- Conditional drawer rendering must keep server and client markup identical; the closed-by-default state and absence of persisted drawer state eliminate hydration-mismatch risk.
- Textarea auto-grow depends on browser `scrollHeight` behavior and is therefore verified only in the manual matrix, not in jsdom unit tests.
