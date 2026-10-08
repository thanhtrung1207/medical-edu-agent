"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Loader2, Sparkles, TrendingUp } from "lucide-react";
import { QuizCard } from "@/components/quiz/QuizCard";
import { ScoreBoard } from "@/components/quiz/ScoreBoard";
import { QuizTimer } from "@/components/quiz/QuizTimer";
import { generateQuiz, submitQuizAnswer } from "@/lib/api";
import { getOrCreateUserId } from "@/lib/client-identity";
import { useQuizTracking } from "@/hooks/useQuizTracking";
import type { QuizAttempt } from "@/lib/quiz-db";
import type { Quiz, QuizDifficulty, QuizResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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
  const [count, setCount] = useState<number | string>(5);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nextReviewDays, setNextReviewDays] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { saveAttempt, getProgress } = useQuizTracking();

  useEffect(() => {
    setUserId(getOrCreateUserId());
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setAnswers({});
    setNextReviewDays(null);
    try {
      const parsedCount = Math.max(1, Math.min(20, typeof count === "number" ? count : parseInt(String(count), 10) || 5));
      const q = await generateQuiz(
        topic || "Y học tổng quát",
        difficulty,
        parsedCount,
      );
      setQuiz(q);
    } catch {
      setError("Không thể tạo bộ câu hỏi. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (questionId: string, optionKey: string) => {
    if (result) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionKey }));
  };

  const handleSubmit = async () => {
    if (!quiz || !userId) return;

    setSubmitting(true);
    setError("");
    try {
      const res = await submitQuizAnswer(quiz, answers, userId);
      setResult(res);

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
      } catch (trackingError) {
        console.warn("Quiz progress tracking skipped:", trackingError);
      }
    } catch {
      setError("Không thể nộp bài. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setQuiz(null);
    setAnswers({});
    setResult(null);
    setNextReviewDays(null);
    setError("");
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-cream via-white to-secondary-50 p-4 dark:from-slate-950 dark:via-slate-950 dark:to-primary-900/20 sm:p-6">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Luyện tập trắc nghiệm
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Tạo câu hỏi trắc nghiệm theo chủ đề và độ khó (định dạng USMLE/NMLE).
            </p>
          </div>
          <Link
            href="/progress"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 backdrop-blur transition-all duration-150 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:bg-white hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <TrendingUp className="h-4 w-4 text-primary" />
            📊 Tiến độ của tôi
          </Link>
        </header>

        {error && (
          <p role="alert" className="mb-4 text-sm text-red-600">
            {error}
          </p>
        )}

        {!quiz && (
          <Card>
            <CardContent className="p-5">
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Chủ đề
            </label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ví dụ: Răng vỡ, Mất răng đơn lẻ, Implant, Phục hình..."
              className="mb-4"
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
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={count}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      setCount("");
                    } else {
                      const num = parseInt(val, 10);
                      if (!isNaN(num)) {
                        setCount(num);
                      }
                    }
                  }}
                  onBlur={() => {
                    const num = typeof count === "number" ? count : parseInt(String(count), 10);
                    if (isNaN(num) || num < 1) setCount(1);
                    else if (num > 20) setCount(20);
                    else setCount(num);
                  }}
                />
              </div>
            </div>

            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={loading}
              className="w-auto"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loading ? "Đang tạo..." : "Tạo bộ câu hỏi"}
            </Button>
            </CardContent>
          </Card>
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
              <Button
                variant="secondary"
                onClick={handleSubmit}
                disabled={submitting || !userId}
                className="mt-6 w-auto"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Nộp bài
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
