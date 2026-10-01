'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { getSavedCases, deleteCase } from '@/lib/case-storage';
import { SavedCase } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';

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
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-cream via-white to-secondary-50 p-4 dark:from-slate-950 dark:via-slate-950 dark:to-primary-900/20 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
              Lịch sử case
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {cases.length > 0 ? `${cases.length} case đã lưu` : 'Chưa có case nào được lưu'}
          </p>
        </header>

        {cases.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/8 text-3xl">
                📋
              </div>
              <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
                Chưa có case nào được lưu
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                Hoàn thành một case và nhấn ✅ Kết thúc &amp; Lưu case để lưu lại
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {cases.map((c) => {
              const isFracture = c.scenario === 'fracture';
              return (
                <Card key={c.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={isFracture ? 'primary' : 'secondary'}>
                          {isFracture ? 'Răng vỡ' : 'Mất răng'}
                        </Badge>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          Răng: {c.teeth.join(', ')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="shrink-0 rounded-xl p-1.5 text-slate-400 transition-all duration-150 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 active:scale-[0.95]"
                        aria-label="Xóa case"
                      >
                        🗑
                      </button>
                    </div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400 mb-2">
                      {formatDate(c.date)}
                    </p>
                    <p className="text-sm leading-6 text-slate-500 dark:text-slate-400 line-clamp-3">
                      {c.summary.slice(0, 300)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
