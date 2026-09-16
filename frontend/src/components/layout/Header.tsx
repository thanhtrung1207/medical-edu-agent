"use client";

import { useEffect, useState } from "react";
import { Menu, Moon, Settings, Stethoscope, Sun } from "lucide-react";
import { SettingsModal } from "@/components/case/SettingsModal";

interface HeaderProps {
  onToggleDrawer?: () => void;
  /** Mirrors the AppShell drawer state so the launcher reports it correctly. */
  drawerOpen?: boolean;
}

export function Header({ onToggleDrawer, drawerOpen }: HeaderProps) {
  const [dark, setDark] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleDrawer}
          aria-label="Mở menu điều hướng"
          aria-expanded={drawerOpen ?? false}
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
