"use client";

import { useState } from "react";
import type { ToothStatus } from "@/lib/clinical-record/types";
import { TOOTH_CONDITIONS, ToothPopover } from "./ToothPopover";

const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const NORMAL_STATUS: ToothStatus = { condition: "normal" };

const CONDITION_LABELS = Object.fromEntries(
  TOOTH_CONDITIONS.map(({ value, label }) => [value, label]),
) as Record<ToothStatus["condition"], string>;

export interface DentalChartProps {
  value: Record<number, ToothStatus>;
  onChange: (value: Record<number, ToothStatus>) => void;
  disabled?: boolean;
}

interface JawRowProps {
  jaw: "upper" | "lower";
  teeth: number[];
  value: Record<number, ToothStatus>;
  disabled: boolean;
  onSelect: (tooth: number) => void;
}

function JawRow({ jaw, teeth, value, disabled, onSelect }: JawRowProps) {
  return (
    <div data-jaw-row={jaw} className="overflow-x-auto">
      <div className="flex min-w-max gap-1 p-1">
        {teeth.map((tooth) => {
          const status = value[tooth];
          const isAnnotated = status?.condition && status.condition !== "normal";

          return (
            <button
              key={tooth}
              type="button"
              aria-label={`Răng ${tooth}`}
              data-status={isAnnotated ? status.condition : undefined}
              disabled={disabled}
              onClick={() => onSelect(tooth)}
              className={`relative flex h-9 w-9 items-center justify-center rounded-md border text-xs font-semibold ${
                isAnnotated
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-borderSoft bg-cream text-slate-700 hover:border-primary"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {tooth}
              {isAnnotated && (
                <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[9px] text-white">
                  {TOOTH_CONDITIONS.find((option) => option.value === status.condition)?.indicator}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DentalChart({ value, onChange, disabled = false }: DentalChartProps) {
  const [activeTooth, setActiveTooth] = useState<number | null>(null);
  const activeStatus = activeTooth === null ? NORMAL_STATUS : value[activeTooth] ?? NORMAL_STATUS;
  const annotatedTeeth = Object.entries(value)
    .map(([tooth, status]) => [Number(tooth), status] as const)
    .filter(([, status]) => status.condition !== "normal")
    .sort(([first], [second]) => first - second);

  const updateActiveTooth = (update: Partial<ToothStatus>) => {
    if (activeTooth === null) return;
    onChange({
      ...value,
      [activeTooth]: { ...activeStatus, ...update },
    });
  };

  return (
    <section className="space-y-3" aria-label="Sơ đồ răng">
      <div className="space-y-1">
        <span className="text-xs font-semibold text-slate-500">Hàm trên</span>
        <JawRow jaw="upper" teeth={UPPER_TEETH} value={value} disabled={disabled} onSelect={setActiveTooth} />
      </div>
      <div className="space-y-1">
        <span className="text-xs font-semibold text-slate-500">Hàm dưới</span>
        <JawRow jaw="lower" teeth={LOWER_TEETH} value={value} disabled={disabled} onSelect={setActiveTooth} />
      </div>

      {activeTooth !== null && !disabled && (
        <ToothPopover
          tooth={activeTooth}
          status={activeStatus}
          onStatusChange={(condition) => updateActiveTooth({ condition })}
          onNoteChange={(note) => updateActiveTooth({ note })}
          onClose={() => setActiveTooth(null)}
        />
      )}

      {annotatedTeeth.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-700" aria-label="Tóm tắt tình trạng răng">
          {annotatedTeeth.map(([tooth, status]) => (
            <li key={tooth}>Răng {tooth}: {CONDITION_LABELS[status.condition]}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
