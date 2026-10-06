"use client";

import { useEffect } from "react";
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
  // Clear hidden field values when visibility changes
  useEffect(() => {
    for (const field of step.fields) {
      if (!isFieldVisible(field, data) && data[field.id] !== undefined && data[field.id] !== "") {
        onChange(field.id, "");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.fields, data]);

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
              value={data[field.id] ?? ""}
              onChange={onChange}
              error={errors[field.id]}
            />
          </div>
        ))}
    </div>
  );
}
