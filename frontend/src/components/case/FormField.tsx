"use client";

import { memo } from "react";
import type { FieldDef } from "@/lib/case-schemas";

interface FormFieldProps {
  field: FieldDef;
  value: string;
  onChange: (id: string, value: string) => void;
}

const inputClass =
  "w-full px-2.5 py-2 border border-borderSoft rounded-lg text-xs bg-cream text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20";

function FormFieldComponent({ field, value, onChange }: FormFieldProps) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 mb-1 block">
        {field.label}
      </label>
      {field.type === "text" && (
        <input
          type="text"
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(field.id, e.target.value)}
          className={inputClass}
        />
      )}
      {field.type === "textarea" && (
        <textarea
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(field.id, e.target.value)}
          className={`${inputClass} min-h-[50px] resize-vertical`}
        />
      )}
      {field.type === "select" && (
        <select
          value={value}
          onChange={(e) => onChange(field.id, e.target.value)}
          className={inputClass}
        >
          <option value="">-- Chọn --</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export const FormField = memo(FormFieldComponent);
