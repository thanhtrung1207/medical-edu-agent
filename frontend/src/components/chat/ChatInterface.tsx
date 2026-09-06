"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Stethoscope } from "lucide-react";
import type { Message } from "@/lib/types";
import { sendMessage, getChatHistory } from "@/lib/api";
import { AIError } from "@/lib/ai-client";
import { generateId } from "@/lib/utils";
import { hasAnyApiKey } from "@/lib/api-keys";
import { MessageBubble } from "./MessageBubble";
import { ThinkingIndicator } from "./ThinkingIndicator";

const SUGGESTIONS = [
  "Phân loại mức độ gãy vỡ răng theo Ellis?",
  "Khi nào nên cắm implant thay cho răng mất đơn lẻ?",
  "So sánh cầu răng cố định và implant khi thay thế răng đơn lẻ?",
];

const DEFAULT_HEADER_TITLE = "Trợ lý AI Giáo dục Nha khoa";

const FINISH_CASE_MESSAGE =
  "Thầy ơi, em muốn kết thúc case này. Thầy tóm tắt phân tích của em, đánh giá phác đồ điều trị (điểm tốt + điểm cần cải thiện), và đưa ra phương án tham khảo cuối cùng cùng những lưu ý lâm sàng quan trọng giúp em nhé.";

interface ChatInterfaceProps {
  /** Auto-send on mount (the serialized case text). */
  initialMessage?: string;
  /** Default true, false in case screen. */
  showSuggestions?: boolean;
  /** Default "Trợ lý AI Giáo dục Nha khoa". */
  headerTitle?: string;
  /** Default undefined. */
  headerSubtitle?: string;
  /** Callback when session_id arrives. */
  onSessionCreated?: (sessionId: string) => void;
  /** Callback when user clicks "Finish & Save". */
  onFinishCase?: (summary: string) => void;
  /** Skip localStorage, start a fresh session (case screen). */
  freshSession?: boolean;
  /** Clinical scenario for direct API system prompt. */
  scenario?: 'fracture' | 'missing';
}

export function ChatInterface({
  initialMessage,
  showSuggestions,
  headerTitle,
  headerSubtitle,
  onSessionCreated,
  onFinishCase,
  freshSession,
  scenario,
}: ChatInterfaceProps = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (freshSession || typeof window === "undefined") return null;
    return localStorage.getItem("chatSessionId");
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyLoaded = useRef(false);
  const [initialSessionId] = useState<string | null>(() => {
    if (freshSession || typeof window === "undefined") return null;
    return localStorage.getItem("chatSessionId");
  });
  const initialMessageSent = useRef(false);
  const finishCasePendingRef = useRef(false);
  const [caseFinished, setCaseFinished] = useState(false);

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
    if (historyLoaded.current || !sessionId) return;
    if (sessionId !== initialSessionId) return; // skip newly-created sessions
    historyLoaded.current = true;
    let cancelled = false;
    getChatHistory(sessionId)
      .then((data) => {
        if (cancelled || data.messages.length === 0) return;
        const restoredMessages: Message[] = data.messages.map((m) => ({
          id: m.id,
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          timestamp: new Date(m.created_at),
          confidence: m.metadata?.confidence,
          citations: m.metadata?.citations,
          reasoning_steps: m.metadata?.reasoning_steps,
          warnings: m.metadata?.warnings,
        }));
        setMessages((prev) => {
          // If user sent messages during the fetch, preserve them
          const userSentDuringLoad = prev.some((m) => m.role === "user");
          return userSentDuringLoad
            ? [...restoredMessages, ...prev]
            : restoredMessages;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId, initialSessionId]);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;

    const userMsg: Message = {
      id: generateId("msg"),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    // Build conversation history for direct API mode
    // Fix 3: Filter out error messages (IDs starting with "error-") from history
    const history = messages
      .filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          !m.id.startsWith("error-"),
      )
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    history.push({ role: "user", content: trimmed });

    // Fix 1: Only add streaming placeholder when API keys are present.
    // In mock/backend mode this avoids an empty bubble during the wait.
    const willStream = hasAnyApiKey();
    const placeholderId = `assistant-${Date.now()}`;
    if (willStream) {
      setMessages((prev) => [
        ...prev,
        {
          id: placeholderId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
        },
      ]);
    }

    try {
      const reply = await sendMessage(
        trimmed,
        sessionId ?? undefined,
        history,
        scenario,
        (chunk: string) => {
          // Fix 2: Don't set isThinking to false on first chunk.
          // Keep it true until the finally block to prevent concurrent sends.
          // The streaming text appearing in the placeholder bubble is
          // sufficient UX feedback.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId
                ? { ...m, content: m.content + chunk }
                : m,
            ),
          );
        },
      );

      // Fix 4: Handle empty AI response — show error instead of a blank bubble
      if (!reply.content || !reply.content.trim()) {
        if (willStream) {
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== placeholderId),
            {
              id: `error-${Date.now()}`,
              role: "assistant",
              content: "⚠️ AI không trả về nội dung. Vui lòng thử lại.",
              timestamp: new Date(),
            },
          ]);
        }
        return;
      }

      if (willStream) {
        // Update placeholder with final content/metadata
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? {
                  ...m,
                  content: reply.content || m.content,
                  confidence: reply.confidence,
                  citations: reply.citations,
                  warnings: reply.warnings,
                  disclaimer: reply.disclaimer,
                  reasoning_steps: reply.reasoning_steps,
                }
              : m,
          ),
        );
      } else {
        // Add assistant message normally (no placeholder was created)
        setMessages((prev) => [
          ...prev,
          {
            id: placeholderId,
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
      }

      if (reply.session_id && reply.session_id !== sessionId) {
        setSessionId(reply.session_id);
        if (!freshSession && typeof window !== "undefined") {
          localStorage.setItem("chatSessionId", reply.session_id);
        }
        onSessionCreated?.(reply.session_id);
      }

      if (finishCasePendingRef.current && onFinishCase) {
        finishCasePendingRef.current = false;
        onFinishCase(reply.content);
      }
    } catch (error) {
      finishCasePendingRef.current = false;

      if (
        error instanceof AIError &&
        (error.code === "auth_error" || error.code === "no_key")
      ) {
        // Remove the placeholder (only if it was added) and show an error
        // message with setup guidance
        setMessages((prev) => [
          ...(willStream ? prev.filter((m) => m.id !== placeholderId) : prev),
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: `⚠️ ${error.message}\n\nVui lòng nhấn ⚙️ ở góc trên để mở Cài đặt và nhập API key.`,
            timestamp: new Date(),
          },
        ]);
      } else {
        // Other errors: remove placeholder (only if added) and show generic error
        setMessages((prev) => [
          ...(willStream ? prev.filter((m) => m.id !== placeholderId) : prev),
          {
            id: generateId("msg"),
            role: "assistant",
            content:
              "Đã xảy ra lỗi khi kết nối với trợ lý. Vui lòng thử lại.",
            confidence: 0,
            timestamp: new Date(),
          },
        ]);
      }
    } finally {
      setIsThinking(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend(input);
    }
  };

  // Auto-send initialMessage on mount (once).
  useEffect(() => {
    if (
      initialMessage &&
      initialMessage.trim() !== "" &&
      !initialMessageSent.current
    ) {
      initialMessageSent.current = true;
      void handleSend(initialMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage]);

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
      {/* Message list */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin px-4 py-6 sm:px-6"
      >
        {showFinishButton && (
          <div className="sticky top-0 z-10 flex justify-end">
            <button
              type="button"
              onClick={handleFinishCase}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700"
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
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void handleSend(s)}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-left text-sm text-slate-700 transition hover:border-primary hover:bg-primary/5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {s}
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
                  Điền thông tin bệnh nhân ở panel bên trái và nhấn Gửi case để
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

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {isThinking && <ThinkingIndicator />}
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Nhập câu hỏi nha khoa của bạn..."
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            aria-label="Ô nhập câu hỏi"
          />
          <button
            type="button"
            onClick={() => void handleSend(input)}
            disabled={!input.trim() || isThinking}
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
