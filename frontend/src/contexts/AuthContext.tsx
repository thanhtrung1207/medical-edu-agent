"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { config } from "@/lib/config";
import { apiFetch, AUTH_SECURITY_EVENT } from "@/lib/http";
import { getOrCreateUserId } from "@/lib/client-identity";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  /** Non-null when a reused/stolen refresh token was detected server-side. */
  securityNotice: string | null;
  dismissSecurityNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`${config.apiBaseUrl}/auth/me`);
        if (cancelled) return;
        setUser(res.ok ? ((await res.json()) as AuthUser) : null);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleSecurityEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      setSecurityNotice(detail.message);
      setUser(null);
    };
    window.addEventListener(AUTH_SECURITY_EVENT, handleSecurityEvent);
    return () => {
      window.removeEventListener(AUTH_SECURITY_EVENT, handleSecurityEvent);
    };
  }, []);

  const login = useCallback(() => {
    setSecurityNotice(null);
    const anonId = getOrCreateUserId();
    window.location.href = `${config.apiBaseUrl}/auth/google/login?anon_id=${encodeURIComponent(anonId)}`;
  }, []);

  const logout = useCallback(async () => {
    await apiFetch(`${config.apiBaseUrl}/auth/logout`, { method: "POST" });
    setUser(null);
  }, []);

  const dismissSecurityNotice = useCallback(() => {
    setSecurityNotice(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, logout, securityNotice, dismissSecurityNotice }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
