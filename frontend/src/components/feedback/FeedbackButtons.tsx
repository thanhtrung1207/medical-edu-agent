"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { submitFeedback } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CorrectionModal } from "./CorrectionModal";

interface FeedbackButtonsProps {
  messageId: string;
}

export function FeedbackButtons({ messageId }: FeedbackButtonsProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleUp = async () => {
    setRating(1);
    await submitFeedback(messageId, 1);
  };

  const handleDown = () => {
    setRating(-1);
    setModalOpen(true);
  };

  const handleCorrection = async (correction: string) => {
    setModalOpen(false);
    await submitFeedback(messageId, -1, correction || undefined);
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleUp}
          aria-label="Câu trả lời hữu ích"
          aria-pressed={rating === 1}
          className={cn(
            "rounded-md p-1 transition hover:bg-slate-100 dark:hover:bg-slate-700",
            rating === 1
              ? "text-secondary"
              : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          )}
        >
          <ThumbsUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleDown}
          aria-label="Câu trả lời chưa tốt"
          aria-pressed={rating === -1}
          className={cn(
            "rounded-md p-1 transition hover:bg-slate-100 dark:hover:bg-slate-700",
            rating === -1
              ? "text-red-500"
              : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          )}
        >
          <ThumbsDown className="h-4 w-4" />
        </button>
      </div>

      <CorrectionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCorrection}
      />
    </>
  );
}
