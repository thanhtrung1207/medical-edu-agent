"use client";

import type { ToothStatus } from "@/lib/clinical-record/types";

export const TOOTH_CONDITIONS = [
  { value: "normal", label: "Bình thường", indicator: "BT" },
  { value: "decay", label: "Sâu", indicator: "S" },
  { value: "missing", label: "Mất", indicator: "M" },
  { value: "restored", label: "Phục hình", indicator: "PH" },
  { value: "mobile", label: "Lung lay", indicator: "LL" },
  { value: "treatment-needed", label: "Cần điều trị", indicator: "ĐT" },
] as const satisfies ReadonlyArray<{
  value: ToothStatus["condition"];
  label: string;
  indicator: string;
}>;

interface ToothPopoverProps {
  tooth: number;
  status: ToothStatus;
  onStatusChange: (condition: ToothStatus["condition"]) => void;
  onNoteChange: (note: string) => void;
  onClose: () => void;
}

export function ToothPopover({
  tooth,
  status,
  onStatusChange,
  onNoteChange,
  onClose,
}: ToothPopoverProps) {
  return (
    <div
      role="dialog"
      aria-label={`Răng ${tooth}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="rounded-lg border border-borderSoft bg-white p-3 shadow-lg"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Răng {tooth}</h3>
        <button type="button" onClick={onClose} aria-label="Đóng">
          ×
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {TOOTH_CONDITIONS.map(({ value, label, indicator }) => (
          <button
            key={value}
            type="button"
            onClick={() => onStatusChange(value)}
            aria-pressed={status.condition === value}
            aria-label={label}
            className={`flex items-center gap-2 rounded border px-2 py-1.5 text-left text-sm ${
              status.condition === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-borderSoft text-slate-700 hover:border-primary"
            }`}
          >
            <span className="flex h-5 min-w-5 items-center justify-center rounded bg-slate-100 px-1 text-[10px] font-bold">
              {indicator}
            </span>
            {label}
          </button>
        ))}
      </div>

      <label className="mt-3 block text-sm text-slate-700" htmlFor={`tooth-note-${tooth}`}>
        Ghi chú
      </label>
      <input
        id={`tooth-note-${tooth}`}
        aria-label={`Ghi chú răng ${tooth}`}
        value={status.note ?? ""}
        onChange={(event) => onNoteChange(event.target.value)}
        className="mt-1 w-full rounded border border-borderSoft px-2 py-1.5 text-sm"
      />

      <button
        type="button"
        onClick={onClose}
        className="mt-3 w-full rounded bg-primary px-3 py-1.5 text-sm font-medium text-white"
      >
        Xong
      </button>
    </div>
  );
}
