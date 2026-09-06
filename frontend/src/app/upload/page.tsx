"use client";

import { useEffect, useState } from "react";
import { DocumentUploader } from "@/components/upload/DocumentUploader";
import { DocumentList } from "@/components/upload/DocumentList";
import { listDocuments } from "@/lib/api";
import type { MedicalDocument } from "@/lib/types";

export default function UploadPage() {
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const docs = await listDocuments();
    setDocuments(docs);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleUploaded = (doc: MedicalDocument) => {
    setDocuments((prev) => [doc, ...prev]);
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Tài liệu học tập
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tải lên tài liệu y khoa (PDF, DOCX, TXT, MD, PPTX) để AI học và trả
            lời dựa trên nội dung của bạn.
          </p>
        </header>

        <DocumentUploader onUploaded={handleUploaded} />

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-200">
            Tài liệu đã tải lên
          </h2>
          <DocumentList
            documents={documents}
            loading={loading}
            onRefresh={refresh}
          />
        </section>
      </div>
    </div>
  );
}
