import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";


describe("HomePage", () => {
  it("renders the premium dashboard greeting and hero", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Chào mừng quay lại" })).toBeDefined();
    expect(screen.getByText("AI Dental Education")).toBeDefined();
    expect(screen.getByText("Case Study: Phục hình răng sau")).toBeDefined();
    expect(screen.getByRole("link", { name: "Tiếp tục học" }).getAttribute("href")).toBe("/case/fracture");
  });

  it("keeps both existing case routes available", () => {
    render(<HomePage />);

    expect(screen.getByRole("link", { name: /Răng vỡ \/ Sâu nặng/ }).getAttribute("href")).toBe("/case/fracture");
    expect(screen.getByRole("link", { name: /Mất răng đơn lẻ/ }).getAttribute("href")).toBe("/case/missing");
  });
});
