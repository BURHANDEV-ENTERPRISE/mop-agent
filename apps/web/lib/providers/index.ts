/**
 * Provider resolution. The shared chain (set in /settings) wins: main first,
 * then ordered fallbacks. Falls back to env keys, then the offline echo
 * provider so chat always works. chat() tries each in order (see chat route).
 */
import type { ChatProvider } from "./types";
import { anthropicProvider } from "./anthropic";
import { openRouterProvider } from "./openrouter";
import { openAICompatProvider } from "./openaiCompat";
import { echoProvider } from "./echo";
import { getProviderMeta } from "./catalog";
import { decryptSecret } from "../crypto";
import { getFallbackSlots, getMainSlot, type SlotRow } from "./config";

export type { ChatProvider, ChatOptions, Msg } from "./types";
export { anthropicProvider, openRouterProvider, openAICompatProvider, echoProvider };

function providerFromSlot(slot: SlotRow): ChatProvider | null {
  if (!slot.enabled) return null;
  if (slot.authType === "oauth") return null; // subscription login not wired yet
  if (!slot.apiKeyEnc) return null;
  let apiKey: string;
  try {
    apiKey = decryptSecret(slot.apiKeyEnc);
  } catch {
    return null;
  }
  const meta = getProviderMeta(slot.provider);
  const model = slot.model ?? meta?.defaultModel ?? "";
  if (slot.provider === "anthropic") return anthropicProvider(apiKey, model || undefined);
  const baseURL = slot.baseUrl ?? meta?.baseUrl;
  if (!baseURL) return null;
  return openAICompatProvider({ id: slot.provider, apiKey, baseURL, model });
}

/** Ordered provider chain: shared main → fallbacks → env → echo (always non-empty). */
export function resolveProviderChain(): ChatProvider[] {
  const chain: ChatProvider[] = [];
  try {
    const main = getMainSlot();
    if (main) {
      const p = providerFromSlot(main);
      if (p) chain.push(p);
    }
    for (const slot of getFallbackSlots()) {
      const p = providerFromSlot(slot);
      if (p) chain.push(p);
    }
  } catch {
    /* db not ready — fall through to env */
  }

  // env fallback, only when nothing is configured in the shared chain
  if (chain.length === 0) {
    const pref = process.env.MOP_AGENT_PROVIDER; // "anthropic" | "openrouter" | "echo"
    if ((pref === "anthropic" || (!pref && process.env.ANTHROPIC_API_KEY)) && process.env.ANTHROPIC_API_KEY) {
      chain.push(anthropicProvider(process.env.ANTHROPIC_API_KEY, process.env.MOP_AGENT_MODEL));
    } else if ((pref === "openrouter" || (!pref && process.env.OPENROUTER_API_KEY)) && process.env.OPENROUTER_API_KEY) {
      chain.push(openRouterProvider(process.env.OPENROUTER_API_KEY, process.env.MOP_AGENT_MODEL));
    }
  }

  chain.push(echoProvider());
  return chain;
}

/** Back-compat: the single best provider (head of the chain). */
export function resolveProvider(_ownerId?: string): ChatProvider {
  return resolveProviderChain()[0] ?? echoProvider();
}
