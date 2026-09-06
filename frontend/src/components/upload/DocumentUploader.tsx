"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { CheckCircle2, CloudUpload, XCircle } from "lucide-react";
import { config } from "@/lib/config";
import { uploadDocument } from "@/lib/api";
import type { MedicalDocument } from "@/lib/types";
import { cn, formatFileSize } from "@/lib/utils";

interface DocumentUploaderProps {
  onUploaded: (doc: MedicalDocument) => void;
}

interface Toast {
  id: number;
  type: "success" | "error";
  message: string;
}

export function DocumentUploader({ onUploaded }: DocumentUploaderProps) {
  const [progress, setProgress] = useState<number | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (type: Toast["type"], message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const onDrop = useCallback(
    async (accepted: File[], rejected: FileRejection[]) => {
      rejected.forEach((r) => {
        const reason =
          r.errors[0]?.code === "file-too-large"
            ? "Tệp quá lớn (tối đa 25MB)"
            : "Định dạng tệp không được hỗ trợ";
        pushToast("error", `${r.file.name}: ${reason}`);
      });

      for (const file of accepted) {
        setCurrentFile(file.name);
        setProgress(0);
        try {
          const res = await uploadDocument(file, (p) => setProgress(p));
          onUploaded({
            id: res.id,
            filename: res.filename,
            status: res.status,
            uploaded_at: res.uploaded_at,
            num_chunks: res.num_chunks,
          });
          pushToast("success", `Đã tải lên "${file.name}" thành công`);
        } catch {
          pushToast("error", `Tải lên "${file.name}" thất bại`);
        } finally {
          setProgress(null);
          setCurrentFile(null);
        }
      }
    },
    [onUploaded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: config.allowedFileTypes,
    maxSize: config.maxFileSize,
    multiple: true,
  });

  return (
    <div className="relative">
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-slate-300 bg-white hover:border-primary/60 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
        )}
      >
        <input {...getInputProps()} aria-label="Chọn tệp để tải lên" />
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CloudUpload className="h-7 w-7" />
        </div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {isDragActive
            ? "Thả tệp vào đây..."
            : "Kéo thả tệp vào đây hoặc bấm để chọn"}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Hỗ trợ: PDF, DOCX, TXT, MD, PPTX · Tối đa{" "}
          {formatFileSize(config.maxFileSize)}
        </p>
      </div>

      {/* Progress bar */}
      {progress !== null && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-1 flex justify-between text-xs text-slate-600 dark:text-slate-300">
            <span className="truncate">{currentFile}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm text-white shadow-lg animate-fade-in",
              t.type === "success" ? "bg-secondary" : "bg-red-500"
            )}
          >
            {t.type === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
