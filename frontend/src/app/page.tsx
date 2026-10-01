"use client";

import Link from "next/link";
import { ArrowRight, BookOpenCheck, Sparkles, Target } from "lucide-react";
import ScenarioCard from "@/components/home/ScenarioCard";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";

const metrics = [
  { label: "Cases done", value: "12", helper: "case luyện tập" },
  { label: "Quiz streak", value: "7 ngày", helper: "duy trì học đều" },
  { label: "Citations", value: "98%", helper: "câu trả lời có nguồn" },
];

export default function HomePage() {
  return (
    <div className="min-h-full overflow-y-auto bg-gradient-to-br from-cream via-white to-secondary-50 p-4 dark:from-slate-950 dark:via-slate-950 dark:to-primary-900/20 sm:p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="primary">AI Dental Education</Badge>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
              Chào mừng quay lại
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Tiếp tục ca lâm sàng và luyện quiz hôm nay với trải nghiệm học nha khoa có cấu trúc, thân thiện và có trích dẫn.
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <Card className="overflow-hidden border-primary/10 bg-gradient-to-br from-primary via-primary-700 to-primary-900 text-white shadow-2xl shadow-primary/20">
            <CardContent className="grid gap-6 p-6 md:grid-cols-[1fr_220px] md:p-8">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-secondary-100">
                  <Sparkles className="h-4 w-4" />
                  Gợi ý tiếp theo
                </div>
                <h2 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">
                  Case Study: Phục hình răng sau
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">
                  AI sẽ dẫn dắt bằng câu hỏi Socratic, gợi ý chẩn đoán, kế hoạch điều trị và trích dẫn kiến thức liên quan.
                </p>
                <Link
                  href="/case/fracture"
                  className="mt-6 inline-flex min-h-[44px] items-center rounded-2xl bg-white px-5 text-sm font-bold text-primary transition hover:bg-secondary-50"
                >
                  Tiếp tục học
                  <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                </Link>
              </div>
              <div className="hidden rounded-3xl border border-white/10 bg-white/10 p-4 md:block">
                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-white/70">
                  FDI quick map
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-10 rounded-xl bg-white/80 shadow-inner shadow-primary/10"
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary-50 text-secondary-900">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-50">Learning plan</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">3 bước học gợi ý hôm nay</div>
                </div>
              </div>
              <div className="mt-5 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div className="rounded-2xl bg-cream p-3 dark:bg-slate-800">1. Ôn chỉ định phục hình</div>
                <div className="rounded-2xl bg-cream p-3 dark:bg-slate-800">2. Làm một case study</div>
                <div className="rounded-2xl bg-cream p-3 dark:bg-slate-800">3. Tự kiểm tra bằng quiz</div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {metrics.map((metric) => (
            <Card key={metric.label}>
              <CardContent className="p-5">
                <div className="text-sm text-slate-500 dark:text-slate-400">{metric.label}</div>
                <div className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">{metric.value}</div>
                <div className="mt-1 text-xs text-slate-400">{metric.helper}</div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">Chọn case để bắt đầu</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <ScenarioCard
              href="/case/fracture"
              icon="🦷"
              title="Răng vỡ / Sâu nặng"
              description="Đánh giá khả năng phục hồi và lựa chọn loại phục hình tối ưu cho răng tổn thương lớn"
              tags={[
                "Composite · Inlay · Onlay",
                "Mão răng (toàn sứ / PFM / kim loại)",
                "Trụ nội + Core + Mão",
                "Tiên lượng và chỉ định nhổ",
              ]}
            />
            <ScenarioCard
              href="/case/missing"
              icon="🔬"
              title="Mất răng đơn lẻ"
              description="Phân tích chỉ định và lựa chọn phương pháp phục hình mất răng phù hợp nhất"
              tags={[
                "Implant nha khoa (tiêu chuẩn vàng)",
                "Cầu răng cố định (FPD)",
                "Hàm tháo lắp một phần (RPD)",
                "So sánh ưu / nhược điểm",
              ]}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
