"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, PlusCircle, RotateCw } from "lucide-react";
import { getChatSessions, type ChatSessionSummary } from "@/lib/api";
import {
  clearActiveSessionId,
  getActiveSessionId,
  getOrCreateUserId,
  SESSION_UPDATED_EVENT,
} from "@/lib/client-identity";
import { cn } from "@/lib/utils";

/** Format an ISO timestamp as a short Vietnamese relative-time label. */
function formatRelativeTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";

  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;

  if (minutes / 60 < 24) {
    return `${Math.floor(minutes / 60)} giờ trước`;
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const dayCount = Math.floor(
    (startOfToday.getTime() - startOfDay.getTime()) / 86_400_000,
  );
  if (dayCount === 1) return "Hôm qua";
  if (dayCount < 7) return `${dayCount} ngày trước`;

  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Sidebar section listing the user's past chat sessions. Loads once on mount
 * and refetches whenever a `session-updated` DOM event is dispatched by the
 * chat interface (new session created, topic updated, or reset).
 */
interface SessionListProps {
  /**
   * Notified when SessionList initiates navigation — opening a session or
   * starting a new conversation — so container surfaces such as the AppShell
   * drawer can close themselves. Non-navigational actions (e.g. the
   * failed-load retry) do not fire it.
   */
  onNavigate?: () => void;
}

export function SessionList({ onNavigate }: SessionListProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const refreshSessions = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    try {
      const userId = getOrCreateUserId();
      const data = await getChatSessions(userId);
      if (fetchId !== fetchIdRef.current) return;
      setSessions(
        [...data].sort(
          (a, b) =>
            new Date(b.last_active).getTime() -
            new Date(a.last_active).getTime(),
        ),
      );
      setCurrentSessionId(getActiveSessionId());
      setFailed(false);
    } catch {
      if (fetchId !== fetchIdRef.current) return;
      setFailed(true);
    } finally {
      if (fetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
    const handleSessionUpdated = () => {
      void refreshSessions();
    };
    window.addEventListener(SESSION_UPDATED_EVENT, handleSessionUpdated);
    return () => {
      window.removeEventListener(SESSION_UPDATED_EVENT, handleSessionUpdated);
    };
  }, [refreshSessions]);

  const handleNewConversation = () => {
    clearActiveSessionId();
    setCurrentSessionId(null);
    // The nonce forces ChatInterface to remount, so a fresh chat starts even
    // when the user is already on /chat.
    router.push(`/chat?new=${Date.now()}`);
    onNavigate?.();
  };

  const handleOpenSession = (sessionId: string) => {
    router.push(`/chat?session=${encodeURIComponent(sessionId)}`);
    onNavigate?.();
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Gần đây
        </span>
        <button
          type="button"
          onClick={handleNewConversation}
          aria-label="Bắt đầu cuộc trò chuyện mới"
          title="Bắt đầu cuộc trò chuyện mới"
          className="text-slate-400 transition hover:text-primary"
        >
          <PlusCircle className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div
          role="status"
          className="flex items-center justify-center gap-2 px-2 py-6 text-xs text-slate-400"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Đang tải...
        </div>
      ) : failed ? (
        <div className="flex flex-col items-center gap-1.5 px-2 py-4 text-center">
          <p className="text-xs text-slate-400">
            Không tải được danh sách trò chuyện
          </p>
          <button
            type="button"
            onClick={() => void refreshSessions()}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary transition hover:text-primary-700"
          >
            <RotateCw className="h-3 w-3" aria-hidden="true" />
            Thử lại
          </button>
        </div>
      ) : sessions.length === 0 ? (
        <p className="px-2 py-4 text-center text-sm text-slate-400">
          Chưa có cuộc trò chuyện nào
        </p>
      ) : (
        <ul className="animate-fade-in space-y-1 pb-3">
          {sessions.map((session) => {
            const isActive = session.session_id === currentSessionId;
            return (
              <li key={session.session_id}>
                <button
                  type="button"
                  onClick={() => handleOpenSession(session.session_id)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left transition",
                    isActive
                      ? "bg-primary/10"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <MessageSquare
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        isActive ? "text-primary" : "text-slate-400",
                      )}
                      aria-hidden="true"
                    />
                    <span
                      title={session.topic ?? undefined}
                      className={cn(
                        "truncate text-xs font-medium",
                        isActive
                          ? "text-primary"
                          : "text-slate-700 dark:text-slate-200",
                      )}
                    >
                      {session.topic || "Cuộc trò chuyện mới"}
                    </span>
                  </span>
                  <span className="flex items-center justify-between pl-5">
                    <span className="text-[11px] text-slate-400">
                      {formatRelativeTime(session.last_active)}
                    </span>
                    <span
                      title={`${session.message_count} tin nhắn`}
                      className="rounded-full bg-secondary/20 px-1.5 py-0.5 text-[10px] font-semibold text-secondary-700 dark:text-secondary-300"
                    >
                      {session.message_count}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
