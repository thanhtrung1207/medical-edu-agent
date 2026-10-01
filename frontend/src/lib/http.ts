import { config } from "./config";

/**
 * Dispatched on `window` when a refresh attempt fails because the refresh
 * token was reused after rotation (theft signal) — see AUTH_REFRESH_REUSE_DETECTED
 * in the backend's error taxonomy. AuthContext listens for this to show a
 * persistent security banner, per the design spec's distinction between this
 * code (persistent banner) and plain AUTH_REFRESH_INVALID (silent, no banner).
 */
export const AUTH_SECURITY_EVENT = "auth-security-notice";

let refreshPromise: Promise<boolean> | null = null;

function dispatchSecurityNotice(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AUTH_SECURITY_EVENT, { detail: { message } }),
  );
}

function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${config.apiBaseUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (res.ok) return true;
        const body = await res.json().catch(() => null);
        if (body?.detail?.error_code === "AUTH_REFRESH_REUSE_DETECTED") {
          dispatchSecurityNotice(body.detail.message as string);
        }
        return false;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * fetch() wrapper that always sends auth cookies and retries once after a
 * successful token refresh when the backend returns 401. Concurrent 401s
 * share a single in-flight refresh call instead of each triggering their own.
 */
export async function apiFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const requestInit: RequestInit = { ...init, credentials: "include" };

  const first = await fetch(url, requestInit);
  if (first.status !== 401) return first;

  const refreshed = await refreshSession();
  if (!refreshed) return first;

  return fetch(url, requestInit);
}
