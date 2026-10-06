import { fireEvent, render, screen } from "@testing-library/react";
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

  it("opens the tooth popover with six Vietnamese statuses and closes it with Xong", () => {
    render(<DentalChart value={{}} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Răng 16" }));
    expect(screen.getByRole("dialog", { name: "Răng 16" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Bình thường/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sâu/ }).textContent).toContain("S");
    expect(screen.getByRole("button", { name: /Mất/ }).textContent).toContain("M");
    expect(screen.getByLabelText("Ghi chú răng 16")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Xong" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("merges a selected tooth condition and its note into onChange", () => {
    const onChange = vi.fn();
    render(<DentalChart value={statuses} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Răng 16" }));
    fireEvent.click(screen.getByRole("button", { name: /Phục hình/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...statuses,
      16: { condition: "restored", note: "Mặt nhai" },
    });

    fireEvent.change(screen.getByLabelText("Ghi chú răng 16"), { target: { value: "Mão sứ" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...statuses,
      16: { condition: "decay", note: "Mão sứ" },
    });
  });

  it("marks annotated teeth and summarizes their Vietnamese status", () => {
    const { container } = render(<DentalChart value={statuses} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Răng 16" }).getAttribute("data-status")).toBe("decay");
    expect(screen.getByRole("button", { name: "Răng 24" }).getAttribute("data-status")).toBe("missing");
    expect(screen.getByText("Răng 16: Sâu")).toBeTruthy();
    expect(screen.getByText("Răng 24: Mất")).toBeTruthy();
    expect(container.querySelector('[aria-label="Răng 18"]')?.getAttribute("data-status")).toBeNull();
  });

  it("does not open a popover for disabled teeth", () => {
    render(<DentalChart value={{}} onChange={vi.fn()} disabled />);

    fireEvent.click(screen.getByRole("button", { name: "Răng 16" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
