import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChatSessions, type ChatSessionSummary } from "@/lib/api";

// Mutable router state lets tests assert navigation without the Next.js
// router context.
const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
}));

vi.mock("@/lib/api", () => ({
  getChatSessions: vi.fn(),
}));

import { SessionList } from "./SessionList";
import { SESSION_UPDATED_EVENT } from "@/lib/client-identity";

const SESSIONS: ChatSessionSummary[] = [
  {
    session_id: "session-1",
    topic: "Cuộc trò chuyện mẫu",
    created_at: new Date().toISOString(),
    last_active: new Date().toISOString(),
    message_count: 3,
  },
];

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  navigation.push.mockClear();
  localStorage.clear();
  // Preset identity so SessionList never needs to mint a UUID.
  localStorage.setItem("medical-edu-agent.user-id", "user-uuid");
  localStorage.setItem("chatSessionId", "session-1");
  vi.mocked(getChatSessions).mockResolvedValue(SESSIONS);
});

describe("SessionList touch targets", () => {
  it("gives the new-conversation launcher a 44px hit area", async () => {
    render(<SessionList />);

    const button = await screen.findByRole("button", {
      name: "Bắt đầu cuộc trò chuyện mới",
    });
    expect(button.className).toContain("h-11");
    expect(button.className).toContain("w-11");
  });

  it("gives the failed-load retry button a 44px hit area", async () => {
    vi.mocked(getChatSessions).mockRejectedValueOnce(
      new Error("Chat sessions request failed: 500"),
    );

    render(<SessionList />);

    const retry = await screen.findByRole("button", { name: "Thử lại" });
    expect(retry.className).toContain("min-h-[44px]");
  });

  it("gives session rows a 44px minimum hit area", async () => {
    render(<SessionList />);

    const row = await screen.findByRole("button", {
      name: /Cuộc trò chuyện mẫu/,
    });
    expect(row.className).toContain("min-h-[44px]");
  });
});

describe("SessionList behavior", () => {
  it("starts a new conversation, clears the active session and notifies the container", async () => {
    const onNavigate = vi.fn();
    render(<SessionList onNavigate={onNavigate} />);

    const button = await screen.findByRole("button", {
      name: "Bắt đầu cuộc trò chuyện mới",
    });
    fireEvent.click(button);

    expect(navigation.push).toHaveBeenCalledWith(
      expect.stringContaining("/chat?new="),
    );
    expect(localStorage.getItem("chatSessionId")).toBeNull();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("retries the failed load from the retry button", async () => {
    vi.mocked(getChatSessions)
      .mockRejectedValueOnce(new Error("Chat sessions request failed: 500"))
      .mockResolvedValueOnce(SESSIONS);

    render(<SessionList />);

    const retry = await screen.findByRole("button", { name: "Thử lại" });
    fireEvent.click(retry);

    expect(
      await screen.findByRole("button", { name: /Cuộc trò chuyện mẫu/ }),
    ).toBeDefined();
    expect(getChatSessions).toHaveBeenCalledTimes(2);
  });

  it("refetches in realtime when the session-updated event fires", async () => {
    render(<SessionList />);

    await screen.findByRole("button", { name: /Cuộc trò chuyện mẫu/ });
    expect(getChatSessions).toHaveBeenCalledTimes(1);

    fireEvent(window, new Event(SESSION_UPDATED_EVENT));

    await waitFor(() => {
      expect(getChatSessions).toHaveBeenCalledTimes(2);
    });
  });
});
