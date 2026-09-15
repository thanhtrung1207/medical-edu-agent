import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { FormField } from "./FormField";
import type { FieldDef } from "@/lib/case-schemas";

afterEach(cleanup);

const textField: FieldDef = {
  id: "f_age",
  label: "Tuổi / Giới tính",
  type: "text",
  placeholder: "VD: 38 tuổi, Nam",
};

const textareaField: FieldDef = {
  id: "f_systemic",
  label: "Tiền sử toàn thân",
  type: "textarea",
  placeholder: "VD: Không có bệnh toàn thân",
};

const selectField: FieldDef = {
  id: "f_fracture_type",
  label: "Loại tổn thương",
  type: "select",
  options: ["Gãy thân răng", "Gãy cổ răng"],
};

describe("FormField", () => {
  // --- 44px touch targets ---
  it("text input has min-h-[44px] for the mobile touch target", () => {
    const { container } = render(
      <FormField field={textField} value="" onChange={vi.fn()} />,
    );
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    expect(input?.className).toContain("min-h-[44px]");
  });

  it("select has min-h-[44px] for the mobile touch target", () => {
    const { container } = render(
      <FormField field={selectField} value="" onChange={vi.fn()} />,
    );
    const select = container.querySelector("select");
    expect(select).not.toBeNull();
    expect(select?.className).toContain("min-h-[44px]");
  });

  it("textarea keeps its taller min-h-[50px] and resize-vertical (not broken)", () => {
    const { container } = render(
      <FormField field={textareaField} value="" onChange={vi.fn()} />,
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea?.className).toContain("min-h-[50px]");
    expect(textarea?.className).toContain("resize-vertical");
  });

  // --- Behavior preservation ---
  it("renders the field label", () => {
    const { container } = render(
      <FormField field={textField} value="" onChange={vi.fn()} />,
    );
    expect(container.querySelector("label")?.textContent).toBe(
      "Tuổi / Giới tính",
    );
  });

  it("calls onChange with the field id on input change", () => {
    const onChange = vi.fn();
    const { container } = render(
      <FormField field={textField} value="" onChange={onChange} />,
    );
    fireEvent.change(container.querySelector("input") as HTMLElement, {
      target: { value: "38 tuổi, Nam" },
    });
    expect(onChange).toHaveBeenCalledWith("f_age", "38 tuổi, Nam");
  });

  it("renders select options with the placeholder choice", () => {
    const { container } = render(
      <FormField field={selectField} value="" onChange={vi.fn()} />,
    );
    const options = Array.from(
      container.querySelectorAll("option"),
    ).map((o) => o.textContent);
    expect(options).toEqual(["-- Chọn --", "Gãy thân răng", "Gãy cổ răng"]);
  });
});
