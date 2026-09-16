"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  RotateCw,
  Send,
  Stethoscope,
  X,
} from "lucide-react";
import type { Message } from "@/lib/types";
import { getChatHistory, sendMessage } from "@/lib/api";
import {
  clearActiveSessionId,
  getActiveSessionId,
  getOrCreateUserId,
  notifySessionUpdated,
  setActiveSessionId,
} from "@/lib/client-identity";
import { generateId } from "@/lib/utils";
import { MessageBubble } from "./MessageBubble";
import { ThinkingIndicator } from "./ThinkingIndicator";

const SUGGESTIONS = [
  "Phân loại mức độ gãy vỡ răng theo Ellis?",
  "Khi nào nên cắm implant thay cho răng mất đơn lẻ?",
  "So sánh cầu răng cố định và implant khi thay thế răng đơn lẻ?",
];

const DEFAULT_HEADER_TITLE = "UniDent";

const FINISH_CASE_MESSAGE =
  "Thầy ơi, em muốn kết thúc case này. Thầy tóm tắt phân tích của em, đánh giá phác đồ điều trị (điểm tốt + điểm cần cải thiện), và đưa ra phương án tham khảo cuối cùng cùng những lưu ý lâm sàng quan trọng giúp em nhé.";

interface ChatInterfaceProps {
  /** Auto-send on mount (the serialized case text). */
  initialMessage?: string;
  /** Default true, false in case screen. */
  showSuggestions?: boolean;
  /** Default "UniDent". */
  headerTitle?: string;
  /** Default undefined. */
  headerSubtitle?: string;
  /** Callback when session_id arrives. */
  onSessionCreated?: (sessionId: string) => void;
  /** Callback when user clicks "Finish & Save". */
  onFinishCase?: (summary: string) => void;
  /** Skip the stored active session and start a fresh conversation (case screen). */
  freshSession?: boolean;
  /**
   * Session opened externally (e.g. `/chat?session=...`). Takes precedence
   * over the stored active session; ignored when `freshSession` is true.
   * Changing it switches the conversation in place.
   */
  externalSessionId?: string;
}

export function ChatInterface({
  initialMessage,
  showSuggestions,
  headerTitle,
  headerSubtitle,
  onSessionCreated,
  onFinishCase,
  freshSession,
  externalSessionId,
}: ChatInterfaceProps = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyLoaded = useRef(false);
  const storedSessionId = useRef<string | null>(null);
  const initialMessageSent = useRef(false);
  const finishCasePendingRef = useRef(false);
  const conversationGenerationRef = useRef(0);
  const [caseFinished, setCaseFinished] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRetryCount, setHistoryRetryCount] = useState(0);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  useEffect(() => {
    const id = getOrCreateUserId();
    // freshSession (case screen) always starts blank and ignores any
    // externally opened session; otherwise the external session wins over
    // the one stored in localStorage.
    const activeSessionId = freshSession
      ? null
      : externalSessionId ?? getActiveSessionId();

    // Persist the externally opened session so it becomes the active one.
    if (externalSessionId) {
      setActiveSessionId(externalSessionId);
    }

    // A session switch must cancel any in-flight request and reset the view.
    conversationGenerationRef.current += 1;
    finishCasePendingRef.current = false;
    storedSessionId.current = activeSessionId;
    historyLoaded.current = false;
    setUserId(id);
    setSessionId(activeSessionId);
    setMessages([]);
    setIsThinking(false);
    setCaseFinished(false);
    setHistoryError(null);
  }, [freshSession, externalSessionId]);

  useEffect(() => {
    if (
      historyLoaded.current ||
      !sessionId ||
      !userId ||
      sessionId !== storedSessionId.current
    ) {
      return;
    }

    historyLoaded.current = true;
    let cancelled = false;

    getChatHistory(sessionId, userId)
      .then((data) => {
        if (cancelled) return;
        setHistoryError(null);
        if (data.messages.length === 0) return;
        const restoredMessages: Message[] = data.messages.map((message) => ({
          id: message.id,
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content,
          timestamp: new Date(message.created_at),
          confidence: message.metadata?.confidence,
          citations: message.metadata?.citations,
          reasoning_steps: message.metadata?.reasoning_steps,
          warnings: message.metadata?.warnings,
        }));
        setMessages((current) => {
          const userSentDuringLoad = current.some(
            (message) => message.role === "user",
          );
          return userSentDuringLoad
            ? [...restoredMessages, ...current]
            : restoredMessages;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setHistoryError(
          "Không thể tải lịch sử trò chuyện. Vui lòng thử lại.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, userId, historyRetryCount]);

  const handleRetryHistory = () => {
    historyLoaded.current = false;
    setHistoryRetryCount((count) => count + 1);
  };

  const handleDismissHistoryError = () => {
    setHistoryError(null);
  };

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isThinking || !userId) return;

    const requestGeneration = conversationGenerationRef.current;
    const isCurrentConversation = () =>
      requestGeneration === conversationGenerationRef.current;
    const userMessage: Message = {
      id: generateId("msg"),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsThinking(true);

    try {
      const reply = await sendMessage(trimmed, userId, sessionId ?? undefined);
      if (!isCurrentConversation()) return;

      if (!reply.content?.trim()) {
        finishCasePendingRef.current = false;
        setMessages((current) => [
          ...current,
          {
            id: generateId("msg"),
            role: "assistant",
            content: "AI không trả về nội dung. Vui lòng thử lại.",
            confidence: 0,
            timestamp: new Date(),
          },
        ]);
        return;
      }

      setMessages((current) => [
        ...current,
        {
          id: reply.message_id ?? generateId("msg"),
          role: "assistant",
          content: reply.content,
          timestamp: new Date(),
          confidence: reply.confidence,
          citations: reply.citations,
          warnings: reply.warnings,
          disclaimer: reply.disclaimer,
          reasoning_steps: reply.reasoning_steps,
        },
      ]);

      if (reply.session_id) {
        setActiveSessionId(reply.session_id);
        if (reply.session_id !== sessionId) {
          setSessionId(reply.session_id);
          onSessionCreated?.(reply.session_id);
        }
        // Keep the sidebar session list in sync (new session, topic,
        // message count, ...).
        notifySessionUpdated();
      }

      if (finishCasePendingRef.current && onFinishCase) {
        finishCasePendingRef.current = false;
        onFinishCase(reply.content);
      }
    } catch {
      if (!isCurrentConversation()) return;

      finishCasePendingRef.current = false;
      setMessages((current) => [
        ...current,
        {
          id: generateId("msg"),
          role: "assistant",
          content: "Đã xảy ra lỗi khi kết nối với trợ lý. Vui lòng thử lại.",
          confidence: 0,
          timestamp: new Date(),
        },
      ]);
    } finally {
      if (!isCurrentConversation()) return;

      setIsThinking(false);
      textareaRef.current?.focus();
    }
  };

  const handleNewConversation = () => {
    conversationGenerationRef.current += 1;
    finishCasePendingRef.current = false;
    clearActiveSessionId();
    storedSessionId.current = null;
    historyLoaded.current = false;
    setCaseFinished(false);
    setSessionId(null);
    setMessages([]);
    setIsThinking(false);
    setHistoryError(null);
    // Let the sidebar session list reflect the new empty state.
    notifySessionUpdated();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend(input);
    }
  };

  // Auto-grow: recompute height whenever input text changes (typing or clearing).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    if (
      !userId ||
      !initialMessage ||
      initialMessage.trim() === "" ||
      initialMessageSent.current
    ) {
      return;
    }

    initialMessageSent.current = true;
    void handleSend(initialMessage);
  }, [initialMessage, userId]);

  const handleFinishCase = () => {
    setCaseFinished(true);
    finishCasePendingRef.current = true;
    void handleSend(FINISH_CASE_MESSAGE);
  };

  const showFinishButton =
    initialMessageSent.current &&
    !caseFinished &&
    messages.length > 0 &&
    !isThinking;

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin px-4 py-6 sm:px-6"
      >
        {historyError && (
          <div
            role="alert"
            className="sticky top-0 z-10 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1">{historyError}</p>
            <button
              type="button"
              onClick={handleRetryHistory}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 dark:border-red-700 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-900/40"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              Thử lại
            </button>
            <button
              type="button"
              onClick={handleDismissHistoryError}
              aria-label="Đóng thông báo lỗi"
              className="shrink-0 rounded-lg p-1.5 transition hover:bg-red-100 dark:hover:bg-red-900/40"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        {showFinishButton && (
          <div className="sticky top-0 z-10 flex justify-end">
            <button
              type="button"
              onClick={handleFinishCase}
              className="min-h-[44px] rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700"
            >
              ✅ Kết thúc &amp; Lưu case
            </button>
          </div>
        )}
        {messages.length === 0 && !isThinking && (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Stethoscope className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {headerTitle ?? DEFAULT_HEADER_TITLE}
            </h2>
            {headerSubtitle && (
              <p className="mt-1 text-xs font-medium text-slate-400 dark:text-slate-500">
                {headerSubtitle}
              </p>
            )}
            {showSuggestions ?? true ? (
              <>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Đặt câu hỏi nha khoa dựa trên y học bằng chứng. Hãy thử một
                  gợi ý bên dưới.
                </p>
                <div className="mt-5 flex w-full flex-col gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void handleSend(suggestion)}
                      className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-left text-sm text-slate-700 transition hover:border-primary hover:bg-primary/5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                  Sẵn sàng phân tích case
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Điền thông tin bệnh nhân trong form case rồi nhấn Gửi case để
                  phân tích
                </p>
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                  Nhấn ⚡ Case mẫu ở góc trên để tự động điền một ca thực tế và
                  thử ngay
                </p>
              </>
            )}
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {isThinking && <ThinkingIndicator />}
      </div>

      <div className="border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 sm:px-6">
        {(!freshSession || sessionId !== null) && (
          <div className="mx-auto mb-2 flex max-w-3xl justify-end">
            <button
              type="button"
              onClick={handleNewConversation}
              aria-label="Bắt đầu cuộc trò chuyện mới"
              className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-primary transition hover:text-primary-700"
            >
              Bắt đầu cuộc trò chuyện mới
            </button>
          </div>
        )}
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Nhập câu hỏi nha khoa của bạn..."
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            aria-label="Ô nhập câu hỏi"
          />
          <button
            type="button"
            onClick={() => void handleSend(input)}
            disabled={!input.trim() || isThinking || !userId}
            aria-label="Gửi câu hỏi"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-primary-700 disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
        <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-slate-400 dark:text-slate-500">
          Nhấn Enter để gửi · Shift + Enter để xuống dòng
        </p>
      </div>
    </div>
  );
}
