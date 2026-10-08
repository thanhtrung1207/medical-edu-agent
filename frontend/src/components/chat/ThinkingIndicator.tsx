"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingIndicatorProps {
  /** Optional detailed reasoning steps to reveal when expanded. */
  steps?: string[];
  mode?: "chat" | "agent";
}

const DEFAULT_STEPS = [
  "🔍 Đang xác nhận yêu cầu...",
  "🧠 Đang phân tích thông tin...",
  "✍️ Đang soạn câu trả lời...",
  "✅ Đang kiểm tra an toàn y khoa...",
];

const AGENT_STEPS = [
  "🧭 Phân tích mục tiêu & dữ kiện ca bệnh...",
  "📚 Tra cứu tài liệu y văn & guidelines (RAG / Web)...",
  "⚖️ Đánh giá bằng chứng & suy luận xác suất...",
  "🎓 Đặt câu hỏi dẫn dắt theo phương pháp Socratic...",
];

export function ThinkingIndicator({ steps, mode = "chat" }: ThinkingIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const isAgent = mode === "agent";
  const defaultList = isAgent ? AGENT_STEPS : DEFAULT_STEPS;
  const detailSteps = steps && steps.length > 0 ? steps : defaultList;

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
            {isAgent ? "Agent đang suy luận & tra cứu (ReAct)..." : "Trợ lý đang suy nghĩ..."}
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
