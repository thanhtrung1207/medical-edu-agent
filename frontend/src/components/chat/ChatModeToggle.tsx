"use client";

import { Sparkles, Workflow } from "lucide-react";

import type { ChatMode } from "@/lib/types";

interface ChatModeToggleProps {
  value: ChatMode;
  onChange: (next: ChatMode) => void;
  disabled?: boolean;
}

const PILL_BASE =
  "inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60";

export function ChatModeToggle({
  value,
  onChange,
  disabled = false,
}: ChatModeToggleProps) {
  const isChat = value === "chat";

  return (
    <div
      role="group"
      aria-label="Chọn chế độ trả lời"
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900"
    >
      <button
        type="button"
        aria-pressed={isChat}
        disabled={disabled}
        onClick={() => onChange("chat")}
        className={`${PILL_BASE} ${
          isChat
            ? "bg-primary text-white shadow-sm"
            : "text-slate-500 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
        }`}
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        Chat
      </button>
      <button
        type="button"
        aria-pressed={!isChat}
        disabled={disabled}
        onClick={() => onChange("agent")}
        className={`${PILL_BASE} ${
          !isChat
            ? "bg-primary text-white shadow-sm"
            : "text-slate-500 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
        }`}
      >
        <Workflow className="h-4 w-4" aria-hidden />
        Agent
      </button>
    </div>
  );
}
