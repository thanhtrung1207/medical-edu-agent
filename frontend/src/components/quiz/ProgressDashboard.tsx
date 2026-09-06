"use client";

/**
 * Progress dashboard for the spaced-repetition quiz tracker.
 *
 * Displays aggregate stats, mastery grouping, and topics due for review.
 * All data is read from IndexedDB via the tracking hooks and gracefully
 * shows an empty state when no history exists (or persistence is disabled).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Award,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Flame,
  Loader2,
  ListChecks,
  RotateCcw,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  getAllSchedules,
  MASTERY_THRESHOLD,
  type ProgressSchedule,
} from "@/lib/quiz-db";
import { useProgressStats } from "@/hooks/useQuizTracking";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Format a future timestamp as a friendly Vietnamese "due" label. */
function formatDueLabel(nextReviewAt: number): string {
  const now = Date.now();
  const diff = nextReviewAt - now;
  if (diff <= 0) return "Đến hạn hôm nay";
  const days = Math.ceil(diff / DAY_MS);
  if (days === 1) return "Ngày mai";
  if (days <= 7) return `Sau ${days} ngày`;
  const date = new Date(nextReviewAt);
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

/** Mastery buckets, in display order. */
type Bucket = "mastered" | "inProgress" | "needsWork";

function bucketOf(mastery: number): Bucket {
  if (mastery >= MASTERY_THRESHOLD) return "mastered";
  if (mastery >= 0.3) return "inProgress";
  return "needsWork";
}

const BUCKET_META: Record<
  Bucket,
  { label: string; badge: string; bar: string }
> = {
  mastered: {
    label: "Đã thành thạo (≥70%)",
    badge: "bg-secondary/10 text-secondary-700 dark:text-secondary-300",
    bar: "bg-secondary",
  },
  inProgress: {
    label: "Đang tiến bộ (30-70%)",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  needsWork: {
    label: "Cần cải thiện (<30%)",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300",
    bar: "bg-red-500",
  },
};

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Award;
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            accent
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            {value}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        </div>
      </div>
    </div>
  );
}

function TopicRow({ schedule }: { schedule: ProgressSchedule }) {
  const meta = BUCKET_META[bucketOf(schedule.masteryLevel)];
  const pct = Math.round(schedule.masteryLevel * 100);
  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
            {schedule.topic}
          </span>
          <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {pct}%
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={cn("h-full rounded-full transition-all", meta.bar)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
          <CalendarClock className="h-3 w-3" />
          Ôn tập tiếp: {formatDueLabel(schedule.nextReviewAt)}
        </p>
      </div>
    </li>
  );
}

export function ProgressDashboard() {
  const { stats, loading: statsLoading, refresh } = useProgressStats();
  const [schedules, setSchedules] = useState<ProgressSchedule[] | null>(null);

  const loadSchedules = useCallback(async () => {
    const all = await getAllSchedules();
    setSchedules(all.sort((a, b) => b.masteryLevel - a.masteryLevel));
  }, []);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  const handleRefresh = useCallback(() => {
    refresh();
    void loadSchedules();
  }, [refresh, loadSchedules]);

  const loading = statsLoading || schedules === null;

  const now = Date.now();
  const dueTopics = (schedules ?? [])
    .filter((s) => s.nextReviewAt <= now + 7 * DAY_MS)
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt);

  const grouped: Record<Bucket, ProgressSchedule[]> = {
    mastered: [],
    inProgress: [],
    needsWork: [],
  };
  (schedules ?? []).forEach((s) => grouped[bucketOf(s.masteryLevel)].push(s));

  const isEmpty = !loading && (schedules?.length ?? 0) === 0;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              <TrendingUp className="h-6 w-6 text-primary" />
              Tiến độ học tập
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Theo dõi mức độ thành thạo và lịch ôn tập theo phương pháp lặp lại
              ngắt quãng (SM-2).
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Làm mới
          </button>
        </header>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Đang tải tiến độ...
          </div>
        )}

        {isEmpty && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
            <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">
              Chưa có dữ liệu tiến độ
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Hãy hoàn thành một bộ câu hỏi để bắt đầu theo dõi tiến độ của bạn.
            </p>
            <Link
              href="/quiz"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
            >
              <ListChecks className="h-4 w-4" />
              Bắt đầu luyện tập
            </Link>
          </div>
        )}

        {!loading && !isEmpty && (
          <>
            {/* Stats cards */}
            <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                icon={ListChecks}
                label="Lượt làm bài"
                value={stats?.totalAttempts ?? 0}
                accent="bg-primary/10 text-primary"
              />
              <StatCard
                icon={Flame}
                label="Ngày liên tiếp"
                value={stats?.streak ?? 0}
                accent="bg-orange-100 text-orange-600 dark:bg-orange-900/20"
              />
              <StatCard
                icon={Award}
                label="Chủ đề thành thạo"
                value={stats?.topicsMastered ?? 0}
                accent="bg-secondary/10 text-secondary"
              />
              <StatCard
                icon={Target}
                label="Cần ôn tập"
                value={stats?.dueCount ?? 0}
                accent="bg-amber-100 text-amber-600 dark:bg-amber-900/20"
              />
            </section>

            {/* Due for review */}
            <section className="mb-6">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200">
                <CalendarClock className="h-4 w-4 text-amber-500" />
                Cần ôn tập
              </h2>
              {dueTopics.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-secondary/30 bg-secondary/5 px-4 py-3 text-sm text-secondary-700 dark:text-secondary-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Tuyệt vời! Không có chủ đề nào cần ôn tập trong tuần này.
                </div>
              ) : (
                <ul className="space-y-2">
                  {dueTopics.map((s) => {
                    const due = s.nextReviewAt <= now;
                    return (
                      <li
                        key={s.topic}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                            {s.topic}
                          </p>
                          <p
                            className={cn(
                              "text-[11px]",
                              due
                                ? "font-semibold text-amber-600"
                                : "text-slate-400"
                            )}
                          >
                            {formatDueLabel(s.nextReviewAt)}
                          </p>
                        </div>
                        <Link
                          href={`/quiz?topic=${encodeURIComponent(s.topic)}`}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-700"
                        >
                          <ListChecks className="h-3.5 w-3.5" />
                          Ôn ngay
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Mastery overview grouped by status */}
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200">
                <Target className="h-4 w-4 text-primary" />
                Tổng quan mức độ thành thạo
              </h2>
              <div className="space-y-5">
                {(["mastered", "inProgress", "needsWork"] as Bucket[]).map(
                  (bucket) => {
                    const items = grouped[bucket];
                    if (items.length === 0) return null;
                    const meta = BUCKET_META[bucket];
                    return (
                      <div key={bucket}>
                        <div className="mb-2 flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                              meta.badge
                            )}
                          >
                            {meta.label}
                          </span>
                          <span className="text-xs text-slate-400">
                            {items.length} chủ đề
                          </span>
                        </div>
                        <ul className="space-y-2">
                          {items.map((s) => (
                            <TopicRow key={s.topic} schedule={s} />
                          ))}
                        </ul>
                      </div>
                    );
                  }
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
