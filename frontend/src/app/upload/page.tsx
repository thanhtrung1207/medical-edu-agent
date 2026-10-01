"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
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
    <div className="min-h-full bg-gradient-to-br from-cream via-white to-secondary-50 p-4 dark:from-slate-950 dark:via-slate-950 dark:to-primary-900/20 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
              Tài liệu học tập
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tải lên tài liệu y khoa (PDF, DOCX, TXT, MD, PPTX) để AI học và trả lời dựa trên nội dung của bạn.
          </p>
        </header>

        <DocumentUploader onUploaded={handleUploaded} />

        <section className="mt-8">
          <h2 className="mb-4 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
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
