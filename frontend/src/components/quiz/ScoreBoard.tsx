"use client";

import { RotateCcw, Trophy } from "lucide-react";
import type { QuizResult } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ScoreBoardProps {
  result: QuizResult;
  onRetry: () => void;
}

export function ScoreBoard({ result, onRetry }: ScoreBoardProps) {
  const passed = result.score >= 60;

  return (
    <div
      className={cn(
        "rounded-xl border p-5 text-center shadow-sm",
        passed
          ? "border-secondary/40 bg-secondary/5"
          : "border-amber-300/50 bg-amber-50 dark:bg-amber-900/10"
      )}
    >
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow dark:bg-slate-800">
        <Trophy
          className={cn(
            "h-7 w-7",
            passed ? "text-secondary" : "text-amber-500"
          )}
        />
      </div>
      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
        {passed ? "Chúc mừng!" : "Cần cố gắng thêm!"}
      </h3>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Bạn trả lời đúng{" "}
        <span className="font-bold text-slate-900 dark:text-white">
          {result.correctCount}/{result.total}
        </span>{" "}
        câu
      </p>
      <div className="mt-3 text-4xl font-extrabold text-primary">
        {result.score}
        <span className="text-xl text-slate-400">/100</span>
      </div>

      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
      >
        <RotateCcw className="h-4 w-4" />
        Làm bộ câu hỏi mới
      </button>
    </div>
  );
}
