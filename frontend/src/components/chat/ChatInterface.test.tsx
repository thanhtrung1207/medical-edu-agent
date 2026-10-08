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
import type { ClinicalRecordData } from "@/lib/clinical-record/types";
import { getChatHistory, sendMessage } from "@/lib/api";
import { commandRegistry } from "@/lib/slash-commands/registry";
import "@/lib/slash-commands/commands";
import { ChatInterface } from "./ChatInterface";

// ---------------------------------------------------------------------------
// Hoisted mocks — these are resolved before the module graph runs so the
// vi.mock factories below can reference them.
// ---------------------------------------------------------------------------

const {
  mockSendMessage,
  mockPush,
  mockGetActiveRecord,
  mockSaveClinicalRecord,
  mockCloseRecord,
} = vi.hoisted(() => ({
  mockSendMessage: vi.fn(),
  mockPush: vi.fn(),
  mockGetActiveRecord: vi.fn(),
  mockSaveClinicalRecord: vi.fn(),
  mockCloseRecord: vi.fn(),
}));

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
  sendMessage: mockSendMessage,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

vi.mock("@/lib/clinical-record/storage", () => ({
  getActiveRecord: mockGetActiveRecord,
  saveClinicalRecord: mockSaveClinicalRecord,
  closeRecord: mockCloseRecord,
}));

vi.mock("@/components/clinical-record/ClinicalRecordWizard", () => ({
  ClinicalRecordWizard: ({
    onSubmit,
    onCancel,
  }: {
    onSubmit: (record: ClinicalRecordData) => void;
    onCancel: () => void;
  }) => (
    <>
      <button
        onClick={() =>
          onSubmit({
            id: "new-record",
            schemaId: "thao-lap",
            data: { dental_chart: { 16: { condition: "decay" } } },
            serializedText: "",
            createdAt: "2026-10-06T00:00:00.000Z",
            updatedAt: "2026-10-06T00:00:00.000Z",
          })
        }
      >
        Mock wizard submit
      </button>
      <button onClick={onCancel}>Mock wizard cancel</button>
    </>
  ),
}));

vi.mock("./MessageBubble", () => ({
  MessageBubble: ({ message }: { message: { content: string } }) => (
    <div>{message.content}</div>
  ),
}));

vi.mock("./ThinkingIndicator", () => ({
  ThinkingIndicator: () => null,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function makeNewRecord(overrides: Partial<ClinicalRecordData> = {}): ClinicalRecordData {
  return {
    id: "new-record",
    schemaId: "co-dinh",
    data: { dental_chart: { 16: { condition: "decay" } } },
    serializedText: "",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Existing identity tests
// ---------------------------------------------------------------------------

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
    mockSendMessage.mockResolvedValueOnce({
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
        "chat",
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
    mockSendMessage.mockReturnValueOnce(pendingReply.promise);

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
        "chat",
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

describe("ChatInterface mode selection", () => {
  it("sends agent mode after selecting the Agent pill", async () => {
    mockSendMessage.mockResolvedValueOnce({
      content: "Trả lời ở chế độ agent.",
      citations: [],
      warnings: [],
      reasoning_steps: [],
      session_id: "agent-session-1",
    });

    render(<ChatInterface freshSession />);

    fireEvent.click(screen.getByRole("button", { name: /Agent/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Ô nhập câu hỏi" }), {
      target: { value: "Câu hỏi agent" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        "Câu hỏi agent",
        "user-uuid",
        undefined,
        "agent",
      );
    });
    expect(screen.getByText("Trả lời ở chế độ agent.")).toBeDefined();
  });
});

describe("ChatInterface history failure", () => {
  it("shows a dismissible error banner and still allows sending messages", async () => {
    vi.mocked(getChatHistory).mockRejectedValueOnce(
      new Error("Chat history request failed: 500"),
    );
    mockSendMessage.mockResolvedValueOnce({
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
        "chat",
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
    mockSendMessage.mockResolvedValueOnce({
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
    mockSendMessage.mockResolvedValueOnce({
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

// ---------------------------------------------------------------------------
// Slash command & clinical record integration
// ---------------------------------------------------------------------------

const oldRecord = makeNewRecord({ id: "old-record" });
const activeRecord = makeNewRecord({ id: "active-record" });
const editableRecord = makeNewRecord({ id: "editable-record", sessionId: "session-1" });

function selectSlashCommand(id: string) {
  const command = commandRegistry.getById(id)!;
  fireEvent.change(screen.getByRole("textbox"), { target: { value: `/${id}` } });
  fireEvent.click(screen.getByText(command.label));
}

function sendNormalMessage(message: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: message } });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
}

describe("ChatInterface slash command & clinical record", () => {
  beforeEach(() => {
    localStorage.removeItem("chatSessionId"); // fresh session for predictable sessionId assertions
    vi.restoreAllMocks();
    mockSendMessage.mockReset();
    mockPush.mockReset();
    mockGetActiveRecord.mockReset();
    mockSaveClinicalRecord.mockReset();
    mockCloseRecord.mockReset();
  });

  it("does not call handleSend when Enter selects an open slash-command menu", () => {
    render(<ChatInterface />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/chan" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(screen.getByText("Phân tích chẩn đoán")).toBeDefined();
  });

  it("closes an empty slash-command menu so Enter sends unmatched text normally", async () => {
    mockSendMessage.mockResolvedValue({ answer: "OK", content: "OK", session_id: "s1" });
    render(<ChatInterface />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/abc" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith(
        "/abc",
        expect.any(String),
        undefined,
        "chat",
      ),
    );
  });

  it("shows record-required notice and does not call API when /chan-doan has no record", () => {
    render(<ChatInterface />);
    selectSlashCommand("chan-doan");
    expect(screen.getByText("Vui lòng tạo bệnh án trước")).toBeDefined();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("keeps old active record if replacement wizard is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGetActiveRecord.mockReturnValue(oldRecord);
    render(<ChatInterface />);
    selectSlashCommand("benh-an-thao-lap");
    fireEvent.click(screen.getByRole("button", { name: "Mock wizard cancel" }));
    expect(mockCloseRecord).not.toHaveBeenCalled();
    expect(screen.getByText("Phục Hình Cố Định")).toBeDefined();
  });

  it("closes old record only after replacement wizard submits successfully", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGetActiveRecord.mockReturnValue(oldRecord);
    render(<ChatInterface />);
    selectSlashCommand("benh-an-thao-lap");
    fireEvent.click(screen.getByRole("button", { name: "Mock wizard submit" }));
    expect(mockCloseRecord).toHaveBeenCalledWith(oldRecord.id, null);
    expect(mockSaveClinicalRecord).toHaveBeenCalledWith(
      expect.objectContaining({ schemaId: "thao-lap" }),
    );
  });

  it("updates the edited record without creating a second history entry", () => {
    mockGetActiveRecord.mockReturnValue(editableRecord);
    render(<ChatInterface />);
    fireEvent.click(screen.getByRole("button", { name: "Sửa" }));
    fireEvent.click(screen.getByRole("button", { name: "Mock wizard submit" }));
    expect(mockSaveClinicalRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        id: editableRecord.id,
        createdAt: editableRecord.createdAt,
        sessionId: editableRecord.sessionId,
        data: expect.objectContaining({ dental_chart: expect.anything() }),
      }),
    );
    expect(mockCloseRecord).not.toHaveBeenCalled();
  });

  it("adds clinical_context and command to analysis request", async () => {
    mockGetActiveRecord.mockReturnValue(activeRecord);
    mockSendMessage.mockResolvedValue({ answer: "OK", content: "OK", session_id: "s1" });
    render(<ChatInterface />);
    selectSlashCommand("chan-doan");
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith(
        "Yêu cầu: Phân tích chẩn đoán",
        expect.any(String),
        undefined,
        "chat",
        "chan-doan",
        expect.stringContaining("Răng:"),
      ),
    );
  });

  it("sends clinical analysis through chat mode even when Agent mode is selected", async () => {
    mockGetActiveRecord.mockReturnValue(activeRecord);
    mockSendMessage.mockResolvedValue({ answer: "OK", content: "OK", session_id: "s1" });
    render(<ChatInterface />);
    fireEvent.click(screen.getByRole("button", { name: "Agent" }));
    selectSlashCommand("chan-doan");
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith(
        "Yêu cầu: Phân tích chẩn đoán",
        expect.any(String),
        undefined,
        "chat",
        "chan-doan",
        expect.stringContaining("Răng:"),
      ),
    );
  });

  it("writes sessionId immutably to an active record after first response", async () => {
    mockGetActiveRecord.mockReturnValue(activeRecord);
    mockSendMessage.mockResolvedValue({ answer: "OK", session_id: "new-session" });
    render(<ChatInterface />);
    sendNormalMessage("Xin chào");
    await waitFor(() =>
      expect(mockSaveClinicalRecord).toHaveBeenCalledWith(
        expect.objectContaining({ id: activeRecord.id, sessionId: "new-session" }),
      ),
    );
    expect(activeRecord.sessionId).toBeUndefined();
  });

  it("sends /ket-thuc with its exact request, clinical context, and 60-second timeout", async () => {
    mockGetActiveRecord.mockReturnValue(activeRecord);
    mockSendMessage.mockResolvedValue({ answer: "Tóm tắt ca", session_id: "s1" });
    render(<ChatInterface />);
    selectSlashCommand("ket-thuc");
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith(
        "Yêu cầu: Tóm tắt và lưu case",
        expect.any(String),
        undefined,
        "chat",
        "ket-thuc",
        expect.any(String),
        { timeoutMs: 60_000 },
      ),
    );
    expect(mockSaveClinicalRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        id: activeRecord.id,
        sessionId: "s1",
        summary: "Tóm tắt ca",
      }),
    );
    expect(mockCloseRecord).toHaveBeenCalledWith(activeRecord.id, "Tóm tắt ca");
    expect(mockPush).toHaveBeenCalledWith("/history");
  });

  it("sends /ket-thuc through chat mode even when Agent mode is selected", async () => {
    mockGetActiveRecord.mockReturnValue(activeRecord);
    mockSendMessage.mockResolvedValue({ answer: "Tóm tắt ca", session_id: "s1" });
    render(<ChatInterface />);
    fireEvent.click(screen.getByRole("button", { name: "Agent" }));
    selectSlashCommand("ket-thuc");
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith(
        "Yêu cầu: Tóm tắt và lưu case",
        expect.any(String),
        undefined,
        "chat",
        "ket-thuc",
        expect.any(String),
        { timeoutMs: 60_000 },
      ),
    );
  });

  it("ignores a repeated /ket-thuc while the first summary request is running", () => {
    mockGetActiveRecord.mockReturnValue(activeRecord);
    mockSendMessage.mockImplementation(() => new Promise(() => {}));
    render(<ChatInterface />);
    selectSlashCommand("ket-thuc");
    selectSlashCommand("ket-thuc");
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it("does not close or navigate when /ket-thuc times out", async () => {
    mockGetActiveRecord.mockReturnValue(activeRecord);
    mockSendMessage.mockRejectedValueOnce(new DOMException("timeout", "AbortError"));
    render(<ChatInterface />);
    selectSlashCommand("ket-thuc");
    await waitFor(() =>
      expect(screen.getByText(/không thể tóm tắt/i)).toBeDefined(),
    );
    expect(mockCloseRecord).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does not close or navigate when /ket-thuc has no assistant summary", async () => {
    mockGetActiveRecord.mockReturnValue(activeRecord);
    mockSendMessage.mockResolvedValue({ answer: "", session_id: "s1" });
    render(<ChatInterface />);
    selectSlashCommand("ket-thuc");
    await waitFor(() =>
      expect(screen.getByText("Không nhận được tóm tắt")).toBeDefined(),
    );
    expect(mockCloseRecord).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("ChatInterface Clinical Studio Canvas toggle", () => {
  it("toggles the studio canvas open and closed", () => {
    render(<ChatInterface freshSession />);

    const toggleBtn = screen.getByRole("button", {
      name: /mở clinical studio canvas/i,
    });
    expect(toggleBtn).toBeDefined();

    // Open canvas
    fireEvent.click(toggleBtn);
    expect(screen.getAllByText("Clinical Canvas").length).toBeGreaterThan(0);

    // Close canvas
    const closeBtn = screen.getByRole("button", {
      name: /thu gọn clinical canvas/i,
    });
    fireEvent.click(closeBtn);
    expect(screen.queryByText("Clinical Canvas")).toBeNull();
  });
});

const SUGGESTIONS = [
  "Phân loại mức độ gãy vỡ răng theo Ellis?",
  "Khi nào nên cắm implant thay cho răng mất đơn lẻ?",
  "So sánh cầu răng cố định và implant khi thay thế răng đơn lẻ?",
];
