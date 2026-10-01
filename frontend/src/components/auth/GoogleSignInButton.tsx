"use client";

import { useAuth } from "@/contexts/AuthContext";

export function GoogleSignInButton() {
  const { login } = useAuth();

  return (
    <button
      type="button"
      onClick={login}
      aria-label="Đăng nhập với Google"
      className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-white transition hover:bg-primary-700"
    >
      Đăng nhập với Google
    </button>
  );
}
