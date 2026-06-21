import OpenAI from "openai";
import type { ChatProvider, ChatOptions } from "./types";

/** OpenRouter is OpenAI-compatible — unlocks most other models in one adapter. */
export function openRouterProvider(apiKey: string, model = "anthropic/claude-sonnet-4.6"): ChatProvider {
  const client = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });
  return {
    id: "openrouter",
    model,
    async *chat({ system, messages }: ChatOptions) {
      const openRouterMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages.map((message) => {
        if (!message.image || message.role !== "user") return { role: message.role, content: message.content };
        return {
          role: "user",
          content: [
            { type: "text", text: message.content || "Describe and help with this image." },
            { type: "image_url", image_url: { url: message.image.dataUrl } },
          ],
        };
      });
      const stream = await client.chat.completions.create({
        model,
        stream: true,
        messages: [
          ...(system ? ([{ role: "system" as const, content: system }]) : []),
          ...openRouterMessages,
        ],
      });
      for await (const chunk of stream) {
        yield chunk.choices[0]?.delta?.content ?? "";
      }
    },
  };
}
