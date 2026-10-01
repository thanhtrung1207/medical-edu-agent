import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginBrandPanel } from "./LoginBrandPanel";


describe("LoginBrandPanel", () => {
  it("renders the premium UniDent brand panel, hidden below the md breakpoint", () => {
    const { container } = render(<LoginBrandPanel />);

    expect(screen.getByText("UniDent")).toBeDefined();
    expect(
      screen.getByText("Học nha khoa với trợ lý AI có trích dẫn."),
    ).toBeDefined();
    expect(screen.getByText("Case study theo ca lâm sàng")).toBeDefined();
    expect(screen.getByText("Quiz luyện thi & spaced repetition")).toBeDefined();
    expect(screen.getByText("Câu trả lời có nguồn tham khảo")).toBeDefined();

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("hidden");
    expect(root.className).toContain("md:flex");
  });
});
