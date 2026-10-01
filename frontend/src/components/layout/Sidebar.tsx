"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  KNOWLEDGE_BASE_ICON as KnowledgeBaseIcon,
  KNOWLEDGE_BASE_URL,
  NAV,
} from "./navigation";
import { SessionList } from "./SessionList";

interface SidebarProps {
  onExpandDrawer?: () => void;
  /** Mirrors the AppShell drawer state so the launcher reports it correctly. */
  drawerOpen?: boolean;
}

/**
 * Three-tier navigation:
 * - below md: hidden entirely (the AppShell drawer handles navigation);
 * - md to below lg: 56px icon rail with an expand button that opens the
 *   AppShell drawer for the full labeled menu and recent sessions;
 * - lg and up: 256px sidebar with labels and the visible SessionList.
 *
 * The SessionList itself is mounted from md up (hidden between md and lg)
 * so its `session-updated` listener keeps the session data live across the
 * tablet range; below md it is not mounted at all, so phones never fetch
 * session data into an invisible surface.
 */
export function Sidebar({ onExpandDrawer, drawerOpen }: SidebarProps) {
  const pathname = usePathname();
  // Starts false so SSR markup matches the first client render (no hydration
  // mismatch); the matchMedia listener corrects it right after hydration.
  const [isMdUp, setIsMdUp] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const handleChange = (event: MediaQueryListEvent) =>
      setIsMdUp(event.matches);
    mql.addEventListener("change", handleChange);
    setIsMdUp(mql.matches);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return (
    <aside className="hidden w-14 shrink-0 flex-col border-r border-slate-100 bg-gradient-to-b from-white to-cream/30 dark:border-slate-800 dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-900 md:flex lg:w-64">
      {/* Brand + expand region — stacked in the rail, row at lg+ */}
      <div className="flex flex-col border-b border-slate-100 dark:border-slate-800 lg:flex-row lg:items-center lg:gap-2 lg:px-4 lg:py-4">
        {/* Expand button — rail only (md to below lg) */}
        <button
          type="button"
          onClick={onExpandDrawer}
          aria-label="Mở rộng thanh điều hướng"
          aria-expanded={drawerOpen ?? false}
          aria-controls="nav-drawer"
          className="flex h-14 w-14 shrink-0 items-center justify-center text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {/* Logo mark — rail only, stacked under the expand button */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-700 text-white">
            <Stethoscope className="h-5 w-5" />
          </div>
        </div>
        {/* Expanded brand — lg+ */}
        <div className="hidden items-center gap-2 lg:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-700 text-white">
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

      {/* Nav — icon-only (with titles) in the rail, labeled at lg+ */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 lg:px-3" aria-label="Điều hướng chính">
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
                    "flex h-11 items-center justify-center gap-3 rounded-xl text-sm font-medium transition lg:justify-start lg:px-3 lg:py-2",
                    active
                      ? "bg-primary text-white"
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
              className="flex h-11 items-center justify-center gap-3 rounded-xl text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:justify-start lg:px-3 lg:py-2"
            >
              <KnowledgeBaseIcon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">📖 Knowledge Base</span>
            </a>
          </li>
        </ul>
      </nav>

      {/* Recent chat sessions — mounted from md up so the list keeps
          listening for SESSION_UPDATED_EVENT and stays current across the
          tablet range; the wrapper only reveals it at lg where the sidebar
          is wide enough for the full list. */}
      {isMdUp && (
        <div className="hidden min-h-0 flex-1 lg:flex">
          <SessionList />
        </div>
      )}
    </aside>
  );
}
