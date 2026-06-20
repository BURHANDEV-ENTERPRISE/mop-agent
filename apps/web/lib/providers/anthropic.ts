import Anthropic from "@anthropic-ai/sdk";
import type { ChatProvider, ChatOptions } from "./types.js";

export function anthropicProvider(apiKey: string, model = "claude-sonnet-4-6"): ChatProvider {
  const client = new Anthropic({ apiKey });
  return {
    id: "anthropic",
    model,
    async *chat({ system, messages }: ChatOptions) {
      const stream = client.messages.stream({
        model,
        max_tokens: 4096,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          yield ev.delta.text;
        }
      }
    },
  };
}
