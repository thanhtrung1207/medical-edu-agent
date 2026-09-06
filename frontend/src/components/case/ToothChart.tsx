"use client";

import { UPPER_RIGHT, UPPER_LEFT, LOWER_RIGHT, LOWER_LEFT } from "@/lib/case-schemas";

interface ToothChartProps {
  selectedTeeth: number[];
  onToggle: (tooth: number) => void;
  onClear: () => void;
}

function ToothButton({
  tooth,
  isSelected,
  onToggle,
}: {
  tooth: number;
  isSelected: boolean;
  onToggle: (tooth: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(tooth)}
      className={`relative flex h-7 w-7 items-center justify-center rounded-md border text-[10px] font-bold transition-all duration-150 ${
        isSelected
          ? "border-primary bg-primary text-white"
          : "border-borderSoft bg-cream text-slate-600 hover:border-primary hover:scale-105"
      }`}
      aria-pressed={isSelected}
      aria-label={`Răng ${tooth}`}
    >
      {tooth}
      {isSelected && (
        <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-secondary" />
      )}
    </button>
  );
}

function QuadrantRow({
  label,
  rightTeeth,
  leftTeeth,
  selectedTeeth,
  onToggle,
}: {
  label: string;
  rightTeeth: number[];
  leftTeeth: number[];
  selectedTeeth: number[];
  onToggle: (tooth: number) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <div className="flex items-center gap-1">
        {/* Right quadrant */}
        <div className="flex gap-0.5">
          {rightTeeth.map((tooth) => (
            <ToothButton
              key={tooth}
              tooth={tooth}
              isSelected={selectedTeeth.includes(tooth)}
              onToggle={onToggle}
            />
          ))}
        </div>
        {/* Divider */}
        <div className="mx-0.5 h-7 w-px bg-borderSoft" />
        {/* Left quadrant */}
        <div className="flex gap-0.5">
          {leftTeeth.map((tooth) => (
            <ToothButton
              key={tooth}
              tooth={tooth}
              isSelected={selectedTeeth.includes(tooth)}
              onToggle={onToggle}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ToothChart({ selectedTeeth, onToggle, onClear }: ToothChartProps) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Sơ đồ răng
        </span>
        {selectedTeeth.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary-700"
          >
            <span>Xóa chọn</span>
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-primary text-[8px] leading-none">
              ×
            </span>
          </button>
        )}
      </div>

      <div className="rounded-lg border border-borderSoft bg-cream/50 p-2.5 space-y-2">
        <QuadrantRow
          label="HÀM TRÊN"
          rightTeeth={UPPER_RIGHT}
          leftTeeth={UPPER_LEFT}
          selectedTeeth={selectedTeeth}
          onToggle={onToggle}
        />
        <div className="h-px bg-borderSoft" />
        <QuadrantRow
          label="HÀM DƯỚI"
          rightTeeth={LOWER_RIGHT}
          leftTeeth={LOWER_LEFT}
          selectedTeeth={selectedTeeth}
          onToggle={onToggle}
        />
      </div>

      {selectedTeeth.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-700">Đã chọn:</span>
          <span className="text-primary font-medium">
            {selectedTeeth.join(", ")}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-slate-500 text-[9px] leading-none transition hover:bg-red-100 hover:text-red-600"
            aria-label="Xóa tất cả răng đã chọn"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
