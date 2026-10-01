"use client";

import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Separator } from "@/components/ui/Separator";
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
    <div className="min-h-full overflow-y-auto bg-gradient-to-br from-cream via-white to-secondary-50 p-4 dark:from-slate-950 dark:via-slate-950 dark:to-primary-900/20 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-8rem)] w-full max-w-6xl gap-6 md:grid-cols-[0.95fr_1fr]">
        <LoginBrandPanel />

        <div className="flex items-center justify-center">
          <Card className="w-full max-w-md border-white/80 bg-white/90 shadow-2xl shadow-primary/10 backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/90">
            <CardHeader className="text-center">
              <div className="flex justify-center">
                <Badge variant="primary">Welcome to UniDent</Badge>
              </div>
              <CardTitle as="h1">Đăng nhập</CardTitle>
              <CardDescription>
                Tiếp tục học nha khoa với AI tutor cá nhân hóa theo lịch sử học của bạn.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <GoogleSignInButton />
              <div className="grid grid-cols-2 gap-3">
                <DisabledProviderButton provider="facebook" />
                <DisabledProviderButton provider="apple" />
              </div>
              <Separator label="hoặc" />
              <EmailPasswordForm />
              <div className="flex items-center justify-center gap-2 text-center text-xs text-slate-400">
                <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
                <span>Bảo mật bởi Google OAuth · lịch sử học được đồng bộ sau đăng nhập</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
