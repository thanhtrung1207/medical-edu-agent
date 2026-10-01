import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";


describe("Button", () => {
  it("renders a primary large button and forwards native props", () => {
    const onClick = vi.fn();

    render(
      <Button type="button" variant="primary" size="lg" onClick={onClick}>
        Tiếp tục
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Tiếp tục" });
    expect(button.className).toContain("min-h-[48px]");
    expect(button.className).toContain("bg-primary");
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a disabled muted button", () => {
    render(
      <Button type="button" variant="muted" disabled>
        Đang phát triển
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Đang phát triển" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.className).toContain("bg-slate-200");
  });
});
