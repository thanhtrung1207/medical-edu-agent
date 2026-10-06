import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({
  config: { apiBaseUrl: "https://api.example.com" },
  USE_MOCK_API: false,
}));

vi.mock("./http", () => ({
  apiFetch: vi.fn(),
}));

import { sendMessage } from "./api";
import { apiFetch } from "./http";

const assistantReply = {
  content: "Phản hồi",
  citations: [],
  warnings: [],
  reasoning_steps: [],
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("sendMessage", () => {
  it("posts slash-command metadata when supplied", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => assistantReply,
    } as Response);

    await sendMessage(
      "msg",
      "user",
      "session",
      "agent",
      "chan-doan",
      "context",
    );

    expect(apiFetch).toHaveBeenCalledOnce();
    expect(apiFetch).toHaveBeenCalledWith("https://api.example.com/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "msg",
        user_id: "user",
        session_id: "session",
        mode: "agent",
        command: "chan-doan",
        clinical_context: "context",
      }),
    });
  });

  it("omits optional request fields for existing positional calls", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => assistantReply,
    } as Response);

    await sendMessage("msg", "user");

    expect(apiFetch).toHaveBeenCalledOnce();
    expect(apiFetch).toHaveBeenCalledWith("https://api.example.com/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "msg", user_id: "user" }),
    });
  });
});
