import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginBrandPanel } from "./LoginBrandPanel";

describe("LoginBrandPanel", () => {
  it("renders the UniDent brand and slogan, hidden below the md breakpoint", () => {
    const { container } = render(<LoginBrandPanel />);

    expect(screen.getByText("UniDent")).toBeDefined();
    expect(
      screen.getByText(
        "Học nha khoa cùng AI — hỏi đáp, case study, quiz có trích dẫn",
      ),
    ).toBeDefined();

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("hidden");
    expect(root.className).toContain("md:flex");
  });
});
