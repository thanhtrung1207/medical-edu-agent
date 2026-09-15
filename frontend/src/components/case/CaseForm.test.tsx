import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { CaseForm } from "./CaseForm";
import { FRACTURE_SCHEMA } from "@/lib/case-schemas";

afterEach(cleanup);

function renderForm(
  props: Partial<{
    submitted: boolean;
    onBack: () => void;
    onCaseSubmit: (caseText: string, selectedTeeth: number[]) => void;
  }> = {},
) {
  const defaults = {
    scenario: "fracture" as const,
    onCaseSubmit: vi.fn(),
    submitted: false,
  };
  return render(<CaseForm {...defaults} {...props} />);
}

describe("CaseForm", () => {
  // --- 44px touch targets ---
  it("submit button has min-h-[44px]", () => {
    renderForm();
    const btn = screen.getByRole("button", { name: /Gửi case để phân tích/ });
    expect(btn.className).toContain("min-h-[44px]");
  });

  it("disabled submit state has min-h-[44px] and stays disabled", () => {
    renderForm({ submitted: true });
    const btn = screen.getByRole("button", { name: /Case đã gửi/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.className).toContain("min-h-[44px]");
  });

  it("sample 'Case mẫu' button has min-h-[44px]", () => {
    renderForm();
    const btn = screen.getByRole("button", { name: /Case mẫu/ });
    expect(btn.className).toContain("min-h-[44px]");
  });

  it("sample button is disabled once submitted", () => {
    renderForm({ submitted: true });
    const btn = screen.getByRole("button", {
      name: /Case mẫu/,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("back button is an explicit 44x44 target (h-11 w-11) with centered content", () => {
    renderForm({ onBack: vi.fn() });
    const btn = screen.getByRole("button", { name: "Quay lại trang chủ" });
    expect(btn.className).toContain("h-11");
    expect(btn.className).toContain("w-11");
    expect(btn.className).toContain("flex");
    expect(btn.className).toContain("items-center");
    expect(btn.className).toContain("justify-center");
  });

  it("back button keeps its accessible name and calls onBack on click", () => {
    const onBack = vi.fn();
    renderForm({ onBack });
    const btn = screen.getByRole("button", { name: "Quay lại trang chủ" });
    fireEvent.click(btn);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  // --- Behavior preservation ---
  it("sample fill populates form fields and teeth, then submit calls onCaseSubmit", () => {
    const onCaseSubmit = vi.fn();
    const { container } = renderForm({ onCaseSubmit });

    fireEvent.click(screen.getByRole("button", { name: /Case mẫu/ }));

    const firstInput = container.querySelector("input") as HTMLInputElement;
    expect(firstInput.value).toBe(FRACTURE_SCHEMA.sampleData.f_age);

    fireEvent.click(screen.getByRole("button", { name: /Gửi case để phân tích/ }));

    expect(onCaseSubmit).toHaveBeenCalledTimes(1);
    const [caseText, selectedTeeth] = onCaseSubmit.mock.calls[0];
    expect(typeof caseText).toBe("string");
    expect(caseText.length).toBeGreaterThan(0);
    expect(Array.isArray(selectedTeeth)).toBe(true);
    expect(selectedTeeth).toEqual(FRACTURE_SCHEMA.sampleTeeth);
  });

  it("renders the scenario title and ToothChart quadrant labels", () => {
    renderForm();
    expect(screen.getByText(/Răng vỡ \/ Sâu nặng/)).toBeDefined();
    const labels = screen.getAllByText(
      /^(TRÊN PHẢI|TRÊN TRÁI|DƯỚI PHẢI|DƯỚI TRÁI)$/,
    );
    expect(labels).toHaveLength(4);
  });
});
