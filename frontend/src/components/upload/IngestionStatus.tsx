"use client";

import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import type { DocumentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface IngestionStatusProps {
  status: DocumentStatus;
  className?: string;
}

const STATUS_MAP: Record<
  DocumentStatus,
  { label: string; classes: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Đang chờ",
    classes: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  processing: {
    label: "Đang xử lý",
    classes:
      "bg-primary/10 text-primary dark:bg-primary-900/30 dark:text-primary-300",
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  },
  completed: {
    label: "Hoàn tất",
    classes:
      "bg-secondary/10 text-secondary-700 dark:bg-secondary-900/30 dark:text-secondary-300",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  failed: {
    label: "Thất bại",
    classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
};

export function IngestionStatus({ status, className }: IngestionStatusProps) {
  const cfg = STATUS_MAP[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        cfg.classes,
        className
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}
