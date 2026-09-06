"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, ExternalLink } from "lucide-react";
import {
  clearApiKeys,
  getActiveProvider,
  getClaudeApiKey,
  getGeminiApiKey,
  hasAnyApiKey,
  setClaudeApiKey,
  setGeminiApiKey,
  setActiveProvider,
  type AIProvider,
} from "@/lib/api-keys";

type ProviderChoice = AIProvider | "auto";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [claudeKey, setClaudeKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [provider, setProvider] = useState<ProviderChoice>("auto");
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [claudeSaved, setClaudeSaved] = useState(false);
  const [geminiSaved, setGeminiSaved] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  // Load values from localStorage when modal opens
  useEffect(() => {
    if (!open) return;
    const ck = getClaudeApiKey();
    const gk = getGeminiApiKey();
    setClaudeKey(ck);
    setGeminiKey(gk);
    setClaudeSaved(ck.length > 0);
    setGeminiSaved(gk.length > 0);
    setProvider(getActiveProvider() ?? "auto");
    setHasKey(hasAnyApiKey());
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = () => {
    setClaudeApiKey(claudeKey);
    setGeminiApiKey(geminiKey);
    setActiveProvider(provider === "auto" ? null : provider);
    setClaudeSaved(claudeKey.length > 0);
    setGeminiSaved(geminiKey.length > 0);
    setHasKey(hasAnyApiKey());
    window.dispatchEvent(new Event("api-keys-changed"));
    onClose();
  };

  const handleClear = () => {
    clearApiKeys();
    setClaudeKey("");
    setGeminiKey("");
    setProvider("auto");
    setClaudeSaved(false);
    setGeminiSaved(false);
    setHasKey(false);
    window.dispatchEvent(new Event("api-keys-changed"));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-2xl">🔑</span>
          <h2 className="text-lg font-bold text-slate-800">Cài đặt API Key</h2>
        </div>

        {/* Explanation */}
        <p className="mb-5 text-sm text-slate-600">
          Nhập API key để chat trực tiếp với AI. Key được lưu trong trình duyệt,
          không gửi đến máy chủ nào khác.
        </p>

        {/* Claude API Key */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center gap-2">
            <label
              htmlFor="claude-api-key"
              className="text-sm font-semibold text-slate-700"
            >
              Anthropic API Key (Claude)
            </label>
            {claudeSaved && (
              <span
                className="inline-block h-2 w-2 rounded-full bg-green-500"
                title="Đã lưu"
              />
            )}
          </div>
          <div className="relative">
            <input
              id="claude-api-key"
              type={showClaudeKey ? "text" : "password"}
              value={claudeKey}
              onChange={(e) => setClaudeKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              autoComplete="off"
              className="w-full rounded-lg border border-borderSoft bg-cream/50 px-3 py-2 pr-10 font-mono text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={() => setShowClaudeKey((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
              aria-label={showClaudeKey ? "Ẩn key" : "Hiện key"}
            >
              {showClaudeKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-secondary-600 transition hover:text-secondary-700 hover:underline"
          >
            Lấy key tại console.anthropic.com
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Gemini API Key */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center gap-2">
            <label
              htmlFor="gemini-api-key"
              className="text-sm font-semibold text-slate-700"
            >
              Google AI API Key (Gemini)
            </label>
            {geminiSaved && (
              <span
                className="inline-block h-2 w-2 rounded-full bg-green-500"
                title="Đã lưu"
              />
            )}
          </div>
          <div className="relative">
            <input
              id="gemini-api-key"
              type={showGeminiKey ? "text" : "password"}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIza..."
              autoComplete="off"
              className="w-full rounded-lg border border-borderSoft bg-cream/50 px-3 py-2 pr-10 font-mono text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={() => setShowGeminiKey((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
              aria-label={showGeminiKey ? "Ẩn key" : "Hiện key"}
            >
              {showGeminiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-secondary-600 transition hover:text-secondary-700 hover:underline"
          >
            Lấy key tại aistudio.google.com
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Provider preference */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Provider ưu tiên
          </label>
          <div className="space-y-1.5">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-cream">
              <input
                type="radio"
                name="provider"
                value="claude"
                checked={provider === "claude"}
                onChange={() => setProvider("claude")}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm text-slate-700">
                Claude (khuyến nghị)
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-cream">
              <input
                type="radio"
                name="provider"
                value="gemini"
                checked={provider === "gemini"}
                onChange={() => setProvider("gemini")}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm text-slate-700">Gemini</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-cream">
              <input
                type="radio"
                name="provider"
                value="auto"
                checked={provider === "auto"}
                onChange={() => setProvider("auto")}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm text-slate-700">
                Tự động (Claude trước)
              </span>
            </label>
          </div>
        </div>

        {/* Status indicator */}
        <div className="mb-4 rounded-lg bg-cream p-3">
          {hasKey ? (
            <p className="text-sm font-medium text-green-600">
              ✓ Đã cấu hình API key
            </p>
          ) : (
            <p className="text-sm font-medium text-amber-600">
              ⚠ Chưa có API key — đang dùng chế độ mock
            </p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex justify-between gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Xóa tất cả
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
