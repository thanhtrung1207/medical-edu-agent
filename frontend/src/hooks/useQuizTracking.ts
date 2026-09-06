"use client";

/**
 * React hooks for offline-first quiz progress tracking.
 *
 * `useQuizTracking` records attempts and advances the SM-2 schedule.
 * `useProgressStats` exposes aggregate statistics for the dashboard.
 *
 * Both hooks degrade gracefully when IndexedDB is unavailable: reads return
 * empty results and writes become no-ops, so the quiz experience keeps working.
 */

import { useCallback, useEffect, useState } from "react";
import {
  getDueTopics as dbGetDueTopics,
  getSchedule,
  getStats,
  isIndexedDBAvailable,
  initDB,
  saveAttempt as dbSaveAttempt,
  updateSchedule,
  type ProgressSchedule,
  type QuizAttempt,
} from "@/lib/quiz-db";
import {
  calculateNextReview,
  getMasteryLevel,
  initialSM2State,
  scoreToQuality,
  type SM2State,
} from "@/lib/sm2";
import { generateId } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

export function useQuizTracking(): {
  saveAttempt: (attempt: Omit<QuizAttempt, "id">) => Promise<void>;
  getDueTopics: () => Promise<ProgressSchedule[]>;
  getProgress: (topic?: string) => Promise<ProgressSchedule | undefined>;
  isReady: boolean;
} {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isIndexedDBAvailable()) {
      setIsReady(false);
      return;
    }
    initDB()
      .then(() => {
        if (!cancelled) setIsReady(true);
      })
      .catch(() => {
        if (!cancelled) setIsReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveAttempt = useCallback(
    async (attempt: Omit<QuizAttempt, "id">): Promise<void> => {
      // 1. Persist the raw attempt.
      const record: QuizAttempt = { ...attempt, id: generateId("attempt") };
      await dbSaveAttempt(record);

      // 2. Advance the SM-2 schedule for this topic.
      const existing = await getSchedule(attempt.topic);
      const prevState: SM2State = existing
        ? {
            easeFactor: existing.easeFactor,
            interval: existing.interval,
            repetitions: existing.repetitions,
          }
        : initialSM2State();

      const quality = scoreToQuality(attempt.score);
      const next = calculateNextReview(prevState, quality);

      const schedule: ProgressSchedule = {
        topic: attempt.topic,
        easeFactor: next.easeFactor,
        interval: next.interval,
        repetitions: next.repetitions,
        nextReviewAt: Date.now() + next.interval * DAY_MS,
        lastAttemptScore: attempt.score,
        masteryLevel: getMasteryLevel(next.easeFactor, next.repetitions),
      };
      await updateSchedule(schedule);
    },
    []
  );

  const getDueTopics = useCallback(
    (): Promise<ProgressSchedule[]> => dbGetDueTopics(),
    []
  );

  const getProgress = useCallback(
    (topic?: string): Promise<ProgressSchedule | undefined> => {
      if (!topic) return Promise.resolve(undefined);
      return getSchedule(topic);
    },
    []
  );

  return { saveAttempt, getDueTopics, getProgress, isReady };
}

export function useProgressStats(): {
  stats: {
    totalAttempts: number;
    topicsMastered: number;
    streak: number;
    dueCount: number;
  } | null;
  loading: boolean;
  refresh: () => void;
} {
  const [stats, setStats] = useState<{
    totalAttempts: number;
    topicsMastered: number;
    streak: number;
    dueCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [base, due] = await Promise.all([getStats(), dbGetDueTopics()]);
      setStats({ ...base, dueCount: due.length });
    } catch {
      setStats({
        totalAttempts: 0,
        topicsMastered: 0,
        streak: 0,
        dueCount: 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return { stats, loading, refresh };
}
