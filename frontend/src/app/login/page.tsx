"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { LoginBrandPanel } from "@/components/auth/LoginBrandPanel";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { DisabledProviderButton } from "@/components/auth/DisabledProviderButton";
import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";

export default function LoginPage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  if (user) return null;

  return (
    <div className="flex h-full w-full">
      <LoginBrandPanel />
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex w-full max-w-xs flex-col gap-3">
          <h1 className="text-center text-lg font-bold text-slate-800 dark:text-slate-100">
            Đăng nhập
          </h1>
          <GoogleSignInButton />
          <div className="flex gap-2">
            <DisabledProviderButton provider="facebook" />
            <DisabledProviderButton provider="apple" />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            <span>hoặc</span>
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          </div>
          <EmailPasswordForm />
        </div>
      </div>
    </div>
  );
}
