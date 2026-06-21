/**
 * Provider resolution. Fasa 3: env-driven (ANTHROPIC_API_KEY / OPENROUTER_API_KEY),
 * falls back to the offline echo provider so chat works with no keys.
 * TODO Fasa 3b: per-owner encrypted provider_config (AES-GCM via MOP_AGENT_SECRET).
 */
import type { ChatProvider } from "./types";
import { anthropicProvider } from "./anthropic";
import { openRouterProvider } from "./openrouter";
import { echoProvider } from "./echo";
import { getDecryptedKey, getProviderConfigRow } from "./config";

export type { ChatProvider, ChatOptions, Msg } from "./types";
export { anthropicProvider, openRouterProvider, echoProvider };

export function resolveProvider(ownerId?: string): ChatProvider {
  // 1) DB config (encrypted key set via /settings) wins.
  try {
    const row = getProviderConfigRow(ownerId);
    if (row) {
      const apiKey = getDecryptedKey(row);
      if (row.provider === "anthropic") return anthropicProvider(apiKey, row.model ?? undefined);
      if (row.provider === "openrouter") return openRouterProvider(apiKey, row.model ?? undefined);
    }
  } catch {
    /* DB not ready or secret rotated — fall through to env */
  }

  // 2) env fallback
  const pref = process.env.MOP_AGENT_PROVIDER; // "anthropic" | "openrouter" | "echo"
  if (pref === "anthropic" || (!pref && process.env.ANTHROPIC_API_KEY)) {
    if (process.env.ANTHROPIC_API_KEY) {
      return anthropicProvider(process.env.ANTHROPIC_API_KEY, process.env.MOP_AGENT_MODEL);
    }
  }
  if (pref === "openrouter" || (!pref && process.env.OPENROUTER_API_KEY)) {
    if (process.env.OPENROUTER_API_KEY) {
      return openRouterProvider(process.env.OPENROUTER_API_KEY, process.env.MOP_AGENT_MODEL);
    }
  }
  return echoProvider();
}
