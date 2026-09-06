import { getClaudeApiKey, getGeminiApiKey, getActiveProvider, type AIProvider } from './api-keys';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class AIError extends Error {
  code: 'no_key' | 'auth_error' | 'rate_limit' | 'network' | 'unknown';
  provider?: string;
  constructor(message: string, code: AIError['code'], provider?: string) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.provider = provider;
  }
}

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_TOKENS = 1024;
const MAX_HISTORY = 20;

function truncateHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_HISTORY) return messages;
  let truncated = messages.slice(-MAX_HISTORY);
  // Claude/Gemini require first message to be from "user"
  if (truncated[0].role !== 'user') {
    truncated = truncated.slice(1);
  }
  return truncated;
}

export async function callClaudeStream(
  messages: ChatMessage[],
  systemPrompt: string,
  apiKey: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const truncated = truncateHistory(messages);
  
  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: truncated.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    });
  } catch (e) {
    throw new AIError('Không thể kết nối đến Claude. Kiểm tra kết nối mạng.', 'network', 'claude');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AIError('API key Claude không hợp lệ. Vui lòng kiểm tra trong Cài đặt.', 'auth_error', 'claude');
    }
    if (response.status === 429) {
      throw new AIError('Giới hạn yêu cầu Claude. Vui lòng đợi hoặc đổi sang Gemini.', 'rate_limit', 'claude');
    }
    throw new AIError(`Lỗi Claude API: ${response.status}`, 'unknown', 'claude');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new AIError('Không thể đọc phản hồi từ Claude.', 'network', 'claude');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullText += parsed.delta.text;
            onChunk?.(parsed.delta.text);
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }
  }

  // Flush decoder and process any remaining buffer
  buffer += decoder.decode();
  if (buffer.startsWith('data: ')) {
    const data = buffer.slice(6).trim();
    if (data && data !== '[DONE]') {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullText += parsed.delta.text;
          onChunk?.(parsed.delta.text);
        }
      } catch {}
    }
  }

  return fullText;
}

export async function callGeminiStream(
  messages: ChatMessage[],
  systemPrompt: string,
  apiKey: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const truncated = truncateHistory(messages);
  
  const contents = truncated.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: MAX_TOKENS },
        }),
      }
    );
  } catch (e) {
    throw new AIError('Không thể kết nối đến Gemini. Kiểm tra kết nối mạng.', 'network', 'gemini');
  }

  if (!response.ok) {
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      // For 400, check if it's a key error
      let isKeyError = response.status !== 400;
      if (response.status === 400) {
        try {
          const body = await response.text();
          isKeyError = body.includes('API key not valid') || body.includes('API_KEY_INVALID');
        } catch {}
      }
      if (isKeyError) {
        throw new AIError('API key Gemini không hợp lệ. Vui lòng kiểm tra trong Cài đặt.', 'auth_error', 'gemini');
      }
    }
    if (response.status === 429) {
      throw new AIError('Giới hạn yêu cầu Gemini. Vui lòng đợi hoặc đổi sang Claude.', 'rate_limit', 'gemini');
    }
    throw new AIError(`Lỗi Gemini API: ${response.status}`, 'unknown', 'gemini');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new AIError('Không thể đọc phản hồi từ Gemini.', 'network', 'gemini');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            fullText += text;
            onChunk?.(text);
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }
  }

  // Flush decoder and process any remaining buffer
  buffer += decoder.decode();
  if (buffer.startsWith('data: ')) {
    const data = buffer.slice(6).trim();
    if (data && data !== '[DONE]') {
      try {
        const parsed = JSON.parse(data);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullText += text;
          onChunk?.(text);
        }
      } catch {}
    }
  }

  return fullText;
}

export async function callAIDirect(
  messages: ChatMessage[],
  systemPrompt: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const provider = getActiveProvider();
  
  if (!provider) {
    throw new AIError('Chưa có API key. Vui lòng mở Cài đặt để nhập key.', 'no_key');
  }

  // Try active provider first
  try {
    if (provider === 'claude') {
      const claudeKey = getClaudeApiKey();
      if (claudeKey) {
        return await callClaudeStream(messages, systemPrompt, claudeKey, onChunk);
      }
    } else {
      const geminiKey = getGeminiApiKey();
      if (geminiKey) {
        return await callGeminiStream(messages, systemPrompt, geminiKey, onChunk);
      }
    }
  } catch (error) {
    // Only fallback on transient errors (rate_limit, network), not auth errors
    if (error instanceof AIError && (error.code === 'rate_limit' || error.code === 'network')) {
      // Try the other provider
      const otherProvider: AIProvider = provider === 'claude' ? 'gemini' : 'claude';
      if (otherProvider === 'claude') {
        const claudeKey = getClaudeApiKey();
        if (claudeKey) {
          return await callClaudeStream(messages, systemPrompt, claudeKey, onChunk);
        }
      } else {
        const geminiKey = getGeminiApiKey();
        if (geminiKey) {
          return await callGeminiStream(messages, systemPrompt, geminiKey, onChunk);
        }
      }
    }
    // Re-throw if no fallback available or auth error
    throw error;
  }

  // If active provider has no key (shouldn't happen due to getActiveProvider check, but just in case)
  // Try the other provider
  if (provider === 'claude') {
    const geminiKey = getGeminiApiKey();
    if (geminiKey) {
      return await callGeminiStream(messages, systemPrompt, geminiKey, onChunk);
    }
  } else {
    const claudeKey = getClaudeApiKey();
    if (claudeKey) {
      return await callClaudeStream(messages, systemPrompt, claudeKey, onChunk);
    }
  }

  throw new AIError('Chưa có API key. Vui lòng mở Cài đặt để nhập key.', 'no_key');
}
