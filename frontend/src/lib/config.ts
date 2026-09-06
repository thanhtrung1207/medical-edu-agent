/**
 * Runtime configuration for the frontend.
 * Values are read from public environment variables so they can be
 * overridden at build time without touching source code.
 */

export const config = {
  /** Base URL of the ADK / FastAPI backend. */
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  /** CopilotKit runtime endpoint (proxied through the Next.js API route). */
  copilotkitUrl: process.env.NEXT_PUBLIC_COPILOTKIT_URL || "/api/copilotkit",
  /** Default UI language. */
  defaultLocale: "vi",
  /** Allowed document upload types. */
  allowedFileTypes: {
    "application/pdf": [".pdf"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
      ".docx",
    ],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
      ".pptx",
    ],
    "text/plain": [".txt"],
    "text/markdown": [".md"],
  } as Record<string, string[]>,
  /** Max upload size in bytes (25 MB). */
  maxFileSize: 25 * 1024 * 1024,
} as const;

/** Whether the app should call the real backend or use mock data. */
export const USE_MOCK_API =
  process.env.NEXT_PUBLIC_USE_MOCK_API !== "false";
