"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import type { QuizAnswerResult, QuizQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";

interface QuizCardProps {
  index: number;
  question: QuizQuestion;
  selected?: string;
  answerResult?: QuizAnswerResult;
  onSelect: (optionKey: string) => void;
}

export function QuizCard({
  index,
  question,
  selected,
  answerResult,
  onSelect,
}: QuizCardProps) {
  const graded = Boolean(answerResult);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {index}
        </span>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
          {question.stem}
        </p>
      </div>

      <div className="space-y-2" role="radiogroup" aria-label={`Câu ${index}`}>
        {question.options.map((opt) => {
          const isSelected = selected === opt.key;
          const isCorrect = answerResult?.correctAnswer === opt.key;
          const isWrongPick =
            graded && isSelected && !answerResult?.correct;

          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={graded}
              onClick={() => onSelect(opt.key)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition",
                !graded &&
                  isSelected &&
                  "border-primary bg-primary/10 text-primary",
                !graded &&
                  !isSelected &&
                  "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800",
                graded &&
                  isCorrect &&
                  "border-secondary bg-secondary/10 text-secondary-700 dark:text-secondary-300",
                isWrongPick &&
                  "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300",
                graded &&
                  !isCorrect &&
                  !isWrongPick &&
                  "border-slate-200 text-slate-500 dark:border-slate-700"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  isSelected || isCorrect
                    ? "border-current"
                    : "border-slate-300 dark:border-slate-600"
                )}
              >
                {opt.key}
              </span>
              <span className="flex-1">{opt.text}</span>
              {graded && isCorrect && (
                <CheckCircle2 className="h-4 w-4 text-secondary" />
              )}
              {isWrongPick && <XCircle className="h-4 w-4 text-red-500" />}
            </button>
          );
        })}
      </div>

      {graded && answerResult?.explanation && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            Giải thích:{" "}
          </span>
          {answerResult.explanation}
        </div>
      )}
    </div>
  );
}
