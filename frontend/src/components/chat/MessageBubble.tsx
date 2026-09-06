"use client";

import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { AlertTriangle, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import type { Message } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { FeedbackButtons } from "@/components/feedback/FeedbackButtons";

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const [showCitations, setShowCitations] = useState(false);
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex animate-fade-in",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[75%]",
          isUser
            ? "rounded-tr-sm bg-primary text-white"
            : "rounded-tl-sm border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        )}
      >
        {/* Content */}
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {message.content}
          </p>
        ) : (
          <div className="markdown-body text-sm">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}

        {/* Warnings */}
        {message.warnings && message.warnings.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Assistant meta row */}
        {!isUser && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {typeof message.confidence === "number" && (
              <ConfidenceBadge score={message.confidence} />
            )}
            <FeedbackButtons messageId={message.id} />
          </div>
        )}

        {/* Citations */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setShowCitations((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <BookOpen className="h-3.5 w-3.5" />
              {message.citations.length} nguồn tham khảo
              {showCitations ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            {showCitations && (
              <ul className="mt-2 space-y-2">
                {message.citations.map((c, i) => (
                  <li
                    key={i}
                    className="rounded-md bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-900/50 dark:text-slate-300"
                  >
                    <p className="font-semibold text-slate-700 dark:text-slate-200">
                      {c.source}
                      {c.chapter ? ` · ${c.chapter}` : ""}
                      {c.page ? ` · tr.${c.page}` : ""}
                    </p>
                    <p className="mt-0.5 italic">&ldquo;{c.quote}&rdquo;</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Disclaimer */}
        {!isUser && message.disclaimer && (
          <p className="mt-2 text-[11px] italic text-slate-400 dark:text-slate-500">
            {message.disclaimer}
          </p>
        )}

        {/* Timestamp */}
        <p
          className={cn(
            "mt-1 text-[10px]",
            isUser ? "text-white/70" : "text-slate-400 dark:text-slate-500"
          )}
        >
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
});
