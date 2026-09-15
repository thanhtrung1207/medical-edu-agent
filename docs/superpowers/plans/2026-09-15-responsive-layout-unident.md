# Responsive Layout & UniDent Branding — Implementation Plan

> **Agentic worker sub-skill**: This plan is designed for execution by an agentic coding worker (subagent or main agent). Each task is self-contained with exact file paths, concrete code, and verification commands. The worker should execute tasks sequentially, committing after each task group.

## Goal

Make the primary flow (root shell, home, case study, chat) fully usable from 375px phone through 1440px desktop, and unify every user-facing brand surface under `UniDent`. No backend, API, database, or environment changes.

## Architecture

Three-tier responsive strategy using Tailwind default breakpoints only:

- **Mobile** (< 768px, below `md`): Hidden sidebar, hamburger opens overlay drawer, case page uses tabs.
- **Tablet** (768px–1023px, `md` to below `lg`): 56px icon rail with expand button that opens overlay drawer, case page horizontal split.
- **Desktop** (>= 1024px, `lg`+): 256px expanded sidebar with always-mounted SessionList, case page horizontal split.

A new `AppShell` client component owns drawer state. `SessionList` is conditionally mounted (not merely CSS-hidden) only where visible: desktop sidebar or open drawer. Drawer auto-dismisses at `lg` breakpoint.

## Tech Stack

- Next.js 14 (App Router), React 18, Tailwind CSS 3.4, TypeScript 5
- Vitest + @testing-library/react + jsdom for unit/component tests
- lucide-react for icons
- No new dependencies added

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/components/layout/AppShell.tsx` | **Create** | Client component: drawer state, coordinates hamburger + rail expand + drawer overlay, renders Sidebar/Header/main/Footer |
| `frontend/src/components/layout/Drawer.tsx` | **Create** | Overlay drawer with backdrop, panel, focus trap, Escape close, nav + SessionList |
| `frontend/src/components/layout/Sidebar.tsx` | **Modify** | Responsive rail (`w-14 lg:w-64`), icon-only below `lg`, conditional SessionList mount at `lg+`, expand button `md`–`lg` |
| `frontend/src/components/layout/Header.tsx` | **Modify** | Hamburger below `md`, UniDent wordmark at all sizes, 44px settings/theme buttons |
| `frontend/src/app/layout.tsx` | **Modify** | Wrap children in AppShell, update metadata title/description to UniDent |
| `frontend/src/app/page.tsx` | **Modify** | UniDent heading, responsive padding `p-4 md:p-10` |
| `frontend/src/components/home/ScenarioCard.tsx` | **Modify** | `w-full max-w-[340px]` instead of fixed `w-[340px]` |
| `frontend/src/app/case/[scenario]/page.tsx` | **Modify** | Mobile tabs, responsive form widths, auto-switch tab on submit |
| `frontend/src/components/case/ToothChart.tsx` | **Modify** | Stack quadrant rows vertically, responsive tooth button sizes, 44px clear button |
| `frontend/src/components/case/CaseForm.tsx` | **Modify** | 44px min heights on submit/sample/back buttons |
| `frontend/src/components/case/FormField.tsx` | **Modify** | 44px min height on text inputs and selects |
| `frontend/src/components/chat/ChatInterface.tsx` | **Modify** | Textarea auto-grow, UniDent `DEFAULT_HEADER_TITLE`, reword panel-left copy, 44px suggestion buttons |
| `frontend/src/components/layout/Drawer.test.tsx` | **Create** | Drawer open/close, backdrop click, Escape, SessionList mounting |
| `frontend/src/app/case/[scenario]/CasePageTabs.test.tsx` | **Create** | Tab switching, state persistence, auto-switch on submit |

---

## Task 1: UniDent Metadata Branding

**Files**: `frontend/src/app/layout.tsx`
**Time**: ~2 min

### 1a. Update metadata title and description

Replace the existing `metadata` export:

```tsx
export const metadata: Metadata = {
  title: "UniDent — Trợ lý AI Giáo dục Nha khoa",
  description:
    "UniDent hỗ trợ sinh viên Răng Hàm Mặt phân tích case lâm sàng và học tập dựa trên y học bằng chứng.",
  icons: { icon: "/logo.svg" },
};
```

### Verification

```bash
cd frontend && npx tsc --noEmit
# Expected: pass
```

### Commit

```
docs: update metadata to UniDent branding
```

---

## Task 2: Header — UniDent Wordmark, Hamburger Stub, 44px Buttons

**Files**: `frontend/src/components/layout/Header.tsx`
**Time**: ~3 min

### 2a. Replace brand regions with single UniDent wordmark

Remove the existing mobile brand `div` (`md:hidden` with `Phục hình AI`) and the desktop `h1` (`hidden md:block` with `Trợ lý Phục hình`). Replace with one wordmark visible at all sizes:

```tsx
<span className="text-sm font-bold text-slate-800 dark:text-slate-100">
  UniDent
</span>
```

### 2b. Add hamburger button prop and stub

Add interface and prop:

```tsx
interface HeaderProps {
  onToggleDrawer?: () => void;
}

export function Header({ onToggleDrawer }: HeaderProps) {
```

Add hamburger before the wordmark, visible only below `md`:

```tsx
<button
  type="button"
  onClick={onToggleDrawer}
  aria-label="Mở menu điều hướng"
  aria-expanded={false}
  aria-controls="nav-drawer"
  className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
>
  <Menu className="h-5 w-5" />
</button>
```

Import `Menu` from `lucide-react`.

### 2c. Enlarge settings/theme buttons to 44px

Change both buttons from `p-2` to `flex h-11 w-11 items-center justify-center`:

```tsx
<button
  type="button"
  onClick={() => setSettingsOpen(true)}
  title="Quản lý dữ liệu học tập"
  aria-label="Quản lý dữ liệu học tập"
  className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
>
  <Settings className="h-4 w-4" />
</button>
```

Same pattern for theme toggle.

### Full Header.tsx

```tsx
"use client";

import { useEffect, useState } from "react";
import { Menu, Moon, Settings, Stethoscope, Sun } from "lucide-react";
import { SettingsModal } from "@/components/case/SettingsModal";

interface HeaderProps {
  onToggleDrawer?: () => void;
}

export function Header({ onToggleDrawer }: HeaderProps) {
  const [dark, setDark] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const prefersDark =
      stored === "dark" ||
      (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(prefersDark);
    document.documentElement.classList.toggle("dark", prefersDark);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleDrawer}
          aria-label="Mở menu điều hướng"
          aria-expanded={false}
          aria-controls="nav-drawer"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white md:hidden">
          <Stethoscope className="h-4 w-4" />
        </div>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
          UniDent
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Quản lý dữ liệu học tập"
          aria-label="Quản lý dữ liệu học tập"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={dark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
```

### Verification

```bash
cd frontend && npx tsc --noEmit
# Expected: pass
```

### Commit

```
feat(header): UniDent wordmark, hamburger stub, 44px touch targets
```

---

## Task 3: ScenarioCard Responsive Width

**Files**: `frontend/src/components/home/ScenarioCard.tsx`
**Time**: ~2 min

### 3a. Replace fixed width with responsive

Change the Link className from `w-[340px]` to `w-full max-w-[340px]`:

```tsx
className="group block w-full max-w-[340px] bg-white rounded-2xl p-7 cursor-pointer border-2 border-borderSoft transition-all hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-1 hover:border-primary"
```

### Verification

```bash
cd frontend && npx tsc --noEmit
# Expected: pass
```

### Commit

```
fix(scenario-card): responsive width prevents horizontal overflow at 375px
```

---

## Task 4: Home Page — Responsive Padding and UniDent Heading

**Files**: `frontend/src/app/page.tsx`
**Time**: ~2 min

### 4a. Responsive container padding

Change `p-10` to `p-4 md:p-10`:

```tsx
<div className="flex-1 flex flex-col items-center justify-center p-4 md:p-10 min-h-[calc(100vh-56px)] overflow-y-auto">
```

### 4b. Rebrand heading

Change `Trợ lý Lâm sàng Phục hình` to `UniDent`:

```tsx
<h1 className="text-3xl font-extrabold text-slate-800 mb-2">UniDent</h1>
```

### Verification

```bash
cd frontend && npx tsc --noEmit
# Expected: pass
```

### Commit

```
feat(home): responsive padding, UniDent heading
```

---

## Task 5: AppShell — Drawer State Coordinator

**Files**: `frontend/src/components/layout/AppShell.tsx`, `frontend/src/app/layout.tsx`
**Time**: ~4 min

### 5a. Create AppShell.tsx

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Drawer } from "./Drawer";
import { Footer } from "./Footer";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerInvokerRef = useRef<HTMLButtonElement | null>(null);

  const openDrawer = useCallback(() => {
    drawerInvokerRef.current =
      document.activeElement as HTMLButtonElement | null;
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    drawerInvokerRef.current?.focus();
    drawerInvokerRef.current = null;
  }, []);

  const toggleDrawer = useCallback(() => {
    if (drawerOpen) closeDrawer();
    else openDrawer();
  }, [drawerOpen, closeDrawer, openDrawer]);

  // Auto-dismiss drawer when viewport crosses lg (1024px)
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches && drawerOpen) {
        setDrawerOpen(false);
        drawerInvokerRef.current = null;
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [drawerOpen]);

  return (
    <>
      <Sidebar onExpandDrawer={openDrawer} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onToggleDrawer={toggleDrawer} />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
        <Footer />
      </div>
      <Drawer open={drawerOpen} onClose={closeDrawer} />
    </>
  );
}
```

### 5b. Update layout.tsx to use AppShell

Replace the body contents. Remove `Sidebar`, `Header` imports. Keep `Footer` import removed (AppShell renders it).

```tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "UniDent — Trợ lý AI Giáo dục Nha khoa",
  description:
    "UniDent hỗ trợ sinh viên Răng Hàm Mặt phân tích case lâm sàng và học tập dựa trên y học bằng chứng.",
  icons: { icon: "/logo.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#8B1E3F",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={inter.className} suppressHydrationWarning>
      <body>
        <div className="flex h-screen w-full overflow-hidden bg-cream text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          <AppShell>{children}</AppShell>
        </div>
      </body>
    </html>
  );
}
```

Note: `layout.tsx` remains a server component (no `"use client"`). `AppShell` is the client boundary.

### Verification

```bash
cd frontend && npx tsc --noEmit
# Expected: FAIL — Drawer and updated Sidebar not yet created.
# Compilation passes after Tasks 6 and 7.
```

---

## Task 6: Sidebar — Responsive Rail, Expand Button, Conditional SessionList

**Files**: `frontend/src/components/layout/Sidebar.tsx`
**Time**: ~5 min

### 6a. Rewrite Sidebar with three-tier behavior

Key design decisions:
- Below `md`: entire `<aside>` is `hidden` (drawer handles all navigation).
- `md` to `lg`: icon rail, `w-14`, with expand button and icon-only nav links.
- `lg`+: full `w-64` sidebar with labels and SessionList.
- **SessionList is conditionally mounted** (React conditional, not CSS `hidden`) only at `lg+`, using a `matchMedia` hook. This prevents phones/tablets from fetching session data into an invisible surface.

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChevronRight,
  Clock,
  FileText,
  ListChecks,
  MessageSquare,
  Stethoscope,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SessionList } from "./SessionList";

const NAV = [
  { href: "/", label: "Ca lâm sàng", icon: Stethoscope },
  { href: "/chat", label: "Trò chuyện", icon: MessageSquare },
  { href: "/history", label: "Lịch sử", icon: Clock },
  { href: "/quiz", label: "Trắc nghiệm", icon: ListChecks },
  { href: "/progress", label: "Tiến độ", icon: TrendingUp },
  { href: "/upload", label: "Tài liệu", icon: FileText },
];

const KNOWLEDGE_BASE_URL = "#";

interface SidebarProps {
  onExpandDrawer?: () => void;
}

export function Sidebar({ onExpandDrawer }: SidebarProps) {
  const pathname = usePathname();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return (
    <aside className="hidden w-14 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:flex lg:w-64">
      {/* Brand + expand region */}
      <div className="flex items-center border-b border-slate-200 dark:border-slate-800">
        {/* Expand button — rail only (md to lg) */}
        <button
          type="button"
          onClick={onExpandDrawer}
          aria-label="Mở rộng thanh điều hướng"
          aria-expanded={false}
          aria-controls="nav-drawer"
          className="flex h-14 w-14 shrink-0 items-center justify-center transition hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
        >
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>
        {/* Logo mark — rail only */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
            <Stethoscope className="h-5 w-5" />
          </div>
        </div>
        {/* Expanded brand — lg+ */}
        <div className="hidden items-center gap-2 px-4 py-4 lg:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
              UniDent
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Trợ lý AI Giáo dục Nha khoa
            </p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 lg:px-3">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-lg text-sm font-medium transition",
                    "justify-center lg:justify-start lg:px-3 lg:py-2",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <a
              href={KNOWLEDGE_BASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              title="📖 Knowledge Base"
              className="flex h-11 items-center gap-3 rounded-lg justify-center text-sm font-medium lg:justify-start lg:px-3 lg:py-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">📖 Knowledge Base</span>
            </a>
          </li>
        </ul>
      </nav>

      {/* SessionList — conditionally mounted at lg+ only */}
      {isDesktop && <SessionList />}
    </aside>
  );
}
```

The `isDesktop` state defaults to `false` on server and initial client render, so SSR and client produce identical markup (no hydration mismatch). The `matchMedia` listener updates it after hydration.

### Verification

```bash
cd frontend && npx tsc --noEmit
# Expected: FAIL — Drawer not yet created. Passes after Task 7.
```

---

## Task 7: Drawer Component + Tests

**Files**: `frontend/src/components/layout/Drawer.tsx`, `frontend/src/components/layout/Drawer.test.tsx`
**Time**: ~5 min

### 7a. Create Drawer.tsx

```tsx
"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Clock,
  FileText,
  ListChecks,
  MessageSquare,
  Stethoscope,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SessionList } from "./SessionList";

const NAV = [
  { href: "/", label: "Ca lâm sàng", icon: Stethoscope },
  { href: "/chat", label: "Trò chuyện", icon: MessageSquare },
  { href: "/history", label: "Lịch sử", icon: Clock },
  { href: "/quiz", label: "Trắc nghiệm", icon: ListChecks },
  { href: "/progress", label: "Tiến độ", icon: TrendingUp },
  { href: "/upload", label: "Tài liệu", icon: FileText },
];

const KNOWLEDGE_BASE_URL = "#";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
}

export function Drawer({ open, onClose }: DrawerProps) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus first nav link when drawer opens
  useEffect(() => {
    if (!open) return;
    const firstLink = panelRef.current?.querySelector<HTMLAnchorElement>(
      "nav a",
    );
    firstLink?.focus();
  }, [open]);

  // Escape closes drawer
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Close on route change (pathname changes)
  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current !== pathname && open) {
      onClose();
    }
    prevPathname.current = pathname;
  }, [pathname, open, onClose]);

  // Minimal focus trap: Tab/Shift+Tab cycle within panel
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        id="nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu điều hướng"
        className="absolute left-0 top-0 bottom-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-900"
      >
        {/* Brand header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                UniDent
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Trợ lý AI Giáo dục Nha khoa
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng menu"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="px-3 py-3">
          <ul className="space-y-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <a
                href={KNOWLEDGE_BASE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <BookOpen className="h-4 w-4 shrink-0" />
                📖 Knowledge Base
              </a>
            </li>
          </ul>
        </nav>

        {/* SessionList — mounted only while drawer is open */}
        <SessionList />
      </div>
    </div>
  );
}
```

### 7b. Create Drawer.test.tsx

```tsx
import * as React from "react";
import { afterEach, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("./SessionList", () => ({
  SessionList: () => <div data-testid="session-list">Sessions</div>,
}));

import { Drawer } from "./Drawer";

describe("Drawer", () => {
  afterEach(cleanup);

  it("renders nothing when closed", () => {
    const { container } = render(<Drawer open={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog with nav and session list when open", () => {
    render(<Drawer open onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByTestId("session-list")).toBeTruthy();
    expect(screen.getByText("Ca lâm sàng")).toBeTruthy();
  });

  it("calls onClose on backdrop click", () => {
    const onClose = vi.fn();
    render(<Drawer open onClose={onClose} />);
    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(<Drawer open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

### Verification

```bash
cd frontend && npx tsc --noEmit
# Expected: pass (all files now resolve — AppShell, Drawer, updated Sidebar/Header)

cd frontend && npm test -- --run src/components/layout/Drawer.test.tsx
# Expected: 4 tests pass
```

### Commit

```
feat(shell): AppShell drawer coordinator, responsive sidebar, overlay drawer with tests
```

This commit covers Tasks 5, 6, and 7 together since they are interdependent for compilation.

---

## Task 8: ChatInterface — Branding, Auto-Grow, Touch Targets

**Files**: `frontend/src/components/chat/ChatInterface.tsx`
**Time**: ~4 min

### 8a. Change DEFAULT_HEADER_TITLE

```tsx
const DEFAULT_HEADER_TITLE = "UniDent";
```

### 8b. Reword "panel bên trái" copy

Change:
```tsx
Điền thông tin bệnh nhân ở panel bên trái và nhấn Gửi case để phân tích
```
To:
```tsx
Điền thông tin bệnh nhân và nhấn Gửi case để phân tích
```

### 8c. Textarea auto-grow

Add a `useEffect` that resizes the textarea on value change:

```tsx
useEffect(() => {
  const el = textareaRef.current;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}, [input]);
```

Add `overflow-y-auto` to the textarea className so content past 160px scrolls internally. The `min-h-[44px]` and `max-h-40` classes are already present.

### 8d. 44px suggestion buttons

Change the suggestion button className to include `min-h-[44px] flex items-center`:

```tsx
<button
  key={suggestion}
  type="button"
  onClick={() => void handleSend(suggestion)}
  className="flex min-h-[44px] items-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-left text-sm text-slate-700 transition hover:border-primary hover:bg-primary/5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
>
  {suggestion}
</button>
```

### Verification

```bash
cd frontend && npx tsc --noEmit
# Expected: pass

cd frontend && npm test
# Expected: all existing tests still pass
```

### Commit

```
feat(chat): UniDent branding, textarea auto-grow, 44px suggestion buttons
```

---

## Task 9: Case Page — Mobile Tabs, Responsive Widths, Auto-Switch

**Files**: `frontend/src/app/case/[scenario]/page.tsx`, `frontend/src/app/case/[scenario]/CasePageTabs.test.tsx`
**Time**: ~5 min

### 9a. Add tab state and effects

Add to `CasePage`:

```tsx
const [activeTab, setActiveTab] = useState<"form" | "chat">("form");
```

Auto-switch to chat tab on submit:

```tsx
useEffect(() => {
  if (caseSubmitted) setActiveTab("chat");
}, [caseSubmitted]);
```

Reset tab on scenario change (add to existing reset effect):

```tsx
useEffect(() => {
  setCaseText(null);
  setCaseSubmitted(false);
  setCaseTeeth([]);
  setSessionId(undefined);
  setActiveTab("form");
}, [scenario]);
```

### 9b. Replace JSX with tab-aware layout

The key responsive trick: below `md`, the `hidden` HTML attribute hides inactive panels. At `md+`, Tailwind's `md:block` overrides `hidden` (higher specificity media query), so both panels show side by side.

```tsx
return (
  <div className="flex h-full flex-col">
    {/* Mobile tab bar — visible only below md */}
    <div
      role="tablist"
      aria-label="Case study tabs"
      className="flex shrink-0 border-b border-borderSoft md:hidden"
    >
      <button
        type="button"
        role="tab"
        id="tab-form"
        aria-selected={activeTab === "form"}
        aria-controls="panel-form"
        tabIndex={activeTab === "form" ? 0 : -1}
        onClick={() => setActiveTab("form")}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            setActiveTab("chat");
            document.getElementById("tab-chat")?.focus();
          }
        }}
        className={`h-11 flex-1 text-sm font-medium transition ${
          activeTab === "form"
            ? "border-b-2 border-primary text-primary"
            : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
        }`}
      >
        Thông tin ca
      </button>
      <button
        type="button"
        role="tab"
        id="tab-chat"
        aria-selected={activeTab === "chat"}
        aria-controls="panel-chat"
        tabIndex={activeTab === "chat" ? 0 : -1}
        onClick={() => setActiveTab("chat")}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            setActiveTab("form");
            document.getElementById("tab-form")?.focus();
          }
        }}
        className={`h-11 flex-1 text-sm font-medium transition ${
          activeTab === "chat"
            ? "border-b-2 border-primary text-primary"
            : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
        }`}
      >
        Trợ lý AI
      </button>
    </div>

    {/* Panels container */}
    <div className="min-h-0 flex-1 flex flex-col md:flex-row">
      {/* Form panel */}
      <div
        id="panel-form"
        role="tabpanel"
        aria-labelledby="tab-form"
        hidden={activeTab !== "form"}
        className="overflow-hidden md:block md:w-80 md:flex-shrink-0 md:border-r md:border-borderSoft lg:w-[400px]"
      >
        <CaseForm
          key={scenario}
          scenario={scenario as Scenario}
          onCaseSubmit={handleCaseSubmit}
          submitted={caseSubmitted}
          onBack={handleBack}
        />
      </div>

      {/* Chat panel */}
      <div
        id="panel-chat"
        role="tabpanel"
        aria-labelledby="tab-chat"
        hidden={activeTab !== "chat"}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col md:block"
      >
        {caseText ? (
          <CaseChatPanel
            key={`chat-${scenario}`}
            initialMessage={caseText}
            onSessionCreated={handleSessionCreated}
            onFinishCase={handleFinishCase}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-3xl">
              👨‍⚕️
            </div>
            <h2 className="text-xl font-bold text-slate-800">Giảng viên AI</h2>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Hướng dẫn theo phương pháp Socratic
            </p>
            <p className="mt-4 text-sm font-medium text-slate-600">
              Sẵn sàng phân tích case
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Điền thông tin bệnh nhân và nhấn Gửi case để phân tích
            </p>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              💡 Mẹo — Nhấn ⚡ Case mẫu ở góc trên để tự động điền một ca thực tế
            </p>
          </div>
        )}
      </div>
    </div>
  </div>
);
```

**Why this works across breakpoints:**
- Below `md`: `hidden` attribute hides inactive panel; `md:block` and `md:flex-row` are inactive; panels stack vertically.
- At `md`+: `md:block` overrides `hidden` (CSS media query specificity > element attribute); both panels visible side by side in `md:flex-row`; form is `md:w-80 lg:w-[400px]`.

### 9c. Create CasePageTabs.test.tsx

```tsx
import * as React from "react";
import { afterEach, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ scenario: "fracture" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/case/CaseForm", () => ({
  CaseForm: ({ onCaseSubmit, submitted }: { onCaseSubmit: (t: string, teeth: number[]) => void; submitted: boolean }) => (
    <div data-testid="case-form">
      <button
        type="button"
        onClick={() => onCaseSubmit("test case", [16])}
        disabled={submitted}
      >
        Submit
      </button>
    </div>
  ),
}));

vi.mock("@/components/case/CaseChatPanel", () => ({
  CaseChatPanel: () => <div data-testid="case-chat-panel">Chat</div>,
}));

import CasePage from "./page";

describe("CasePageTabs", () => {
  afterEach(cleanup);

  it("renders both tabs on mount", () => {
    render(<CasePage />);
    expect(screen.getByRole("tab", { name: /Thông tin ca/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Trợ lý AI/i })).toBeTruthy();
  });

  it("defaults to form tab active", () => {
    render(<CasePage />);
    expect(
      screen.getByRole("tab", { name: /Thông tin ca/i }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("tab", { name: /Trợ lý AI/i }).getAttribute("aria-selected"),
    ).toBe("false");
  });

  it("switches tabs on click", () => {
    render(<CasePage />);
    fireEvent.click(screen.getByRole("tab", { name: /Trợ lý AI/i }));
    expect(
      screen.getByRole("tab", { name: /Trợ lý AI/i }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("auto-switches to chat tab after case submit", () => {
    render(<CasePage />);
    fireEvent.click(screen.getByText("Submit"));
    expect(
      screen.getByRole("tab", { name: /Trợ lý AI/i }).getAttribute("aria-selected"),
    ).toBe("true");
  });
});
```

### Verification

```bash
cd frontend && npx tsc --noEmit
# Expected: pass

cd frontend && npm test -- --run src/app/case/\[scenario\]/CasePageTabs.test.tsx
# Expected: 4 tests pass
```

### Commit

```
feat(case-page): mobile tabs with a11y, responsive widths, auto-switch on submit
```

---

## Task 10: ToothChart — Vertical Quadrant Stacking and Touch Targets

**Files**: `frontend/src/components/case/ToothChart.tsx`
**Time**: ~3 min

### 10a. Replace QuadrantRow with single-quadrant layout

Each quadrant becomes its own row (currently two quadrants share a row with a divider). This fixes the horizontal overflow where 16 teeth + dividers exceeded panel width.

Replace `QuadrantRow`:

```tsx
function QuadrantRow({
  label,
  teeth,
  selectedTeeth,
  onToggle,
}: {
  label: string;
  teeth: number[];
  selectedTeeth: number[];
  onToggle: (tooth: number) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <div className="flex flex-wrap gap-0.5 md:gap-1">
        {teeth.map((tooth) => (
          <ToothButton
            key={tooth}
            tooth={tooth}
            isSelected={selectedTeeth.includes(tooth)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}
```

### 10b. Responsive tooth button sizes

```tsx
function ToothButton({
  tooth,
  isSelected,
  onToggle,
}: {
  tooth: number;
  isSelected: boolean;
  onToggle: (tooth: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(tooth)}
      className={`relative flex h-9 w-9 md:h-7 md:w-7 items-center justify-center rounded-md border text-[10px] font-bold transition-all duration-150 ${
        isSelected
          ? "border-primary bg-primary text-white"
          : "border-borderSoft bg-cream text-slate-600 hover:border-primary hover:scale-105"
      }`}
      aria-pressed={isSelected}
      aria-label={`Răng ${tooth}`}
    >
      {tooth}
      {isSelected && (
        <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-secondary" />
      )}
    </button>
  );
}
```

- Below `md`: 36px (`h-9 w-9`) — fits 8 teeth per row in a 375px form pane with padding.
- At `md`+: 28px (`h-7 w-7`) — the documented exception for dense anatomical data.

### 10c. Update ToothChart render

```tsx
export function ToothChart({ selectedTeeth, onToggle, onClear }: ToothChartProps) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Sơ đồ răng
        </span>
        {selectedTeeth.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="flex h-11 items-center gap-1 text-[10px] font-medium text-primary hover:text-primary-700"
          >
            <span>Xóa chọn</span>
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-primary text-[8px] leading-none">
              ×
            </span>
          </button>
        )}
      </div>

      <div className="rounded-lg border border-borderSoft bg-cream/50 p-2.5 space-y-2">
        <QuadrantRow label="HÀM TRÊN — PHẢI" teeth={UPPER_RIGHT} selectedTeeth={selectedTeeth} onToggle={onToggle} />
        <QuadrantRow label="HÀM TRÊN — TRÁI" teeth={UPPER_LEFT} selectedTeeth={selectedTeeth} onToggle={onToggle} />
        <div className="h-px bg-borderSoft" />
        <QuadrantRow label="HÀM DƯỚI — PHẢI" teeth={LOWER_RIGHT} selectedTeeth={selectedTeeth} onToggle={onToggle} />
        <QuadrantRow label="HÀM DƯỚI — TRÁI" teeth={LOWER_LEFT} selectedTeeth={selectedTeeth} onToggle={onToggle} />
      </div>

      {selectedTeeth.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-700">Đã chọn:</span>
          <span className="text-primary font-medium">{selectedTeeth.join(", ")}</span>
          <button
            type="button"
            onClick={onClear}
            className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[9px] leading-none text-slate-500 transition hover:bg-red-100 hover:text-red-600"
            aria-label="Xóa tất cả răng đã chọn"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
```

### Verification

```bash
cd frontend && npx tsc --noEmit
# Expected: pass
```

### Commit

```
fix(tooth-chart): vertical quadrant stacking, responsive button sizes, 44px clear
```

---

## Task 11: CaseForm and FormField — 44px Touch Targets

**Files**: `frontend/src/components/case/CaseForm.tsx`, `frontend/src/components/case/FormField.tsx`
**Time**: ~3 min

### 11a. FormField — 44px min height on text inputs and selects

In `FormField.tsx`, update the shared `inputClass` to include `min-h-[44px]`:

```tsx
const inputClass =
  "w-full min-h-[44px] px-2.5 py-2 border border-borderSoft rounded-lg text-xs bg-cream text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20";
```

This affects all text inputs, textareas (which already have `min-h-[50px]`), and select elements.

### 11b. CaseForm — Increase button touch targets

- Submit button: add `min-h-[44px]` (currently `py-2.5` which is ~38px).
- "Case mẫu" button: add `min-h-[44px]` to ensure it is tappable.
- Back button (← arrow): wrap in `h-11 w-11 flex items-center justify-center`.

Submit button:
```tsx
<button
  type="button"
  onClick={handleSubmit}
  className="w-full rounded-lg bg-primary py-2.5 min-h-[44px] px-4 text-sm font-semibold text-white transition hover:bg-primary-700"
>
  🚀 Gửi case để phân tích
</button>
```

Disabled submit (already submitted):
```tsx
<button
  type="button"
  disabled
  className="w-full rounded-lg bg-secondary/20 py-2.5 min-h-[44px] px-4 text-sm font-semibold text-secondary-700"
>
  Case đã gửi ✓
</button>
```

Sample button:
```tsx
<button
  type="button"
  onClick={handleFillSample}
  disabled={submitted}
  className="min-h-[44px] rounded-md border border-secondary/40 bg-secondary/10 px-2.5 py-1 text-[11px] font-semibold text-secondary-700 transition hover:bg-secondary/20 disabled:opacity-50"
>
  ⚡ Case mẫu
</button>
```

### Verification

```bash
cd frontend && npx tsc --noEmit
# Expected: pass
```

### Commit

```
fix(case-form): 44px min touch targets on inputs and buttons
```

---

## Task 12: Integration Verification — Type-Check, Test, Build

**Files**: All modified files
**Time**: ~5 min

### 12a. Kill any running dev server

```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
```

### 12b. Clean .next cache

```bash
cd frontend && rm -rf .next
```

### 12c. Type-check

```bash
cd frontend && npx tsc --noEmit
# Expected: pass, 0 errors
```

### 12d. Run all tests

```bash
cd frontend && npm test
# Expected: all tests pass (existing + Drawer + CasePageTabs)
```

### 12e. Production build

```bash
cd frontend && npm run build
# Expected: build succeeds
```

**Note**: The dev server must NOT be running when `npm run build` executes, since both share the `.next` directory. Step 12a ensures this.

### Commit

```
chore: integration verification — type-check, tests, build all pass
```

---

## Task 13: Manual Browser E2E Verification

**Tool**: Chrome DevTools device emulator
**Modes**: Light and Dark for each viewport
**Time**: ~20 min

### Pre-flight

```bash
cd frontend && npm run dev
# Open http://localhost:3000
```

### 13a. Mobile — 375x667 and 390x844

- [ ] Hamburger button visible in header
- [ ] Hamburger opens drawer with nav links and session list
- [ ] Nav link click navigates and closes drawer
- [ ] Session row click navigates to chat and closes drawer
- [ ] Escape key closes drawer
- [ ] Backdrop click closes drawer
- [ ] Home page: full-width cards, no horizontal overflow
- [ ] `document.documentElement.scrollWidth <= window.innerWidth` on home, chat, and case pages
- [ ] Case page: both tabs visible, switching works
- [ ] Tab state persists (form values, selected teeth survive tab switches)
- [ ] Submit case auto-switches to "Trợ lý AI" tab
- [ ] Chat analysis loads after submit
- [ ] Tooth chart quadrants stacked vertically, no horizontal scroll in form pane
- [ ] Chat textarea grows to ~160px cap then scrolls internally
- [ ] Repeat in dark mode

### 13b. Tablet — 768x1024 and 1024x768

- [ ] 56px icon rail persistent with icon-only nav and active highlighting
- [ ] Expand button opens labeled drawer with recent sessions
- [ ] Drawer sessions update in realtime after sending a chat message
- [ ] Case page horizontal layout: ~320px form pane + flexible chat
- [ ] No horizontal overflow on any page
- [ ] Repeat in dark mode

### 13c. Desktop — 1280x800 and 1440x900

- [ ] 256px expanded sidebar with labels and SessionList
- [ ] SessionList realtime updates working
- [ ] Case form pane ~400px, chat flexible
- [ ] Chat content within `max-w-3xl`
- [ ] Resize from tablet (drawer open) to desktop: drawer auto-dismisses
- [ ] Repeat in dark mode

### 13d. Brand Verification

- [ ] Browser title: "UniDent — Trợ lý AI Giáo dục Nha khoa"
- [ ] Header: "UniDent" at all sizes
- [ ] Sidebar/Drawer: "UniDent" + "Trợ lý AI Giáo dục Nha khoa"
- [ ] Home heading: "UniDent"
- [ ] Chat empty state: "UniDent"
- [ ] No old brand names visible anywhere: "Phục hình AI", "Trợ lý Phục hình", "Trợ lý Lâm sàng Phục hình", "Trợ lý AI Giáo dục Y khoa"

### 13e. End-to-End Case at 375px

- [ ] Navigate to /case/fracture
- [ ] Tap ⚡ Case mẫu to fill sample
- [ ] Submit case
- [ ] Auto-switch to chat tab, analysis loads
- [ ] Send a follow-up message
- [ ] Tap "Kết thúc & Lưu case"
- [ ] Redirected to /history

---

## Task Summary

| # | Task | Time |
|---|------|------|
| 1 | UniDent metadata title/description | ~2 min |
| 2 | Header: UniDent wordmark, hamburger, 44px buttons | ~3 min |
| 3 | ScenarioCard responsive width | ~2 min |
| 4 | Home page responsive padding + heading | ~2 min |
| 5 | AppShell component (drawer coordinator) | ~4 min |
| 6 | Sidebar: rail, expand, conditional SessionList | ~5 min |
| 7 | Drawer component + tests | ~5 min |
| 8 | ChatInterface: branding, auto-grow, 44px targets | ~4 min |
| 9 | Case page: mobile tabs + tests | ~5 min |
| 10 | ToothChart: vertical stacking, touch targets | ~3 min |
| 11 | CaseForm: 44px touch targets | ~2 min |
| 12 | Integration: type-check, test, build | ~5 min |
| 13 | Manual browser E2E verification | ~20 min |

**Total estimated time**: ~62 minutes

---

## Accessibility Checklist

- Drawer: `role="dialog"`, `aria-modal="true"`, `aria-label`, focus trap (Tab/Shift+Tab cycle), Escape close, focus restoration to invoking control
- Hamburger and rail expand: `aria-expanded`, `aria-controls="nav-drawer"`
- Case tabs: `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `role="tabpanel"`, `aria-labelledby`, roving tabindex (ArrowLeft/Right)
- Rail icon links: `title` tooltip for accessible name, `aria-current="page"` on active
- All interactive controls: 44px min height (tooth buttons: 36px below md, 28px above — documented exception)
- Dark mode: all new surfaces use existing `dark:` class pattern
- `prefers-reduced-motion`: drawer opens/closes instantly (no CSS transitions on open/close state)

## Viewport Matrix

| Viewport | Tier | Sidebar | Case Layout |
|----------|------|---------|-------------|
| 375×667 | Mobile | Drawer (hamburger) | Tabs |
| 390×844 | Mobile | Drawer (hamburger) | Tabs |
| 768×1024 | Tablet | Rail + Drawer (expand) | Horizontal (320px form) |
| 1024×768 | Desktop | Expanded sidebar | Horizontal (400px form) |
| 1280×800 | Desktop | Expanded sidebar | Horizontal (400px form) |
| 1440×900 | Desktop | Expanded sidebar | Horizontal (400px form) |

Note: 1024px is exactly at `lg`, so the expanded sidebar and SessionList are mounted.
