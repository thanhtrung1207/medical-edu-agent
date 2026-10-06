import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FieldDef } from "@/lib/clinical-record/schemas";
import type { ToothStatus } from "@/lib/clinical-record/types";
import { WizardField } from "./WizardField";
import { WizardStepRenderer } from "./WizardStepRenderer";

// ── helpers ──────────────────────────────────────────────────────────────────

function mkField(overrides: Partial<FieldDef> & Pick<FieldDef, "type">): FieldDef {
  return { id: "f1", label: "Test Label", ...overrides };
}

// ── 1. text ───────────────────────────────────────────────────────────────────

describe("WizardField – text", () => {
  it("renders a text input and calls onChange", () => {
    const onChange = vi.fn();
    render(<WizardField field={mkField({ type: "text" })} value="" onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "hello" } });
    expect(onChange).toHaveBeenCalledWith("f1", "hello");
  });
});

// ── 2. textarea ───────────────────────────────────────────────────────────────

describe("WizardField – textarea", () => {
  it("renders a textarea with hint text 'Không ghi tên/SĐT thật.'", () => {
    render(<WizardField field={mkField({ type: "textarea" })} value="" onChange={vi.fn()} />);
    expect(screen.getByRole("textbox").tagName).toBe("TEXTAREA");
    expect(screen.getByText("Không ghi tên/SĐT thật.")).toBeTruthy();
  });
});

// ── 3. select ─────────────────────────────────────────────────────────────────

describe("WizardField – select", () => {
  it("renders a select with options and calls onChange", () => {
    const onChange = vi.fn();
    const field = mkField({
      type: "select",
      options: [
        { value: "A", label: "Option A" },
        { value: "B", label: "Option B" },
      ],
    });
    render(<WizardField field={field} value="A" onChange={onChange} />);
    const select = screen.getByRole("combobox");
    expect(screen.getByRole("option", { name: "Option A" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Option B" })).toBeTruthy();
    fireEvent.change(select, { target: { value: "B" } });
    expect(onChange).toHaveBeenCalledWith("f1", "B");
  });
});

// ── 4. radio ──────────────────────────────────────────────────────────────────

describe("WizardField – radio", () => {
  it("renders radio buttons and calls onChange on click", () => {
    const onChange = vi.fn();
    const field = mkField({
      type: "radio",
      options: [
        { value: "Yes", label: "Có" },
        { value: "No", label: "Không" },
      ],
    });
    render(<WizardField field={field} value="" onChange={onChange} />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Có"));
    expect(onChange).toHaveBeenCalledWith("f1", "Yes");
  });
});

// ── 5. multi-checkbox ─────────────────────────────────────────────────────────

describe("WizardField – multi-checkbox", () => {
  it("renders checkboxes and toggles values in array", () => {
    const onChange = vi.fn();
    const field = mkField({
      type: "multi-checkbox",
      options: [
        { value: "A", label: "Alpha" },
        { value: "B", label: "Beta" },
        { value: "C", label: "Gamma" },
      ],
    });
    // Start with ["A"] checked
    render(<WizardField field={field} value={["A"]} onChange={onChange} />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);

    // Clicking B should add it
    fireEvent.click(checkboxes[1]);
    expect(onChange).toHaveBeenCalledWith("f1", ["A", "B"]);

    // Clicking A should remove it
    fireEvent.click(checkboxes[0]);
    expect(onChange).toHaveBeenCalledWith("f1", []);
  });
});

// ── 6. dental-chart ───────────────────────────────────────────────────────────

describe("WizardField – dental-chart", () => {
  it("delegates to DentalChart and passes value/onChange", () => {
    const onChange = vi.fn();
    const chartValue: Record<number, ToothStatus> = {};
    const field = mkField({ type: "dental-chart" });
    render(<WizardField field={field} value={chartValue} onChange={onChange} />);
    // DentalChart renders 32 tooth buttons
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(16);
    // The dental chart aria-label
    expect(screen.getByRole("region", { name: "Sơ đồ răng" })).toBeTruthy();
  });
});

// ── 7. radio-with-other ───────────────────────────────────────────────────────

describe("WizardField – radio-with-other", () => {
  const field = mkField({
    type: "radio-with-other",
    options: [
      { value: "Tốt", label: "Tốt" },
      { value: "Không tốt", label: "Không tốt" },
      { value: "Khác", label: "Khác" },
    ],
    pairedTextLabel: "Lý do",
  });

  it("does not show free-text input when a non-last option is selected", () => {
    render(<WizardField field={field} value="Tốt" onChange={vi.fn()} />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows free-text input when the last option ('Khác') is selected", () => {
    render(<WizardField field={field} value="Khác" onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("stores free-text as {value, text} object via onChange", () => {
    const onChange = vi.fn();
    render(<WizardField field={field} value="Khác" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Lý do khác" } });
    expect(onChange).toHaveBeenCalledWith("f1", { value: "Khác", text: "Lý do khác" });
  });

  it("shows free-text when value is an object with 'Khác'", () => {
    render(<WizardField field={field} value={{ value: "Khác", text: "abc" }} onChange={vi.fn()} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("abc");
  });
});

// ── 8. select-with-text ───────────────────────────────────────────────────────

describe("WizardField – select-with-text", () => {
  const field = mkField({
    type: "select-with-text",
    pairedTextLabel: "Biến thể",
    options: [
      { value: "Loại I", label: "Loại I" },
      { value: "Loại II", label: "Loại II" },
    ],
  });

  it("renders select and paired text input", () => {
    render(
      <WizardField
        field={field}
        value={{ value: "Loại I", text: "abc" }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("calls onChange with {value, text} when select changes", () => {
    const onChange = vi.fn();
    render(
      <WizardField
        field={field}
        value={{ value: "Loại I", text: "" }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Loại II" } });
    expect(onChange).toHaveBeenCalledWith("f1", { value: "Loại II", text: "" });
  });

  it("calls onChange with {value, text} when text changes", () => {
    const onChange = vi.fn();
    render(
      <WizardField
        field={field}
        value={{ value: "Loại I", text: "" }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "class 2" } });
    expect(onChange).toHaveBeenCalledWith("f1", { value: "Loại I", text: "class 2" });
  });
});

// ── Error messages ────────────────────────────────────────────────────────────

describe("WizardField – error display", () => {
  it("shows error message in red below the field when error prop provided", () => {
    const { container } = render(
      <WizardField
        field={mkField({ type: "text" })}
        value=""
        onChange={vi.fn()}
        error="Trường này bắt buộc"
      />,
    );
    const errEl = screen.getByText("Trường này bắt buộc");
    expect(errEl).toBeTruthy();
    // Should have red color styling
    expect(errEl.className).toMatch(/red|error|danger/i);
    // Must appear after the input
    const input = container.querySelector("input");
    expect(input).toBeTruthy();
    const errPos = Array.from(container.querySelectorAll("*")).indexOf(errEl);
    const inputPos = Array.from(container.querySelectorAll("*")).indexOf(input!);
    expect(errPos).toBeGreaterThan(inputPos);
  });

  it("shows no error element when error prop is absent", () => {
    render(<WizardField field={mkField({ type: "text" })} value="" onChange={vi.fn()} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// ── Required asterisk ─────────────────────────────────────────────────────────

describe("WizardField – required asterisk", () => {
  it("shows asterisk after label when field is required", () => {
    render(
      <WizardField
        field={mkField({ type: "text", required: true })}
        value=""
        onChange={vi.fn()}
      />,
    );
    const label = screen.getByText(/Test Label/);
    expect(label.textContent).toContain("*");
  });

  it("does not show asterisk when field is not required", () => {
    render(<WizardField field={mkField({ type: "text" })} value="" onChange={vi.fn()} />);
    const label = screen.getByText("Test Label");
    expect(label.textContent).not.toContain("*");
  });
});

// ── I-1: Accessible group role ────────────────────────────────────────────────

describe("WizardField – accessible group role (I-1)", () => {
  it("radio: outer div has role=group and aria-labelledby pointing to label id", () => {
    const field = mkField({
      type: "radio",
      options: [{ value: "A", label: "Alpha" }],
    });
    const { container } = render(<WizardField field={field} value="" onChange={vi.fn()} />);
    const group = container.querySelector('[role="group"]');
    expect(group).toBeTruthy();
    const labelId = group!.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(container.querySelector(`#${labelId}`)).toBeTruthy();
  });

  it("multi-checkbox: outer div has role=group and aria-labelledby", () => {
    const field = mkField({
      type: "multi-checkbox",
      options: [{ value: "A", label: "Alpha" }],
    });
    const { container } = render(<WizardField field={field} value={[]} onChange={vi.fn()} />);
    expect(container.querySelector('[role="group"]')).toBeTruthy();
  });

  it("radio-with-other: outer div has role=group and aria-labelledby", () => {
    const field = mkField({
      type: "radio-with-other",
      options: [{ value: "Khác", label: "Khác" }],
    });
    const { container } = render(<WizardField field={field} value="" onChange={vi.fn()} />);
    expect(container.querySelector('[role="group"]')).toBeTruthy();
  });

  it("dental-chart: outer div has role=group and aria-labelledby", () => {
    const field = mkField({ type: "dental-chart" });
    const { container } = render(<WizardField field={field} value={{}} onChange={vi.fn()} />);
    expect(container.querySelector('[role="group"]')).toBeTruthy();
  });

  it("text: outer label still has htmlFor pointing to the input id", () => {
    const field = mkField({ type: "text" });
    const { container } = render(<WizardField field={field} value="" onChange={vi.fn()} />);
    const label = container.querySelector("label");
    expect(label?.getAttribute("for")).toBe(field.id);
  });
});

// ── I-2: radio-with-other radio click emits {value, text:""} ─────────────────

describe("WizardField – radio-with-other radio click type (I-2)", () => {
  it("emits {value, text:''} not a bare string when a radio is clicked", () => {
    const onChange = vi.fn();
    const field = mkField({
      type: "radio-with-other",
      options: [
        { value: "Tốt", label: "Tốt" },
        { value: "Không tốt", label: "Không tốt" },
        { value: "Khác", label: "Khác" },
      ],
    });
    render(<WizardField field={field} value="" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Tốt"));
    expect(onChange).toHaveBeenCalledWith("f1", { value: "Tốt", text: "" });
  });

  it("emits {value, text:''} for the last (other) option too", () => {
    const onChange = vi.fn();
    const field = mkField({
      type: "radio-with-other",
      options: [
        { value: "Tốt", label: "Tốt" },
        { value: "Khác", label: "Khác" },
      ],
    });
    render(<WizardField field={field} value="" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Khác"));
    expect(onChange).toHaveBeenCalledWith("f1", { value: "Khác", text: "" });
  });
});

// ── I-3: No hardcoded "Khác" fallback ─────────────────────────────────────────

describe("WizardField – isOtherSelected uses lastOption.value only (I-3)", () => {
  it("does NOT show free-text when value='Khác' but last option is a different value", () => {
    // last option is "Last", not "Khác"
    const field = mkField({
      type: "radio-with-other",
      options: [
        { value: "Khác", label: "Khác" },
        { value: "Last", label: "Last" },
      ],
    });
    render(<WizardField field={field} value="Khác" onChange={vi.fn()} />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

// ── I-4: select-with-text paired text input aria-label ───────────────────────

describe("WizardField – select-with-text aria-label (I-4)", () => {
  it("paired text input has aria-label matching pairedTextLabel", () => {
    const field = mkField({
      type: "select-with-text",
      pairedTextLabel: "Biến thể",
      options: [{ value: "A", label: "A" }],
    });
    render(<WizardField field={field} value={{ value: "A", text: "" }} onChange={vi.fn()} />);
    const textInput = screen.getByRole("textbox");
    expect(textInput.getAttribute("aria-label")).toBe("Biến thể");
  });

  it("paired text input defaults aria-label to 'Ghi chú...' when pairedTextLabel absent", () => {
    const field = mkField({
      type: "select-with-text",
      options: [{ value: "A", label: "A" }],
    });
    render(<WizardField field={field} value={{ value: "A", text: "" }} onChange={vi.fn()} />);
    const textInput = screen.getByRole("textbox");
    expect(textInput.getAttribute("aria-label")).toBe("Ghi chú...");
  });
});

// ── I-5: required and aria-invalid / aria-describedby ────────────────────────

describe("WizardField – required and aria-invalid (I-5)", () => {
  it("text input has required attribute when field.required is true", () => {
    render(<WizardField field={mkField({ type: "text", required: true })} value="" onChange={vi.fn()} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).required).toBe(true);
  });

  it("textarea has required attribute when field.required is true", () => {
    render(<WizardField field={mkField({ type: "textarea", required: true })} value="" onChange={vi.fn()} />);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).required).toBe(true);
  });

  it("select has required attribute when field.required is true", () => {
    render(
      <WizardField field={mkField({ type: "select", required: true, options: [] })} value="" onChange={vi.fn()} />,
    );
    expect((screen.getByRole("combobox") as HTMLSelectElement).required).toBe(true);
  });

  it("text input has aria-invalid='true' and aria-describedby pointing to error element when error given", () => {
    render(
      <WizardField field={mkField({ type: "text" })} value="" onChange={vi.fn()} error="Required" />,
    );
    const input = screen.getByRole("textbox");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedById = input.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    expect(document.getElementById(describedById!)).toBeTruthy();
    expect(document.getElementById(describedById!)!.textContent).toBe("Required");
  });

  it("text input has no aria-invalid when no error", () => {
    render(<WizardField field={mkField({ type: "text" })} value="" onChange={vi.fn()} />);
    const input = screen.getByRole("textbox");
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });
});

// ── I-6: WizardStepRenderer per-type value defaults ──────────────────────────

describe("WizardStepRenderer – per-type value defaults (I-6)", () => {
  it("passes [] as default for multi-checkbox when data has no value for the field", () => {
    const mcStep = {
      id: "s",
      label: "S",
      shortLabel: "S",
      fields: [
        {
          id: "mc",
          label: "MC",
          type: "multi-checkbox" as const,
          options: [{ value: "A", label: "A" }],
        },
      ],
    };
    render(<WizardStepRenderer step={mcStep} data={{}} onChange={vi.fn()} />);
    // Checkboxes render correctly (not crashing from calling .includes on "")
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(1);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(false);
  });

  it("passes {} as default for dental-chart when data has no value for the field", () => {
    const dcStep = {
      id: "s",
      label: "S",
      shortLabel: "S",
      fields: [{ id: "chart", label: "Chart", type: "dental-chart" as const }],
    };
    render(<WizardStepRenderer step={dcStep} data={{}} onChange={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Sơ đồ răng" })).toBeTruthy();
  });

  it("passes '' as default for text field when data has no value", () => {
    const textStep = {
      id: "s",
      label: "S",
      shortLabel: "S",
      fields: [{ id: "name", label: "Name", type: "text" as const }],
    };
    render(<WizardStepRenderer step={textStep} data={{}} onChange={vi.fn()} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("");
  });
});

// ── WizardStepRenderer ────────────────────────────────────────────────────────

describe("WizardStepRenderer", () => {
  const step = {
    id: "test-step",
    label: "Test Step",
    shortLabel: "TS",
    fields: [
      { id: "name", label: "Name", type: "text" as const },
      {
        id: "detail",
        label: "Detail",
        type: "textarea" as const,
        visibleWhen: { fieldId: "name", notEquals: "skip" },
      },
    ],
  };

  it("renders visible fields in a grid layout", () => {
    const { container } = render(
      <WizardStepRenderer
        step={step}
        data={{ name: "Alice", detail: "some detail" }}
        onChange={vi.fn()}
        errors={{}}
      />,
    );
    expect(screen.getByLabelText(/Name/)).toBeTruthy();
    expect(screen.getByLabelText(/Detail/)).toBeTruthy();
    // Should use a grid container
    const grid = container.querySelector("[class*='grid']");
    expect(grid).toBeTruthy();
  });

  it("renders a half-width field without the full-width col-span-2 class", () => {
    const halfStep = {
      id: "half-step",
      label: "Half Step",
      shortLabel: "HS",
      fields: [{ id: "a", label: "A Field", type: "text" as const, half: true }],
    };
    const { container } = render(
      <WizardStepRenderer step={halfStep} data={{ a: "" }} onChange={vi.fn()} />,
    );
    const input = container.querySelector("input");
    expect(input).toBeTruthy();
    const wrapper = input!.parentElement;
    expect(wrapper?.className).not.toMatch(/col-span-2/);
  });

  it("renders dental-chart with full-width col-span-2 class even when half is true", () => {
    const chartStep = {
      id: "chart-step",
      label: "Chart Step",
      shortLabel: "CS",
      fields: [{ id: "chart", label: "Sơ đồ", type: "dental-chart" as const, half: true }],
    };
    render(
      <WizardStepRenderer step={chartStep} data={{ chart: {} }} onChange={vi.fn()} />,
    );
    const region = screen.getByRole("region", { name: "Sơ đồ răng" });
    const wrapper = region.closest("div[class]");
    expect(wrapper?.className).toMatch(/col-span-2/);
  });

  it("hides fields where isFieldVisible returns false", () => {
    render(
      <WizardStepRenderer
        step={step}
        data={{ name: "skip", detail: "hidden" }}
        onChange={vi.fn()}
        errors={{}}
      />,
    );
    expect(screen.getByLabelText(/Name/)).toBeTruthy();
    expect(screen.queryByLabelText(/Detail/)).toBeNull();
  });

  it("calls onChange with empty value when a field transitions from visible to hidden", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <WizardStepRenderer
        step={step}
        data={{ name: "Alice", detail: "some detail" }}
        onChange={onChange}
        errors={{}}
      />,
    );
    // Now make detail invisible by setting name to "skip"
    rerender(
      <WizardStepRenderer
        step={step}
        data={{ name: "skip", detail: "some detail" }}
        onChange={onChange}
        errors={{}}
      />,
    );
    expect(onChange).toHaveBeenCalledWith("detail", "");
  });

  it("clears hidden multi-checkbox field to [] not empty string", () => {
    const onChange = vi.fn();
    const mcStep = {
      id: "mc-step",
      label: "MC Step",
      shortLabel: "MC",
      fields: [
        { id: "trigger", label: "Trigger", type: "text" as const },
        {
          id: "checks",
          label: "Checks",
          type: "multi-checkbox" as const,
          options: [{ value: "A", label: "A" }],
          visibleWhen: { fieldId: "trigger", notEquals: "hide" },
        },
      ],
    };
    const { rerender } = render(
      <WizardStepRenderer
        step={mcStep}
        data={{ trigger: "show", checks: ["A"] }}
        onChange={onChange}
      />,
    );
    rerender(
      <WizardStepRenderer
        step={mcStep}
        data={{ trigger: "hide", checks: ["A"] }}
        onChange={onChange}
      />,
    );
    expect(onChange).toHaveBeenCalledWith("checks", []);
    expect(onChange).not.toHaveBeenCalledWith("checks", "");
  });

  it("clears hidden dental-chart field to {} not empty string", () => {
    const onChange = vi.fn();
    const dcStep = {
      id: "dc-step",
      label: "DC Step",
      shortLabel: "DC",
      fields: [
        { id: "trigger", label: "Trigger", type: "text" as const },
        {
          id: "chart",
          label: "Chart",
          type: "dental-chart" as const,
          visibleWhen: { fieldId: "trigger", notEquals: "hide" },
        },
      ],
    };
    const { rerender } = render(
      <WizardStepRenderer
        step={dcStep}
        data={{ trigger: "show", chart: { 1: "D" } }}
        onChange={onChange}
      />,
    );
    rerender(
      <WizardStepRenderer
        step={dcStep}
        data={{ trigger: "hide", chart: { 1: "D" } }}
        onChange={onChange}
      />,
    );
    expect(onChange).toHaveBeenCalledWith("chart", {});
    expect(onChange).not.toHaveBeenCalledWith("chart", "");
  });
});
