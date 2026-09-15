const USER_ID_KEY = "medical-edu-agent.user-id";
const SESSION_ID_KEY = "chatSessionId";

export function getOrCreateUserId(): string {
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;

  const userId = crypto.randomUUID();
  localStorage.setItem(USER_ID_KEY, userId);
  return userId;
}

export function getActiveSessionId(): string | null {
  return localStorage.getItem(SESSION_ID_KEY);
}

export function setActiveSessionId(sessionId: string): void {
  localStorage.setItem(SESSION_ID_KEY, sessionId);
}

export function clearActiveSessionId(): void {
  localStorage.removeItem(SESSION_ID_KEY);
}

/**
 * Custom DOM event broadcast whenever chat sessions change (created,
 * updated, or reset) so detached consumers — e.g. the sidebar session list —
 * can refetch without prop drilling or a React context.
 */
export const SESSION_UPDATED_EVENT = "session-updated";

/** Notify listeners that the chat session list may have changed. */
export function notifySessionUpdated(): void {
  window.dispatchEvent(new CustomEvent(SESSION_UPDATED_EVENT));
}
