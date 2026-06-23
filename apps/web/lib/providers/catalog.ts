/**
 * Provider catalog — the menu shown in /settings. Most providers speak the
 * OpenAI Chat Completions protocol, so one adapter (openaiCompat) covers them
 * by base URL. Anthropic uses its native SDK. The two "*-sub" entries are
 * subscription logins (OAuth) whose connect flow lands in a follow-up.
 */
export type ProviderAuth = "apikey" | "oauth" | "custom";

export type ProviderMeta = {
  id: string;
  name: string;
  auth: ProviderAuth;
  /** speaks the OpenAI /chat/completions protocol */
  openaiCompatible: boolean;
  /** base URL for openai-compatible providers */
  baseUrl?: string;
  defaultModel: string;
  keyPlaceholder?: string;
  note?: string;
};

export const PROVIDER_CATALOG: ProviderMeta[] = [
  { id: "anthropic", name: "Anthropic", auth: "apikey", openaiCompatible: false, defaultModel: "claude-sonnet-4-6", keyPlaceholder: "sk-ant-…" },
  { id: "openai", name: "OpenAI", auth: "apikey", openaiCompatible: true, baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4.1", keyPlaceholder: "sk-…" },
  { id: "openrouter", name: "OpenRouter", auth: "apikey", openaiCompatible: true, baseUrl: "https://openrouter.ai/api/v1", defaultModel: "anthropic/claude-sonnet-4.6", keyPlaceholder: "sk-or-…", note: "One key, 300+ models." },
  { id: "gemini", name: "Google Gemini", auth: "apikey", openaiCompatible: true, baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-2.5-pro", keyPlaceholder: "AIza…" },
  { id: "deepseek", name: "DeepSeek", auth: "apikey", openaiCompatible: true, baseUrl: "https://api.deepseek.com", defaultModel: "deepseek-chat", keyPlaceholder: "sk-…" },
  { id: "glm", name: "Zhipu GLM (z.ai)", auth: "apikey", openaiCompatible: true, baseUrl: "https://api.z.ai/api/paas/v4", defaultModel: "glm-4.6" },
  { id: "moonshot", name: "Moonshot Kimi", auth: "apikey", openaiCompatible: true, baseUrl: "https://api.moonshot.ai/v1", defaultModel: "kimi-k2-0905-preview" },
  { id: "groq", name: "Groq", auth: "apikey", openaiCompatible: true, baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile", keyPlaceholder: "gsk_…" },
  { id: "mistral", name: "Mistral", auth: "apikey", openaiCompatible: true, baseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-large-latest" },
  { id: "xai", name: "xAI Grok", auth: "apikey", openaiCompatible: true, baseUrl: "https://api.x.ai/v1", defaultModel: "grok-4", keyPlaceholder: "xai-…" },
  { id: "custom", name: "Custom (OpenAI-compatible)", auth: "custom", openaiCompatible: true, defaultModel: "", note: "Any OpenAI-compatible endpoint — Ollama, LM Studio, vLLM, a proxy. Set base URL + key + model." },
  { id: "claude-sub", name: "claude.ai (subscription)", auth: "oauth", openaiCompatible: false, defaultModel: "claude-sonnet-4-6", note: "Log in with your Claude Pro/Max subscription like Claude Code. Experimental — connect flow coming next." },
  { id: "chatgpt-sub", name: "ChatGPT (subscription)", auth: "oauth", openaiCompatible: false, defaultModel: "gpt-5.5", note: "Log in with your ChatGPT subscription like Codex. Experimental — uses the Codex backend; only Codex-supported models work (e.g. gpt-5.5)." },
];

export function getProviderMeta(id: string): ProviderMeta | undefined {
  return PROVIDER_CATALOG.find((provider) => provider.id === id);
}

export function isKnownProvider(id: string): boolean {
  return PROVIDER_CATALOG.some((provider) => provider.id === id);
}
