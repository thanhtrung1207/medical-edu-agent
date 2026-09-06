"use client";

import { FileText, RefreshCw } from "lucide-react";
import type { MedicalDocument } from "@/lib/types";
import { IngestionStatus } from "./IngestionStatus";

interface DocumentListProps {
  documents: MedicalDocument[];
  loading: boolean;
  onRefresh: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function DocumentList({
  documents = [],
  loading,
  onRefresh,
}: DocumentListProps) {
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Làm mới
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Đang tải danh sách tài liệu...
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Chưa có tài liệu nào. Hãy tải lên tài liệu đầu tiên của bạn.
        </div>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {doc.filename}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatDate(doc.uploaded_at)}
                  {typeof doc.num_chunks === "number" && doc.num_chunks > 0
                    ? ` · ${doc.num_chunks} đoạn`
                    : ""}
                </p>
              </div>
              <IngestionStatus status={doc.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
