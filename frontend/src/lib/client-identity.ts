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
