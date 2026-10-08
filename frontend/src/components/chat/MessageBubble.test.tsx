import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "@/lib/types";

afterEach(() => {
  cleanup();
});

describe("MessageBubble", () => {
  it("renders a user message with appropriate styling and timestamp", () => {
    const message: Message = {
      id: "m1",
      role: "user",
      content: "Xin chào UniDent",
      timestamp: 1710000000000,
    };

    render(<MessageBubble message={message} />);

    expect(screen.getByText("Xin chào UniDent")).toBeDefined();
    expect(screen.queryByText("UniDent")).toBeNull(); // Header badge is only on assistant messages
  });

  it("renders assistant message with UniDent Socratic badge and markdown content", () => {
    const message: Message = {
      id: "m2",
      role: "assistant",
      content: "Chào bạn! Đây là câu trả lời lâm sàng.",
      timestamp: 1710000000000,
      confidence: 0.92,
    };

    render(<MessageBubble message={message} />);

    expect(screen.getByText("UniDent")).toBeDefined();
    expect(screen.getByText("Socratic")).toBeDefined();
    expect(screen.getByText(/Đây là câu trả lời lâm sàng/)).toBeDefined();
    expect(screen.getByText(/92%/)).toBeDefined();
  });

  it("renders Socratic question callout block with special highlighting", () => {
    const message: Message = {
      id: "m3",
      role: "assistant",
      content: "### 💡 Câu hỏi gợi mở lâm sàng\n> Em nghĩ giải pháp nào tối ưu?",
      timestamp: 1710000000000,
    };

    render(<MessageBubble message={message} />);

    expect(screen.getByText(/Câu hỏi gợi mở lâm sàng/)).toBeDefined();
    expect(screen.getByText(/Em nghĩ giải pháp nào tối ưu/)).toBeDefined();
  });

  it("toggles citations when citation button is clicked", () => {
    const message: Message = {
      id: "m4",
      role: "assistant",
      content: "Chỉ định implant theo ITI Consensus.",
      timestamp: 1710000000000,
      citations: [
        {
          source: "ITI Consensus 2023",
          chapter: "Implant đơn lẻ",
          page: 45,
          quote: "Đánh giá khoảng sinh học trước khi phẫu thuật.",
        },
      ],
    };

    render(<MessageBubble message={message} />);

    const citationButton = screen.getByRole("button", {
      name: /nguồn y văn/i,
    });
    expect(citationButton).toBeDefined();
    expect(screen.queryByText(/ITI Consensus 2023/)).toBeNull();

    fireEvent.click(citationButton);
    expect(screen.getByText(/ITI Consensus 2023/)).toBeDefined();
    expect(screen.getByText(/khoảng sinh học/)).toBeDefined();
  });
});
