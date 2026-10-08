"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  LayoutDashboard,
  RotateCw,
  Send,
  Sparkles,
  Stethoscope,
  X,
} from "lucide-react";
import type { ChatMode, Message } from "@/lib/types";
import { getChatHistory, sendMessage } from "@/lib/api";
import {
  clearActiveSessionId,
  getActiveSessionId,
  getOrCreateUserId,
  notifySessionUpdated,
  setActiveSessionId,
} from "@/lib/client-identity";
import { getActiveRecord, saveClinicalRecord, closeRecord } from "@/lib/clinical-record/storage";
import { buildClinicalSummary } from "@/lib/clinical-record/summarize";
import { getSchema } from "@/lib/clinical-record/schemas";
import type { ClinicalRecordData } from "@/lib/clinical-record/types";
import type { SchemaId } from "@/lib/clinical-record/schemas";
import { commandRegistry } from "@/lib/slash-commands/registry";
import type { SlashCommand } from "@/lib/slash-commands/types";
import "@/lib/slash-commands/commands";
import { generateId } from "@/lib/utils";
import { ChatModeToggle } from "./ChatModeToggle";
import { MessageBubble } from "./MessageBubble";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { ClinicalRecordBadge } from "./ClinicalRecordBadge";
import { ClinicalRecordWizard } from "@/components/clinical-record/ClinicalRecordWizard";
import { ClinicalStudioCanvas } from "./ClinicalStudioCanvas";

const SUGGESTIONS = [
  "Phân loại mức độ gãy vỡ răng theo Ellis?",
  "Khi nào nên cắm implant thay cho răng mất đơn lẻ?",
  "So sánh cầu răng cố định và implant khi thay thế răng đơn lẻ?",
];

const DEFAULT_HEADER_TITLE = "UniDent";

const FINISH_CASE_MESSAGE =
  "Thầy ơi, em muốn kết thúc case này. Thầy tóm tắt phân tích của em, đánh giá phác đồ điều trị (điểm tốt + điểm cần cải thiện), và đưa ra phương án tham khảo cuối cùng cùng những lưu ý lâm sàng quan trọng giúp em nhé.";

// Budget for the /ket-thuc summary request before aborting.
const CASE_SUMMARY_TIMEOUT_MS = 60_000;

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
  const router = useRouter();

  // ── Core chat state ─────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("chat");
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

  // ── Slash command state ──────────────────────────────────────────────────────
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");

  // ── Clinical record state ────────────────────────────────────────────────────
  const [activeClinicalRecord, setActiveClinicalRecord] = useState<ClinicalRecordData | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardSchemaId, setWizardSchemaId] = useState<SchemaId | null>(null);
  const [pendingReplacementRecordId, setPendingReplacementRecordId] = useState<string | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);

  // ── /ket-thuc guard (ref for synchronous read before React re-render) ────────
  const isClosingCaseRef = useRef(false);
  const [isClosingCase, _setIsClosingCase] = useState(false);

  function setIsClosingCase(val: boolean) {
    isClosingCaseRef.current = val;
    _setIsClosingCase(val);
  }

  // ── Inline notice (record-required, ket-thuc errors) ────────────────────────
  const [notice, setNotice] = useState<{ type: "error"; message: string } | null>(null);

  // Auto-dismiss notice after 4 seconds.
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const getClinicalContext = useCallback(
    (record: ClinicalRecordData | null): string | undefined =>
      record ? buildClinicalSummary(getSchema(record.schemaId), record.data) : undefined,
    [],
  );

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  // Load (or clear) the active clinical record on mount.
  useEffect(() => {
    setActiveClinicalRecord(getActiveRecord() ?? null);
  }, []);

  useEffect(() => {
    const id = getOrCreateUserId();
    const activeSessionId = freshSession
      ? null
      : externalSessionId ?? getActiveSessionId();

    if (externalSessionId) {
      setActiveSessionId(externalSessionId);
    }

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

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleRetryHistory = () => {
    historyLoaded.current = false;
    setHistoryRetryCount((count) => count + 1);
  };

  const handleDismissHistoryError = () => {
    setHistoryError(null);
  };

  const handleSend = async (
    text: string,
    commandId?: string,
    clinicalContextOverride?: string,
    modeOverride?: ChatMode,
  ) => {
    const trimmed = text.trim();
    if (!trimmed || isThinking || !userId) return;

    const requestMode = modeOverride ?? mode;
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

    const clinicalContext =
      clinicalContextOverride ?? getClinicalContext(activeClinicalRecord);

    try {
      const reply =
        commandId !== undefined || clinicalContext !== undefined
          ? await sendMessage(
              trimmed,
              userId,
              sessionId ?? undefined,
              requestMode,
              commandId,
              clinicalContext,
            )
          : await sendMessage(trimmed, userId, sessionId ?? undefined, requestMode);

      if (!isCurrentConversation()) return;

      const replyContent = reply.answer ?? reply.content;

      if (!replyContent?.trim()) {
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
          content: replyContent,
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
        notifySessionUpdated();
      }

      // Immutably bind the session ID to the active record on first response.
      if (activeClinicalRecord && !activeClinicalRecord.sessionId && reply.session_id) {
        const updated = {
          ...activeClinicalRecord,
          sessionId: reply.session_id,
          updatedAt: new Date().toISOString(),
        };
        saveClinicalRecord(updated);
        setActiveClinicalRecord(updated);
      }

      if (finishCasePendingRef.current && onFinishCase) {
        finishCasePendingRef.current = false;
        onFinishCase(replyContent);
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

  // ── Wizard handlers ───────────────────────────────────────────────────────────

  function openWizard(schemaId: SchemaId, replacementId: string | null = null) {
    setEditingRecordId(null);
    setPendingReplacementRecordId(replacementId);
    setWizardSchemaId(schemaId);
    setWizardOpen(true);
    setSlashMenuOpen(false);
    setInput("");
  }

  function handleBadgeEdit() {
    if (!activeClinicalRecord || activeClinicalRecord.closedAt) return;
    setPendingReplacementRecordId(null);
    setEditingRecordId(activeClinicalRecord.id);
    setWizardSchemaId(activeClinicalRecord.schemaId);
    setWizardOpen(true);
  }

  function handleWizardCancel() {
    setWizardOpen(false);
    setWizardSchemaId(null);
    setPendingReplacementRecordId(null);
    setEditingRecordId(null);
  }

  function handleWizardSubmit(submittedRecord: ClinicalRecordData) {
    const isEditingActiveRecord = editingRecordId === activeClinicalRecord?.id;
    const recordToSave =
      isEditingActiveRecord && activeClinicalRecord
        ? {
            ...activeClinicalRecord,
            data: submittedRecord.data,
            serializedText: submittedRecord.serializedText,
            updatedAt: new Date().toISOString(),
          }
        : submittedRecord;

    if (pendingReplacementRecordId) closeRecord(pendingReplacementRecordId, null);
    saveClinicalRecord(recordToSave);
    setActiveClinicalRecord(recordToSave);
    setWizardOpen(false);
    setWizardSchemaId(null);
    setPendingReplacementRecordId(null);
    setEditingRecordId(null);
  }

  // ── Slash command handler ─────────────────────────────────────────────────────

  function handleSlashCommand(cmd: SlashCommand) {
    if (cmd.handler === "form-wizard") {
      const schemaId = cmd.formSchemaId as SchemaId;
      setSlashMenuOpen(false);
      setSlashQuery("");
      setInput("");
      if (activeClinicalRecord) {
        const confirmed = window.confirm(
          "Bệnh án hiện tại sẽ được lưu vào lịch sử khi bạn gửi bệnh án mới. Bạn muốn tiếp tục?",
        );
        if (!confirmed) return;
        openWizard(schemaId, activeClinicalRecord.id);
      } else {
        openWizard(schemaId, null);
      }
      return;
    }

    if (cmd.requiresClinicalRecord && !activeClinicalRecord) {
      setNotice({ type: "error", message: "Vui lòng tạo bệnh án trước" });
      return;
    }

    // Close menu for executable commands.
    setSlashMenuOpen(false);
    setSlashQuery("");
    setInput("");

    if (cmd.handler === "action" && cmd.id === "ket-thuc") {
      void handleKetThuc();
      return;
    }

    if (cmd.handler === "send-message") {
      const message = `Yêu cầu: ${cmd.label}`;
      void handleSend(message, cmd.id, getClinicalContext(activeClinicalRecord), "chat");
    }
  }

  // ── /ket-thuc handler ─────────────────────────────────────────────────────────

  async function handleKetThuc() {
    if (!activeClinicalRecord || isClosingCaseRef.current) return;
    setIsClosingCase(true);
    try {
      const reply = await sendMessage(
        "Yêu cầu: Tóm tắt và lưu case",
        userId!,
        sessionId ?? undefined,
        "chat",
        "ket-thuc",
        getClinicalContext(activeClinicalRecord),
        { timeoutMs: CASE_SUMMARY_TIMEOUT_MS },
      );

      const summary = (reply.answer ?? reply.content ?? "").trim();
      if (!summary) {
        setNotice({ type: "error", message: "Không nhận được tóm tắt" });
        return;
      }

      const resolvedSessionId = activeClinicalRecord.sessionId ?? reply.session_id;
      const closedRecord: ClinicalRecordData = {
        ...activeClinicalRecord,
        ...(resolvedSessionId ? { sessionId: resolvedSessionId } : {}),
        summary,
        closedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveClinicalRecord(closedRecord);
      closeRecord(activeClinicalRecord.id, summary);
      setActiveClinicalRecord(closedRecord);

      if (reply.session_id) {
        setActiveSessionId(reply.session_id);
        if (reply.session_id !== sessionId) {
          setSessionId(reply.session_id);
          onSessionCreated?.(reply.session_id);
        }
        notifySessionUpdated();
      }

      router.push("/history");
    } catch {
      setNotice({
        type: "error",
        message: "Không thể tóm tắt bệnh án. Vui lòng thử lại.",
      });
    } finally {
      setIsClosingCase(false);
    }
  }

  // ── Legacy finish-case handler (case screen) ──────────────────────────────────

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
    notifySessionUpdated();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // When the slash menu is open, Enter should be handled by the menu's global
    // listener — not fire a send.
    if (
      slashMenuOpen &&
      event.key === "Enter" &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend(input);
    }
  };

  // Auto-grow: recompute height whenever input text changes.
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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* Fixed inline notice (record-required, /ket-thuc errors) */}
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 max-w-xs rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-md dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
        >
          {notice.message}
        </div>
      )}

      {/* Full-screen wizard overlay */}
      {wizardOpen && wizardSchemaId && (
        <div className="fixed inset-0 z-40 overflow-auto bg-white dark:bg-slate-900">
          <ClinicalRecordWizard
            schema={getSchema(wizardSchemaId)}
            recordId={editingRecordId ?? undefined}
            initialData={editingRecordId ? activeClinicalRecord?.data : undefined}
            onSubmit={handleWizardSubmit}
            onCancel={handleWizardCancel}
          />
        </div>
      )}

      {/* Studio Toolbar with Canvas Toggle */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200/70 bg-white/75 px-4 py-2 backdrop-blur-md dark:border-slate-800/70 dark:bg-slate-900/75 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary-950/60">
            <Stethoscope className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
            {messages.length > 0 ? (headerTitle ?? DEFAULT_HEADER_TITLE) : "Socratic Studio"}
          </span>
          {activeClinicalRecord && (
            <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Case
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCanvasOpen((v) => !v)}
            aria-label={canvasOpen ? "Thu gọn Clinical Canvas" : "Mở Clinical Studio Canvas"}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-primary-400"
          >
            <LayoutDashboard className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">{canvasOpen ? "Thu gọn Studio" : "Clinical Studio Canvas"}</span>
            <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left Pane: Chat Stream & Floating Dock */}
        <div className="flex min-w-0 flex-1 flex-col">
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
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 to-primary/5 text-primary shadow-sm shadow-primary/10">
              <Stethoscope className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
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
                      className="min-h-[44px] rounded-xl border border-slate-200/80 bg-white/80 px-4 py-2.5 text-left text-sm text-slate-700 shadow-sm backdrop-blur-sm transition-all hover:border-primary/60 hover:bg-primary/5 hover:text-primary-700 hover:shadow-md dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-primary-400 dark:hover:bg-primary-950/20"
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

        {isThinking && <ThinkingIndicator mode={mode} />}
      </div>

      {/* Floating Studio Dock */}
      <div className="border-t border-slate-200/60 bg-gradient-to-t from-slate-100/90 via-white/90 to-transparent px-4 pb-4 pt-2 backdrop-blur-md dark:border-slate-800/60 dark:from-slate-950/90 dark:via-slate-900/90 sm:px-6">
        {(!freshSession || sessionId !== null) && (
          <div className="mx-auto mb-2 flex max-w-3xl justify-end">
            <button
              type="button"
              onClick={handleNewConversation}
              aria-label="Bắt đầu cuộc trò chuyện mới"
              className="inline-flex min-h-[44px] items-center rounded-xl px-2.5 text-xs font-semibold text-primary transition hover:bg-primary/5 hover:text-primary-700 dark:text-primary-400"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Bắt đầu cuộc trò chuyện mới
            </button>
          </div>
        )}

        {/* Active clinical record badge */}
        {activeClinicalRecord && !activeClinicalRecord.closedAt && (
          <div className="mx-auto mb-2.5 max-w-3xl">
            <ClinicalRecordBadge
              record={activeClinicalRecord}
              onEdit={handleBadgeEdit}
            />
          </div>
        )}

        {/* Studio Dock Island */}
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200/90 bg-white/95 p-2.5 shadow-xl shadow-slate-900/5 backdrop-blur-xl transition focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10 dark:border-slate-700/80 dark:bg-slate-900/95 dark:shadow-black/20 dark:focus-within:border-primary-400/50">
          <div className="mb-2 flex items-center justify-between px-1">
            <ChatModeToggle
              value={mode}
              onChange={setMode}
              disabled={isThinking}
            />
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
              <span className="flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                /
              </span>
              <span>menu lệnh lâm sàng</span>
            </div>
          </div>
          <div className="relative flex items-end gap-2">
            {/* Slash command menu — positioned above the input row */}
            {slashMenuOpen && (
              <div className="absolute bottom-[calc(100%+0.75rem)] left-0 z-50 w-[min(22rem,calc(100vw-2rem))]">
                <SlashCommandMenu
                  query={slashQuery}
                  onSelect={handleSlashCommand}
                  onClose={() => {
                    setSlashMenuOpen(false);
                    setSlashQuery("");
                  }}
                  disabledCommandIds={
                    isClosingCase ? new Set(["ket-thuc"]) : undefined
                  }
                />
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => {
                const val = event.target.value;
                setInput(val);
                // Derive slash fragment: only open menu when value starts with /,
                // the fragment has no space, and results are non-empty.
                const trimmed = val.trimStart();
                if (trimmed.startsWith("/")) {
                  const fragment = trimmed.slice(1);
                  if (!fragment.includes(" ") && commandRegistry.search(fragment).length > 0) {
                    setSlashMenuOpen(true);
                    setSlashQuery(fragment);
                    return;
                  }
                }
                // Close menu for anything else (no match, space in fragment, no slash).
                setSlashMenuOpen(false);
                setSlashQuery("");
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Nhập câu hỏi nha khoa của bạn..."
              className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200/80 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 dark:border-slate-700/80 dark:bg-slate-800/50 dark:text-slate-100 dark:focus:bg-slate-800"
              aria-label="Ô nhập câu hỏi"
            />
            <button
              type="button"
              onClick={() => void handleSend(input)}
              disabled={!input.trim() || isThinking || !userId}
              aria-label="Gửi câu hỏi"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-primary to-primary-600 text-white shadow-md shadow-primary/25 transition hover:shadow-lg hover:shadow-primary/30 active:scale-95 disabled:scale-100 disabled:opacity-50 disabled:shadow-none"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-slate-400 dark:text-slate-500">
          Nhấn Enter để gửi · Shift + Enter để xuống dòng
        </p>
      </div>
    </div>

    {/* Right Pane: Clinical Studio Canvas (Desktop Split-Screen) */}
    {canvasOpen && (
      <div className="hidden w-[22rem] shrink-0 border-l border-slate-200/80 bg-slate-50/50 dark:border-slate-800/80 dark:bg-slate-900/50 lg:block xl:w-[26rem] 2xl:w-[28rem]">
        <ClinicalStudioCanvas
          activeRecord={activeClinicalRecord}
          onEditRecord={handleBadgeEdit}
          onNewRecord={() => {
            setEditingRecordId(null);
            setPendingReplacementRecordId(null);
            setWizardSchemaId("co-dinh");
            setWizardOpen(true);
          }}
          onAskQuestion={(prompt) => {
            void handleSend(prompt);
          }}
          onClose={() => setCanvasOpen(false)}
        />
      </div>
    )}

    {/* Mobile / Tablet Drawer Overlay */}
    {canvasOpen && (
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl dark:bg-slate-900 lg:hidden">
        <ClinicalStudioCanvas
          activeRecord={activeClinicalRecord}
          onEditRecord={handleBadgeEdit}
          onNewRecord={() => {
            setEditingRecordId(null);
            setPendingReplacementRecordId(null);
            setWizardSchemaId("co-dinh");
            setWizardOpen(true);
          }}
          onAskQuestion={(prompt) => {
            void handleSend(prompt);
            setCanvasOpen(false);
          }}
          onClose={() => setCanvasOpen(false)}
        />
      </div>
    )}
  </div>
</div>
  );
}
