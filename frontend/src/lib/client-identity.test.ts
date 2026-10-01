import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearActiveSessionId,
  getActiveSessionId,
  getOrCreateUserId,
  setActiveSessionId,
} from "./client-identity";
import {
  deleteAllMemories,
  deleteMemory,
  generateQuiz,
  getChatHistory,
  listDocuments,
  listMemories,
  sendMessage,
  submitFeedback,
  submitQuizAnswer,
  uploadDocument,
} from "./api";
import type { Quiz } from "./types";

const randomUUID = vi.fn(() => "user-uuid");

beforeEach(() => {
  localStorage.clear();
  randomUUID.mockClear();
  vi.unstubAllGlobals();
  vi.stubGlobal("crypto", { randomUUID });
});

describe("client identity", () => {
  it("persists one browser identity", () => {
    expect(getOrCreateUserId()).toBe("user-uuid");
    expect(getOrCreateUserId()).toBe("user-uuid");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("restores an active session after refresh", () => {
    setActiveSessionId("session-1");

    expect(getActiveSessionId()).toBe("session-1");
  });

  it("clears only the active session", () => {
    getOrCreateUserId();
    setActiveSessionId("session-1");

    clearActiveSessionId();

    expect(localStorage.getItem("chatSessionId")).toBeNull();
    expect(localStorage.getItem("medical-edu-agent.user-id")).toBe("user-uuid");
  });

  it("sends the identity and active session to the backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: "Đã nhận" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendMessage("Implant là gì?", "user-uuid", "session-1");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Implant là gì?",
        user_id: "user-uuid",
        session_id: "session-1",
      }),
      credentials: "include",
    });
  });

  it("loads chat history with the identity query parameter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [], topic: null }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getChatHistory("session-1", "user-uuid");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/chat/history/session-1?user_id=user-uuid",
      { credentials: "include" },
    );
  });

  it("scopes every memory request to the browser user", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ memories: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deleted: 1 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deleted: 2 }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await listMemories("user-uuid");
    await deleteMemory(7, "user-uuid");
    await deleteAllMemories("user-uuid");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8000/api/memories?user_id=user-uuid",
      { credentials: "include" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8000/api/memories/7?user_id=user-uuid",
      { method: "DELETE", credentials: "include" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:8000/api/memories?user_id=user-uuid",
      { method: "DELETE", credentials: "include" },
    );
  });

  it("sends the identity with a quiz submission", async () => {
    const quiz: Quiz = {
      id: "quiz-1",
      topic: "Implant",
      difficulty: "easy",
      questions: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          quizId: "quiz-1",
          score: 100,
          total: 0,
          correct: 0,
          correctCount: 0,
          details: [],
          results: [],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await submitQuizAnswer(quiz, {}, "user-uuid");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/quiz/submit",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId: "quiz-1",
          answers: {},
          user_id: "user-uuid",
        }),
        credentials: "include",
      },
    );
  });

  it("propagates backend failures instead of returning mock data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    await expect(
      uploadDocument(new File(["test"], "notes.txt", { type: "text/plain" })),
    ).rejects.toThrow("Upload failed: 503");
    await expect(listDocuments()).rejects.toThrow("List failed: 503");
    await expect(submitFeedback("message-1", 5)).rejects.toThrow(
      "Feedback failed: 503",
    );
    await expect(generateQuiz("Implant", "easy", 1)).rejects.toThrow(
      "Quiz generation failed: 503",
    );
  });
});
