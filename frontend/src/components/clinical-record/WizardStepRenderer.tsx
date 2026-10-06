"use client";

import { useEffect, useRef } from "react";
import type { WizardStep } from "@/lib/clinical-record/schemas";
import { isFieldVisible } from "@/lib/clinical-record/schemas";
import { WizardField } from "./WizardField";

export interface WizardStepRendererProps {
  step: WizardStep;
  data: Record<string, unknown>;
  onChange: (id: string, value: unknown) => void;
  errors?: Record<string, string>;
}

export function WizardStepRenderer({
  step,
  data,
  onChange,
  errors = {},
}: WizardStepRendererProps) {
  // Serialised key built from ONLY the field IDs+values that affect visibility.
  // The effect re-fires only when visibility-relevant data changes, not on every
  // unrelated keystroke (avoids O(n) firing caused by bare `data` object dep).
  const visibilityKey = JSON.stringify(
    step.fields
      .filter((f) => f.visibleWhen)
      .flatMap((f) => [
        f.id,
        data[f.id],
        f.visibleWhen!.fieldId,
        data[f.visibleWhen!.fieldId],
      ]),
  );

  // Refs keep the latest data/onChange available inside the effect without them
  // becoming deps (which would re-fire on every unrelated keystroke).
  const dataRef = useRef(data);
  dataRef.current = data;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Clear hidden field values when visibility changes.
  // Uses type-correct empty values: multi-checkbox → [], dental-chart → {}, else → "".
  useEffect(() => {
    const d = dataRef.current;
    const cb = onChangeRef.current;
    for (const field of step.fields) {
      if (!isFieldVisible(field, d)) {
        const v = d[field.id];
        if (v === undefined) continue;
        if (field.type === "multi-checkbox") {
          if (!Array.isArray(v) || (v as unknown[]).length > 0) cb(field.id, []);
        } else if (field.type === "dental-chart") {
          if (typeof v !== "object" || v === null || Object.keys(v as object).length > 0)
            cb(field.id, {});
        } else {
          if (v !== "") cb(field.id, "");
        }
      }
    }
    // step.fields is stable (comes from a schema constant).
    // visibilityKey re-fires the effect when visibility-relevant data changes.
    // data/onChange are accessed via refs to avoid firing on unrelated keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.fields, visibilityKey]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {step.fields
        .filter((field) => isFieldVisible(field, data))
        .map((field) => (
          <div
            key={field.id}
            className={
              field.type === "dental-chart" ||
              field.type === "textarea" ||
              !field.half
                ? "sm:col-span-2"
                : ""
            }
          >
            <WizardField
              field={field}
              value={
                data[field.id] ??
                (field.type === "multi-checkbox"
                  ? []
                  : field.type === "dental-chart"
                    ? {}
                    : "")
              }
              onChange={onChange}
              error={errors[field.id]}
            />
          </div>
        ))}
    </div>
  );
}
