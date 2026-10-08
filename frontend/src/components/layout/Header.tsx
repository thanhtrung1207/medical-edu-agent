"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Menu, Moon, Stethoscope, Sun } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  onToggleDrawer?: () => void;
  /** Mirrors the AppShell drawer state so the launcher reports it correctly. */
  drawerOpen?: boolean;
}

export function Header({ onToggleDrawer, drawerOpen }: HeaderProps) {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const { user, logout } = useAuth();

  // Initialise theme from system / stored preference.
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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-slate-200/70 bg-white/75 px-4 shadow-sm backdrop-blur-md dark:border-slate-800/70 dark:bg-slate-900/75">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleDrawer}
          aria-label="Mở menu điều hướng"
          aria-expanded={drawerOpen ?? false}
          aria-controls="nav-drawer"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-700 text-white shadow-sm shadow-primary/25 md:hidden">
          <Stethoscope className="h-4 w-4" />
        </div>
        <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
          UniDent
        </span>
        <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-50/60 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 backdrop-blur-sm dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300 md:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          <span className="tracking-tight">Socratic Studio · ITI / ADA Guidelines</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {user ? (
          <div className="flex items-center gap-2 pr-1">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name ?? user.email}
                className="h-7 w-7 rounded-full ring-2 ring-primary/20"
              />
            ) : null}
            <span className="hidden text-xs font-medium text-slate-700 dark:text-slate-200 sm:inline">
              {user.name ?? user.email}
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="Đăng xuất"
              className="flex min-h-[44px] items-center rounded-xl px-2.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <LogOut className="h-4 w-4" />
              <span className="ml-1.5 hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => router.push("/login")}
            aria-label="Đăng nhập"
            className="flex min-h-[44px] items-center rounded-xl bg-gradient-to-r from-primary to-primary-600 px-3.5 text-xs font-semibold text-white shadow-sm shadow-primary/25 transition hover:shadow-md hover:shadow-primary/30"
          >
            Đăng nhập
          </button>
        )}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={dark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {dark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-600" />}
        </button>
      </div>
    </header>
  );
}
