"use client";

import { useAuth } from "./AuthContext";

export function SecurityNoticeBanner() {
  const { securityNotice, dismissSecurityNotice } = useAuth();

  if (!securityNotice) return null;

  return (
    <div
      role="alert"
      className="flex min-h-[44px] items-center justify-between gap-3 bg-red-600 px-4 py-2 text-sm text-white"
    >
      <span>{securityNotice}</span>
      <button
        type="button"
        onClick={dismissSecurityNotice}
        aria-label="Đóng"
        className="flex min-h-[44px] items-center rounded px-2 font-medium underline"
      >
        Đóng
      </button>
    </div>
  );
}
