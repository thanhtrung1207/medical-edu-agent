"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingIndicatorProps {
  /** Optional detailed reasoning steps to reveal when expanded. */
  steps?: string[];
}

const DEFAULT_STEPS = [
  "🔍 Đang xác nhận...",
  "🧠 Đang phân tích...",
  "✍️ Đang soạn...",
  "✅ Đang kiểm tra...",
];

export function ThinkingIndicator({ steps }: ThinkingIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const detailSteps = steps && steps.length > 0 ? steps : DEFAULT_STEPS;

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 rounded-full bg-primary animate-bounce-dot"
                style={{ animationDelay: `${i * 0.16}s` }}
              />
            ))}
          </div>
          <span className="text-sm text-slate-600 dark:text-slate-300">
            Trợ lý đang suy nghĩ...
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-1 inline-flex items-center text-xs text-primary hover:underline"
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <ul
          className={cn(
            "mt-2 space-y-1 overflow-hidden text-sm text-slate-500 transition-all dark:text-slate-400",
            expanded ? "max-h-40" : "max-h-0"
          )}
        >
          {detailSteps.map((step, i) => (
            <li key={i} className="animate-fade-in">
              {step}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
