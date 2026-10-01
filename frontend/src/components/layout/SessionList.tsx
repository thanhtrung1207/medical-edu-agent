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
import { useAuth } from "@/contexts/AuthContext";

// ---------------------------------------------------------------------------
// Date grouping
// ---------------------------------------------------------------------------

type DateGroup = { label: string; sessions: ChatSessionSummary[] };

function groupByDate(sessions: ChatSessionSummary[]): DateGroup[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const buckets: DateGroup[] = [
    { label: "Hôm nay", sessions: [] },
    { label: "Hôm qua", sessions: [] },
    { label: "7 ngày qua", sessions: [] },
    { label: "Tháng này", sessions: [] },
    { label: "Lâu hơn", sessions: [] },
  ];

  for (const s of sessions) {
    const t = new Date(s.last_active).getTime();
    if (t >= todayMs) {
      buckets[0].sessions.push(s);
    } else if (t >= todayMs - 86_400_000) {
      buckets[1].sessions.push(s);
    } else if (t >= todayMs - 6 * 86_400_000) {
      buckets[2].sessions.push(s);
    } else if (t >= todayMs - 29 * 86_400_000) {
      buckets[3].sessions.push(s);
    } else {
      buckets[4].sessions.push(s);
    }
  }

  return buckets.filter((b) => b.sessions.length > 0);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const refreshSessions = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    try {
      const userId = user?.id ?? getOrCreateUserId();
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
  }, [user]);

  useEffect(() => {
    void refreshSessions();
    const handleSessionUpdated = () => {
      void refreshSessions();
    };
    window.addEventListener(SESSION_UPDATED_EVENT, handleSessionUpdated);
    return () => {
      window.removeEventListener(SESSION_UPDATED_EVENT, handleSessionUpdated);
    };
  }, [refreshSessions, user]);

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
      {/* Header */}
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Gần đây
        </span>
        <button
          type="button"
          onClick={handleNewConversation}
          aria-label="Bắt đầu cuộc trò chuyện mới"
          title="Bắt đầu cuộc trò chuyện mới"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-all duration-150 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:bg-slate-100 hover:text-primary dark:hover:bg-slate-800"
        >
          <PlusCircle className="h-4 w-4" />
        </button>
      </div>

      {/* States */}
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
            className="inline-flex min-h-[44px] items-center gap-1.5 px-2 text-xs font-medium text-primary transition hover:text-primary-700"
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
        <div className="animate-fade-in pb-3">
          {groupByDate(sessions).map((group) => (
            <div key={group.label}>
              {/* Date group header */}
              <div className="px-1 pb-1 pt-3 first:pt-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                  {group.label}
                </span>
              </div>
              {/* Sessions in this group */}
              <ul className="space-y-0.5">
                {group.sessions.map((session) => {
                  const isActive = session.session_id === currentSessionId;
                  return (
                    <li key={session.session_id}>
                      <button
                        type="button"
                        onClick={() => handleOpenSession(session.session_id)}
                        aria-current={isActive ? "true" : undefined}
                        title={session.topic ?? undefined}
                        className={cn(
                          "flex min-h-[44px] w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left",
                          "transition-all duration-150 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
                        )}
                      >
                        <MessageSquare
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            isActive ? "text-primary" : "text-slate-400",
                          )}
                          aria-hidden="true"
                        />
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-xs",
                            isActive ? "font-semibold" : "font-medium",
                          )}
                        >
                          {session.topic || "Cuộc trò chuyện mới"}
                        </span>
                        {session.message_count > 0 && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {session.message_count}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
