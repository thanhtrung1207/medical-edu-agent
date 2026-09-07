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
