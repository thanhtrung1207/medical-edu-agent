"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";

export default function HomePage() {
  return (
    <div className="min-h-full overflow-y-auto bg-gradient-to-br from-cream via-white to-secondary-50 p-4 dark:from-slate-950 dark:via-slate-950 dark:to-primary-900/20 sm:p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <section>
          <Badge variant="primary">AI Dental Education</Badge>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
            Chào mừng đến UniDent
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Học nha khoa lâm sàng với AI hỗ trợ — tạo bệnh án, nhận phân tích chẩn đoán và lưu ca lâm sàng của bạn.
          </p>
        </section>

        <Card className="overflow-hidden border-primary/10 bg-gradient-to-br from-primary via-primary-700 to-primary-900 text-white shadow-2xl shadow-primary/20">
          <CardContent className="p-6 md:p-8">
            <div className="flex items-center gap-2 text-sm font-semibold text-secondary-100">
              <MessageCircle className="h-4 w-4" />
              Bắt đầu ngay
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">
              Chat với AI nha khoa
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/75">
              Tạo bệnh án, nhận phân tích chẩn đoán và kế hoạch điều trị dựa trên y học bằng chứng.
            </p>
            <Link
              href="/chat"
              className="group/cta mt-5 inline-flex min-h-[44px] items-center gap-3 rounded-2xl bg-white px-5 text-sm font-bold text-primary transition-all duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:bg-secondary-50 active:scale-[0.97]"
            >
              Bắt đầu chat
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
