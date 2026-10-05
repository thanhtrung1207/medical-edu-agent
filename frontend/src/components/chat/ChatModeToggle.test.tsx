import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ChatModeToggle } from "./ChatModeToggle";

describe("ChatModeToggle", () => {
  it("renders both pills and marks the active one with aria-pressed", () => {
    render(<ChatModeToggle value="chat" onChange={() => {}} />);

    const chatPill = screen.getByRole("button", { name: /Chat/ });
    const agentPill = screen.getByRole("button", { name: /Agent/ });

    expect(chatPill).toHaveAttribute("aria-pressed", "true");
    expect(agentPill).toHaveAttribute("aria-pressed", "false");
  });

  it("includes dark-mode contrast classes", () => {
    render(<ChatModeToggle value="agent" onChange={() => {}} />);

    expect(
      screen.getByRole("group", { name: /chọn chế độ/i }),
    ).toHaveClass("dark:bg-slate-900");
    expect(screen.getByRole("button", { name: /Chat/ })).toHaveClass(
      "dark:text-slate-300",
    );
    expect(screen.getByText(/phân tích sâu/i)).toHaveClass(
      "dark:text-slate-400",
    );
  });

  it("fires onChange with the opposite mode when a pill is clicked", () => {
    const onChange = vi.fn();
    render(<ChatModeToggle value="chat" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Agent/ }));
    expect(onChange).toHaveBeenCalledWith("agent");

    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    // Already active, still fires but with same value — UI stays simple.
    expect(onChange).toHaveBeenCalledWith("chat");
  });

  it("each pill is at least 44px tall for touch accessibility", () => {
    render(<ChatModeToggle value="chat" onChange={() => {}} />);
    for (const pill of screen.getAllByRole("button")) {
      expect(pill.className).toContain("min-h-[44px]");
    }
  });

  it("shows a hint when Agent is selected", () => {
    const { rerender } = render(
      <ChatModeToggle value="chat" onChange={() => {}} />,
    );
    expect(screen.queryByText(/phân tích sâu/i)).toBeNull();

    rerender(<ChatModeToggle value="agent" onChange={() => {}} />);
    expect(screen.getByText(/phân tích sâu/i)).toBeInTheDocument();
  });

  it("disables both pills when disabled=true", () => {
    render(<ChatModeToggle value="chat" onChange={() => {}} disabled />);
    for (const pill of screen.getAllByRole("button")) {
      expect(pill).toBeDisabled();
    }
  });
});
