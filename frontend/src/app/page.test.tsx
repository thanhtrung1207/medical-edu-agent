import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";


describe("HomePage", () => {
  it("renders the welcome heading and badge", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Chào mừng đến UniDent" })).toBeDefined();
    expect(screen.getByText("AI Dental Education")).toBeDefined();
  });

  it("renders a chat CTA link pointing to /chat", () => {
    render(<HomePage />);

    const ctaLink = screen.getByRole("link", { name: "Bắt đầu chat" });
    expect(ctaLink).toBeDefined();
    expect(ctaLink.getAttribute("href")).toBe("/chat");
  });
});
