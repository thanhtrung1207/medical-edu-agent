"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { listClinicalRecords } from "@/lib/clinical-record/storage";
import type { ClinicalRecordData } from "@/lib/clinical-record/types";
import { Card, CardContent } from "@/components/ui/Card";

const SCHEMA_LABELS: Record<string, string> = {
  "co-dinh": "Cố Định",
  "thao-lap": "Tháo Lắp",
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export default function HistoryPage() {
  const [records, setRecords] = useState<ClinicalRecordData[]>([]);

  useEffect(() => {
    setRecords(
      listClinicalRecords()
        .filter((r) => r.closedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }, []);

  return (
    <div className="min-h-full bg-gradient-to-br from-cream via-white to-secondary-50 p-4 dark:from-slate-950 dark:via-slate-950 dark:to-primary-900/20 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
              Lịch sử bệnh án
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {records.length > 0
              ? `${records.length} bệnh án đã lưu`
              : "Chưa có bệnh án nào"}
          </p>
        </header>

        {records.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/8 text-3xl">
                📋
              </div>
              <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
                Chưa có bệnh án nào
              </p>
              <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                Tạo bệnh án trong chat, sử dụng lệnh /ket-thuc để kết thúc và lưu ca
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {records.map((record) => {
              const schemaLabel =
                SCHEMA_LABELS[record.schemaId] ?? record.schemaId;
              const summaryText = record.summary?.trim()
                ? record.summary
                : record.closedAt
                  ? "Chưa có tóm tắt"
                  : "";

              return (
                <Card key={record.id}>
                  <CardContent className="p-5">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          Phục Hình {schemaLabel}
                        </span>
                        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                          {formatDate(record.createdAt)}
                        </p>
                      </div>
                    </div>
                    {summaryText && (
                      <p className="text-sm leading-6 text-slate-500 line-clamp-3 dark:text-slate-400">
                        {summaryText.slice(0, 300)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
