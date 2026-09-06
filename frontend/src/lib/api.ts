/**
 * API client for the Medical Education AI Agent.
 *
 * The backend is not fully implemented yet, so every function gracefully
 * falls back to mock data when USE_MOCK_API is enabled or when a network
 * request fails. This keeps the MVP fully functional in isolation.
 */

import { config, USE_MOCK_API } from "./config";
import { generateId } from "./utils";
import type {
  Citation,
  FeedbackPayload,
  MedicalDocument,
  Quiz,
  QuizDifficulty,
  QuizResult,
  UploadResponse,
} from "./types";
import { hasAnyApiKey, getActiveProvider } from "./api-keys";
import { callAIDirect, type ChatMessage, AIError } from "./ai-client";
import { getSystemPrompt, type Scenario } from "./system-prompt";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/*                                Chat / Q&A                                  */
/* -------------------------------------------------------------------------- */

export interface AssistantReply {
  content: string;
  confidence?: number;
  citations: Citation[];
  warnings: string[];
  disclaimer?: string;
  reasoning_steps: string[];
  session_id?: string;
  message_id?: string;
}

const MOCK_DISCLAIMER =
  "⚠️ Thông tin chỉ mang tính chất tham khảo học thuật, không thay thế tư vấn y khoa chuyên nghiệp.";

function buildMockReply(message: string): AssistantReply {
  return {
    content: `Đây là câu trả lời minh hoạ cho câu hỏi: **"${message}"**.\n\nTrong y học dựa trên bằng chứng (evidence-based medicine), việc tiếp cận vấn đề cần dựa trên:\n\n1. Triệu chứng lâm sàng\n2. Kết quả cận lâm sàng\n3. Hướng dẫn điều trị hiện hành\n\n> Khi backend được kết nối, nội dung này sẽ được thay thế bằng phản hồi thực tế từ AI Agent.`,
    confidence: 0.82,
    citations: [
      {
        source: "Harrison's Principles of Internal Medicine",
        page: 1423,
        chapter: "Chương 12",
        quote:
          "Chẩn đoán cần kết hợp bệnh sử, khám lâm sàng và cận lâm sàng phù hợp.",
      },
    ],
    warnings: [],
    disclaimer: MOCK_DISCLAIMER,
    reasoning_steps: [
      "🔍 Xác nhận: Phân tích ý định câu hỏi của người dùng.",
      "🧠 Phân tích: Truy xuất kiến thức liên quan từ cơ sở tri thức.",
      "✍️ Soạn thảo: Tổng hợp câu trả lời dựa trên bằng chứng.",
      "✅ Kiểm tra: Đối chiếu độ tin cậy và trích dẫn nguồn.",
    ],
  };
}

/**
 * Send a message to the backend and receive a streaming response.
 * Falls back to a mock stream when the backend is unavailable.
 */
export async function sendMessage(
  message: string,
  sessionId?: string,
  history?: ChatMessage[],
  scenario?: Scenario,
  onChunk?: (chunk: string) => void
): Promise<AssistantReply> {
  // Direct API mode: if user has API keys, call AI directly from browser
  if (hasAnyApiKey() && history) {
    try {
      const systemPrompt = getSystemPrompt(scenario);
      const fullText = await callAIDirect(history, systemPrompt, onChunk);
      return {
        content: fullText,
        confidence: undefined,
        citations: [],
        warnings: [],
        disclaimer:
          "Lưu ý: Đây là phản hồi giáo dục từ AI, không thay thế chẩn đoán lâm sàng.",
        reasoning_steps: [],
      };
    } catch (error) {
      // If direct API fails, fall through to mock/backend as fallback
      // But if it's an auth error, re-throw so ChatInterface can show the error
      if (
        error instanceof AIError &&
        (error.code === "auth_error" || error.code === "no_key")
      ) {
        throw error;
      }
      // For rate_limit, network, unknown errors: fall through to mock/backend
      console.warn("Direct API failed, falling back:", error);
    }
  }

  if (USE_MOCK_API) {
    await delay(900);
    return buildMockReply(message);
  }

  try {
    const res = await fetch(`${config.apiBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        ...(sessionId ? { session_id: sessionId } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Chat request failed: ${res.status}`);
    return (await res.json()) as AssistantReply;
  } catch (err) {
    console.warn("sendMessage falling back to mock:", err);
    await delay(600);
    return buildMockReply(message);
  }
}

export interface ChatHistoryMessage {
  id: string;
  role: string;
  content: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface ChatHistoryResponse {
  messages: ChatHistoryMessage[];
  topic: string | null;
}

export async function getChatHistory(
  sessionId: string
): Promise<ChatHistoryResponse> {
  if (USE_MOCK_API) return { messages: [], topic: null };
  try {
    const res = await fetch(
      `${config.apiBaseUrl}/api/chat/history/${sessionId}`
    );
    if (!res.ok) return { messages: [], topic: null };
    return (await res.json()) as ChatHistoryResponse;
  } catch {
    return { messages: [], topic: null };
  }
}

/* -------------------------------------------------------------------------- */
/*                              Document upload                               */
/* -------------------------------------------------------------------------- */

export async function uploadDocument(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResponse> {
  if (USE_MOCK_API) {
    for (let p = 0; p <= 100; p += 20) {
      onProgress?.(p);
      await delay(180);
    }
    return {
      id: generateId("doc"),
      filename: file.name,
      status: "processing",
      uploaded_at: new Date().toISOString(),
    };
  }

  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${config.apiBaseUrl}/api/documents`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    onProgress?.(100);
    return (await res.json()) as UploadResponse;
  } catch (err) {
    console.warn("uploadDocument falling back to mock:", err);
    onProgress?.(100);
    return {
      id: generateId("doc"),
      filename: file.name,
      status: "processing",
      uploaded_at: new Date().toISOString(),
    };
  }
}

export async function listDocuments(): Promise<MedicalDocument[]> {
  if (USE_MOCK_API) {
    await delay(400);
    return [
      {
        id: "doc_sample_1",
        filename: "Sinh_ly_hoc_Guyton.pdf",
        status: "completed",
        uploaded_at: new Date(Date.now() - 86400000).toISOString(),
        num_chunks: 342,
      },
      {
        id: "doc_sample_2",
        filename: "Duoc_ly_lam_sang.docx",
        status: "processing",
        uploaded_at: new Date().toISOString(),
        num_chunks: 0,
      },
    ];
  }

  try {
    const res = await fetch(`${config.apiBaseUrl}/api/documents`);
    if (!res.ok) throw new Error(`List failed: ${res.status}`);
    return (await res.json()) as MedicalDocument[];
  } catch (err) {
    console.warn("listDocuments falling back to mock:", err);
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/*                                 Feedback                                   */
/* -------------------------------------------------------------------------- */

export async function submitFeedback(
  messageId: string,
  rating: number,
  correction?: string
): Promise<void> {
  const payload: FeedbackPayload = { messageId, rating, correction };
  if (USE_MOCK_API) {
    await delay(300);
    console.info("Mock feedback submitted:", payload);
    return;
  }

  try {
    const res = await fetch(`${config.apiBaseUrl}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Feedback failed: ${res.status}`);
  } catch (err) {
    console.warn("submitFeedback failed (ignored in MVP):", err);
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Quiz                                     */
/* -------------------------------------------------------------------------- */

function buildMockQuiz(
  topic: string,
  difficulty: QuizDifficulty,
  count: number
): Quiz {
  const questions = Array.from({ length: count }).map((_, i) => ({
    id: `q_${i + 1}`,
    stem: `(${topic}) Câu hỏi số ${
      i + 1
    }: Đâu là phát biểu đúng nhất theo y học dựa trên bằng chứng?`,
    options: [
      { key: "A", text: "Phương án A - lựa chọn minh hoạ" },
      { key: "B", text: "Phương án B - lựa chọn minh hoạ" },
      { key: "C", text: "Phương án C - lựa chọn minh hoạ" },
      { key: "D", text: "Phương án D - lựa chọn minh hoạ" },
      { key: "E", text: "Phương án E - lựa chọn minh hoạ" },
    ],
    correct_answer: "B",
    explanation:
      "Phương án B đúng vì phù hợp với hướng dẫn điều trị hiện hành. (Nội dung minh hoạ khi backend chưa sẵn sàng.)",
  }));

  return { id: generateId("quiz"), topic, difficulty, questions };
}

export async function generateQuiz(
  topic: string,
  difficulty: QuizDifficulty,
  count: number
): Promise<Quiz> {
  if (USE_MOCK_API) {
    await delay(800);
    return buildMockQuiz(topic, difficulty, count);
  }

  try {
    const res = await fetch(`${config.apiBaseUrl}/api/quiz/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, difficulty, count }),
    });
    if (!res.ok) throw new Error(`Quiz generation failed: ${res.status}`);
    return (await res.json()) as Quiz;
  } catch (err) {
    console.warn("generateQuiz falling back to mock:", err);
    return buildMockQuiz(topic, difficulty, count);
  }
}

function gradeQuizLocally(
  quiz: Quiz,
  answers: Record<string, string>
): QuizResult {
  const results = quiz.questions.map((q) => {
    const selected = answers[q.id] ?? "";
    const correctAnswer = q.correct_answer ?? "B";
    return {
      questionId: q.id,
      selected,
      correct: selected === correctAnswer,
      correctAnswer,
      explanation: q.explanation,
    };
  });
  const correctCount = results.filter((r) => r.correct).length;
  return {
    quizId: quiz.id,
    total: quiz.questions.length,
    correctCount,
    score: Math.round((correctCount / quiz.questions.length) * 100),
    results,
  };
}

export async function submitQuizAnswer(
  quiz: Quiz,
  answers: Record<string, string>
): Promise<QuizResult> {
  if (USE_MOCK_API) {
    await delay(500);
    return gradeQuizLocally(quiz, answers);
  }

  try {
    const res = await fetch(`${config.apiBaseUrl}/api/quiz/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId: quiz.id, answers }),
    });
    if (!res.ok) throw new Error(`Quiz submit failed: ${res.status}`);
    return (await res.json()) as QuizResult;
  } catch (err) {
    console.warn("submitQuizAnswer falling back to mock:", err);
    return gradeQuizLocally(quiz, answers);
  }
}
