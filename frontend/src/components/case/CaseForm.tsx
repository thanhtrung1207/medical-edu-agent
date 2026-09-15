"use client";

import { useReducer, useCallback } from "react";
import type { Scenario } from "@/lib/case-schemas";
import { SCENARIO_REGISTRY, buildCaseText } from "@/lib/case-schemas";
import { ToothChart } from "./ToothChart";
import { FormField } from "./FormField";
import { FormSection } from "./FormSection";

interface CaseFormProps {
  scenario: Scenario;
  onCaseSubmit: (caseText: string, selectedTeeth: number[]) => void;
  submitted: boolean;
  onBack?: () => void;
}

interface FormState {
  values: Record<string, string>;
  selectedTeeth: number[];
}

type FormAction =
  | { type: "SET_FIELD"; fieldId: string; value: string }
  | { type: "TOGGLE_TOOTH"; tooth: number }
  | { type: "CLEAR_TEETH" }
  | { type: "FILL_SAMPLE"; data: Record<string, string>; teeth: number[] }
  | { type: "RESET" };

const initialState: FormState = {
  values: {},
  selectedTeeth: [],
};

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_FIELD":
      return {
        ...state,
        values: { ...state.values, [action.fieldId]: action.value },
      };
    case "TOGGLE_TOOTH": {
      const isSelected = state.selectedTeeth.includes(action.tooth);
      const updated = isSelected
        ? state.selectedTeeth.filter((t) => t !== action.tooth)
        : [...state.selectedTeeth, action.tooth];
      return { ...state, selectedTeeth: updated.sort((a, b) => a - b) };
    }
    case "CLEAR_TEETH":
      return { ...state, selectedTeeth: [] };
    case "FILL_SAMPLE":
      return { values: { ...action.data }, selectedTeeth: [...action.teeth] };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

export function CaseForm({ scenario, onCaseSubmit, submitted, onBack }: CaseFormProps) {
  const [state, dispatch] = useReducer(formReducer, initialState);
  const schema = SCENARIO_REGISTRY[scenario];

  const handleFieldChange = useCallback((id: string, value: string) => {
    dispatch({ type: "SET_FIELD", fieldId: id, value });
  }, []);

  const handleToggleTooth = useCallback((tooth: number) => {
    dispatch({ type: "TOGGLE_TOOTH", tooth });
  }, []);

  const handleClearTeeth = useCallback(() => {
    dispatch({ type: "CLEAR_TEETH" });
  }, []);

  const handleFillSample = useCallback(() => {
    dispatch({ type: "FILL_SAMPLE", data: schema.sampleData, teeth: schema.sampleTeeth });
  }, [schema]);

  const handleSubmit = useCallback(() => {
    const caseText = buildCaseText(scenario, state.values, state.selectedTeeth);
    onCaseSubmit(caseText, state.selectedTeeth);
  }, [scenario, state.values, state.selectedTeeth, onCaseSubmit]);

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-borderSoft px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center text-slate-400 text-lg leading-none transition hover:text-primary"
            aria-label="Quay lại trang chủ"
          >
            ←
          </button>
          <span className="text-sm font-bold text-slate-800">
            {schema.icon} {schema.title}
          </span>
        </div>
        <button
          type="button"
          onClick={handleFillSample}
          disabled={submitted}
          className="min-h-[44px] rounded-md border border-secondary/40 bg-secondary/10 px-2.5 py-1 text-[11px] font-semibold text-secondary-700 transition hover:bg-secondary/20 disabled:opacity-50"
        >
          ⚡ Case mẫu
        </button>
      </div>

      {/* Scrollable form area */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        <ToothChart
          selectedTeeth={state.selectedTeeth}
          onToggle={handleToggleTooth}
          onClear={handleClearTeeth}
        />

        {schema.sections.map((section, idx) => (
          <FormSection key={section.id} number={idx + 1} title={section.label}>
            {section.fields.map((field) => (
              <FormField
                key={field.id}
                field={field}
                value={state.values[field.id] ?? ""}
                onChange={handleFieldChange}
              />
            ))}
          </FormSection>
        ))}
      </div>

      {/* Submit button */}
      <div className="border-t border-borderSoft p-3.5">
        {submitted ? (
          <button
            type="button"
            disabled
            className="w-full rounded-lg bg-secondary/20 py-2.5 min-h-[44px] px-4 text-sm font-semibold text-secondary-700"
          >
            Case đã gửi ✓
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            className="w-full rounded-lg bg-primary py-2.5 min-h-[44px] px-4 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            🚀 Gửi case để phân tích
          </button>
        )}
      </div>
    </div>
  );
}
