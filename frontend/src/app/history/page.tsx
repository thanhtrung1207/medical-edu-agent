'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSavedCases, deleteCase } from '@/lib/case-storage';
import { SavedCase } from '@/lib/types';

export default function HistoryPage() {
  const [cases, setCases] = useState<SavedCase[]>([]);

  useEffect(() => {
    setCases(getSavedCases());
  }, []);

  const handleDelete = (id: number) => {
    deleteCase(id);
    setCases(getSavedCases());
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-borderSoft bg-white text-slate-600 transition hover:bg-cream hover:text-primary"
            aria-label="Quay lại trang chủ"
          >
            ←
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Lịch sử case</h1>
            <p className="text-sm text-slate-500">
              {cases.length} case đã lưu
            </p>
          </div>
        </div>

        {/* Empty state */}
        {cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-borderSoft bg-white py-20 text-center">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-base font-semibold text-slate-700 mb-1">
              Chưa có case nào được lưu
            </p>
            <p className="text-sm text-slate-500 max-w-sm">
              Hoàn thành một case và nhấn ✅ Kết thúc &amp; Lưu case để lưu lại
            </p>
          </div>
        ) : (
          /* Case list */
          <div className="space-y-4">
            {cases.map((c) => {
              const isFracture = c.scenario === 'fracture';
              return (
                <div
                  key={c.id}
                  className="rounded-2xl border border-borderSoft bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isFracture
                            ? 'bg-primary text-white'
                            : 'bg-secondary text-white'
                        }`}
                      >
                        {isFracture ? 'Răng vỡ' : 'Mất răng'}
                      </span>
                      <span className="text-sm font-medium text-slate-700">
                        Răng: {c.teeth.join(', ')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                      aria-label="Xóa case"
                    >
                      🗑
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">
                    {formatDate(c.date)}
                  </p>
                  <p className="text-sm text-slate-500 line-clamp-3">
                    {c.summary.slice(0, 300)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
