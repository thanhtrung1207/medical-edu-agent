"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { isFieldVisible, type ClinicalRecordSchema, type WizardStep } from "@/lib/clinical-record/schemas";
import { serializeClinicalRecord } from "@/lib/clinical-record/serialize";
import type { ClinicalRecordData } from "@/lib/clinical-record/types";
import { WizardStepRenderer } from "./WizardStepRenderer";

// ── Constants ─────────────────────────────────────────────────────────────────

export const DRAFT_DELAY_MS = 2000;

export const CANCEL_CONFIRM_TEXT =
  "Bạn có thay đổi chưa lưu. Thoát sẽ giữ bản nháp. Xác nhận thoát?";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function draftKey(schemaId: string, recordId?: string): string {
  return `unident_wizard_draft_${schemaId}_${recordId ?? "new"}`;
}

export function validateStep(
  step: WizardStep,
  data: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const currentYear = new Date().getFullYear();

  for (const field of step.fields) {
    if (!isFieldVisible(field, data)) continue;

    const value = data[field.id];

    // dental-chart special-case: required means the chart must have at least one tooth entry
    if (field.type === "dental-chart") {
      if (field.required) {
        const isEmpty =
          value == null ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          Object.keys(value as object).length === 0;
        if (isEmpty) {
          errors[field.id] = "Vui lòng điền vào sơ đồ răng";
        }
      }
      continue; // dental-chart is never checked via the generic required path
    }

    // Year validation (nam_sinh): must be a 4-digit year in range [1900, currentYear]
    if (field.id === "nam_sinh") {
      const strVal = String(value ?? "").trim();
      if (strVal !== "") {
        const year = Number(strVal);
        if (!/^\d{4}$/.test(strVal) || year < 1900 || year > currentYear) {
          errors[field.id] = `Năm sinh phải từ 1900 đến ${currentYear}`;
        }
      }
    }

    // Generic required field validation (runs only if no year-error already set for this field)
    if (field.required && !errors[field.id]) {
      let isEmpty: boolean;
      if (field.type === "multi-checkbox") {
        isEmpty = !Array.isArray(value) || (value as unknown[]).length === 0;
      } else {
        isEmpty = value === undefined || value === null || value === "";
      }
      if (isEmpty) {
        errors[field.id] = "Trường này bắt buộc";
      }
    }
  }

  return errors;
}

// ── Reducer ───────────────────────────────────────────────────────────────────

export interface WizardState {
  currentStep: number;
  data: Record<string, unknown>;
  errors: Record<string, string>;
}

type WizardAction =
  | { type: "SET_FIELD"; id: string; value: unknown }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "SET_ERRORS"; errors: Record<string, string> }
  | { type: "RESTORE_DRAFT"; data: Record<string, unknown> };

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, data: { ...state.data, [action.id]: action.value } };
    case "NEXT":
      return { ...state, currentStep: state.currentStep + 1, errors: {} };
    case "BACK":
      return { ...state, currentStep: state.currentStep - 1, errors: {} };
    case "SET_ERRORS":
      return { ...state, errors: action.errors };
    case "RESTORE_DRAFT":
      return { ...state, data: action.data };
    default:
      return state;
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ClinicalRecordWizardProps {
  schema: ClinicalRecordSchema;
  recordId?: string;
  initialData?: Record<string, unknown>;
  onSubmit: (record: ClinicalRecordData) => void;
  onCancel: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ClinicalRecordWizard({
  schema,
  recordId,
  initialData,
  onSubmit,
  onCancel,
}: ClinicalRecordWizardProps) {
  const [state, dispatch] = useReducer(wizardReducer, {
    currentStep: 0,
    data: initialData ?? {},
    errors: {},
  });

  // Ref to always access the latest state inside async callbacks / timers
  const stateRef = useRef(state);
  stateRef.current = state;

  // Pending debounce timer handle
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prevent the debounced-save effect from firing on the very first render
  const isFirstRender = useRef(true);

  // ── Draft restore on mount (only when no initialData) ─────────────────────
  useEffect(() => {
    if (initialData !== undefined) return;
    const key = draftKey(schema.id, recordId);
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      dispatch({ type: "RESTORE_DRAFT", data: parsed });
    } catch {
      // ignore malformed JSON
    }
    // Run once on mount only — deps intentionally omitted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Debounced draft save whenever data changes ─────────────────────────────
  useEffect(() => {
    // Skip the initial mount to avoid writing an empty/initialData draft.
    // The cleanup checks whether the data reference is still the same as when
    // the effect ran; if it is, we're in StrictMode's mount→cleanup→remount
    // cycle (no user change), so we reset the flag so the second invocation
    // is also treated as "first render". If the data changed (a real deps
    // update) the flag is left alone so the next invocation schedules the timer.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      const capturedData = stateRef.current.data;
      return () => {
        if (stateRef.current.data === capturedData) {
          isFirstRender.current = true;
        }
      };
    }
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      localStorage.setItem(
        draftKey(schema.id, recordId),
        JSON.stringify(stateRef.current.data),
      );
    }, DRAFT_DELAY_MS);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
    // schema.id and recordId are stable for the lifetime of the wizard
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data]);

  // ── Flush draft immediately (called on Back / Next) ────────────────────────
  const flushDraft = () => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    localStorage.setItem(draftKey(schema.id, recordId), JSON.stringify(stateRef.current.data));
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  // I-1: Wrap in useCallback so the reference is stable across renders.
  // dispatch is guaranteed stable by useReducer, so no extra deps are needed.
  const handleChange = useCallback((id: string, value: unknown) => {
    dispatch({ type: "SET_FIELD", id, value });
  }, [dispatch]);

  const handleNext = () => {
    const step = schema.steps[state.currentStep];
    const stepErrors = validateStep(step, state.data);
    if (Object.keys(stepErrors).length > 0) {
      dispatch({ type: "SET_ERRORS", errors: stepErrors });
      return;
    }
    if (state.currentStep < schema.steps.length - 1) {
      flushDraft();
      dispatch({ type: "NEXT" });
    }
  };

  const handleBack = () => {
    if (state.currentStep > 0) {
      flushDraft();
      dispatch({ type: "BACK" });
    }
  };

  const handleSubmit = () => {
    const step = schema.steps[state.currentStep];
    const stepErrors = validateStep(step, state.data);
    if (Object.keys(stepErrors).length > 0) {
      dispatch({ type: "SET_ERRORS", errors: stepErrors });
      return;
    }
    // Clear any pending debounce timer
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    // Remove the draft from storage
    localStorage.removeItem(draftKey(schema.id, recordId));

    const now = new Date().toISOString();
    onSubmit({
      id: crypto.randomUUID(),
      schemaId: schema.id,
      data: state.data,
      serializedText: serializeClinicalRecord(schema, state.data),
      createdAt: now,
      updatedAt: now,
    });
  };

  const handleCancel = () => {
    const isDirty =
      JSON.stringify(state.data) !== JSON.stringify(initialData ?? {});
    if (isDirty) {
      const confirmed = window.confirm(CANCEL_CONFIRM_TEXT);
      if (confirmed) {
        // Retain draft in localStorage (do NOT remove it) then cancel
        onCancel();
      }
      return;
    }
    onCancel();
  };

  // ── Derived UI values ─────────────────────────────────────────────────────
  const totalSteps = schema.steps.length;
  const isFirst = state.currentStep === 0;
  const isLast = state.currentStep === totalSteps - 1;
  const currentStepDef = schema.steps[state.currentStep];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* Learning banner */}
      <div
        role="note"
        className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800"
      >
        Đây là bệnh án giả định cho mục đích học tập. Không nhập thông tin bệnh nhân thật.
      </div>

      {/* 5-step numbered stepper */}
      <nav aria-label="Các bước" className="flex items-center gap-1 overflow-x-auto pb-1">
        {schema.steps.map((step, index) => {
          const isActive = index === state.currentStep;
          const isDone = index < state.currentStep;
          return (
            <div key={step.id} className="flex flex-1 items-center gap-1.5">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isActive || isDone
                    ? "bg-primary text-white"
                    : "bg-slate-200 text-slate-600"
                }`}
                aria-current={isActive ? "step" : undefined}
              >
                {index + 1}
              </span>
              {/* Full label — hidden on mobile */}
              <span className="hidden truncate text-xs sm:block">{step.label}</span>
              {/* Short label — hidden on desktop */}
              <span className="truncate text-xs sm:hidden">{step.shortLabel}</span>
            </div>
          );
        })}
      </nav>

      {/* Current-step fields */}
      <WizardStepRenderer
        step={currentStepDef}
        data={state.data}
        onChange={handleChange}
        errors={state.errors}
      />

      {/* Navigation row */}
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={handleCancel}
          className="text-xs text-slate-400 underline hover:text-slate-600"
        >
          Hủy
        </button>

        <div className="flex gap-2">
          {!isFirst && (
            <button
              type="button"
              onClick={handleBack}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50"
            >
              Quay lại
            </button>
          )}

          {!isLast ? (
            <button
              type="button"
              onClick={handleNext}
              className="rounded-lg bg-primary px-4 py-2 text-xs text-white hover:bg-primary/90"
            >
              Tiếp theo
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              className="rounded-lg bg-primary px-4 py-2 text-xs text-white hover:bg-primary/90"
            >
              Hoàn thành
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
