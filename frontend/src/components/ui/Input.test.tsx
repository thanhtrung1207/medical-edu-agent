import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./Input";


describe("Input", () => {
  it("forwards disabled and placeholder props", () => {
    render(<Input placeholder="Email" disabled />);

    const input = screen.getByPlaceholderText("Email") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.className).toContain("min-h-[46px]");
  });
});
