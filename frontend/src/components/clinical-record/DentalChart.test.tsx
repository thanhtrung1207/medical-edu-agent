import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DentalChart } from "./DentalChart";
import type { ToothStatus } from "@/lib/clinical-record/types";

const statuses: Record<number, ToothStatus> = {
  16: { condition: "decay", note: "Mặt nhai" },
  24: { condition: "missing" },
};

describe("DentalChart", () => {
  it("renders 32 permanent FDI teeth in upper and lower scrollable jaw rows", () => {
    const { container } = render(<DentalChart value={{}} onChange={vi.fn()} />);

    const upper = container.querySelector<HTMLElement>('[data-jaw-row="upper"]');
    const lower = container.querySelector<HTMLElement>('[data-jaw-row="lower"]');
    expect(upper?.className).toContain("overflow-x-auto");
    expect(lower?.className).toContain("overflow-x-auto");

    expect(upper?.querySelectorAll("button")).toHaveLength(16);
    expect(lower?.querySelectorAll("button")).toHaveLength(16);
    expect(Array.from(upper?.querySelectorAll("button") ?? []).map((button) => button.getAttribute("aria-label")))
      .toEqual(["Răng 18", "Răng 17", "Răng 16", "Răng 15", "Răng 14", "Răng 13", "Răng 12", "Răng 11", "Răng 21", "Răng 22", "Răng 23", "Răng 24", "Răng 25", "Răng 26", "Răng 27", "Răng 28"]);
    expect(Array.from(lower?.querySelectorAll("button") ?? []).map((button) => button.getAttribute("aria-label")))
      .toEqual(["Răng 48", "Răng 47", "Răng 46", "Răng 45", "Răng 44", "Răng 43", "Răng 42", "Răng 41", "Răng 31", "Răng 32", "Răng 33", "Răng 34", "Răng 35", "Răng 36", "Răng 37", "Răng 38"]);
  });

  it("closes the non-modal popover with Escape and restores focus to its tooth", () => {
    render(<DentalChart value={{}} onChange={vi.fn()} />);

    const tooth = screen.getByRole("button", { name: "Răng 16" });
    tooth.focus();
    fireEvent.click(tooth);

    const dialog = screen.getByRole("dialog", { name: "Răng 16" });
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    expect(screen.getByRole("button", { name: /Bình thường/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sâu/ }).textContent).toContain("S");
    expect(screen.getByRole("button", { name: /Mất/ }).textContent).toContain("M");
    expect(screen.getByLabelText("Ghi chú răng 16")).toBeTruthy();

    // Focus stays on the trigger; Escape should close from document level
    fireEvent.keyDown(tooth, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(tooth);
  });

  it("preserves a newly selected condition when the controlled value updates before editing its note", () => {
    function ControlledChart() {
      const [value, setValue] = useState(statuses);
      return <DentalChart value={value} onChange={setValue} />;
    }

    render(<ControlledChart />);

    fireEvent.click(screen.getByRole("button", { name: "Răng 16" }));
    fireEvent.click(screen.getByRole("button", { name: /Phục hình/ }));
    fireEvent.change(screen.getByLabelText("Ghi chú răng 16"), { target: { value: "Mão sứ" } });

    expect(screen.getByRole("button", { name: /Phục hình/ }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Ghi chú răng 16") as HTMLInputElement).value).toBe("Mão sứ");
  });

  it("marks annotated teeth and summarizes their Vietnamese status", () => {
    const { container } = render(<DentalChart value={statuses} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Răng 16" }).getAttribute("data-status")).toBe("decay");
    expect(screen.getByRole("button", { name: "Răng 24" }).getAttribute("data-status")).toBe("missing");
    expect(screen.getByText("Răng 16: Sâu")).toBeTruthy();
    expect(screen.getByText("Răng 24: Mất")).toBeTruthy();
    expect(container.querySelector('[aria-label="Răng 18"]')?.getAttribute("data-status")).toBeNull();
  });

  it("closes an active popover when disabled, and keeps it closed after re-enabling", () => {
    const { rerender } = render(<DentalChart value={{}} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Răng 16" }));
    expect(screen.getByRole("dialog", { name: "Răng 16" })).toBeTruthy();

    rerender(<DentalChart value={{}} onChange={vi.fn()} disabled />);
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(<DentalChart value={{}} onChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not open a popover for disabled teeth", () => {
    render(<DentalChart value={{}} onChange={vi.fn()} disabled />);

    fireEvent.click(screen.getByRole("button", { name: "Răng 16" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
