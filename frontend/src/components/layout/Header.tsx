"use client";

import { useEffect, useState } from "react";
import { Moon, Stethoscope, Sun, Settings } from "lucide-react";
import { SettingsModal } from "@/components/case/SettingsModal";
import { hasAnyApiKey } from "@/lib/api-keys";

export function Header() {
  const [dark, setDark] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  // Initialise theme from system / stored preference.
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const prefersDark =
      stored === "dark" ||
      (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(prefersDark);
    document.documentElement.classList.toggle("dark", prefersDark);
  }, []);

  // Check API key status on mount and sync when keys change elsewhere
  useEffect(() => {
    setHasKey(hasAnyApiKey());
    const handler = () => setHasKey(hasAnyApiKey());
    window.addEventListener("storage", handler);
    window.addEventListener("api-keys-changed", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("api-keys-changed", handler);
    };
  }, []);

  const handleCloseSettings = () => {
    setSettingsOpen(false);
    setHasKey(hasAnyApiKey());
  };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 md:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
          <Stethoscope className="h-4 w-4" />
        </div>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
          Phục hình AI
        </span>
      </div>

      <h1 className="hidden text-sm font-semibold text-slate-700 dark:text-slate-200 md:block">
        Trợ lý Phục hình
      </h1>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Cài đặt API Key"
          aria-label="Cài đặt API Key"
          className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Settings className="h-4 w-4" />
          <span
            className={`absolute top-1 right-1 h-2 w-2 rounded-full ${
              hasKey ? "bg-green-500" : "bg-amber-400"
            }`}
          />
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={dark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
      <SettingsModal open={settingsOpen} onClose={handleCloseSettings} />
    </header>
  );
}
