"use client";

import { memo } from "react";
import type { FieldDef } from "@/lib/clinical-record/schemas";
import type { ToothStatus } from "@/lib/clinical-record/types";
import { DentalChart } from "./DentalChart";

export interface SelectWithTextValue {
  value: string;
  text: string;
}

export interface WizardFieldProps {
  field: FieldDef;
  value: unknown;
  onChange: (id: string, value: unknown) => void;
  error?: string;
}

const inputClass =
  "w-full min-h-[44px] px-2.5 py-2 border border-borderSoft rounded-lg text-xs bg-cream text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20";

const TEXTAREA_HINT = "Không ghi tên/SĐT thật.";

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  return [];
}

function asSelectWithText(v: unknown): SelectWithTextValue {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>;
    return { value: asString(obj.value), text: asString(obj.text) };
  }
  return { value: asString(v), text: "" };
}

function asDentalChart(v: unknown): Record<number, ToothStatus> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<number, ToothStatus>;
  }
  return {};
}

function isOtherSelected(value: unknown, options: FieldDef["options"]): boolean {
  if (!options || options.length === 0) return false;
  const lastOption = options[options.length - 1];
  const strVal = typeof value === "object" && value !== null && "value" in value
    ? asString((value as SelectWithTextValue).value)
    : asString(value);
  return strVal === lastOption.value;
}

function WizardFieldComponent({ field, value, onChange, error }: WizardFieldProps) {
  const labelId = `label-${field.id}`;
  const errorId = `error-${field.id}`;

  const isGroupType = (
    field.type === "radio" ||
    field.type === "multi-checkbox" ||
    field.type === "radio-with-other" ||
    field.type === "dental-chart"
  );

  const label = isGroupType ? (
    <span id={labelId} className="text-xs font-semibold text-slate-700 mb-1 block">
      {field.label}
      {field.required && <span className="text-red-500 ml-0.5">*</span>}
    </span>
  ) : (
    <label id={labelId} htmlFor={field.id} className="text-xs font-semibold text-slate-700 mb-1 block">
      {field.label}
      {field.required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );

  const errorEl = error ? (
    <p id={errorId} className="text-red-500 text-xs mt-1" role="alert">{error}</p>
  ) : null;

  if (field.type === "text") {
    return (
      <div>
        {label}
        <input
          id={field.id}
          type="text"
          value={asString(value)}
          placeholder={field.placeholder}
          onChange={(e) => onChange(field.id, e.target.value)}
          className={inputClass}
          required={field.required}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {errorEl}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        {label}
        <textarea
          id={field.id}
          value={asString(value)}
          placeholder={field.placeholder}
          onChange={(e) => onChange(field.id, e.target.value)}
          className={`${inputClass} min-h-[50px] resize-vertical`}
          required={field.required}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <p className="text-slate-400 text-[10px] mt-0.5">{TEXTAREA_HINT}</p>
        {errorEl}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        {label}
        <select
          id={field.id}
          value={asString(value)}
          onChange={(e) => onChange(field.id, e.target.value)}
          className={inputClass}
          required={field.required}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : undefined}
        >
          <option value="">-- Chọn --</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {errorEl}
      </div>
    );
  }

  if (field.type === "radio") {
    return (
      <div role="group" aria-labelledby={labelId}>
        {label}
        <div className="flex flex-wrap gap-2 mt-1">
          {field.options?.map((opt) => (
            <label key={opt.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="radio"
                name={field.id}
                value={opt.value}
                checked={asString(value) === opt.value}
                onChange={() => onChange(field.id, opt.value)}
                className="accent-primary"
              />
              {opt.label}
            </label>
          ))}
        </div>
        {errorEl}
      </div>
    );
  }

  if (field.type === "multi-checkbox") {
    const checked = asArray(value);
    return (
      <div role="group" aria-labelledby={labelId}>
        {label}
        <div className="flex flex-wrap gap-2 mt-1">
          {field.options?.map((opt) => (
            <label key={opt.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                value={opt.value}
                checked={checked.includes(opt.value)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...checked, opt.value]
                    : checked.filter((v) => v !== opt.value);
                  onChange(field.id, next);
                }}
                className="accent-primary"
              />
              {opt.label}
            </label>
          ))}
        </div>
        {errorEl}
      </div>
    );
  }

  if (field.type === "dental-chart") {
    return (
      <div role="group" aria-labelledby={labelId}>
        {label}
        <DentalChart
          value={asDentalChart(value)}
          onChange={(v) => onChange(field.id, v)}
        />
        {errorEl}
      </div>
    );
  }

  if (field.type === "radio-with-other") {
    const showOther = isOtherSelected(value, field.options);
    const selectedValue =
      typeof value === "object" && value !== null && "value" in value
        ? asString((value as SelectWithTextValue).value)
        : asString(value);
    const otherText =
      typeof value === "object" && value !== null && "text" in value
        ? asString((value as SelectWithTextValue).text)
        : "";

    return (
      <div role="group" aria-labelledby={labelId}>
        {label}
        <div className="flex flex-wrap gap-2 mt-1">
          {field.options?.map((opt) => (
            <label key={opt.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="radio"
                name={field.id}
                value={opt.value}
                checked={selectedValue === opt.value}
                onChange={() => onChange(field.id, { value: opt.value, text: "" })}
                className="accent-primary"
              />
              {opt.label}
            </label>
          ))}
        </div>
        {showOther && (
          <input
            type="text"
            value={otherText}
            placeholder={field.pairedTextLabel ?? "Ghi rõ..."}
            onChange={(e) =>
              onChange(field.id, { value: selectedValue, text: e.target.value })
            }
            className={`${inputClass} mt-2`}
          />
        )}
        {errorEl}
      </div>
    );
  }

  if (field.type === "select-with-text") {
    const parsed = asSelectWithText(value);
    return (
      <div>
        {label}
        <div className="flex gap-2">
          <select
            id={field.id}
            value={parsed.value}
            onChange={(e) => onChange(field.id, { value: e.target.value, text: parsed.text })}
            className={`${inputClass} flex-1`}
          >
            <option value="">-- Chọn --</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={parsed.text}
            placeholder={field.pairedTextLabel ?? "Ghi chú..."}
            aria-label={field.pairedTextLabel ?? "Ghi chú..."}
            onChange={(e) => onChange(field.id, { value: parsed.value, text: e.target.value })}
            className={`${inputClass} flex-1`}
          />
        </div>
        {errorEl}
      </div>
    );
  }

  return null;
}

export const WizardField = memo(WizardFieldComponent);
