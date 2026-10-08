"use client";

import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Sparkles,
} from "lucide-react";
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
          "max-w-[88%] rounded-2xl px-4 py-3 sm:max-w-[80%]",
          isUser
            ? "rounded-tr-sm bg-gradient-to-br from-primary to-primary-700 text-white shadow-md shadow-primary/20"
            : "rounded-tl-sm border border-slate-200/90 bg-white/95 text-slate-800 shadow-sm backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-800/95 dark:text-slate-100"
        )}
      >
        {/* Assistant Header Badge */}
        {!isUser && (
          <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-slate-100/90 pb-2 dark:border-slate-700/80">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary dark:text-primary-400">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary dark:bg-primary-950/60">
                <Sparkles className="h-3 w-3" />
              </span>
              <span>UniDent</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                Socratic
              </span>
            </div>
            {typeof message.confidence === "number" && (
              <ConfidenceBadge score={message.confidence} />
            )}
          </div>
        )}

        {/* Content */}
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {message.content}
          </p>
        ) : (
          <div className="markdown-body text-sm leading-relaxed">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="mb-2 mt-3 border-b border-slate-100 pb-1 text-base font-bold text-slate-900 dark:border-slate-800 dark:text-slate-100">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="mb-1.5 mt-3 text-sm font-bold text-slate-900 dark:text-slate-100">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => {
                  const text = String(children);
                  const isSocratic =
                    /câu hỏi|socratic|gợi mở|phản tư|thảo luận|tư duy/i.test(text);
                  if (isSocratic) {
                    return (
                      <div className="my-2.5 flex items-center gap-2 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent px-3 py-2 text-xs font-bold text-amber-900 dark:border-amber-500/40 dark:text-amber-300">
                        <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />
                        <span>{children}</span>
                      </div>
                    );
                  }
                  return (
                    <h3 className="mb-1 mt-2.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                      {children}
                    </h3>
                  );
                },
                blockquote: ({ children }) => (
                  <div className="my-3 overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-50/40 to-primary/5 p-3 shadow-sm dark:border-amber-400/30 dark:bg-amber-950/20">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 rounded-lg bg-amber-500/20 p-1 text-amber-600 dark:text-amber-400">
                        <HelpCircle className="h-4 w-4" />
                      </div>
                      <div className="flex-1 text-xs font-medium leading-relaxed text-slate-800 dark:text-slate-200">
                        {children}
                      </div>
                    </div>
                  </div>
                ),
                table: ({ children }) => (
                  <div className="my-2.5 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-left text-xs">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="bg-slate-100/90 px-2.5 py-1.5 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border-t border-slate-100 px-2.5 py-1.5 text-slate-600 dark:border-slate-700/60 dark:text-slate-300">
                    {children}
                  </td>
                ),
                ul: ({ children }) => (
                  <ul className="my-1.5 list-disc space-y-0.5 pl-4">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-1.5 list-decimal space-y-0.5 pl-4">{children}</ol>
                ),
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Warnings */}
        {message.warnings && message.warnings.length > 0 && (
          <div className="mt-2.5 space-y-1">
            {message.warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50/80 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-600/40 dark:bg-amber-950/30 dark:text-amber-300"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="leading-snug">{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Citations */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2.5 border-t border-slate-100 pt-2 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setShowCitations((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5 transition dark:text-primary-400 dark:hover:bg-primary-950/30"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>{message.citations.length} nguồn y văn (ITI / ADA)</span>
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
                    className="group rounded-xl border border-slate-200/70 bg-gradient-to-br from-slate-50/90 via-white to-primary/5 p-3 text-xs text-slate-600 shadow-sm transition hover:border-primary/40 hover:shadow-md dark:border-slate-700/60 dark:from-slate-900/80 dark:via-slate-850 dark:to-primary-950/20 dark:text-slate-300"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
                        <span className="h-2 w-2 rounded-full bg-primary ring-2 ring-primary/20"></span>
                        <span>{c.source}</span>
                        {c.chapter ? ` · ${c.chapter}` : ""}
                        {c.page ? ` · tr.${c.page}` : ""}
                      </p>
                      <span className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Evidence Level I
                      </span>
                    </div>
                    <blockquote className="mt-1.5 border-l-2 border-primary/40 pl-2.5 text-[11px] italic leading-relaxed text-slate-600 dark:text-slate-300">
                      &ldquo;{c.quote}&rdquo;
                    </blockquote>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Disclaimer */}
        {!isUser && message.disclaimer && (
          <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] italic text-slate-400 dark:bg-slate-900/40 dark:text-slate-500">
            {message.disclaimer}
          </p>
        )}

        {/* Assistant Footer Meta Row */}
        {!isUser ? (
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100/80 pt-2 dark:border-slate-700/60">
            <FeedbackButtons messageId={message.id} />
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              {formatTime(message.timestamp)}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-right text-[10px] text-white/70">
            {formatTime(message.timestamp)}
          </p>
        )}
      </div>
    </div>
  );
});
