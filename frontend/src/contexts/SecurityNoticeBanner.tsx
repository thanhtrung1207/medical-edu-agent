"use client";

import { AlertTriangle, X } from "lucide-react";
import { useAuth } from "./AuthContext";

export function SecurityNoticeBanner() {
  const { securityNotice, dismissSecurityNotice } = useAuth();

  if (!securityNotice) return null;

  return (
    <div
      role="alert"
      className="flex min-h-[44px] items-center justify-between gap-3 bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-md transition-all"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-white" aria-hidden="true" />
        <span>{securityNotice}</span>
      </div>
      <button
        type="button"
        onClick={dismissSecurityNotice}
        aria-label="Đóng"
        className="flex min-h-[36px] items-center gap-1 rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/40"
      >
        <span>Đóng</span>
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
