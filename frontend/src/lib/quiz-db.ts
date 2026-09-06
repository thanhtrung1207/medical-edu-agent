/**
 * IndexedDB persistence layer for offline-first quiz progress tracking.
 *
 * Uses the native IndexedDB API (no external dependency). Every public method
 * degrades gracefully when IndexedDB is unavailable — e.g. server-side render
 * or Safari private mode — returning empty/undefined results instead of
 * throwing, so the quiz flow never breaks.
 */

const DB_NAME = "dental-edu-quiz-db";
const DB_VERSION = 1;
const STORE_ATTEMPTS = "quizAttempts";
const STORE_SCHEDULE = "progressSchedule";

export interface QuizAttempt {
  id: string;
  quizId: string;
  topic: string;
  difficulty: "foundation" | "intermediate" | "advanced";
  score: number; // 0-100
  totalQuestions: number;
  correctCount: number;
  timestamp: number;
}

export interface ProgressSchedule {
  topic: string;
  easeFactor: number; // 1.3 - 2.5
  interval: number; // days
  repetitions: number;
  nextReviewAt: number; // timestamp
  lastAttemptScore: number;
  masteryLevel: number; // 0-1
}

/** A topic is considered "mastered" once mastery reaches this threshold. */
export const MASTERY_THRESHOLD = 0.7;

let dbPromise: Promise<IDBDatabase> | null = null;

/** Detect whether IndexedDB is usable in the current environment. */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof window !== "undefined" && "indexedDB" in window && !!window.indexedDB;
  } catch {
    return false;
  }
}

/**
 * Open (and if necessary upgrade) the IndexedDB database.
 * The resulting promise is memoised so the connection is opened only once.
 */
export function initDB(): Promise<IDBDatabase> {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_ATTEMPTS)) {
        const attempts = db.createObjectStore(STORE_ATTEMPTS, {
          keyPath: "id",
        });
        attempts.createIndex("topic", "topic", { unique: false });
        attempts.createIndex("difficulty", "difficulty", { unique: false });
        attempts.createIndex("timestamp", "timestamp", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_SCHEDULE)) {
        const schedule = db.createObjectStore(STORE_SCHEDULE, {
          keyPath: "topic",
        });
        schedule.createIndex("nextReviewAt", "nextReviewAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open quiz DB"));
    request.onblocked = () =>
      reject(new Error("Quiz DB open blocked by another connection"));
  });

  // Reset the memoised promise on failure so a later call can retry.
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

/** Wrap an IDBRequest in a promise. */
function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Wrap a transaction completion in a promise. */
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

/** Persist a single quiz attempt. Silently no-ops when DB is unavailable. */
export async function saveAttempt(attempt: QuizAttempt): Promise<void> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_ATTEMPTS, "readwrite");
    tx.objectStore(STORE_ATTEMPTS).put(attempt);
    await txDone(tx);
  } catch (err) {
    console.warn("quiz-db.saveAttempt skipped (no persistence):", err);
  }
}

/**
 * Retrieve quiz attempts, optionally filtered by topic.
 * Results are sorted by timestamp descending (most recent first).
 */
export async function getAttempts(topic?: string): Promise<QuizAttempt[]> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_ATTEMPTS, "readonly");
    const store = tx.objectStore(STORE_ATTEMPTS);

    let attempts: QuizAttempt[];
    if (topic) {
      const index = store.index("topic");
      attempts = await promisifyRequest(
        index.getAll(IDBKeyRange.only(topic))
      );
    } else {
      attempts = await promisifyRequest(store.getAll());
    }

    return attempts.sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    console.warn("quiz-db.getAttempts skipped (no persistence):", err);
    return [];
  }
}

/** Fetch the scheduling record for a single topic. */
export async function getSchedule(
  topic: string
): Promise<ProgressSchedule | undefined> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_SCHEDULE, "readonly");
    const result = await promisifyRequest<ProgressSchedule | undefined>(
      tx.objectStore(STORE_SCHEDULE).get(topic)
    );
    return result;
  } catch (err) {
    console.warn("quiz-db.getSchedule skipped (no persistence):", err);
    return undefined;
  }
}

/** Insert or update the scheduling record for a topic. */
export async function updateSchedule(
  schedule: ProgressSchedule
): Promise<void> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_SCHEDULE, "readwrite");
    tx.objectStore(STORE_SCHEDULE).put(schedule);
    await txDone(tx);
  } catch (err) {
    console.warn("quiz-db.updateSchedule skipped (no persistence):", err);
  }
}

/** Return all scheduling records. */
export async function getAllSchedules(): Promise<ProgressSchedule[]> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_SCHEDULE, "readonly");
    const result = await promisifyRequest<ProgressSchedule[]>(
      tx.objectStore(STORE_SCHEDULE).getAll()
    );
    return result;
  } catch (err) {
    console.warn("quiz-db.getAllSchedules skipped (no persistence):", err);
    return [];
  }
}

/** Return topics whose nextReviewAt is at or before now (due for review). */
export async function getDueTopics(): Promise<ProgressSchedule[]> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_SCHEDULE, "readonly");
    const index = tx.objectStore(STORE_SCHEDULE).index("nextReviewAt");
    const now = Date.now();
    const due = await promisifyRequest<ProgressSchedule[]>(
      index.getAll(IDBKeyRange.upperBound(now))
    );
    return due.sort((a, b) => a.nextReviewAt - b.nextReviewAt);
  } catch (err) {
    console.warn("quiz-db.getDueTopics skipped (no persistence):", err);
    return [];
  }
}

/**
 * Compute aggregate progress statistics.
 *   - totalAttempts: number of stored quiz attempts.
 *   - topicsMastered: schedules with mastery >= MASTERY_THRESHOLD.
 *   - streak: consecutive days (ending today) with at least one attempt.
 */
export async function getStats(): Promise<{
  totalAttempts: number;
  topicsMastered: number;
  streak: number;
}> {
  try {
    const [attempts, schedules] = await Promise.all([
      getAttempts(),
      getAllSchedules(),
    ]);

    const topicsMastered = schedules.filter(
      (s) => s.masteryLevel >= MASTERY_THRESHOLD
    ).length;

    const streak = computeStreak(attempts.map((a) => a.timestamp));

    return {
      totalAttempts: attempts.length,
      topicsMastered,
      streak,
    };
  } catch (err) {
    console.warn("quiz-db.getStats skipped (no persistence):", err);
    return { totalAttempts: 0, topicsMastered: 0, streak: 0 };
  }
}

/** Convert a timestamp to a day key at local midnight (ms). */
function dayKey(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Count consecutive days (ending today or yesterday) with activity.
 * The streak stays alive if the most recent activity was today or yesterday.
 */
function computeStreak(timestamps: number[]): number {
  if (timestamps.length === 0) return 0;

  const days = new Set(timestamps.map(dayKey));
  const oneDay = 24 * 60 * 60 * 1000;

  const today = dayKey(Date.now());
  let cursor: number;
  if (days.has(today)) {
    cursor = today;
  } else if (days.has(today - oneDay)) {
    cursor = today - oneDay;
  } else {
    return 0;
  }

  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= oneDay;
  }
  return streak;
}
