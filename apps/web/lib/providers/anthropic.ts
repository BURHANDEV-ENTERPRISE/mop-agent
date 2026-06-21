import Anthropic from "@anthropic-ai/sdk";
import type { ChatProvider, ChatOptions } from "./types";

export function anthropicProvider(apiKey: string, model = "claude-sonnet-4-6"): ChatProvider {
  const client = new Anthropic({ apiKey });
  return {
    id: "anthropic",
    model,
    async *chat({ system, messages }: ChatOptions) {
      const anthropicMessages: Anthropic.MessageParam[] = messages.map((message) => {
        if (!message.image || message.role !== "user") return { role: message.role, content: message.content };
        const match = message.image.dataUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/s);
        if (!match) return { role: message.role, content: message.content };
        return {
          role: message.role,
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: match[2]!,
              },
            },
            { type: "text", text: message.content || "Describe and help with this image." },
          ],
        };
      });
      const stream = client.messages.stream({
        model,
        max_tokens: 4096,
        system,
        messages: anthropicMessages,
      });
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          yield ev.delta.text;
        }
      }
    },
  };
}
