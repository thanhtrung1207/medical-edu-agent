"use client";

import { cn } from "@/lib/utils";

interface ConfidenceBadgeProps {
  score: number;
  className?: string;
}

function getLevel(score: number): {
  label: string;
  classes: string;
  detail: string;
} {
  if (score >= 0.8) {
    return {
      label: "Độ tin cậy cao",
      classes:
        "bg-secondary-100 text-secondary-700 dark:bg-secondary-900/40 dark:text-secondary-300",
      detail: "AI khá chắc chắn về câu trả lời này dựa trên nguồn tham khảo.",
    };
  }
  if (score >= 0.5) {
    return {
      label: "Độ tin cậy trung bình",
      classes:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
      detail: "Nên kiểm tra lại với nguồn chính thống trước khi sử dụng.",
    };
  }
  return {
    label: "Độ tin cậy thấp",
    classes: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    detail: "Câu trả lời có thể không chính xác. Hãy xác minh cẩn thận.",
  };
}

export function ConfidenceBadge({ score, className }: ConfidenceBadgeProps) {
  const level = getLevel(score);
  const percent = Math.round(score * 100);

  return (
    <span
      title={`${level.detail} (Điểm: ${percent}%)`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        level.classes,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {level.label} · {percent}%
    </span>
  );
}
