const CLAUDE_KEY_STORAGE = 'dcs_claude_api_key';
const GEMINI_KEY_STORAGE = 'dcs_gemini_api_key';
const ACTIVE_PROVIDER_STORAGE = 'dcs_active_provider';

export type AIProvider = 'claude' | 'gemini';

export function getClaudeApiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(CLAUDE_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setClaudeApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (key) {
      localStorage.setItem(CLAUDE_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(CLAUDE_KEY_STORAGE);
    }
  } catch {}
}

export function getGeminiApiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(GEMINI_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setGeminiApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (key) {
      localStorage.setItem(GEMINI_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(GEMINI_KEY_STORAGE);
    }
  } catch {}
}

export function clearApiKeys(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CLAUDE_KEY_STORAGE);
    localStorage.removeItem(GEMINI_KEY_STORAGE);
    localStorage.removeItem(ACTIVE_PROVIDER_STORAGE);
  } catch {}
}

export function hasAnyApiKey(): boolean {
  return getClaudeApiKey().length > 0 || getGeminiApiKey().length > 0;
}

export function getActiveProvider(): AIProvider | null {
  // Check explicit user preference first
  try {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_PROVIDER_STORAGE) : null;
    if (stored === 'claude' || stored === 'gemini') {
      // Verify the corresponding key exists
      if (stored === 'claude' && getClaudeApiKey()) return 'claude';
      if (stored === 'gemini' && getGeminiApiKey()) return 'gemini';
    }
  } catch {}

  // Default: Claude primary, Gemini fallback (matches backend model_config.py)
  if (getClaudeApiKey()) return 'claude';
  if (getGeminiApiKey()) return 'gemini';
  return null;
}

export function setActiveProvider(provider: AIProvider | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (provider) {
      localStorage.setItem(ACTIVE_PROVIDER_STORAGE, provider);
    } else {
      localStorage.removeItem(ACTIVE_PROVIDER_STORAGE);
    }
  } catch {}
}
