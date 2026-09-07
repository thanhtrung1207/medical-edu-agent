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
import {
  deleteAllMemories,
  deleteMemory,
  listMemories,
  type LearningMemory,
} from "@/lib/api";
import { SettingsModal } from "./SettingsModal";

vi.mock("@/lib/api", () => ({
  deleteAllMemories: vi.fn(),
  deleteMemory: vi.fn(),
  listMemories: vi.fn(),
}));

const memories: LearningMemory[] = [
  {
    id: 1,
    memory_type: "learning_goal",
    key: "goal:Implant",
    value: { summary: "Mục tiêu implant" },
    confidence: 1,
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function ModalHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
      >
        Mở cài đặt
      </button>
      <SettingsModal
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      />
    </>
  );
}

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("medical-edu-agent.user-id", "user-uuid");
  vi.clearAllMocks();
  vi.mocked(listMemories).mockResolvedValue(memories);
});

describe("SettingsModal", () => {
  it("serializes individual deletion and leaves local state unchanged until it succeeds", async () => {
    const pendingDelete = deferred<void>();
    vi.mocked(deleteMemory).mockReturnValueOnce(pendingDelete.promise);

    render(<SettingsModal open onClose={vi.fn()} />);

    await screen.findByText("Mục tiêu implant");
    const deleteOne = screen.getByRole("button", { name: "Xóa goal:Implant" });
    const deleteAll = screen.getByRole("button", { name: "Xóa toàn bộ" });

    fireEvent.click(deleteOne);

    expect(deleteMemory).toHaveBeenCalledExactlyOnceWith(1, "user-uuid");
    expect(deleteOne.getAttribute("disabled")).not.toBeNull();
    expect(deleteAll.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByText("Mục tiêu implant")).toBeDefined();

    fireEvent.click(deleteOne);
    fireEvent.click(deleteAll);

    expect(deleteMemory).toHaveBeenCalledTimes(1);
    expect(deleteAllMemories).not.toHaveBeenCalled();

    await act(async () => {
      pendingDelete.resolve();
      await pendingDelete.promise;
    });

    await waitFor(() => {
      expect(screen.queryByText("Mục tiêu implant")).toBeNull();
    });
  });

  it("does not start all-memory deletion more than once", async () => {
    const pendingDelete = deferred<number>();
    vi.mocked(deleteAllMemories).mockReturnValueOnce(pendingDelete.promise);

    render(<SettingsModal open onClose={vi.fn()} />);

    await screen.findByText("Mục tiêu implant");
    const deleteAll = screen.getByRole("button", { name: "Xóa toàn bộ" });

    fireEvent.click(deleteAll);
    fireEvent.click(deleteAll);

    expect(deleteAllMemories).toHaveBeenCalledExactlyOnceWith("user-uuid");
    expect(deleteAll.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByText("Mục tiêu implant")).toBeDefined();

    await act(async () => {
      pendingDelete.resolve(1);
      await pendingDelete.promise;
    });

    await waitFor(() => {
      expect(screen.queryByText("Mục tiêu implant")).toBeNull();
    });
  });

  it("contains keyboard focus and returns it to the opener when closed", async () => {
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);

    const opener = screen.getByRole("button", { name: "Mở cài đặt" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole("dialog", {
      name: "Dữ liệu học tập",
    });
    await screen.findByText("Mục tiêu implant");

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Đóng" }),
    );

    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Xóa goal:Implant" }),
    );

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });
});
