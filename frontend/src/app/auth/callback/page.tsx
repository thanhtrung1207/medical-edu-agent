"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_STATE_MISMATCH: "Phiên đăng nhập không hợp lệ, vui lòng thử lại.",
  AUTH_GOOGLE_DENIED: "Bạn đã huỷ đăng nhập Google.",
  AUTH_TOKEN_EXCHANGE_FAILED: "Không thể kết nối Google, vui lòng thử lại sau.",
  AUTH_INVALID_ID_TOKEN: "Xác thực không hợp lệ, vui lòng thử lại.",
};

const DEFAULT_ERROR_MESSAGE = "Đăng nhập không thành công, vui lòng thử lại.";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const errorCode = searchParams.get("error");
    if (!errorCode) {
      router.replace("/");
      return;
    }
    setMessage(ERROR_MESSAGES[errorCode] ?? DEFAULT_ERROR_MESSAGE);
  }, [searchParams, router]);

  if (!message) return null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
      <button
        type="button"
        onClick={() => router.replace("/")}
        className="min-h-[44px] rounded-lg bg-primary px-4 text-sm font-medium text-white"
      >
        Về trang chủ
      </button>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackContent />
    </Suspense>
  );
}
