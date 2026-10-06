"use client";

import * as React from "react";

import type { ClinicalRecordData } from "@/lib/clinical-record/types";
import type { ToothStatus } from "@/lib/clinical-record/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCHEMA_TITLES: Record<string, string> = {
  "co-dinh": "Cố Định",
  "thao-lap": "Tháo Lắp",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ClinicalRecordBadgeProps {
  record: ClinicalRecordData;
  onEdit?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDentalChartTeeth(data: Record<string, unknown>): string[] {
  const chart = data.dental_chart;
  if (
    chart === null ||
    chart === undefined ||
    typeof chart !== "object" ||
    Array.isArray(chart)
  ) {
    return [];
  }
  return Object.keys(chart as Record<string, ToothStatus>);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClinicalRecordBadge({ record, onEdit }: ClinicalRecordBadgeProps) {
  const [expanded, setExpanded] = React.useState(false);

  const schemaTitle = SCHEMA_TITLES[record.schemaId] ?? record.schemaId;
  const teeth = getDentalChartTeeth(record.data);
  const isClosed = Boolean(record.closedAt);
  const showEdit = Boolean(onEdit) && !isClosed;

  // Determine closed state label
  const closedLabel: string | null = isClosed
    ? record.summary
      ? "Đã kết thúc"
      : "Đã lưu — chưa tóm tắt"
    : null;

  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        {/* Title + tooth list */}
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            Phục Hình {schemaTitle}
          </span>

          {teeth.length > 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Răng: {teeth.join(", ")}
            </span>
          )}

          {closedLabel && (
            <span
              className={[
                "mt-0.5 text-xs font-medium",
                record.summary
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400",
              ].join(" ")}
            >
              {closedLabel}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-shrink-0 items-center gap-1">
          {showEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 dark:hover:bg-primary/20"
            >
              Sửa
            </button>
          )}

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {expanded ? "Thu gọn" : "Xem"}
          </button>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-400">
          <pre className="whitespace-pre-wrap break-words font-sans">
            {record.serializedText || "—"}
          </pre>
        </div>
      )}
    </article>
  );
}
