"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Stethoscope, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  KNOWLEDGE_BASE_ICON as KnowledgeBaseIcon,
  KNOWLEDGE_BASE_URL,
  NAV,
} from "./navigation";
import { SessionList } from "./SessionList";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Overlay navigation drawer for mobile (< md, opened from the hamburger) and
 * tablet (md to below lg, opened from the rail expand button). Renders
 * nothing while closed; the full dialog mounts fresh on every open so
 * SessionList only fetches while it is actually visible.
 */
export function Drawer({ open, onClose }: DrawerProps) {
  if (!open) return null;
  return <DrawerDialog onClose={onClose} />;
}

function DrawerDialog({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog as soon as it opens.
  useEffect(() => {
    const firstLink = panelRef.current?.querySelector<HTMLAnchorElement>(
      "nav a",
    );
    firstLink?.focus();
  }, []);

  // Escape closes the drawer.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close when the route changes while the drawer is open.
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) onClose();
    prevPathnameRef.current = pathname;
  }, [pathname, onClose]);

  // Minimal focus trap: Tab/Shift+Tab cycle within the panel.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        data-testid="drawer-backdrop"
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
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-900"
      >
        {/* Brand header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
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
        <nav className="px-3 py-3" aria-label="Điều hướng chính">
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
                <KnowledgeBaseIcon className="h-4 w-4 shrink-0" />
                📖 Knowledge Base
              </a>
            </li>
          </ul>
        </nav>

        {/* Recent chat sessions — mounted only while the drawer is open.
            SessionList reports actual navigation (open session / new
            conversation) through onNavigate; non-navigational controls such
            as the failed-load retry button stay usable without closing. */}
        <SessionList onNavigate={onClose} />
      </div>
    </div>
  );
}
