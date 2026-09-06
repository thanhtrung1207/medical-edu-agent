"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";

interface QuizTimerProps {
  /** Total time budget in minutes. */
  minutes: number;
  /** Called once when the countdown reaches zero. */
  onExpire?: () => void;
}

export function QuizTimer({ minutes, onExpire }: QuizTimerProps) {
  const [remaining, setRemaining] = useState(Math.max(1, minutes) * 60);
  const firedRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (remaining === 0 && !firedRef.current) {
      firedRef.current = true;
      onExpire?.();
    }
  }, [remaining, onExpire]);

  const low = remaining <= 30;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium tabular-nums",
        low
          ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
      )}
      aria-live="polite"
    >
      <Clock className="h-4 w-4" />
      {formatDuration(remaining)}
    </div>
  );
}
