import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ScenarioCard from "./ScenarioCard";


describe("ScenarioCard", () => {
  it("renders a premium scenario link with tags and a 44px CTA", () => {
    render(
      <ScenarioCard
        href="/case/fracture"
        icon="🦷"
        title="Răng vỡ / Sâu nặng"
        description="Đánh giá khả năng phục hồi"
        tags={["Composite", "Mão răng"]}
      />,
    );

    const link = screen.getByRole("link", { name: /Răng vỡ \/ Sâu nặng/ });
    expect(link.getAttribute("href")).toBe("/case/fracture");
    expect(screen.getByText("Composite")).toBeDefined();
    expect(screen.getByText("Mão răng")).toBeDefined();
    const cta = screen.getByText("Bắt đầu phân tích");
    expect(cta.className).toContain("min-h-[44px]");
  });
});
