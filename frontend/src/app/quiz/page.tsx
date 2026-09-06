"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Loader2, Sparkles, TrendingUp } from "lucide-react";
import { QuizCard } from "@/components/quiz/QuizCard";
import { ScoreBoard } from "@/components/quiz/ScoreBoard";
import { QuizTimer } from "@/components/quiz/QuizTimer";
import { generateQuiz, submitQuizAnswer } from "@/lib/api";
import { useQuizTracking } from "@/hooks/useQuizTracking";
import type { QuizAttempt } from "@/lib/quiz-db";
import type { Quiz, QuizDifficulty, QuizResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const DIFFICULTIES: { value: QuizDifficulty; label: string }[] = [
  { value: "easy", label: "Dễ" },
  { value: "medium", label: "Trung bình" },
  { value: "hard", label: "Khó" },
];

// Map the UI difficulty scale onto the tracker's mastery scale.
const DIFFICULTY_TO_TRACKING: Record<
  QuizDifficulty,
  QuizAttempt["difficulty"]
> = {
  easy: "foundation",
  medium: "intermediate",
  hard: "advanced",
};

export default function QuizPage() {
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [count, setCount] = useState(5);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nextReviewDays, setNextReviewDays] = useState<number | null>(null);
  const { saveAttempt, getProgress } = useQuizTracking();

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    setAnswers({});
    setNextReviewDays(null);
    const q = await generateQuiz(topic || "Y học tổng quát", difficulty, count);
    setQuiz(q);
    setLoading(false);
  };

  const handleSelect = (questionId: string, optionKey: string) => {
    if (result) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionKey }));
  };

  const handleSubmit = async () => {
    if (!quiz) return;
    setSubmitting(true);
    const res = await submitQuizAnswer(quiz, answers);
    setResult(res);
    setSubmitting(false);

    // Track progress AFTER the existing submit flow has succeeded. Any failure
    // here is swallowed so the quiz experience is never disrupted.
    try {
      await saveAttempt({
        quizId: res.quizId,
        topic: quiz.topic,
        difficulty: DIFFICULTY_TO_TRACKING[quiz.difficulty],
        score: res.score,
        totalQuestions: res.total,
        correctCount: res.correctCount,
        timestamp: Date.now(),
      });
      const schedule = await getProgress(quiz.topic);
      setNextReviewDays(schedule?.interval ?? null);
    } catch (err) {
      console.warn("Quiz progress tracking skipped:", err);
    }
  };

  const handleReset = () => {
    setQuiz(null);
    setAnswers({});
    setResult(null);
    setNextReviewDays(null);
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Luyện tập trắc nghiệm
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Tạo câu hỏi trắc nghiệm theo chủ đề và độ khó (định dạng USMLE/NMLE).
            </p>
          </div>
          <Link
            href="/progress"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            <TrendingUp className="h-4 w-4 text-primary" />
            📊 Tiến độ của tôi
          </Link>
        </header>

        {!quiz && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Chủ đề
            </label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ví dụ: Răng vỡ, Mất răng đơn lẻ, Implant, Phục hình..."
              className="mb-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />

            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Độ khó
                </label>
                <div className="flex gap-2">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDifficulty(d.value)}
                      className={cn(
                        "flex-1 rounded-lg border px-2 py-2 text-sm transition",
                        difficulty === d.value
                          ? "border-primary bg-primary/10 font-semibold text-primary"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Số câu hỏi
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={count}
                  onChange={(e) =>
                    setCount(Math.max(1, Math.min(20, Number(e.target.value))))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loading ? "Đang tạo..." : "Tạo bộ câu hỏi"}
            </button>
          </div>
        )}

        {quiz && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                  {quiz.topic}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {quiz.questions.length} câu hỏi · Độ khó:{" "}
                  {DIFFICULTIES.find((d) => d.value === quiz.difficulty)?.label}
                </p>
              </div>
              {!result && <QuizTimer minutes={quiz.questions.length} onExpire={handleSubmit} />}
            </div>

            {result && (
              <div className="mb-6">
                <ScoreBoard result={result} onRetry={handleReset} />
                {nextReviewDays !== null && (
                  <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary">
                    <CalendarClock className="h-4 w-4" />
                    Lần ôn tập tiếp theo: {nextReviewDays} ngày nữa
                    <Link
                      href="/progress"
                      className="ml-1 underline underline-offset-2 hover:text-primary-700"
                    >
                      Xem tiến độ
                    </Link>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              {quiz.questions.map((q, idx) => (
                <QuizCard
                  key={q.id}
                  index={idx + 1}
                  question={q}
                  selected={answers[q.id]}
                  answerResult={result?.results.find(
                    (r) => r.questionId === q.id
                  )}
                  onSelect={(opt) => handleSelect(q.id, opt)}
                />
              ))}
            </div>

            {!result && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-secondary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-secondary-600 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Nộp bài
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
