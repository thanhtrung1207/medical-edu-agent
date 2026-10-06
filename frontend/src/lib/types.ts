/**
 * TypeScript interfaces shared across the Medical Education AI Agent frontend.
 */

export type MessageRole = "user" | "assistant";

export interface Citation {
  source: string;
  page?: number;
  chapter?: string;
  quote: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  confidence?: number;
  citations?: Citation[];
  warnings?: string[];
  disclaimer?: string;
  reasoning_steps?: string[];
  timestamp: Date;
}

export type QuizDifficulty = "easy" | "medium" | "hard";

export interface QuizOption {
  key: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  stem: string;
  options: QuizOption[];
  correct_answer?: string;
  explanation?: string;
}

export interface Quiz {
  id: string;
  topic: string;
  difficulty: QuizDifficulty;
  questions: QuizQuestion[];
}

export interface QuizAnswerResult {
  questionId: string;
  selected: string;
  correct: boolean;
  correctAnswer: string;
  explanation?: string;
}

export interface QuizResult {
  quizId: string;
  score: number;
  total: number;
  correctCount: number;
  results: QuizAnswerResult[];
}

export type DocumentStatus = "pending" | "processing" | "completed" | "failed";

export interface MedicalDocument {
  id: string;
  filename: string;
  status: DocumentStatus;
  uploaded_at: string;
  num_chunks?: number;
}

export interface UploadResponse {
  id: string;
  filename: string;
  status: DocumentStatus;
  uploaded_at: string;
  num_chunks?: number;
}

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

export interface FeedbackPayload {
  messageId: string;
  rating: number;
  correction?: string;
}

export interface SavedCase {
  id: number;
  scenario: 'fracture' | 'missing';
  teeth: number[];
  date: string;
  summary: string;
  sessionId?: string;
}

export type ChatMode = "chat" | "agent";

export interface ChatRequest {
  message: string;
  mode: "chat" | "agent";
  user_id: string;
  session_id?: string;
  stream?: boolean;
  command?: string;
  clinical_context?: string;
}

export type { ClinicalRecordData, ToothStatus } from "./clinical-record/types";
