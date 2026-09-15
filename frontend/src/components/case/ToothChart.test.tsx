import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToothChart } from "./ToothChart";
import { UPPER_RIGHT, UPPER_LEFT, LOWER_RIGHT, LOWER_LEFT } from "@/lib/case-schemas";

function getToothButton(container: HTMLElement, toothNum: number): HTMLButtonElement {
  const buttons = container.querySelectorAll("button");
  for (const btn of Array.from(buttons)) {
    if (btn.getAttribute("aria-label") === `Răng ${toothNum}`) return btn;
  }
  throw new Error(`Tooth button ${toothNum} not found`);
}

describe("ToothChart", () => {
  // --- Quadrant labels & order ---
  it("renders four quadrant labels", () => {
    render(<ToothChart selectedTeeth={[]} onToggle={vi.fn()} onClear={vi.fn()} />);
    const labels = screen.getAllByText(/^(TRÊN PHẢI|TRÊN TRÁI|DƯỚI PHẢI|DƯỚI TRÁI)$/);
    expect(labels).toHaveLength(4);
  });

  it("renders quadrants in correct vertical order: UR, UL, LR, LL", () => {
    const { container } = render(
      <ToothChart selectedTeeth={[]} onToggle={vi.fn()} onClear={vi.fn()} />,
    );
    const labels = container.querySelectorAll("[data-quadrant-label]");
    const texts = Array.from(labels).map((el) => el.textContent);
    expect(texts).toEqual(["TRÊN PHẢI", "TRÊN TRÁI", "DƯỚI PHẢI", "DƯỚI TRÁI"]);
  });

  it("displays FDI tooth numbers in correct order per quadrant", () => {
    const { container } = render(
      <ToothChart selectedTeeth={[]} onToggle={vi.fn()} onClear={vi.fn()} />,
    );
    const quadrants = container.querySelectorAll("[data-quadrant]");
    const getToothNums = (el: Element) =>
      Array.from(el.querySelectorAll("button")).map((b) => Number(b.textContent));

    expect(getToothNums(quadrants[0])).toEqual(UPPER_RIGHT); // 18..11
    expect(getToothNums(quadrants[1])).toEqual(UPPER_LEFT); // 21..28
    expect(getToothNums(quadrants[2])).toEqual(LOWER_RIGHT); // 48..41
    expect(getToothNums(quadrants[3])).toEqual(LOWER_LEFT); // 31..38
  });

  // --- Responsive size classes on tooth buttons ---
  it("tooth buttons have responsive size classes (h-9 w-9 base, md:h-7 md:w-7)", () => {
    const { container } = render(
      <ToothChart selectedTeeth={[]} onToggle={vi.fn()} onClear={vi.fn()} />,
    );
    const btn = getToothButton(container, 16);
    expect(btn.className).toContain("h-9");
    expect(btn.className).toContain("w-9");
    expect(btn.className).toContain("md:h-7");
    expect(btn.className).toContain("md:w-7");
  });

  // --- Tooth rows use flex-wrap to prevent overflow ---
  it("quadrant rows use flex-wrap to prevent horizontal overflow", () => {
    const { container } = render(
      <ToothChart selectedTeeth={[]} onToggle={vi.fn()} onClear={vi.fn()} />,
    );
    const quadrants = container.querySelectorAll("[data-quadrant]");
    quadrants.forEach((q) => {
      const row = q.querySelector(".flex");
      expect(row?.className).toMatch(/flex-wrap/);
    });
  });

  // --- Selected toggling ---
  it("calls onToggle when a tooth button is clicked", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ToothChart selectedTeeth={[]} onToggle={onToggle} onClear={vi.fn()} />,
    );
    const btn = getToothButton(container, 16);
    btn.click();
    expect(onToggle).toHaveBeenCalledWith(16);
  });

  it("marks selected teeth with aria-pressed=true", () => {
    const { container } = render(
      <ToothChart selectedTeeth={[16, 26]} onToggle={vi.fn()} onClear={vi.fn()} />,
    );
    const tooth16 = getToothButton(container, 16);
    const tooth26 = getToothButton(container, 26);
    const tooth18 = getToothButton(container, 18);
    expect(tooth16.getAttribute("aria-pressed")).toBe("true");
    expect(tooth26.getAttribute("aria-pressed")).toBe("true");
    expect(tooth18.getAttribute("aria-pressed")).toBe("false");
  });

  // --- Clear action ---
  it("hides header clear button when no teeth selected", () => {
    const { container } = render(
      <ToothChart selectedTeeth={[]} onToggle={vi.fn()} onClear={vi.fn()} />,
    );
    const clearBtn = container.querySelector("button.h-11");
    expect(clearBtn).toBeNull();
  });

  it("shows header clear button when teeth are selected", () => {
    const { container } = render(
      <ToothChart selectedTeeth={[11]} onToggle={vi.fn()} onClear={vi.fn()} />,
    );
    const clearBtn = container.querySelector("button.h-11");
    expect(clearBtn).not.toBeNull();
    expect(clearBtn?.textContent).toContain("Xóa chọn");
  });

  it("clear button has h-11 for 44px touch target", () => {
    const { container } = render(
      <ToothChart selectedTeeth={[11]} onToggle={vi.fn()} onClear={vi.fn()} />,
    );
    const clearBtn = container.querySelector("button.h-11");
    expect(clearBtn?.className).toContain("h-11");
  });

  it("calls onClear when header clear button is clicked", () => {
    const onClear = vi.fn();
    const { container } = render(
      <ToothChart selectedTeeth={[11]} onToggle={vi.fn()} onClear={onClear} />,
    );
    const clearBtn = container.querySelector("button.h-11");
    expect(clearBtn).not.toBeNull();
    (clearBtn as HTMLElement).click();
    expect(onClear).toHaveBeenCalled();
  });
});
