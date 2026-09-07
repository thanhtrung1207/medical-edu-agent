"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  deleteAllMemories,
  deleteMemory,
  listMemories,
  type LearningMemory,
} from "@/lib/api";
import { getOrCreateUserId } from "@/lib/client-identity";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

function memorySummary(value: unknown): string {
  if (typeof value !== "object" || value === null) return "Dữ liệu học tập";
  const summary = (value as Record<string, unknown>).summary;
  return typeof summary === "string" && summary
    ? summary
    : "Dữ liệu học tập";
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [memories, setMemories] = useState<LearningMemory[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const deletionPendingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const id = getOrCreateUserId();
    setUserId(id);
    setError("");
    setLoading(true);

    void listMemories(id)
      .then((items) => {
        if (!cancelled) setMemories(items);
      })
      .catch(() => {
        if (!cancelled) setError("Không thể tải dữ liệu học tập.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    previousFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    return () => {
      previousFocusedElementRef.current?.focus();
      previousFocusedElementRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      const focusIsOutsideDialog = !dialog.contains(activeElement);

      if (
        event.shiftKey &&
        (activeElement === firstElement ||
          activeElement === dialog ||
          focusIsOutsideDialog)
      ) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === lastElement || focusIsOutsideDialog)
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleDelete = async (memoryId: number) => {
    if (!userId || deletionPendingRef.current) return;

    deletionPendingRef.current = true;
    setDeleting(true);
    setError("");
    try {
      await deleteMemory(memoryId, userId);
      setMemories((current) =>
        current.filter((memory) => memory.id !== memoryId),
      );
    } catch {
      setError("Không thể xóa dữ liệu học tập.");
    } finally {
      deletionPendingRef.current = false;
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!userId || deletionPendingRef.current) return;

    deletionPendingRef.current = true;
    setDeleting(true);
    setError("");
    try {
      await deleteAllMemories(userId);
      setMemories([]);
    } catch {
      setError("Không thể xóa dữ liệu học tập.");
    } finally {
      deletionPendingRef.current = false;
      setDeleting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="learning-memory-dialog-title"
        aria-describedby="learning-memory-dialog-description"
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <h2
            id="learning-memory-dialog-title"
            className="text-lg font-bold text-slate-800"
          >
            Dữ liệu học tập
          </h2>
        </div>

        <p
          id="learning-memory-dialog-description"
          className="mb-5 text-sm text-slate-600"
        >
          Dữ liệu này chỉ giúp cá nhân hóa các câu hỏi cùng chủ đề nha khoa trên trình duyệt này.
          Bạn có thể xóa từng mục hoặc xóa toàn bộ bất cứ lúc nào.
        </p>

        {error && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {error}
          </p>
        )}

        {loading ? (
          <p className="py-4 text-sm text-slate-500">Đang tải dữ liệu học tập...</p>
        ) : memories.length === 0 ? (
          <p className="rounded-lg bg-cream p-4 text-sm text-slate-600">
            Chưa có dữ liệu học tập nào được lưu.
          </p>
        ) : (
          <ul className="space-y-3">
            {memories.map((memory) => (
              <li
                key={memory.id}
                className="rounded-lg border border-slate-200 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {memory.memory_type}
                    </p>
                    <p className="truncate text-xs text-slate-500">{memory.key}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDelete(memory.id)}
                    disabled={deleting}
                    aria-label={`Xóa ${memory.key}`}
                    className="shrink-0 rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {memorySummary(memory.value)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Cập nhật: {new Date(memory.updated_at).toLocaleString("vi-VN")}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex justify-between gap-2">
          <button
            type="button"
            onClick={() => void handleDeleteAll()}
            disabled={loading || deleting || memories.length === 0}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Xóa toàn bộ
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
