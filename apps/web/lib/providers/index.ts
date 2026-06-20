/**
 * Provider resolution. Fasa 3: env-driven (ANTHROPIC_API_KEY / OPENROUTER_API_KEY),
 * falls back to the offline echo provider so chat works with no keys.
 * TODO Fasa 3b: per-owner encrypted provider_config (AES-GCM via MOP_AGENT_SECRET).
 */
import type { ChatProvider } from "./types.js";
import { anthropicProvider } from "./anthropic.js";
import { openRouterProvider } from "./openrouter.js";
import { echoProvider } from "./echo.js";

export type { ChatProvider, ChatOptions, Msg } from "./types.js";
export { anthropicProvider, openRouterProvider, echoProvider };

export function resolveProvider(_ownerId?: string): ChatProvider {
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
