import OpenAI from "openai";
import type { ChatProvider, ChatOptions } from "./types.js";

/** OpenRouter is OpenAI-compatible — unlocks most other models in one adapter. */
export function openRouterProvider(apiKey: string, model = "anthropic/claude-sonnet-4.6"): ChatProvider {
  const client = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });
  return {
    id: "openrouter",
    model,
    async *chat({ system, messages }: ChatOptions) {
      const stream = await client.chat.completions.create({
        model,
        stream: true,
        messages: [
          ...(system ? ([{ role: "system" as const, content: system }]) : []),
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      });
      for await (const chunk of stream) {
        yield chunk.choices[0]?.delta?.content ?? "";
      }
    },
  };
}
