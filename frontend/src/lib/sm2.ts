/**
 * SM-2 spaced repetition algorithm (SuperMemo 2).
 *
 * Mirrors the backend adaptive engine constants exactly so that the
 * offline-first frontend scheduling stays consistent with the server:
 *   MIN_INTERVAL=1, MAX_INTERVAL=30, INITIAL_EASINESS=2.5, MIN_EASINESS=1.3
 */

/** Minimum review interval in days. */
export const MIN_INTERVAL = 1;
/** Maximum review interval in days. */
export const MAX_INTERVAL = 30;
/** Starting easiness factor for a brand-new topic. */
export const INITIAL_EASINESS = 2.5;
/** Lower bound for the easiness factor. */
export const MIN_EASINESS = 1.3;

export interface SM2State {
  easeFactor: number;
  interval: number;
  repetitions: number;
}

/** A fresh SM-2 state for a topic that has never been reviewed. */
export function initialSM2State(): SM2State {
  return {
    easeFactor: INITIAL_EASINESS,
    interval: 0,
    repetitions: 0,
  };
}

/** Clamp a number into the inclusive [min, max] range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Compute the next SM-2 state given the previous state and a recall quality.
 *
 * @param state   Previous scheduling state.
 * @param quality Recall quality on a 0-5 scale.
 *   - quality >= 3 → correct recall, interval grows.
 *   - quality < 3  → failed recall, repetitions reset and interval → 1 day.
 */
export function calculateNextReview(state: SM2State, quality: number): SM2State {
  const q = clamp(Math.round(quality), 0, 5);

  // Update the easiness factor per the SM-2 formula.
  const nextEase = clamp(
    state.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
    MIN_EASINESS,
    INITIAL_EASINESS
  );

  if (q < 3) {
    // Failed recall: restart the repetition cycle.
    return {
      easeFactor: nextEase,
      interval: MIN_INTERVAL,
      repetitions: 0,
    };
  }

  // Successful recall: grow the interval.
  const repetitions = state.repetitions + 1;
  let interval: number;
  if (repetitions === 1) {
    interval = MIN_INTERVAL;
  } else if (repetitions === 2) {
    interval = 6;
  } else {
    interval = Math.round(state.interval * nextEase);
  }

  interval = clamp(interval, MIN_INTERVAL, MAX_INTERVAL);

  return {
    easeFactor: nextEase,
    interval,
    repetitions,
  };
}

/**
 * Map a percentage score (0-100) to the SM-2 quality scale (0-5).
 *   0-20% → 0, 20-40% → 1, 40-60% → 2, 60-80% → 3, 80-90% → 4, 90-100% → 5
 */
export function scoreToQuality(scorePercent: number): number {
  const s = clamp(scorePercent, 0, 100);
  if (s < 20) return 0;
  if (s < 40) return 1;
  if (s < 60) return 2;
  if (s < 80) return 3;
  if (s < 90) return 4;
  return 5;
}

/**
 * Estimate a 0-1 mastery level from the easiness factor and repetition count.
 *
 * Combines two signals:
 *   - Ease progress: how far the ease factor has moved from MIN → INITIAL.
 *   - Repetition progress: capped at 5 successful repetitions.
 */
export function getMasteryLevel(
  easeFactor: number,
  repetitions: number
): number {
  const easeProgress =
    (clamp(easeFactor, MIN_EASINESS, INITIAL_EASINESS) - MIN_EASINESS) /
    (INITIAL_EASINESS - MIN_EASINESS);
  const repProgress = clamp(repetitions, 0, 5) / 5;

  // Weight repetitions slightly higher: demonstrated recall matters most.
  const mastery = easeProgress * 0.4 + repProgress * 0.6;
  return Math.round(clamp(mastery, 0, 1) * 100) / 100;
}
