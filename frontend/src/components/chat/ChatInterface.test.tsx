import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChatHistory, sendMessage } from "@/lib/api";
import { ChatInterface } from "./ChatInterface";

vi.mock("@/lib/api", () => ({
  getChatHistory: vi.fn().mockResolvedValue({
    messages: [
      {
        id: "history-message-1",
        role: "assistant",
        content: "Nội dung lịch sử cần được xóa",
        metadata: {},
        created_at: "2025-01-01T00:00:00.000Z",
      },
    ],
    topic: null,
  }),
  sendMessage: vi.fn(),
}));

vi.mock("./MessageBubble", () => ({
  MessageBubble: ({ message }: { message: { content: string } }) => (
    <div>{message.content}</div>
  ),
}));

vi.mock("./ThinkingIndicator", () => ({
  ThinkingIndicator: () => null,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("medical-edu-agent.user-id", "user-uuid");
  localStorage.setItem("chatSessionId", "session-1");
  vi.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
});

describe("ChatInterface identity", () => {
  it("restores its owned session and starts a new one without clearing identity", async () => {
    render(<ChatInterface />);

    await waitFor(() => {
      expect(getChatHistory).toHaveBeenCalledExactlyOnceWith(
        "session-1",
        "user-uuid",
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Nội dung lịch sử cần được xóa")).toBeDefined();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Bắt đầu cuộc trò chuyện mới" }),
    );

    expect(screen.queryByText("Nội dung lịch sử cần được xóa")).toBeNull();
    expect(localStorage.getItem("chatSessionId")).toBeNull();
    expect(localStorage.getItem("medical-edu-agent.user-id")).toBe("user-uuid");
  });

  it("makes reset reachable after a fresh case receives its backend session", async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce({
      content: "Đã tạo phiên case mới.",
      citations: [],
      warnings: [],
      reasoning_steps: [],
      session_id: "case-session-1",
    });

    render(<ChatInterface freshSession initialMessage="Phân tích case này" />);

    expect(
      screen.queryByRole("button", { name: "Bắt đầu cuộc trò chuyện mới" }),
    ).toBeNull();

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        "Phân tích case này",
        "user-uuid",
        undefined,
      );
    });

    expect(
      await screen.findByRole("button", {
        name: "Bắt đầu cuộc trò chuyện mới",
      }),
    ).toBeDefined();
  });

  it("ignores a reply that arrives after resetting an in-flight conversation", async () => {
    const pendingReply = deferred<Awaited<ReturnType<typeof sendMessage>>>();
    vi.mocked(sendMessage).mockReturnValueOnce(pendingReply.promise);

    render(<ChatInterface />);

    await waitFor(() => {
      expect(getChatHistory).toHaveBeenCalledExactlyOnceWith(
        "session-1",
        "user-uuid",
      );
    });

    fireEvent.change(screen.getByRole("textbox", { name: "Ô nhập câu hỏi" }), {
      target: { value: "Câu hỏi cũ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        "Câu hỏi cũ",
        "user-uuid",
        "session-1",
      );
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Bắt đầu cuộc trò chuyện mới" }),
    );

    await act(async () => {
      pendingReply.resolve({
        content: "Phản hồi cũ không được hiển thị",
        citations: [],
        warnings: [],
        reasoning_steps: [],
        session_id: "obsolete-session",
      });
      await pendingReply.promise;
    });

    expect(screen.queryByText("Câu hỏi cũ")).toBeNull();
    expect(screen.queryByText("Phản hồi cũ không được hiển thị")).toBeNull();
    expect(localStorage.getItem("chatSessionId")).toBeNull();
  });
});

describe("ChatInterface history failure", () => {
  it("shows a dismissible error banner and still allows sending messages", async () => {
    vi.mocked(getChatHistory).mockRejectedValueOnce(
      new Error("Chat history request failed: 500"),
    );
    vi.mocked(sendMessage).mockResolvedValueOnce({
      content: "Trả lời cho câu hỏi mới.",
      citations: [],
      warnings: [],
      reasoning_steps: [],
      session_id: "session-1",
    });

    render(<ChatInterface />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Không thể tải lịch sử trò chuyện. Vui lòng thử lại.",
    );

    // Non-blocking: the user can still send a new message while the banner shows.
    fireEvent.change(screen.getByRole("textbox", { name: "Ô nhập câu hỏi" }), {
      target: { value: "Câu hỏi mới" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        "Câu hỏi mới",
        "user-uuid",
        "session-1",
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Trả lời cho câu hỏi mới.")).toBeDefined();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Đóng thông báo lỗi" }),
    );

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("retries the history load when the user clicks retry", async () => {
    vi.mocked(getChatHistory)
      .mockRejectedValueOnce(new Error("Chat history request failed: 500"))
      .mockResolvedValueOnce({
        messages: [
          {
            id: "history-message-1",
            role: "assistant",
            content: "Nội dung lịch sử cần được xóa",
            metadata: {},
            created_at: "2025-01-01T00:00:00.000Z",
          },
        ],
        topic: null,
      });

    render(<ChatInterface />);

    await screen.findByRole("alert");
    expect(getChatHistory).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    await waitFor(() => {
      expect(getChatHistory).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByText("Nội dung lịch sử cần được xóa")).toBeDefined();
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ChatInterface branding & responsive", () => {
  it("shows UniDent as default header title", async () => {
    // Fresh session so no messages → empty state with title visible
    render(<ChatInterface freshSession />);
    expect(screen.getByText("UniDent")).toBeDefined();
  });

  it("uses custom headerTitle when provided", async () => {
    render(<ChatInterface freshSession headerTitle="Custom Title" />);
    expect(screen.getByText("Custom Title")).toBeDefined();
    expect(screen.queryByText("UniDent")).toBeNull();
  });

  it("renders spatially neutral guidance (no spatial references)", async () => {
    // showSuggestions=false triggers the case-ready guidance
    render(<ChatInterface freshSession showSuggestions={false} />);
    const guidance = screen.getByText(/Điền thông tin bệnh nhân/);
    expect(guidance.textContent).not.toContain("panel bên trái");
    expect(guidance.textContent).not.toContain("bên trái");
    expect(guidance.textContent).not.toContain("form bên cạnh");
    expect(guidance.textContent).toContain("trong form case");
  });

  it("suggestion buttons have min-h-[44px] class", async () => {
    render(<ChatInterface freshSession />);
    const buttons = screen.getAllByRole("button");
    const suggestionButtons = buttons.filter((btn) =>
      SUGGESTIONS.includes(btn.textContent ?? ""),
    );
    expect(suggestionButtons.length).toBe(SUGGESTIONS.length);
    suggestionButtons.forEach((btn) => {
      expect(btn.className).toContain("min-h-[44px]");
    });
  });

  it("gives the finish-and-save action a 44px minimum height", async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce({
      content: "Phản hồi phân tích case.",
      citations: [],
      warnings: [],
      reasoning_steps: [],
      session_id: "case-session-finish",
    });

    render(<ChatInterface freshSession initialMessage="Phân tích case này" />);

    const finish = await screen.findByRole("button", {
      name: "✅ Kết thúc & Lưu case",
    });
    expect(finish.className).toContain("min-h-[44px]");
  });

  it("gives the new-conversation action a 44px minimum height", () => {
    render(<ChatInterface />);

    const button = screen.getByRole("button", {
      name: "Bắt đầu cuộc trò chuyện mới",
    });
    expect(button.className).toContain("min-h-[44px]");
  });
});

describe("ChatInterface textarea auto-grow", () => {
  it("resets height to auto and caps at 160px on input change", () => {
    render(<ChatInterface freshSession />);
    const textarea = screen.getByRole("textbox", {
      name: "Ô nhập câu hỏi",
    }) as HTMLTextAreaElement;

    // Spy on style setter
    const styleSpy: string[] = [];
    Object.defineProperty(textarea.style, "height", {
      configurable: true,
      get() {
        return textarea.getAttribute("data-style-height") ?? "";
      },
      set(v: string) {
        styleSpy.push(v);
        textarea.setAttribute("data-style-height", v);
      },
    });

    // Mock scrollHeight
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      get: () => 200,
    });

    fireEvent.change(textarea, { target: { value: "long text" } });

    // Should reset to auto then cap at 160px
    expect(styleSpy).toContain("auto");
    expect(styleSpy).toContain("160px");
  });

  it("uses scrollHeight when below 160px cap", () => {
    render(<ChatInterface freshSession />);
    const textarea = screen.getByRole("textbox", {
      name: "Ô nhập câu hỏi",
    }) as HTMLTextAreaElement;

    const styleSpy: string[] = [];
    Object.defineProperty(textarea.style, "height", {
      configurable: true,
      get() {
        return textarea.getAttribute("data-style-height") ?? "";
      },
      set(v: string) {
        styleSpy.push(v);
        textarea.setAttribute("data-style-height", v);
      },
    });

    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      get: () => 80,
    });

    fireEvent.change(textarea, { target: { value: "short" } });

    expect(styleSpy).toContain("auto");
    expect(styleSpy).toContain("80px");
  });

  it("shrinks textarea height after send clears input", async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce({
      content: "Reply",
      citations: [],
      warnings: [],
      reasoning_steps: [],
      session_id: "s1",
    });

    render(<ChatInterface freshSession />);
    const textarea = screen.getByRole("textbox", {
      name: "Ô nhập câu hỏi",
    }) as HTMLTextAreaElement;

    let currentScrollHeight = 200;
    Object.defineProperty(textarea.style, "height", {
      configurable: true,
      get() {
        return textarea.getAttribute("data-style-height") ?? "";
      },
      set(v: string) {
        textarea.setAttribute("data-style-height", v);
      },
    });
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      get: () => currentScrollHeight,
    });

    // Grow with long text
    fireEvent.change(textarea, { target: { value: "very long input text" } });
    expect(textarea.getAttribute("data-style-height")).toBe("160px");

    // After send, input clears → textarea should shrink to base height
    currentScrollHeight = 44;
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalled();
    });

    // Height must have recomputed to the small base height, not stay at 160px
    expect(textarea.getAttribute("data-style-height")).toBe("44px");
  });
});

const SUGGESTIONS = [
  "Phân loại mức độ gãy vỡ răng theo Ellis?",
  "Khi nào nên cắm implant thay cho răng mất đơn lẻ?",
  "So sánh cầu răng cố định và implant khi thay thế răng đơn lẻ?",
];
