import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coDinhSchema, type ClinicalRecordSchema } from "@/lib/clinical-record/schemas";
import * as WizardStepRendererMod from "./WizardStepRenderer";
import {
  CANCEL_CONFIRM_TEXT,
  ClinicalRecordWizard,
  DRAFT_DELAY_MS,
  draftKey,
  validateStep,
} from "./ClinicalRecordWizard";

// ── Minimal schema helpers ────────────────────────────────────────────────────
// Single-step, no required fields — makes submit/cancel tests straightforward.
// M-2: use distinct ids so localStorage keys don't collide with coDinhSchema tests.
const ONE_STEP_SCHEMA = {
  id: "test-one-step",
  title: "One-Step Test",
  steps: [
    {
      id: "step-a",
      label: "Hành chính",
      shortLabel: "HC",
      fields: [{ id: "note", label: "Ghi chú", type: "text" }],
    },
  ],
} as unknown as ClinicalRecordSchema;

// Single-step with one required text field
// M-2: distinct id "test-req"
const REQ_SCHEMA = {
  id: "test-req",
  title: "Req Test",
  steps: [
    {
      id: "step-r",
      label: "Required Step",
      shortLabel: "RS",
      fields: [{ id: "req_field", label: "Required Field", type: "text", required: true }],
    },
  ],
} as unknown as ClinicalRecordSchema;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  // Fire any pending timers before unmounting so localStorage side-effects settle
  vi.runOnlyPendingTimers();
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── draftKey ──────────────────────────────────────────────────────────────────

describe("draftKey", () => {
  it("builds key with 'new' when recordId is absent", () => {
    expect(draftKey("co-dinh")).toBe("unident_wizard_draft_co-dinh_new");
  });

  it("builds key with supplied recordId", () => {
    expect(draftKey("thao-lap", "r-99")).toBe("unident_wizard_draft_thao-lap_r-99");
  });

  it("builds key with 'new' when recordId is explicitly undefined", () => {
    expect(draftKey("co-dinh", undefined)).toBe("unident_wizard_draft_co-dinh_new");
  });
});

// ── DRAFT_DELAY_MS ────────────────────────────────────────────────────────────

describe("DRAFT_DELAY_MS", () => {
  it("equals 2000", () => {
    expect(DRAFT_DELAY_MS).toBe(2000);
  });
});

// ── validateStep – required text field ───────────────────────────────────────

describe("validateStep – required text field", () => {
  // step 4 = "Tóm tắt & Chẩn đoán", has chan_doan_lam_sang (required textarea)
  const step4 = coDinhSchema.steps[4];

  it("returns an error message for an empty required field", () => {
    const errs = validateStep(step4, {});
    expect(errs["chan_doan_lam_sang"]).toBeTruthy();
  });

  it("returns no error when the required field is filled", () => {
    const errs = validateStep(step4, { chan_doan_lam_sang: "Sâu răng số 46" });
    expect(errs["chan_doan_lam_sang"]).toBeUndefined();
  });

  it("error message is 'Trường này bắt buộc'", () => {
    const errs = validateStep(step4, {});
    expect(errs["chan_doan_lam_sang"]).toBe("Trường này bắt buộc");
  });
});

// ── validateStep – dental_chart special case ──────────────────────────────────

describe("validateStep – dental_chart special case", () => {
  // step 2 = "Khám trong miệng", has dental_chart (required dental-chart field)
  const step2 = coDinhSchema.steps[2];

  it("errors when dental_chart is absent from data", () => {
    expect(validateStep(step2, {})["dental_chart"]).toBeTruthy();
  });

  it("errors when dental_chart is an empty object {}", () => {
    expect(validateStep(step2, { dental_chart: {} })["dental_chart"]).toBeTruthy();
  });

  it("no error when dental_chart has at least one entry", () => {
    expect(
      validateStep(step2, { dental_chart: { 11: { condition: "decay" } } })["dental_chart"],
    ).toBeUndefined();
  });

  it("errors when dental_chart is null", () => {
    expect(validateStep(step2, { dental_chart: null })["dental_chart"]).toBeTruthy();
  });
});

// ── validateStep – year 1900–now ──────────────────────────────────────────────

describe("validateStep – year 1900–now (nam_sinh)", () => {
  // step 0 = "Hành chính", has nam_sinh (required text)
  const step0 = coDinhSchema.steps[0];

  it("no error for a valid year like '1990'", () => {
    const errs = validateStep(step0, { nam_sinh: "1990", gioi_tinh: "Nam" });
    expect(errs["nam_sinh"]).toBeUndefined();
  });

  it("error for year before 1900", () => {
    const errs = validateStep(step0, { nam_sinh: "1899", gioi_tinh: "Nam" });
    expect(errs["nam_sinh"]).toBeTruthy();
  });

  it("error for year strictly after current year", () => {
    const next = String(new Date().getFullYear() + 1);
    const errs = validateStep(step0, { nam_sinh: next, gioi_tinh: "Nam" });
    expect(errs["nam_sinh"]).toBeTruthy();
  });

  it("error for a non-numeric string", () => {
    const errs = validateStep(step0, { nam_sinh: "abc", gioi_tinh: "Nam" });
    expect(errs["nam_sinh"]).toBeTruthy();
  });

  it("empty nam_sinh produces a 'required' error (not year error)", () => {
    const errs = validateStep(step0, { gioi_tinh: "Nam" });
    expect(errs["nam_sinh"]).toBe("Trường này bắt buộc");
  });

  it("no error for exactly year 1900", () => {
    const errs = validateStep(step0, { nam_sinh: "1900", gioi_tinh: "Nam" });
    expect(errs["nam_sinh"]).toBeUndefined();
  });

  it("no error for exactly the current year", () => {
    const cur = String(new Date().getFullYear());
    const errs = validateStep(step0, { nam_sinh: cur, gioi_tinh: "Nam" });
    expect(errs["nam_sinh"]).toBeUndefined();
  });

  it("rejects whitespace-only nam_sinh as required", () => {
    const errs = validateStep(step0, { nam_sinh: "   ", gioi_tinh: "Nam" });
    expect(errs["nam_sinh"]).toBe("Trường này bắt buộc");
  });
});

// ── Learning banner ───────────────────────────────────────────────────────────

describe("ClinicalRecordWizard – learning banner", () => {
  it("renders exact learning banner text", () => {
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const banner = screen.getByRole("note");
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain(
      "Đây là bệnh án giả định cho mục đích học tập. Không nhập thông tin bệnh nhân thật.",
    );
  });
});

// ── Stepper ───────────────────────────────────────────────────────────────────

describe("ClinicalRecordWizard – 5-step stepper", () => {
  it("renders numbered steps 1 through 5", () => {
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    for (let n = 1; n <= 5; n++) {
      expect(screen.getAllByText(String(n)).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders shortLabels HC, BS, KTM, KPH, TT (visible on mobile)", () => {
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    for (const label of ["HC", "BS", "KTM", "KPH", "TT"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

// ── I-4: aria-current="step" on active stepper item ──────────────────────────

describe("ClinicalRecordWizard – stepper aria-current (I-4)", () => {
  it("the first step indicator has aria-current='step' on initial render", () => {
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    // The active (first) step's numbered span should carry aria-current="step"
    const activeSpan = document.querySelector('[aria-current="step"]');
    expect(activeSpan).not.toBeNull();
    expect(activeSpan?.textContent?.trim()).toBe("1");
  });

  it("aria-current moves to step 2 after advancing", () => {
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Năm sinh/), { target: { value: "1990" } });
    fireEvent.click(screen.getByLabelText("Nam"));
    fireEvent.click(screen.getByRole("button", { name: /tiếp theo/i }));
    const activeSpan = document.querySelector('[aria-current="step"]');
    expect(activeSpan?.textContent?.trim()).toBe("2");
  });

  it("inactive steps do NOT have aria-current", () => {
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const allAriaCurrentSpans = document.querySelectorAll('[aria-current="step"]');
    // Only one step is active at a time
    expect(allAriaCurrentSpans.length).toBe(1);
  });
});

// ── WizardStepRenderer mounting ───────────────────────────────────────────────

describe("ClinicalRecordWizard – WizardStepRenderer renders current step", () => {
  it("shows step-0 fields on initial render", () => {
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    // "Năm sinh" is a field on step 0
    expect(screen.getByLabelText(/Năm sinh/)).toBeTruthy();
  });

  it("does not show step-1 fields until navigation to step 1", () => {
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    // "Lý do đến khám" is a field on step 1
    expect(screen.queryByLabelText(/Lý do đến khám/)).toBeNull();
  });
});

// ── Navigation ────────────────────────────────────────────────────────────────

describe("ClinicalRecordWizard – navigation", () => {
  it("does NOT advance when required fields on current step are empty", () => {
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /tiếp theo/i }));
    // Still on step 0 — "Năm sinh" is still visible
    expect(screen.getByLabelText(/Năm sinh/)).toBeTruthy();
  });

  it("advances to step 1 when required fields are filled and Next is clicked", () => {
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Năm sinh/), { target: { value: "1990" } });
    fireEvent.click(screen.getByLabelText("Nam"));
    fireEvent.click(screen.getByRole("button", { name: /tiếp theo/i }));
    // Now on step 1 — "Lý do đến khám" should be visible
    expect(screen.getByLabelText(/Lý do đến khám/)).toBeTruthy();
  });

  it("hides Back button on step 0", () => {
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /quay lại/i })).toBeNull();
  });

  it("shows Back button after advancing to step 1", () => {
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Năm sinh/), { target: { value: "1990" } });
    fireEvent.click(screen.getByLabelText("Nam"));
    fireEvent.click(screen.getByRole("button", { name: /tiếp theo/i }));
    expect(screen.getByRole("button", { name: /quay lại/i })).toBeTruthy();
  });

  it("shows 'Hoàn thành' and hides 'Tiếp theo' on last step", () => {
    render(
      <ClinicalRecordWizard schema={ONE_STEP_SCHEMA} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /tiếp theo/i })).toBeNull();
    expect(screen.getByRole("button", { name: /hoàn thành/i })).toBeTruthy();
  });

  it("shows validation error text after clicking Next with empty required field", () => {
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /tiếp theo/i }));
    expect(screen.getAllByText("Trường này bắt buộc").length).toBeGreaterThanOrEqual(1);
  });
});

// ── I-1: handleChange useCallback stability ────────────────────────────────────

describe("ClinicalRecordWizard – handleChange stability (I-1)", () => {
  it("onChange passed to WizardStepRenderer is the same reference across re-renders (useCallback)", () => {
    // Spy on the WizardStepRenderer export to capture the onChange prop reference on each render.
    // Before fix: handleChange is recreated each render → references differ.
    // After fix: useCallback([dispatch]) → references are identical.
    const spy = vi.spyOn(WizardStepRendererMod, "WizardStepRenderer");

    render(
      <ClinicalRecordWizard schema={ONE_STEP_SCHEMA} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    // Trigger a re-render by dispatching SET_FIELD via a field change
    fireEvent.change(screen.getByLabelText(/Ghi chú/), { target: { value: "stability-test" } });

    // At least 2 renders (initial + after SET_FIELD)
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Extract all captured onChange references
    const onChanges = spy.mock.calls.map((args) => args[0].onChange);
    const first = onChanges[0];
    const last = onChanges[onChanges.length - 1];

    // With useCallback the reference must be stable
    expect(first).toBe(last);

    spy.mockRestore();
  });
});

// ── Draft save (debounced) ────────────────────────────────────────────────────

describe("ClinicalRecordWizard – draft save debounced", () => {
  it("does NOT save draft before DRAFT_DELAY_MS elapses", () => {
    render(
      <ClinicalRecordWizard schema={ONE_STEP_SCHEMA} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText(/Ghi chú/), { target: { value: "hello" } });
    // Timer not advanced yet
    expect(localStorage.getItem(draftKey("test-one-step"))).toBeNull();
  });

  it("saves draft to localStorage after DRAFT_DELAY_MS on data change", () => {
    render(
      <ClinicalRecordWizard schema={ONE_STEP_SCHEMA} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText(/Ghi chú/), { target: { value: "hello" } });
    act(() => {
      vi.advanceTimersByTime(DRAFT_DELAY_MS);
    });
    const raw = localStorage.getItem(draftKey("test-one-step"));
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toMatchObject({ note: "hello" });
  });

  it("uses the correct draft key including recordId", () => {
    render(
      <ClinicalRecordWizard
        schema={ONE_STEP_SCHEMA}
        recordId="rec-42"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Ghi chú/), { target: { value: "x" } });
    act(() => {
      vi.advanceTimersByTime(DRAFT_DELAY_MS);
    });
    expect(localStorage.getItem(draftKey("test-one-step", "rec-42"))).not.toBeNull();
    expect(localStorage.getItem(draftKey("test-one-step"))).toBeNull(); // wrong key not written
  });

  it("saves draft immediately (synchronously) when Next is clicked", () => {
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    // Fill required fields so Next actually navigates
    fireEvent.change(screen.getByLabelText(/Năm sinh/), { target: { value: "1990" } });
    fireEvent.click(screen.getByLabelText("Nam"));
    // DRAFT_DELAY_MS not elapsed yet; click Next
    fireEvent.click(screen.getByRole("button", { name: /tiếp theo/i }));
    // Draft should be saved right away (flush on navigate)
    expect(localStorage.getItem(draftKey("co-dinh"))).not.toBeNull();
  });

  it("saves draft immediately (synchronously) when Back is clicked", () => {
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    // Navigate to step 1 first
    fireEvent.change(screen.getByLabelText(/Năm sinh/), { target: { value: "1990" } });
    fireEvent.click(screen.getByLabelText("Nam"));
    fireEvent.click(screen.getByRole("button", { name: /tiếp theo/i }));
    // Clear storage to test Back independently
    localStorage.clear();
    fireEvent.click(screen.getByRole("button", { name: /quay lại/i }));
    expect(localStorage.getItem(draftKey("co-dinh"))).not.toBeNull();
  });
});

// ── I-3: StrictMode double-mount must not write a spurious draft ──────────────

describe("ClinicalRecordWizard – StrictMode draft safety (I-3)", () => {
  it("does not write a spurious draft on StrictMode double-mount before any user interaction", () => {
    // In React 18 StrictMode, effects are mounted → cleaned up → re-mounted.
    // Without the fix, the second invocation of the debounce effect skips the
    // isFirstRender guard and schedules a timer that writes an empty draft.
    render(
      <ClinicalRecordWizard schema={ONE_STEP_SCHEMA} onSubmit={vi.fn()} onCancel={vi.fn()} />,
      { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> },
    );
    // Advance past debounce window — no user interaction occurred
    act(() => {
      vi.advanceTimersByTime(DRAFT_DELAY_MS);
    });
    // No draft should have been written
    expect(localStorage.getItem(draftKey("test-one-step"))).toBeNull();
  });
});

// ── Draft restore ─────────────────────────────────────────────────────────────

describe("ClinicalRecordWizard – draft restore", () => {
  it("restores draft from localStorage when initialData is absent", () => {
    localStorage.setItem(draftKey("co-dinh"), JSON.stringify({ nam_sinh: "1985" }));
    render(<ClinicalRecordWizard schema={coDinhSchema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByLabelText(/Năm sinh/) as HTMLInputElement;
    expect(input.value).toBe("1985");
  });

  it("does NOT restore draft when initialData is provided", () => {
    localStorage.setItem(draftKey("co-dinh"), JSON.stringify({ nam_sinh: "1985" }));
    render(
      <ClinicalRecordWizard
        schema={coDinhSchema}
        initialData={{ nam_sinh: "2000" }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText(/Năm sinh/) as HTMLInputElement;
    expect(input.value).toBe("2000");
  });

  it("restores draft with correct key when recordId is provided", () => {
    localStorage.setItem(
      draftKey("co-dinh", "rec-7"),
      JSON.stringify({ nam_sinh: "1975" }),
    );
    render(
      <ClinicalRecordWizard
        schema={coDinhSchema}
        recordId="rec-7"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText(/Năm sinh/) as HTMLInputElement;
    expect(input.value).toBe("1975");
  });
});

// ── Submit ────────────────────────────────────────────────────────────────────

describe("ClinicalRecordWizard – submit", () => {
  beforeEach(() => {
    // M-1: use vi.spyOn instead of vi.stubGlobal to avoid replacing globalThis.crypto entirely
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("test-uuid-1234" as `${string}-${string}-${string}-${string}-${string}`);
  });

  it("calls onSubmit with a ClinicalRecordData on valid last-step submit", () => {
    const onSubmit = vi.fn();
    render(
      <ClinicalRecordWizard schema={ONE_STEP_SCHEMA} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /hoàn thành/i }));
    expect(onSubmit).toHaveBeenCalledOnce();
    const record = onSubmit.mock.calls[0][0];
    expect(record.id).toBe("test-uuid-1234");
    // M-2: schemaId now comes from "test-one-step"
    expect(record.schemaId).toBe("test-one-step");
    expect(typeof record.data).toBe("object");
    expect(typeof record.serializedText).toBe("string");
    expect(record.serializedText.length).toBeGreaterThan(0);
    // ISO timestamps
    expect(() => new Date(record.createdAt).toISOString()).not.toThrow();
    expect(() => new Date(record.updatedAt).toISOString()).not.toThrow();
  });

  it("removes the exact draft key from localStorage on submit", () => {
    const key = draftKey("test-one-step");
    localStorage.setItem(key, JSON.stringify({}));
    render(
      <ClinicalRecordWizard schema={ONE_STEP_SCHEMA} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /hoàn thành/i }));
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("removes the keyed draft (with recordId) on submit", () => {
    const key = draftKey("test-one-step", "rec-5");
    localStorage.setItem(key, JSON.stringify({}));
    render(
      <ClinicalRecordWizard
        schema={ONE_STEP_SCHEMA}
        recordId="rec-5"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /hoàn thành/i }));
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("does NOT call onSubmit and shows error when a required field is empty", () => {
    const onSubmit = vi.fn();
    render(<ClinicalRecordWizard schema={REQ_SCHEMA} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /hoàn thành/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Trường này bắt buộc")).toBeTruthy();
  });
});

// ── Cancel ────────────────────────────────────────────────────────────────────

describe("ClinicalRecordWizard – cancel", () => {
  it("calls onCancel immediately when data is clean (no changes)", () => {
    const onCancel = vi.fn();
    render(
      <ClinicalRecordWizard schema={ONE_STEP_SCHEMA} onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /hủy/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows confirm dialog with exact text when data is dirty", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onCancel = vi.fn();
    render(
      <ClinicalRecordWizard schema={ONE_STEP_SCHEMA} onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.change(screen.getByLabelText(/Ghi chú/), { target: { value: "dirty" } });
    fireEvent.click(screen.getByRole("button", { name: /hủy/i }));
    expect(confirmSpy).toHaveBeenCalledWith(CANCEL_CONFIRM_TEXT);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel when confirm returns true", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onCancel = vi.fn();
    render(
      <ClinicalRecordWizard schema={ONE_STEP_SCHEMA} onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.change(screen.getByLabelText(/Ghi chú/), { target: { value: "dirty" } });
    fireEvent.click(screen.getByRole("button", { name: /hủy/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("retains draft in localStorage when cancel is confirmed (dirty data)", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const key = draftKey("test-one-step");
    render(
      <ClinicalRecordWizard schema={ONE_STEP_SCHEMA} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    // Change a field and advance timers to persist the draft
    fireEvent.change(screen.getByLabelText(/Ghi chú/), { target: { value: "keep me" } });
    act(() => {
      vi.advanceTimersByTime(DRAFT_DELAY_MS);
    });
    // Confirm cancel
    fireEvent.click(screen.getByRole("button", { name: /hủy/i }));
    // Draft must still be in localStorage (retained)
    expect(localStorage.getItem(key)).not.toBeNull();
  });

  it("does NOT call onCancel when confirm returns false", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onCancel = vi.fn();
    render(
      <ClinicalRecordWizard schema={ONE_STEP_SCHEMA} onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.change(screen.getByLabelText(/Ghi chú/), { target: { value: "dirty" } });
    fireEvent.click(screen.getByRole("button", { name: /hủy/i }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
